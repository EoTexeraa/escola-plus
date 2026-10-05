import { Router } from 'express';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { GRADE_COMPONENTS, grades, schoolClasses, subjects, teachingAssignments, users, type GradeComponent } from '../db/schema.js';
import { assertCanTeach, isManager, MANAGERS } from '../lib/access.js';
import { audit } from '../lib/audit.js';
import { computeBimester, MAX_SCORE, type ComponentScores } from '../lib/grading.js';
import { badRequest, forbidden, idParam, notFound, zId } from '../lib/http.js';
import { requireRole } from '../middleware/auth.js';
import { buildReportCard } from './student.js';

const SheetQuery = z.object({ classId: zId, subjectId: zId, bimester: z.coerce.number().int().min(1).max(4) });

const SheetUpdate = SheetQuery.extend({
  entries: z.array(z.object({
    studentId: zId,
    component: z.enum(GRADE_COMPONENTS),
    score: z.number().min(0).nullable(), // null = apagar a nota
  })).min(1).max(1000),
});

/** Nível da matéria de Inglês (null para as demais). */
async function englishLevelOf(db: Db, subjectId: number) {
  const [s] = await db.select({ level: subjects.englishLevel }).from(subjects).where(eq(subjects.id, subjectId)).limit(1);
  return s?.level ?? null;
}

export function teacherRouter(db: Db) {
  const r = Router();
  r.use(requireRole('teacher', ...MANAGERS));

  // Turmas/matérias do professor (admin: todas as combinações atribuídas)
  r.get('/assignments', async (req, res) => {
    const user = req.user!;
    const rows = await db.select({
      id: teachingAssignments.id,
      classId: teachingAssignments.classId, className: schoolClasses.name, schoolYear: schoolClasses.schoolYear,
      subjectId: teachingAssignments.subjectId, subject: subjects.name, color: subjects.colorHex,
      teacherId: teachingAssignments.teacherId, teacherName: users.fullName,
      students: sql<number>`(SELECT COUNT(*) FROM users s WHERE s.class_id = ${teachingAssignments.classId} AND s.role = 'student' AND s.is_active = 1)`,
    }).from(teachingAssignments)
      .innerJoin(schoolClasses, eq(schoolClasses.id, teachingAssignments.classId))
      .innerJoin(subjects, eq(subjects.id, teachingAssignments.subjectId))
      .innerJoin(users, eq(users.id, teachingAssignments.teacherId))
      .where(isManager(user.role) ? undefined : eq(teachingAssignments.teacherId, user.id))
      .orderBy(asc(schoolClasses.name), asc(subjects.name));
    res.json({ data: rows });
  });

  // Planilha de notas: alunos da turma × componentes do bimestre, com média calculada
  r.get('/gradesheet', async (req, res) => {
    const q = SheetQuery.parse(req.query);
    await assertCanTeach(db, req.user!, q.classId, q.subjectId);
    const level = await englishLevelOf(db, q.subjectId);
    const students = await db.select({ id: users.id, fullName: users.fullName, username: users.username })
      .from(users)
      .where(and(eq(users.classId, q.classId), eq(users.role, 'student'), eq(users.isActive, true),
        level ? eq(users.englishLevel, level) : undefined))
      .orderBy(asc(users.fullName));
    const rows = students.length
      ? await db.select().from(grades).where(and(
        eq(grades.classId, q.classId), eq(grades.subjectId, q.subjectId), eq(grades.bimester, q.bimester),
        inArray(grades.studentId, students.map((s) => s.id))))
      : [];
    const data = students.map((s) => {
      const scores: ComponentScores = {};
      for (const g of rows) if (g.studentId === s.id) scores[g.component as GradeComponent] = g.score;
      return { student: s, ...computeBimester(scores) };
    });
    res.json({ data: { ...q, maxScore: MAX_SCORE, students: data } });
  });

  // Lançamento em lote (upsert/apagar), validando limites de cada componente e a atribuição
  r.put('/gradesheet', async (req, res) => {
    const body = SheetUpdate.parse(req.body);
    const user = req.user!;
    await assertCanTeach(db, user, body.classId, body.subjectId);

    const bad = body.entries.filter((e) => e.score !== null && e.score > MAX_SCORE[e.component]);
    if (bad.length) {
      throw badRequest('Nota acima do máximo permitido.', bad.map((e) => ({
        field: `${e.studentId}.${e.component}`, message: `Máximo ${MAX_SCORE[e.component].toFixed(1).replace('.', ',')}`,
      })));
    }

    // Todos os alunos precisam ser da turma (impede lançar nota para aluno de outra turma)
    const ids = [...new Set(body.entries.map((e) => e.studentId))];
    const level = await englishLevelOf(db, body.subjectId);
    const valid = await db.select({ id: users.id }).from(users)
      .where(and(inArray(users.id, ids), eq(users.classId, body.classId), eq(users.role, 'student'),
        level ? eq(users.englishLevel, level) : undefined));
    if (valid.length !== ids.length) throw forbidden('Há alunos que não pertencem a essa turma (ou a esse nível de inglês).');

    const key = { classId: body.classId, subjectId: body.subjectId, bimester: body.bimester };
    let upserts = 0;
    let deletes = 0;
    await db.transaction(async (tx) => {
      for (const e of body.entries) {
        if (e.score === null) {
          const d = await tx.delete(grades).where(and(
            eq(grades.studentId, e.studentId), eq(grades.classId, key.classId), eq(grades.subjectId, key.subjectId),
            eq(grades.bimester, key.bimester), eq(grades.component, e.component))).returning({ id: grades.id });
          deletes += d.length;
        } else {
          const score = Math.round(e.score * 100) / 100;
          await tx.insert(grades)
            .values({ ...key, studentId: e.studentId, component: e.component, score, gradedBy: user.id })
            .onConflictDoUpdate({
              target: [grades.studentId, grades.classId, grades.subjectId, grades.bimester, grades.component],
              set: { score, gradedBy: user.id, updatedAt: sql`CURRENT_TIMESTAMP` },
            });
          upserts++;
        }
      }
    });
    await audit(db, user.id, 'grade.upsert', 'grades', null, { ...key, upserts, deletes });
    res.json({ data: { upserts, deletes } });
  });

  // Alunos de uma turma em que o professor leciona
  r.get('/classes/:id/students', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const user = req.user!;
    if (!isManager(user.role)) {
      const [a] = await db.select({ id: teachingAssignments.id }).from(teachingAssignments)
        .where(and(eq(teachingAssignments.teacherId, user.id), eq(teachingAssignments.classId, id))).limit(1);
      if (!a) throw forbidden('Você não leciona nessa turma.');
    }
    const rows = await db.select({ id: users.id, fullName: users.fullName, username: users.username })
      .from(users).where(and(eq(users.classId, id), eq(users.role, 'student'), eq(users.isActive, true)))
      .orderBy(asc(users.fullName));
    res.json({ data: rows });
  });

  // Boletim de um aluno (professor: só matérias que leciona na turma do aluno)
  r.get('/students/:id/report', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const user = req.user!;
    const [s] = await db.select().from(users).where(and(eq(users.id, id), eq(users.role, 'student'))).limit(1);
    if (!s || !s.classId) throw notFound('Aluno não encontrado.');
    const card = await buildReportCard(db, { id: s.id, classId: s.classId, englishLevel: s.englishLevel });
    if (isManager(user.role)) return void res.json({ data: { student: { id: s.id, fullName: s.fullName }, ...card } });
    const mine = await db.select({ subjectId: teachingAssignments.subjectId }).from(teachingAssignments)
      .where(and(eq(teachingAssignments.teacherId, user.id), eq(teachingAssignments.classId, s.classId)));
    if (!mine.length) throw forbidden('Você não leciona para esse aluno.');
    const allowed = new Set(mine.map((m) => m.subjectId));
    res.json({ data: { student: { id: s.id, fullName: s.fullName }, ...card, subjects: card.subjects.filter((x) => allowed.has(x.subject.id)) } });
  });

  return r;
}

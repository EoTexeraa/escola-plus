import { Router } from 'express';
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import {
  announcementReads, announcements, calendarEvents, grades, homework, homeworkCompletions,
  GRADE_COMPONENTS, schoolClasses, studyRoutineChecks, studyRoutines, subjects, users,
  type GradeComponent,
} from '../db/schema.js';
import { subjectVisibleTo, todayIso, todayWeekday } from '../lib/access.js';
import { audit } from '../lib/audit.js';
import { computeYear, MAX_SCORE, type ComponentScores } from '../lib/grading.js';
import { badRequest, forbidden, zId } from '../lib/http.js';
import { requireRole } from '../middleware/auth.js';

/** Quem lançou cada componente: o próprio aluno ou a equipe (professor/coordenação). */
export type GradeAuthor = 'student' | 'staff';

/**
 * Boletim completo de um aluno. Rotas de aluno sempre passam o aluno da SESSÃO (anti-IDOR);
 * professor/coordenação reutilizam ao consultar um aluno específico.
 * Matérias: todas as do currículo (9º ano) + o Inglês do nível do aluno + qualquer uma com nota lançada.
 */
export async function buildReportCard(db: Db, student: { id: number; classId: number; englishLevel: number | null }) {
  const [cls] = await db.select().from(schoolClasses).where(eq(schoolClasses.id, student.classId)).limit(1);
  const rows = await db.select({
    subjectId: grades.subjectId, bimester: grades.bimester, component: grades.component, score: grades.score,
    graderRole: users.role,
  }).from(grades).leftJoin(users, eq(users.id, grades.gradedBy))
    .where(and(eq(grades.studentId, student.id), eq(grades.classId, student.classId)));

  const gradedIds = [...new Set(rows.map((g) => g.subjectId))];
  const levelFilter = student.englishLevel
    ? or(isNull(subjects.englishLevel), eq(subjects.englishLevel, student.englishLevel))
    : isNull(subjects.englishLevel);
  const subs = await db.select().from(subjects)
    .where(gradedIds.length ? or(levelFilter, inArray(subjects.id, gradedIds)) : levelFilter)
    .orderBy(asc(subjects.name));

  const bySubject = subs.map((s) => {
    const perBim: ComponentScores[] = [{}, {}, {}, {}];
    const authors: Array<Partial<Record<GradeComponent, GradeAuthor>>> = [{}, {}, {}, {}];
    for (const g of rows) {
      if (g.subjectId !== s.id) continue;
      perBim[g.bimester - 1]![g.component as GradeComponent] = g.score;
      authors[g.bimester - 1]![g.component as GradeComponent] = g.graderRole === 'student' ? 'student' : 'staff';
    }
    const year = computeYear(perBim);
    return {
      subject: { id: s.id, name: s.name, color: s.colorHex, englishLevel: s.englishLevel },
      ...year,
      bimesters: year.bimesters.map((b, i) => ({ ...b, authors: authors[i]! })),
    };
  });

  // Bimestre atual = o maior com alguma nota lançada (1 se nenhuma)
  const currentBimester = rows.reduce((m, g) => Math.max(m, g.bimester), 1);
  return { class: cls ? { id: cls.id, name: cls.name, schoolYear: cls.schoolYear } : null, currentBimester, subjects: bySubject };
}

const SelfGrades = z.object({
  subjectId: zId,
  bimester: z.number().int().min(1).max(4),
  entries: z.array(z.object({
    component: z.enum(GRADE_COMPONENTS),
    score: z.number().min(0).nullable(), // null = apagar
  })).min(1).max(GRADE_COMPONENTS.length),
});

export function studentRouter(db: Db) {
  const r = Router();
  r.use(requireRole('student'));

  const classOf = (classId: number | null) => {
    if (!classId) throw forbidden('Você ainda não está em uma turma. Procure a secretaria.');
    return classId;
  };

  r.get('/grades', async (req, res) => {
    res.json({ data: await buildReportCard(db, { ...req.user!, classId: classOf(req.user!.classId) }) });
  });

  // O aluno lança as PRÓPRIAS notas (decisão do responsável: aluno e professor lançam; vale a última edição)
  r.put('/grades', async (req, res) => {
    const user = req.user!;
    const classId = classOf(user.classId);
    const body = SelfGrades.parse(req.body);

    const [subject] = await db.select({ id: subjects.id }).from(subjects)
      .where(and(eq(subjects.id, body.subjectId), subjectVisibleTo(user))).limit(1);
    if (!subject) throw forbidden('Essa matéria não faz parte do seu boletim.');

    const bad = body.entries.filter((e) => e.score !== null && e.score > MAX_SCORE[e.component]);
    if (bad.length) {
      throw badRequest('Nota acima do máximo permitido.', bad.map((e) => ({
        field: e.component, message: `Máximo ${MAX_SCORE[e.component].toFixed(1).replace('.', ',')}`,
      })));
    }

    const key = { studentId: user.id, classId, subjectId: body.subjectId, bimester: body.bimester };
    await db.transaction(async (tx) => {
      for (const e of body.entries) {
        if (e.score === null) {
          await tx.delete(grades).where(and(eq(grades.studentId, user.id), eq(grades.classId, classId),
            eq(grades.subjectId, body.subjectId), eq(grades.bimester, body.bimester), eq(grades.component, e.component)));
        } else {
          const score = Math.round(e.score * 100) / 100;
          await tx.insert(grades).values({ ...key, component: e.component, score, gradedBy: user.id })
            .onConflictDoUpdate({
              target: [grades.studentId, grades.classId, grades.subjectId, grades.bimester, grades.component],
              set: { score, gradedBy: user.id, updatedAt: sql`CURRENT_TIMESTAMP` },
            });
        }
      }
    });
    await audit(db, user.id, 'grade.upsert', 'grades', null, { ...key, bySelf: true, entries: body.entries.length });
    res.json({ data: await buildReportCard(db, { ...user, classId }) });
  });

  // Resumo de um bimestre: média geral, destaques e matérias em recuperação
  r.get('/summary', async (req, res) => {
    const { bimester } = z.object({ bimester: z.coerce.number().int().min(1).max(4).optional() }).parse(req.query);
    const card = await buildReportCard(db, { ...req.user!, classId: classOf(req.user!.classId) });
    const b = bimester ?? card.currentBimester;
    const items = card.subjects.map((s) => ({ subject: s.subject, ...s.bimesters[b - 1]! }));
    const graded = items.filter((i) => i.average !== null);
    const overall = graded.length ? graded.reduce((a, i) => a + i.average!, 0) / graded.length : null;
    const sorted = [...graded].sort((a, z2) => z2.average! - a.average!);
    res.json({
      data: {
        bimester: b,
        overallAverage: overall === null ? null : Math.round(overall * 100) / 100,
        subjects: items,
        best: sorted.slice(0, 3).map((i) => ({ subject: i.subject, average: i.average })),
        attention: items.filter((i) => i.status === 'recovery' || i.examBelowReference)
          .map((i) => ({ subject: i.subject, average: i.average, pointsToPass: i.pointsToPass, status: i.status })),
        counts: {
          passing: items.filter((i) => i.status === 'passing').length,
          recovery: items.filter((i) => i.status === 'recovery').length,
          partial: items.filter((i) => i.status === 'partial').length,
        },
      },
    });
  });

  // Painel inicial
  r.get('/overview', async (req, res) => {
    const user = req.user!;
    const classId = classOf(user.classId);
    const today = todayIso();
    const in14 = todayIso(14);

    const card = await buildReportCard(db, { ...user, classId });
    const b = card.currentBimester;
    const bimItems = card.subjects.map((s) => ({ subject: s.subject, ...s.bimesters[b - 1]! }));
    const graded = bimItems.filter((i) => i.average !== null);

    const pendingHomework = await db.select({
      id: homework.id, title: homework.title, dueDate: homework.dueDate,
      subject: subjects.name, color: subjects.colorHex,
    }).from(homework)
      .innerJoin(subjects, eq(subjects.id, homework.subjectId))
      .leftJoin(homeworkCompletions, and(eq(homeworkCompletions.homeworkId, homework.id), eq(homeworkCompletions.studentId, user.id)))
      .where(and(eq(homework.classId, classId), gte(homework.dueDate, today), isNull(homeworkCompletions.studentId), subjectVisibleTo(user)))
      .orderBy(asc(homework.dueDate)).limit(5);

    // Eventos da turma/gerais; provas de Inglês só do nível do aluno
    const upcomingEvents = (await db.select({ event: calendarEvents }).from(calendarEvents)
      .leftJoin(subjects, eq(subjects.id, calendarEvents.subjectId))
      .where(and(gte(calendarEvents.startsOn, today), lte(calendarEvents.startsOn, in14),
        or(eq(calendarEvents.classId, classId), isNull(calendarEvents.classId)), subjectVisibleTo(user)))
      .orderBy(asc(calendarEvents.startsOn)).limit(6)).map((r) => r.event);

    const latest = await db.select({
      id: announcements.id, title: announcements.title, category: announcements.category,
      createdAt: announcements.createdAt, isPinned: announcements.isPinned,
      read: sql<number>`${announcementReads.userId} IS NOT NULL`,
    }).from(announcements)
      .leftJoin(announcementReads, and(eq(announcementReads.announcementId, announcements.id), eq(announcementReads.userId, user.id)))
      .where(or(eq(announcements.classId, classId), isNull(announcements.classId)))
      .orderBy(desc(announcements.isPinned), desc(announcements.createdAt)).limit(20);

    const weekday = todayWeekday();
    const todayRoutine = await db.select({
      id: studyRoutines.id, startTime: studyRoutines.startTime, endTime: studyRoutines.endTime,
      activity: studyRoutines.activity, subject: subjects.name, color: subjects.colorHex,
      done: sql<number>`${studyRoutineChecks.routineId} IS NOT NULL`,
    }).from(studyRoutines)
      .leftJoin(subjects, eq(subjects.id, studyRoutines.subjectId))
      .leftJoin(studyRoutineChecks, and(eq(studyRoutineChecks.routineId, studyRoutines.id), eq(studyRoutineChecks.doneOn, today)))
      .where(and(eq(studyRoutines.studentId, user.id), eq(studyRoutines.weekday, weekday)))
      .orderBy(asc(studyRoutines.startTime));

    res.json({
      data: {
        class: card.class,
        bimester: b,
        overallAverage: graded.length ? Math.round((graded.reduce((a, i) => a + i.average!, 0) / graded.length) * 100) / 100 : null,
        subjects: bimItems.map((i) => ({ subject: i.subject, average: i.average, status: i.status })),
        recoveryCount: bimItems.filter((i) => i.status === 'recovery').length,
        pendingHomework,
        upcomingEvents,
        unreadAnnouncements: latest.filter((a) => !a.read).length,
        latestAnnouncements: latest.slice(0, 3).map((a) => ({ ...a, read: Boolean(a.read) })),
        todayRoutine: todayRoutine.map((t) => ({ ...t, done: Boolean(t.done) })),
      },
    });
  });

  return r;
}

// Calendário de provas (grupos alternados) e conteúdos das provas.
import { Router } from 'express';
import { and, asc, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { calendarEvents, examSchedules, studyContents, subjects, users } from '../db/schema.js';
import { MANAGERS, subjectVisibleTo } from '../lib/access.js';
import { badRequest, idParam, notFound, zDate, zId, zText } from '../lib/http.js';
import { requireRole } from '../middleware/auth.js';

export const WEEKS_PER_BIMESTER = 8; // G1/G2 alternados, 4 vezes cada (uma por prova: P1..P4)
const WEEKDAY_LABEL: Record<number, string> = { 2: 'terça', 4: 'quinta', 5: 'sexta' };

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Semana w (0..7): grupo = inicial nas semanas pares e o outro nas ímpares; prova = P(⌊w/2⌋+1).
 * Data = primeira terça + 7·w + (dia da matéria − terça).
 */
export function planExams(firstTuesday: string, startingGroup: 1 | 2,
  subjectList: Array<{ id: number; name: string; examGroup: number | null; examWeekday: number | null }>) {
  const plan: Array<{ subjectId: number; title: string; date: string; examNumber: number; group: number }> = [];
  for (let w = 0; w < WEEKS_PER_BIMESTER; w++) {
    const group = w % 2 === 0 ? startingGroup : (3 - startingGroup);
    const examNumber = Math.floor(w / 2) + 1;
    for (const s of subjectList) {
      if (s.examGroup !== group || !s.examWeekday) continue;
      plan.push({ subjectId: s.id, title: `P${examNumber} — ${s.name}`, date: addDays(firstTuesday, 7 * w + (s.examWeekday - 2)), examNumber, group });
    }
  }
  return plan.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

const managers = requireRole(...MANAGERS);

export function examsRouter(db: Db) {
  const r = Router();

  // ================= CALENDÁRIO DE PROVAS =================
  r.get('/exam-schedule', async (req, res) => {
    const year = z.object({ year: z.coerce.number().int().optional() }).parse(req.query).year ?? new Date().getFullYear();
    const schedules = await db.select().from(examSchedules).where(eq(examSchedules.schoolYear, year)).orderBy(asc(examSchedules.bimester));
    const groups = await db.select({
      id: subjects.id, name: subjects.name, color: subjects.colorHex, englishLevel: subjects.englishLevel,
      examGroup: subjects.examGroup, examWeekday: subjects.examWeekday,
    }).from(subjects).where(and(isNotNull(subjects.examGroup), subjectVisibleTo(req.user!)))
      .orderBy(asc(subjects.examGroup), asc(subjects.examWeekday), asc(subjects.name));
    res.json({ data: { year, schedules, subjects: groups, weekdayLabel: WEEKDAY_LABEL } });
  });

  const ScheduleSchema = z.object({
    firstTuesday: zDate.refine((d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 2, 'A data precisa ser uma terça-feira'),
    startingGroup: z.union([z.literal(1), z.literal(2)]).default(1),
  });

  // Define o bimestre e (re)gera as provas automáticas dele. Eventos manuais não são tocados.
  r.put('/exam-schedule/:bimester', managers, async (req, res) => {
    const bimester = z.coerce.number().int().min(1).max(4).parse(req.params.bimester);
    const body = ScheduleSchema.parse(req.body);
    const year = Number(body.firstTuesday.slice(0, 4));
    const list = await db.select({ id: subjects.id, name: subjects.name, examGroup: subjects.examGroup, examWeekday: subjects.examWeekday })
      .from(subjects).where(isNotNull(subjects.examGroup));
    if (!list.length) throw badRequest('Nenhuma matéria tem grupo de prova definido.');
    const plan = planExams(body.firstTuesday, body.startingGroup, list);

    await db.transaction(async (tx) => {
      await tx.delete(calendarEvents).where(and(
        eq(calendarEvents.source, 'auto'), eq(calendarEvents.bimester, bimester),
        gte(calendarEvents.startsOn, `${year}-01-01`), lte(calendarEvents.startsOn, `${year}-12-31`)));
      for (const p of plan) {
        await tx.insert(calendarEvents).values({
          title: p.title, eventType: 'exam', startsOn: p.date, subjectId: p.subjectId, classId: null,
          description: `${bimester}º bimestre · Grupo ${p.group}`, bimester, examNumber: p.examNumber, source: 'auto',
          authorId: req.user!.id,
        });
      }
      await tx.insert(examSchedules).values({ schoolYear: year, bimester, ...body, updatedBy: req.user!.id })
        .onConflictDoUpdate({
          target: [examSchedules.schoolYear, examSchedules.bimester],
          set: { firstTuesday: body.firstTuesday, startingGroup: body.startingGroup, updatedBy: req.user!.id, updatedAt: sql`CURRENT_TIMESTAMP` },
        });
    });
    res.json({ data: { bimester, year, created: plan.length, from: plan[0]?.date, to: plan.at(-1)?.date } });
  });

  // ================= CONTEÚDOS DAS PROVAS =================
  r.get('/contents', async (req, res) => {
    const q = z.object({ bimester: z.coerce.number().int().min(1).max(4).optional(), subjectId: zId.optional() }).parse(req.query);
    // Data da prova correspondente (evento automático da mesma matéria, bimestre e número)
    const examDate = sql<string | null>`(SELECT min(e.starts_on) FROM calendar_events e
      WHERE e.subject_id = ${studyContents.subjectId} AND e.bimester = ${studyContents.bimester}
        AND e.exam_number = ${studyContents.examNumber} AND e.event_type = 'exam')`;
    const rows = await db.select({
      id: studyContents.id, title: studyContents.title, body: studyContents.body,
      bimester: studyContents.bimester, examNumber: studyContents.examNumber,
      subjectId: studyContents.subjectId, subject: subjects.name, color: subjects.colorHex, englishLevel: subjects.englishLevel,
      authorName: users.fullName, createdAt: studyContents.createdAt, updatedAt: studyContents.updatedAt, examDate,
    }).from(studyContents)
      .innerJoin(subjects, eq(subjects.id, studyContents.subjectId))
      .leftJoin(users, eq(users.id, studyContents.authorId))
      .where(and(
        q.bimester ? eq(studyContents.bimester, q.bimester) : undefined,
        q.subjectId ? eq(studyContents.subjectId, q.subjectId) : undefined,
        subjectVisibleTo(req.user!),
      ))
      .orderBy(asc(studyContents.bimester), asc(studyContents.examNumber), asc(subjects.name), desc(studyContents.updatedAt));
    res.json({ data: rows });
  });

  const ContentSchema = z.object({
    subjectId: zId,
    bimester: z.number().int().min(1).max(4),
    examNumber: z.number().int().min(1).max(4).nullable().default(null),
    title: zText(120),
    body: zText(10_000),
  });

  r.post('/contents', managers, async (req, res) => {
    const body = ContentSchema.parse(req.body);
    const [row] = await db.insert(studyContents).values({ ...body, authorId: req.user!.id }).returning();
    res.status(201).json({ data: row });
  });

  r.put('/contents/:id', managers, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = ContentSchema.parse(req.body);
    const [row] = await db.update(studyContents).set({ ...body, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(studyContents.id, id)).returning();
    if (!row) throw notFound();
    res.json({ data: row });
  });

  r.delete('/contents/:id', managers, async (req, res) => {
    const { id } = idParam.parse(req.params);
    await db.delete(studyContents).where(eq(studyContents.id, id));
    res.status(204).end();
  });

  return r;
}

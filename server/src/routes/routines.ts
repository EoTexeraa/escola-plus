import { Router } from 'express';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { studyRoutineChecks, studyRoutines, subjects } from '../db/schema.js';
import { todayIso } from '../lib/access.js';
import { idParam, notFound, zDate, zId, zText, zTime } from '../lib/http.js';
import { requireRole } from '../middleware/auth.js';

const RoutineSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: zTime,
  endTime: zTime,
  subjectId: zId.nullable().optional(),
  activity: zText(120),
}).refine((r) => r.endTime > r.startTime, { path: ['endTime'], message: 'O fim deve ser depois do início' });

export function routinesRouter(db: Db) {
  const r = Router();
  r.use(requireRole('student'));

  /** Garante que a rotina é do aluno da sessão (anti-IDOR). */
  async function own(studentId: number, id: number) {
    const [row] = await db.select().from(studyRoutines)
      .where(and(eq(studyRoutines.id, id), eq(studyRoutines.studentId, studentId))).limit(1);
    if (!row) throw notFound('Rotina não encontrada.');
    return row;
  }

  // Semana: rotinas + checks entre `from` e `to` (padrão: semana atual, domingo a sábado)
  r.get('/', async (req, res) => {
    const q = z.object({ from: zDate.optional(), to: zDate.optional() }).parse(req.query);
    const today = todayIso();
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
    const from = q.from ?? todayIso(-dow);
    const to = q.to ?? todayIso(6 - dow);

    const rows = await db.select({
      id: studyRoutines.id, weekday: studyRoutines.weekday, startTime: studyRoutines.startTime,
      endTime: studyRoutines.endTime, activity: studyRoutines.activity,
      subjectId: studyRoutines.subjectId, subject: subjects.name, color: subjects.colorHex,
    }).from(studyRoutines).leftJoin(subjects, eq(subjects.id, studyRoutines.subjectId))
      .where(eq(studyRoutines.studentId, req.user!.id))
      .orderBy(asc(studyRoutines.weekday), asc(studyRoutines.startTime));

    const checks = rows.length
      ? await db.select().from(studyRoutineChecks).where(and(
        inArray(studyRoutineChecks.routineId, rows.map((x) => x.id)),
        gte(studyRoutineChecks.doneOn, from), lte(studyRoutineChecks.doneOn, to)))
      : [];
    res.json({ data: { from, to, routines: rows, checks } });
  });

  r.post('/', async (req, res) => {
    const body = RoutineSchema.parse(req.body);
    const [row] = await db.insert(studyRoutines).values({ ...body, studentId: req.user!.id }).returning();
    res.status(201).json({ data: row });
  });

  r.put('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    await own(req.user!.id, id);
    const body = RoutineSchema.parse(req.body);
    const [row] = await db.update(studyRoutines).set(body).where(eq(studyRoutines.id, id)).returning();
    res.json({ data: row });
  });

  r.delete('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    await own(req.user!.id, id);
    await db.delete(studyRoutines).where(eq(studyRoutines.id, id));
    res.status(204).end();
  });

  const CheckSchema = z.object({ date: zDate.optional() });

  r.post('/:id/check', async (req, res) => {
    const { id } = idParam.parse(req.params);
    await own(req.user!.id, id);
    const { date } = CheckSchema.parse(req.body ?? {});
    await db.insert(studyRoutineChecks).values({ routineId: id, doneOn: date ?? todayIso() }).onConflictDoNothing();
    res.status(204).end();
  });

  r.delete('/:id/check', async (req, res) => {
    const { id } = idParam.parse(req.params);
    await own(req.user!.id, id);
    const { date } = CheckSchema.parse(req.query);
    await db.delete(studyRoutineChecks)
      .where(and(eq(studyRoutineChecks.routineId, id), eq(studyRoutineChecks.doneOn, date ?? todayIso())));
    res.status(204).end();
  });

  return r;
}

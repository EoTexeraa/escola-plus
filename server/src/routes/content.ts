// Avisos, tarefas de casa e calendário: leitura para todos (filtrada por turma), escrita para professor/admin.
import { Router } from 'express';
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import {
  ANNOUNCEMENT_CATEGORIES, EVENT_TYPES, announcementReads, announcements, calendarEvents,
  homework, homeworkCompletions, schoolClasses, subjects, users,
} from '../db/schema.js';
import { assertCanPublishToClass, assertCanTeach, isManager, MANAGERS, subjectVisibleTo, todayIso, visibleClassIds } from '../lib/access.js';
import { forbidden, idParam, notFound, zDate, zId, zText } from '../lib/http.js';
import { requireRole, type SessionUser } from '../middleware/auth.js';

/** Filtro de turma: gerais (class_id NULL) + turmas visíveis. Admin vê tudo. */
function classFilter(col: typeof announcements.classId | typeof calendarEvents.classId, ids: number[] | null): SQL | undefined {
  if (ids === null) return undefined;
  return ids.length ? or(isNull(col), inArray(col, ids)) : isNull(col);
}

async function assertAuthorOrAdmin(user: SessionUser, authorId: number | null) {
  if (isManager(user.role)) return;
  if (user.role === 'teacher' && authorId === user.id) return;
  throw forbidden('Só quem publicou (ou a coordenação) pode remover.');
}

const staff = requireRole('teacher', ...MANAGERS);

export function contentRouter(db: Db) {
  const r = Router();

  // ================= AVISOS =================
  r.get('/announcements', async (req, res) => {
    const user = req.user!;
    const ids = await visibleClassIds(db, user);
    const rows = await db.select({
      id: announcements.id, title: announcements.title, body: announcements.body,
      category: announcements.category, classId: announcements.classId, className: schoolClasses.name,
      isPinned: announcements.isPinned, createdAt: announcements.createdAt,
      authorId: announcements.authorId, authorName: users.fullName,
      read: sql<number>`${announcementReads.userId} IS NOT NULL`,
    }).from(announcements)
      .leftJoin(users, eq(users.id, announcements.authorId))
      .leftJoin(schoolClasses, eq(schoolClasses.id, announcements.classId))
      .leftJoin(announcementReads, and(eq(announcementReads.announcementId, announcements.id), eq(announcementReads.userId, user.id)))
      .where(classFilter(announcements.classId, ids))
      .orderBy(desc(announcements.isPinned), desc(announcements.createdAt))
      .limit(100);
    res.json({ data: rows.map((a) => ({ ...a, read: Boolean(a.read) })) });
  });

  r.post('/announcements/:id/read', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const ids = await visibleClassIds(db, req.user!);
    const [a] = await db.select({ id: announcements.id }).from(announcements)
      .where(and(eq(announcements.id, id), classFilter(announcements.classId, ids))).limit(1);
    if (!a) throw notFound();
    await db.insert(announcementReads).values({ userId: req.user!.id, announcementId: id }).onConflictDoNothing();
    res.status(204).end();
  });

  const AnnouncementSchema = z.object({
    title: zText(120),
    body: zText(4000),
    category: z.enum(ANNOUNCEMENT_CATEGORIES).default('general'),
    classId: zId.nullable().default(null),
    isPinned: z.boolean().default(false),
  });

  r.post('/announcements', staff, async (req, res) => {
    const body = AnnouncementSchema.parse(req.body);
    await assertCanPublishToClass(db, req.user!, body.classId);
    if (body.isPinned && !isManager(req.user!.role)) body.isPinned = false; // fixar é da coordenação
    const [row] = await db.insert(announcements).values({ ...body, authorId: req.user!.id }).returning();
    res.status(201).json({ data: row });
  });

  r.put('/announcements/:id', staff, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const [a] = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
    if (!a) throw notFound();
    await assertAuthorOrAdmin(req.user!, a.authorId);
    const body = AnnouncementSchema.parse(req.body);
    await assertCanPublishToClass(db, req.user!, body.classId);
    if (body.isPinned && !isManager(req.user!.role)) body.isPinned = a.isPinned;
    const [row] = await db.update(announcements).set(body).where(eq(announcements.id, id)).returning();
    res.json({ data: row });
  });

  r.delete('/announcements/:id', staff, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const [a] = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
    if (!a) throw notFound();
    await assertAuthorOrAdmin(req.user!, a.authorId);
    await db.delete(announcements).where(eq(announcements.id, id));
    res.status(204).end();
  });

  // ================= TAREFAS DE CASA =================
  r.get('/homework', async (req, res) => {
    const user = req.user!;
    const q = z.object({ classId: zId.optional(), status: z.enum(['pending', 'done', 'all']).default('all') }).parse(req.query);
    const ids = await visibleClassIds(db, user);
    const scope = ids === null ? (q.classId ? [q.classId] : null) : q.classId ? ids.filter((i) => i === q.classId) : ids;
    const rows = await db.select({
      id: homework.id, title: homework.title, description: homework.description, dueDate: homework.dueDate,
      classId: homework.classId, className: schoolClasses.name,
      subjectId: homework.subjectId, subject: subjects.name, color: subjects.colorHex,
      authorId: homework.authorId, authorName: users.fullName, createdAt: homework.createdAt,
      done: sql<number>`${homeworkCompletions.studentId} IS NOT NULL`,
    }).from(homework)
      .innerJoin(subjects, eq(subjects.id, homework.subjectId))
      .innerJoin(schoolClasses, eq(schoolClasses.id, homework.classId))
      .leftJoin(users, eq(users.id, homework.authorId))
      .leftJoin(homeworkCompletions, and(eq(homeworkCompletions.homeworkId, homework.id), eq(homeworkCompletions.studentId, user.id)))
      .where(and(scope === null ? undefined : scope.length ? inArray(homework.classId, scope) : sql`0`, subjectVisibleTo(user)))
      .orderBy(asc(homework.dueDate))
      .limit(200);
    const today = todayIso();
    const data = rows
      .map((h) => ({ ...h, done: Boolean(h.done), overdue: !h.done && h.dueDate < today }))
      .filter((h) => q.status === 'all' || (q.status === 'done' ? h.done : !h.done));
    res.json({ data });
  });

  async function studentHomework(user: SessionUser, id: number) {
    if (user.role !== 'student' || !user.classId) throw forbidden();
    const [h] = await db.select({ id: homework.id }).from(homework).innerJoin(subjects, eq(subjects.id, homework.subjectId))
      .where(and(eq(homework.id, id), eq(homework.classId, user.classId), subjectVisibleTo(user))).limit(1);
    if (!h) throw notFound();
  }

  r.post('/homework/:id/complete', async (req, res) => {
    const { id } = idParam.parse(req.params);
    await studentHomework(req.user!, id);
    await db.insert(homeworkCompletions).values({ studentId: req.user!.id, homeworkId: id }).onConflictDoNothing();
    res.status(204).end();
  });

  r.delete('/homework/:id/complete', async (req, res) => {
    const { id } = idParam.parse(req.params);
    await studentHomework(req.user!, id);
    await db.delete(homeworkCompletions)
      .where(and(eq(homeworkCompletions.studentId, req.user!.id), eq(homeworkCompletions.homeworkId, id)));
    res.status(204).end();
  });

  const HomeworkSchema = z.object({
    title: zText(120),
    description: z.string().trim().max(2000).optional().nullable(),
    classId: zId,
    subjectId: zId,
    dueDate: zDate,
  });

  r.post('/homework', staff, async (req, res) => {
    const body = HomeworkSchema.parse(req.body);
    await assertCanTeach(db, req.user!, body.classId, body.subjectId);
    const [row] = await db.insert(homework).values({ ...body, authorId: req.user!.id }).returning();
    res.status(201).json({ data: row });
  });

  r.put('/homework/:id', staff, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const [h] = await db.select().from(homework).where(eq(homework.id, id)).limit(1);
    if (!h) throw notFound();
    await assertAuthorOrAdmin(req.user!, h.authorId);
    const body = HomeworkSchema.parse(req.body);
    await assertCanTeach(db, req.user!, body.classId, body.subjectId);
    const [row] = await db.update(homework).set(body).where(eq(homework.id, id)).returning();
    res.json({ data: row });
  });

  r.delete('/homework/:id', staff, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const [h] = await db.select().from(homework).where(eq(homework.id, id)).limit(1);
    if (!h) throw notFound();
    await assertAuthorOrAdmin(req.user!, h.authorId);
    await db.delete(homework).where(eq(homework.id, id));
    res.status(204).end();
  });

  // ================= CALENDÁRIO =================
  r.get('/calendar', async (req, res) => {
    const q = z.object({ from: zDate, to: zDate }).parse(req.query);
    const ids = await visibleClassIds(db, req.user!);
    const rows = await db.select({
      id: calendarEvents.id, title: calendarEvents.title, description: calendarEvents.description,
      eventType: calendarEvents.eventType, startsOn: calendarEvents.startsOn, endsOn: calendarEvents.endsOn,
      classId: calendarEvents.classId, className: schoolClasses.name,
      subjectId: calendarEvents.subjectId, subject: subjects.name, color: subjects.colorHex,
      authorId: calendarEvents.authorId, bimester: calendarEvents.bimester, examNumber: calendarEvents.examNumber,
      source: calendarEvents.source,
    }).from(calendarEvents)
      .leftJoin(schoolClasses, eq(schoolClasses.id, calendarEvents.classId))
      .leftJoin(subjects, eq(subjects.id, calendarEvents.subjectId))
      .where(and(
        lte(calendarEvents.startsOn, q.to),
        or(gte(calendarEvents.startsOn, q.from), gte(calendarEvents.endsOn, q.from)),
        classFilter(calendarEvents.classId, ids),
        subjectVisibleTo(req.user!),
      ))
      .orderBy(asc(calendarEvents.startsOn));

    // Prazos de tarefas também aparecem no calendário
    const hwScope = ids === null ? undefined : ids.length ? inArray(homework.classId, ids) : sql`0`;
    const hw = await db.select({
      id: homework.id, title: homework.title, dueDate: homework.dueDate, subject: subjects.name, color: subjects.colorHex,
      classId: homework.classId,
    }).from(homework).innerJoin(subjects, eq(subjects.id, homework.subjectId))
      .where(and(gte(homework.dueDate, q.from), lte(homework.dueDate, q.to), hwScope, subjectVisibleTo(req.user!)));

    res.json({ data: { events: rows, homework: hw } });
  });

  const EventSchema = z.object({
    title: zText(120),
    description: z.string().trim().max(1000).optional().nullable(),
    eventType: z.enum(EVENT_TYPES).default('event'),
    startsOn: zDate,
    endsOn: zDate.optional().nullable(),
    classId: zId.nullable().default(null),
    subjectId: zId.optional().nullable(),
  }).refine((e) => !e.endsOn || e.endsOn >= e.startsOn, { path: ['endsOn'], message: 'O fim deve ser depois do início' });

  r.post('/calendar', staff, async (req, res) => {
    const body = EventSchema.parse(req.body);
    if (body.subjectId && body.classId) await assertCanTeach(db, req.user!, body.classId, body.subjectId);
    else await assertCanPublishToClass(db, req.user!, body.classId);
    const [row] = await db.insert(calendarEvents).values({ ...body, authorId: req.user!.id }).returning();
    res.status(201).json({ data: row });
  });

  r.put('/calendar/:id', staff, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const [e] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, id)).limit(1);
    if (!e) throw notFound();
    await assertAuthorOrAdmin(req.user!, e.authorId);
    const body = EventSchema.parse(req.body);
    if (body.subjectId && body.classId) await assertCanTeach(db, req.user!, body.classId, body.subjectId);
    else await assertCanPublishToClass(db, req.user!, body.classId);
    // Editada à mão, a prova deixa de ser "automática" (não é apagada ao regenerar o calendário)
    const [row] = await db.update(calendarEvents).set({ ...body, source: 'manual' }).where(eq(calendarEvents.id, id)).returning();
    res.json({ data: row });
  });

  r.delete('/calendar/:id', staff, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const [e] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, id)).limit(1);
    if (!e) throw notFound();
    await assertAuthorOrAdmin(req.user!, e.authorId);
    await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
    res.status(204).end();
  });

  return r;
}

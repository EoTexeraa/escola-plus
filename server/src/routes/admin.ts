import { Router } from 'express';
import { and, asc, desc, eq, like, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import {
  ROLES, accessKeys, announcements, auditLog, grades, homework, schoolClasses, subjects,
  teachingAssignments, users,
} from '../db/schema.js';
import { audit } from '../lib/audit.js';
import { accessKeyHint, generateAccessKey, generateTempPassword, hashAccessKey, hashSecret } from '../lib/crypto.js';
import { badRequest, conflict, forbidden, idParam, notFound, zId, zText } from '../lib/http.js';
import { MANAGERS } from '../lib/access.js';
import { requireRole, type SessionUser } from '../middleware/auth.js';
import { toUserDto } from './dto.js';

const isUniqueViolation = (e: unknown) => String((e as { message?: string })?.message ?? e).includes('UNIQUE');

/** A Coordenação não altera a conta do Administrador (nem senha, nem status). */
function assertCanManageUser(actor: SessionUser, target: { role: string }) {
  if (target.role === 'admin' && actor.role !== 'admin') throw forbidden('Somente o Administrador altera a própria conta.');
}

export function adminRouter(db: Db) {
  const r = Router();
  r.use(requireRole(...MANAGERS));

  // ---------------- Painel ----------------
  r.get('/stats', async (_req, res) => {
    const count = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
    const n = sql<number>`count(*)`;
    res.json({
      data: {
        students: await count(db.select({ n }).from(users).where(and(eq(users.role, 'student'), eq(users.isActive, true)))),
        teachers: await count(db.select({ n }).from(users).where(and(eq(users.role, 'teacher'), eq(users.isActive, true)))),
        coordinators: await count(db.select({ n }).from(users).where(eq(users.role, 'coordinator'))),
        classes: await count(db.select({ n }).from(schoolClasses)),
        subjects: await count(db.select({ n }).from(subjects)),
        grades: await count(db.select({ n }).from(grades)),
        announcements: await count(db.select({ n }).from(announcements)),
        homework: await count(db.select({ n }).from(homework)),
        activeKeys: await count(db.select({ n }).from(accessKeys)
          .where(and(sql`${accessKeys.revokedAt} IS NULL`, sql`${accessKeys.useCount} < ${accessKeys.maxUses}`))),
      },
    });
  });

  // ---------------- Turmas ----------------
  const ClassSchema = z.object({ name: zText(40, 2), schoolYear: z.number().int().min(2000).max(2100) });

  r.get('/classes', async (_req, res) => {
    const rows = await db.select({
      id: schoolClasses.id, name: schoolClasses.name, schoolYear: schoolClasses.schoolYear,
      students: sql<number>`(SELECT COUNT(*) FROM users u WHERE u.class_id = ${schoolClasses.id} AND u.role = 'student')`,
    }).from(schoolClasses).orderBy(desc(schoolClasses.schoolYear), asc(schoolClasses.name));
    res.json({ data: rows });
  });

  r.post('/classes', async (req, res) => {
    const body = ClassSchema.parse(req.body);
    try {
      const [row] = await db.insert(schoolClasses).values(body).returning();
      res.status(201).json({ data: row });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('Já existe uma turma com esse nome nesse ano.');
      throw e;
    }
  });

  r.patch('/classes/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = ClassSchema.partial().parse(req.body);
    try {
      const [row] = await db.update(schoolClasses).set(body).where(eq(schoolClasses.id, id)).returning();
      if (!row) throw notFound();
      res.json({ data: row });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('Já existe uma turma com esse nome nesse ano.');
      throw e;
    }
  });

  r.delete('/classes/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)` }).from(users).where(eq(users.classId, id));
    if (n > 0) throw conflict('A turma tem alunos. Mova-os antes de excluir.');
    await db.delete(schoolClasses).where(eq(schoolClasses.id, id));
    res.status(204).end();
  });

  // ---------------- Matérias ----------------
  const SubjectBase = z.object({
    name: zText(60, 2),
    colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#1D4ED8'),
    englishLevel: z.union([z.literal(2), z.literal(3), z.literal(4)]).nullable().optional(),
    examGroup: z.union([z.literal(1), z.literal(2)]).nullable().optional(),
    examWeekday: z.union([z.literal(2), z.literal(4), z.literal(5)]).nullable().optional(),
  });
  const groupAndDayTogether = (v: { examGroup?: number | null; examWeekday?: number | null }) =>
    (v.examGroup === undefined && v.examWeekday === undefined) || (v.examGroup == null) === (v.examWeekday == null);
  const groupMsg = { path: ['examWeekday'], message: 'Informe grupo e dia da prova juntos' };
  const SubjectSchema = SubjectBase.refine(groupAndDayTogether, groupMsg);
  const SubjectPatch = SubjectBase.partial().refine(groupAndDayTogether, groupMsg);

  r.post('/subjects', async (req, res) => {
    const body = SubjectSchema.parse(req.body);
    try {
      const [row] = await db.insert(subjects).values(body).returning();
      res.status(201).json({ data: row });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('Já existe uma matéria com esse nome.');
      throw e;
    }
  });

  r.patch('/subjects/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = SubjectPatch.parse(req.body);
    const [row] = await db.update(subjects).set(body).where(eq(subjects.id, id)).returning();
    if (!row) throw notFound();
    res.json({ data: row });
  });

  r.delete('/subjects/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)` }).from(grades).where(eq(grades.subjectId, id));
    if (n > 0) throw conflict('A matéria já tem notas lançadas e não pode ser excluída.');
    await db.delete(subjects).where(eq(subjects.id, id));
    res.status(204).end();
  });

  // ---------------- Usuários ----------------
  r.get('/users', async (req, res) => {
    const q = z.object({
      role: z.enum(ROLES).optional(), classId: zId.optional(), search: z.string().trim().max(60).optional(),
    }).parse(req.query);
    const conds = [
      q.role ? eq(users.role, q.role) : undefined,
      q.classId ? eq(users.classId, q.classId) : undefined,
      q.search ? or(like(users.fullName, `%${q.search}%`), like(users.username, `%${q.search}%`)) : undefined,
    ].filter(Boolean);
    const rows = await db.select({
      id: users.id, username: users.username, fullName: users.fullName, role: users.role,
      classId: users.classId, className: schoolClasses.name, englishLevel: users.englishLevel, isActive: users.isActive,
      lockedUntil: users.lockedUntil, createdAt: users.createdAt,
    }).from(users).leftJoin(schoolClasses, eq(schoolClasses.id, users.classId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(users.role), asc(users.fullName)).limit(500);
    res.json({ data: rows });
  });

  r.patch('/users/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({
      fullName: zText(100, 3).optional(),
      classId: zId.nullable().optional(),
      englishLevel: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
      isActive: z.boolean().optional(),
      unlock: z.boolean().optional(),
    }).parse(req.body);
    const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!u) throw notFound();
    assertCanManageUser(req.user!, u);
    if (u.id === req.user!.id && body.isActive === false) throw forbidden('Você não pode desativar a própria conta.');
    if ((body.classId !== undefined || body.englishLevel !== undefined) && u.role !== 'student') throw badRequest('Turma e nível de inglês são só de alunos.');
    const [row] = await db.update(users).set({
      fullName: body.fullName,
      classId: body.classId,
      englishLevel: body.englishLevel,
      isActive: body.isActive,
      // Desativar derruba as sessões; desbloquear zera contadores
      tokenVersion: body.isActive === false ? u.tokenVersion + 1 : undefined,
      ...(body.unlock ? { lockedUntil: null, failedLoginCount: 0, failedResetCount: 0 } : {}),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    }).where(eq(users.id, id)).returning();
    await audit(db, req.user!.id, 'user.update', 'user', id, { ...body });
    res.json({ data: toUserDto(row!) });
  });

  // Apagar conta (exclusivo do Administrador). Apaga junto: notas, rotinas, tarefas concluídas e
  // atribuições da pessoa; avisos/tarefas/eventos que ela publicou ficam, sem autor.
  r.delete('/users/:id', requireRole('admin'), async (req, res) => {
    const { id } = idParam.parse(req.params);
    if (id === req.user!.id) throw forbidden('Você não pode apagar a própria conta.');
    const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!u) throw notFound();
    await audit(db, req.user!.id, 'user.delete', 'user', id, { username: u.username, role: u.role, fullName: u.fullName });
    await db.delete(users).where(eq(users.id, id));
    res.status(204).end();
  });

  // Senha temporária: o usuário é obrigado a trocar no próximo login
  r.post('/users/:id/reset-password', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!u) throw notFound();
    assertCanManageUser(req.user!, u);
    const temp = generateTempPassword();
    await db.update(users).set({
      passwordHash: await hashSecret(temp),
      mustChangePassword: true,
      tokenVersion: u.tokenVersion + 1,
      failedLoginCount: 0, failedResetCount: 0, lockedUntil: null,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    }).where(eq(users.id, id));
    await audit(db, req.user!.id, 'password.admin_reset', 'user', id);
    res.json({ data: { temporaryPassword: temp } });
  });

  // ---------------- Chaves de acesso ----------------
  r.get('/keys', async (_req, res) => {
    const rows = await db.select({
      id: accessKeys.id, keyHint: accessKeys.keyHint, role: accessKeys.role, label: accessKeys.label,
      maxUses: accessKeys.maxUses, useCount: accessKeys.useCount, expiresAt: accessKeys.expiresAt,
      revokedAt: accessKeys.revokedAt, createdAt: accessKeys.createdAt, createdBy: users.fullName,
    }).from(accessKeys).leftJoin(users, eq(users.id, accessKeys.createdBy)).orderBy(desc(accessKeys.createdAt));
    res.json({ data: rows });
  });

  r.post('/keys', async (req, res) => {
    const body = z.object({
      role: z.enum(['teacher', 'coordinator']),
      label: z.string().trim().max(80).optional(),
      maxUses: z.number().int().min(1).max(100).default(1),
      expiresInDays: z.number().int().min(1).max(365).default(7),
    }).parse(req.body);
    const key = generateAccessKey(body.role);
    const [row] = await db.insert(accessKeys).values({
      keyHash: hashAccessKey(key),
      keyHint: accessKeyHint(key),
      role: body.role,
      label: body.label,
      maxUses: body.maxUses,
      expiresAt: new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString(),
      createdBy: req.user!.id,
    }).returning();
    await audit(db, req.user!.id, 'access_key.create', 'access_key', row!.id, { role: body.role, maxUses: body.maxUses });
    // A chave completa só é mostrada UMA vez (no banco fica apenas o hash)
    res.status(201).json({ data: { id: row!.id, key, role: row!.role, maxUses: row!.maxUses, expiresAt: row!.expiresAt } });
  });

  r.post('/keys/:id/revoke', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const [row] = await db.update(accessKeys).set({ revokedAt: new Date().toISOString() })
      .where(and(eq(accessKeys.id, id), sql`${accessKeys.revokedAt} IS NULL`)).returning({ id: accessKeys.id });
    if (!row) throw notFound('Chave não encontrada ou já revogada.');
    await audit(db, req.user!.id, 'access_key.revoke', 'access_key', id);
    res.status(204).end();
  });

  // ---------------- Atribuições professor × turma × matéria ----------------
  r.post('/assignments', async (req, res) => {
    const body = z.object({ teacherId: zId, classId: zId, subjectId: zId }).parse(req.body);
    const [t] = await db.select({ role: users.role }).from(users).where(eq(users.id, body.teacherId)).limit(1);
    if (t?.role !== 'teacher') throw badRequest('Escolha um professor.');
    try {
      const [row] = await db.insert(teachingAssignments).values(body).returning();
      await audit(db, req.user!.id, 'assignment.create', 'teaching_assignment', row!.id, body);
      res.status(201).json({ data: row });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('Esse professor já leciona essa matéria nessa turma.');
      throw e;
    }
  });

  r.delete('/assignments/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    await db.delete(teachingAssignments).where(eq(teachingAssignments.id, id));
    await audit(db, req.user!.id, 'assignment.delete', 'teaching_assignment', id);
    res.status(204).end();
  });

  // ---------------- Auditoria ----------------
  r.get('/audit', requireRole('admin'), async (req, res) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
    const rows = await db.select({
      id: auditLog.id, action: auditLog.action, entity: auditLog.entity, entityId: auditLog.entityId,
      details: auditLog.details, createdAt: auditLog.createdAt, actor: users.fullName,
    }).from(auditLog).leftJoin(users, eq(users.id, auditLog.actorId))
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id)).limit(q.limit);
    res.json({ data: rows });
  });

  return r;
}

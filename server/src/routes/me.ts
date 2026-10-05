import { Router } from 'express';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { schoolClasses, subjects, users } from '../db/schema.js';
import { subjectVisibleTo } from '../lib/access.js';
import { audit } from '../lib/audit.js';
import { hashSecret, normalizeAnswer, verifySecret } from '../lib/crypto.js';
import { HttpError, unauthorized, zText } from '../lib/http.js';
import { setSessionCookie } from '../middleware/auth.js';
import { adminExists } from './auth.js';
import { toUserDto } from './dto.js';

const zPassword = z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres').max(128)
  .regex(/[A-Za-z]/, 'A senha precisa ter pelo menos uma letra').regex(/\d/, 'A senha precisa ter pelo menos um número');

export function meRouter(db: Db) {
  const r = Router();

  r.get('/', async (req, res) => {
    const u = req.user!;
    const [cls] = u.classId ? await db.select().from(schoolClasses).where(eq(schoolClasses.id, u.classId)).limit(1) : [];
    res.json({ data: { ...u, className: cls?.name ?? null } });
  });

  // Troca de senha logado (também usada para sair da senha temporária)
  r.post('/password', async (req, res) => {
    const body = z.object({
      currentPassword: z.string().max(128),
      newPassword: zPassword,
      securityQuestion: zText(120, 10).optional(),
      securityAnswer: zText(60, 2).optional(),
    }).parse(req.body);
    const [u] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
    if (!u) throw unauthorized();
    if (!(await verifySecret(body.currentPassword, u.passwordHash))) {
      throw new HttpError(400, 'INVALID_PASSWORD', 'Senha atual incorreta.', [{ field: 'currentPassword', message: 'Senha atual incorreta' }]);
    }
    if (u.role !== 'student' && body.newPassword.length < 10) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Use pelo menos 10 caracteres.', [{ field: 'newPassword', message: 'Mínimo de 10 caracteres' }]);
    }
    const [updated] = await db.update(users).set({
      passwordHash: await hashSecret(body.newPassword),
      mustChangePassword: false,
      tokenVersion: u.tokenVersion + 1, // derruba sessões em outros aparelhos
      ...(body.securityQuestion && body.securityAnswer
        ? { securityQuestion: body.securityQuestion, securityAnswerHash: await hashSecret(normalizeAnswer(body.securityAnswer)) }
        : {}),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    }).where(eq(users.id, u.id)).returning();
    await audit(db, u.id, 'password.change', 'user', u.id);
    setSessionCookie(res, updated!.id, updated!.tokenVersion); // mantém ESTE aparelho logado
    res.json({ data: toUserDto(updated!) });
  });

  return r;
}

/** Dados públicos para o cadastro e dados de referência para usuários logados. */
export function metaRouter(db: Db) {
  const r = Router();
  // Público: a opção "Administrador" do cadastro só aparece enquanto ele não existir
  r.get('/setup', async (_req, res) => {
    res.json({ data: { adminAvailable: !(await adminExists(db)) } });
  });
  // Público: turmas do ano letivo mais recente (para o aluno escolher no cadastro)
  r.get('/classes', async (_req, res) => {
    const [latest] = await db.select({ y: sql<number>`max(${schoolClasses.schoolYear})` }).from(schoolClasses);
    const rows = latest?.y
      ? await db.select({ id: schoolClasses.id, name: schoolClasses.name, schoolYear: schoolClasses.schoolYear })
        .from(schoolClasses).where(eq(schoolClasses.schoolYear, latest.y)).orderBy(asc(schoolClasses.name))
      : [];
    res.json({ data: rows });
  });
  return r;
}

export function subjectsRouter(db: Db) {
  const r = Router();
  // Aluno vê as matérias gerais + o Inglês do seu nível
  r.get('/', async (req, res) => {
    res.json({ data: await db.select().from(subjects).where(subjectVisibleTo(req.user!)).orderBy(asc(subjects.name)) });
  });
  r.get('/classes', async (_req, res) => {
    res.json({ data: await db.select().from(schoolClasses).orderBy(desc(schoolClasses.schoolYear), asc(schoolClasses.name)) });
  });
  return r;
}

import crypto from 'node:crypto';
import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { and, eq, isNull, lt, or, sql, gt } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '../config.js';
import type { Db } from '../db/client.js';
import { accessKeys, schoolClasses, users, type Role } from '../db/schema.js';
import { audit } from '../lib/audit.js';
import {
  burnVerifyTime, hashAccessKey, hashSecret, normalizeAnswer, verifySecret,
} from '../lib/crypto.js';
import { badRequest, conflict, HttpError, zId, zText } from '../lib/http.js';
import { clearSessionCookie, setSessionCookie } from '../middleware/auth.js';
import { toUserDto } from './dto.js';

/** Existe Administrador? (a opção de criá-lo só aparece enquanto não existir) */
export async function adminExists(db: Db) {
  const [a] = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).limit(1);
  return Boolean(a);
}

export const SECURITY_QUESTIONS = [
  'Qual o nome do seu primeiro animal de estimação?',
  'Qual o nome da sua primeira escola?',
  'Qual a sua comida favorita?',
  'Em que cidade seus pais se conheceram?',
  'Qual o apelido que você tinha na infância?',
  'Qual o nome do seu melhor amigo de infância?',
];

const zUsername = z.string().trim().toLowerCase()
  .regex(/^[a-z0-9._]{3,30}$/, 'Use de 3 a 30 caracteres: letras, números, ponto ou _');

const zPassword = z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres').max(128)
  .regex(/[A-Za-z]/, 'A senha precisa ter pelo menos uma letra')
  .regex(/\d/, 'A senha precisa ter pelo menos um número');

export const RegisterSchema = z.object({
  // 'admin' (Administrador) só pode ser criado uma vez, sem chave; professor e coordenação usam chave
  role: z.enum(['student', 'teacher', 'coordinator', 'admin']),
  username: zUsername,
  fullName: zText(100, 3),
  password: zPassword,
  classId: zId.optional(),
  englishLevel: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
  securityQuestion: zText(120, 10),
  securityAnswer: zText(60, 2),
  accessKey: z.string().trim().max(40).optional(),
}).superRefine((v, ctx) => {
  if (v.role === 'student' && !v.classId) ctx.addIssue({ code: 'custom', path: ['classId'], message: 'Escolha sua turma' });
  if (v.role === 'student' && !v.englishLevel) ctx.addIssue({ code: 'custom', path: ['englishLevel'], message: 'Escolha seu nível de inglês' });
  if ((v.role === 'teacher' || v.role === 'coordinator') && !v.accessKey) {
    ctx.addIssue({ code: 'custom', path: ['accessKey'], message: 'Informe a chave de acesso' });
  }
  if (v.role !== 'student' && v.password.length < 10) {
    ctx.addIssue({ code: 'custom', path: ['password'], message: 'Professores, coordenação e administrador precisam de senha com pelo menos 10 caracteres' });
  }
});

const LoginSchema = z.object({ username: z.string().trim().toLowerCase().max(30), password: z.string().max(128) });
const QuestionSchema = z.object({ username: z.string().trim().toLowerCase().max(30) });
const RecoverySchema = z.object({
  username: z.string().trim().toLowerCase().max(30),
  answer: z.string().max(60),
  newPassword: zPassword,
});

const INVALID_LOGIN = 'Usuário ou senha incorretos.';
const INVALID_RECOVERY = 'Não foi possível trocar a senha. Confira o usuário e a resposta.';

// Bloqueio progressivo após N falhas: 1, 5, 15 minutos
function lockMinutes(failures: number): number {
  const over = failures - config.security.loginLockThreshold;
  if (over < 0) return 0;
  return [1, 5, 15][Math.min(over, 2)]!;
}

const nowIso = () => new Date().toISOString();
const plusMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

// Usuários inexistentes recebem o mesmo tratamento de bloqueio (anti-enumeração)
const ghostFailures = new Map<string, { count: number; lockedUntil: number }>();
function ghostFail(username: string) {
  if (ghostFailures.size > 10_000) ghostFailures.clear();
  const g = ghostFailures.get(username) ?? { count: 0, lockedUntil: 0 };
  g.count += 1;
  const mins = lockMinutes(g.count);
  if (mins) g.lockedUntil = Date.now() + mins * 60_000;
  ghostFailures.set(username, g);
}

function lockedError(untilMs: number) {
  const minutes = Math.max(1, Math.ceil((untilMs - Date.now()) / 60_000));
  return new HttpError(429, 'ACCOUNT_LOCKED', `Muitas tentativas. Tente novamente em ${minutes} min.`, { retryInMinutes: minutes });
}

/** Pergunta falsa, mas estável, para usuários inexistentes (não revela se a conta existe). */
function fakeQuestion(username: string) {
  const h = crypto.createHmac('sha256', config.appSecret).update(`q:${username}`).digest();
  return SECURITY_QUESTIONS[h[0]! % SECURITY_QUESTIONS.length]!;
}

export function authRouter(db: Db) {
  const r = Router();
  const skip = () => config.isTest;
  const loginLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, skip,
    message: { error: { code: 'RATE_LIMITED', message: 'Muitas tentativas. Aguarde um minuto.' } } });
  const registerLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, skip,
    message: { error: { code: 'RATE_LIMITED', message: 'Muitos cadastros deste endereço. Tente mais tarde.' } } });

  r.get('/security-questions', (_req, res) => { res.json({ data: SECURITY_QUESTIONS }); });

  // ---------- Cadastro ----------
  r.post('/register', registerLimiter, async (req, res) => {
    const body = RegisterSchema.parse(req.body);

    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.username, body.username)).limit(1);
    if (taken) throw conflict('Esse nome de usuário já está em uso.');

    let role: Role = 'student';
    let keyId: number | null = null;

    if (body.role === 'admin') {
      // Criação única do Administrador (decisão do responsável: sem código). O índice único
      // ux_users_single_admin garante que só UM exista, mesmo com dois cadastros simultâneos.
      if (await adminExists(db)) throw conflict('O Administrador já foi criado.');
      role = 'admin';
    } else if (body.role === 'student') {
      const [cls] = await db.select({ id: schoolClasses.id }).from(schoolClasses).where(eq(schoolClasses.id, body.classId!)).limit(1);
      if (!cls) throw badRequest('Turma inválida.', [{ field: 'classId', message: 'Turma não encontrada' }]);
    } else {
      // O papel vem da CHAVE, validada e consumida de forma atômica — nunca do que o cliente pediu.
      const now = nowIso();
      const consumed = await db.update(accessKeys)
        .set({ useCount: sql`${accessKeys.useCount} + 1` })
        .where(and(
          eq(accessKeys.keyHash, hashAccessKey(body.accessKey!)),
          eq(accessKeys.role, body.role),
          isNull(accessKeys.revokedAt),
          lt(accessKeys.useCount, accessKeys.maxUses),
          or(isNull(accessKeys.expiresAt), gt(accessKeys.expiresAt, now)),
        ))
        .returning({ id: accessKeys.id, role: accessKeys.role });
      if (!consumed[0]) {
        throw badRequest('Chave de acesso inválida, expirada ou já utilizada.', [{ field: 'accessKey', message: 'Chave inválida' }]);
      }
      role = consumed[0].role;
      keyId = consumed[0].id;
    }

    let created: typeof users.$inferSelect | undefined;
    try {
      [created] = await db.insert(users).values({
        username: body.username,
        fullName: body.fullName,
        passwordHash: await hashSecret(body.password),
        role,
        classId: role === 'student' ? body.classId! : null,
        englishLevel: role === 'student' ? body.englishLevel! : null,
        securityQuestion: body.securityQuestion,
        securityAnswerHash: await hashSecret(normalizeAnswer(body.securityAnswer)),
      }).returning();
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (msg.includes('users.role')) throw conflict('O Administrador já foi criado.');
      if (msg.includes('users.username')) throw conflict('Esse nome de usuário já está em uso.');
      throw e;
    }
    if (!created) throw new Error('Falha ao criar usuário');

    await audit(db, created.id, 'user.register', 'user', created.id, { role });
    if (keyId) await audit(db, created.id, 'access_key.use', 'access_key', keyId);

    setSessionCookie(res, created.id, created.tokenVersion);
    res.status(201).json({ data: toUserDto(created) });
  });

  // ---------- Login ----------
  r.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = LoginSchema.parse(req.body);
    const [u] = await db.select().from(users).where(eq(users.username, username)).limit(1);

    if (!u || !u.isActive) {
      const g = ghostFailures.get(username);
      if (g && g.lockedUntil > Date.now()) throw lockedError(g.lockedUntil);
      await burnVerifyTime(password); // mesmo tempo de resposta de uma senha errada
      ghostFail(username);
      throw new HttpError(401, 'INVALID_CREDENTIALS', INVALID_LOGIN);
    }

    if (u.lockedUntil && Date.parse(u.lockedUntil) > Date.now()) throw lockedError(Date.parse(u.lockedUntil));

    if (!(await verifySecret(password, u.passwordHash))) {
      const failures = u.failedLoginCount + 1;
      const mins = lockMinutes(failures);
      await db.update(users).set({ failedLoginCount: failures, lockedUntil: mins ? plusMinutes(mins) : u.lockedUntil })
        .where(eq(users.id, u.id));
      await audit(db, u.id, mins ? 'login.locked' : 'login.failure', 'user', u.id, { ip: req.ip, failures });
      throw new HttpError(401, 'INVALID_CREDENTIALS', INVALID_LOGIN);
    }

    await db.update(users).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, u.id));
    await audit(db, u.id, 'login.success', 'user', u.id, { ip: req.ip });
    setSessionCookie(res, u.id, u.tokenVersion);
    res.json({ data: toUserDto(u) });
  });

  r.post('/logout', (_req, res) => {
    clearSessionCookie(res);
    res.status(204).end();
  });

  // ---------- Troca de senha pela pergunta de segurança ----------
  r.post('/recovery/question', loginLimiter, async (req, res) => {
    const { username } = QuestionSchema.parse(req.body);
    const [u] = await db.select({ q: users.securityQuestion, active: users.isActive }).from(users)
      .where(eq(users.username, username)).limit(1);
    res.json({ data: { question: u?.active ? u.q : fakeQuestion(username) } });
  });

  r.post('/recovery', loginLimiter, async (req: Request, res) => {
    const { username, answer, newPassword } = RecoverySchema.parse(req.body);
    const [u] = await db.select().from(users).where(eq(users.username, username)).limit(1);

    if (!u || !u.isActive) {
      await burnVerifyTime(answer);
      throw new HttpError(400, 'RECOVERY_FAILED', INVALID_RECOVERY);
    }
    if (u.lockedUntil && Date.parse(u.lockedUntil) > Date.now() && u.failedResetCount >= config.security.resetLockThreshold) {
      throw lockedError(Date.parse(u.lockedUntil));
    }

    if (!(await verifySecret(normalizeAnswer(answer), u.securityAnswerHash))) {
      const failures = u.failedResetCount + 1;
      const lock = failures >= config.security.resetLockThreshold;
      await db.update(users).set({
        failedResetCount: failures,
        lockedUntil: lock ? plusMinutes(config.security.resetLockMinutes) : u.lockedUntil,
      }).where(eq(users.id, u.id));
      await audit(db, u.id, 'password.reset.failure', 'user', u.id, { ip: req.ip, failures });
      throw new HttpError(400, 'RECOVERY_FAILED', INVALID_RECOVERY);
    }

    // Sucesso: nova senha, zera contadores e derruba todas as sessões antigas (token_version + 1)
    const [updated] = await db.update(users).set({
      passwordHash: await hashSecret(newPassword),
      failedLoginCount: 0,
      failedResetCount: 0,
      lockedUntil: null,
      mustChangePassword: false,
      tokenVersion: u.tokenVersion + 1,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    }).where(eq(users.id, u.id)).returning();
    await audit(db, u.id, 'password.reset.success', 'user', u.id, { ip: req.ip });
    setSessionCookie(res, updated!.id, updated!.tokenVersion);
    res.json({ data: toUserDto(updated!) });
  });

  return r;
}

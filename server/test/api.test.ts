// Testes de API das mitigações de docs/security/modelo-de-ameacas.md
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { createDb, migrate, type Db } from '../src/db/client.js';
import { accessKeys, schoolClasses, subjects, teachingAssignments, users } from '../src/db/schema.js';
import { accessKeyHint, generateAccessKey, hashAccessKey, hashSecret, normalizeAnswer } from '../src/lib/crypto.js';

let app: Express;
let db: Db;
const ids: Record<string, number> = {};
const H = { 'X-Requested-With': 'escola' };

async function user(username: string, role: 'student' | 'teacher' | 'coordinator' | 'admin', classId: number | null = null, englishLevel: number | null = null) {
  const [u] = await db.insert(users).values({
    username, fullName: username.toUpperCase(), role, classId, englishLevel: role === 'student' ? (englishLevel ?? 3) : null,
    passwordHash: await hashSecret('senha12345'),
    securityQuestion: 'Qual o nome do seu primeiro animal?', securityAnswerHash: await hashSecret(normalizeAnswer('Rex')),
  }).returning();
  return u!.id;
}

async function login(username: string, password = 'senha12345') {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').set(H).send({ username, password });
  expect(res.status, `login ${username}`).toBe(200);
  return agent;
}

beforeAll(async () => {
  const conn = createDb('file::memory:');
  db = conn.db;
  await migrate(conn.client);
  app = createApp(db, conn.client);

  const [a, b] = await db.insert(schoolClasses).values([{ name: 'A', schoolYear: 2026 }, { name: 'B', schoolYear: 2026 }]).returning();
  const [mat, por] = await db.insert(subjects).values([{ name: 'Mat' }, { name: 'Por' }]).returning();
  Object.assign(ids, { classA: a!.id, classB: b!.id, mat: mat!.id, por: por!.id });
  ids.alice = await user('alice', 'student', a!.id);
  ids.bob = await user('bob', 'student', b!.id);
  ids.teacher = await user('teacher', 'teacher');
  ids.admin = await user('admin', 'admin');
  ids.coord = await user('coord', 'coordinator');
  await db.insert(teachingAssignments).values({ teacherId: ids.teacher, classId: a!.id, subjectId: mat!.id });
});

describe('CSRF', () => {
  it('bloqueia POST sem o header X-Requested-With', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'alice', password: 'senha12345' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF');
  });
});

describe('Login e enumeração de usuários', () => {
  it('mesma mensagem para usuário inexistente e senha errada', async () => {
    const a = await request(app).post('/api/auth/login').set(H).send({ username: 'ninguem', password: 'x' });
    const b = await request(app).post('/api/auth/login').set(H).send({ username: 'alice', password: 'errada' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });

  it('bloqueio progressivo após 5 falhas', async () => {
    await user('carol', 'student', ids.classA);
    for (let i = 0; i < 5; i++) await request(app).post('/api/auth/login').set(H).send({ username: 'carol', password: 'errada' });
    const res = await request(app).post('/api/auth/login').set(H).send({ username: 'carol', password: 'senha12345' });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('cookie de sessão HttpOnly e SameSite=Strict; resposta sem hashes', async () => {
    const res = await request(app).post('/api/auth/login').set(H).send({ username: 'alice', password: 'senha12345' });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(JSON.stringify(res.body)).not.toMatch(/hash/i);
  });
});

describe('Troca de senha pela pergunta de segurança', () => {
  it('usuário inexistente recebe pergunta estável (não revela existência)', async () => {
    const q1 = await request(app).post('/api/auth/recovery/question').set(H).send({ username: 'fantasma' });
    const q2 = await request(app).post('/api/auth/recovery/question').set(H).send({ username: 'fantasma' });
    expect(q1.status).toBe(200);
    expect(q1.body.data.question).toBe(q2.body.data.question);
  });

  it('resposta certa (sem acento/maiúsculas) troca a senha e derruba sessões antigas', async () => {
    await user('dave', 'student', ids.classA);
    const old = await login('dave');
    const res = await request(app).post('/api/auth/recovery').set(H)
      .send({ username: 'dave', answer: '  REX ', newPassword: 'novaSenha1' });
    expect(res.status).toBe(200);
    expect((await old.get('/api/me')).status).toBe(401); // sessão antiga invalidada
    await login('dave', 'novaSenha1');
  });

  it('5 respostas erradas bloqueiam a troca', async () => {
    await user('eve', 'student', ids.classA);
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/recovery').set(H).send({ username: 'eve', answer: 'gato', newPassword: 'novaSenha1' });
    }
    const res = await request(app).post('/api/auth/recovery').set(H).send({ username: 'eve', answer: 'rex', newPassword: 'novaSenha1' });
    expect(res.status).toBe(429);
  });
});

describe('Cadastro e chaves de acesso', () => {
  const base = { fullName: 'Novo Usuário', password: 'senhaForte123', securityQuestion: 'Qual o nome da sua escola?', securityAnswer: 'escola' };

  it('aluno se cadastra sem chave', async () => {
    const semNivel = await request(app).post('/api/auth/register').set(H).send({ ...base, role: 'student', username: 'novoaluno', classId: ids.classA });
    expect(semNivel.status).toBe(400); // nível de inglês é obrigatório
    const res = await request(app).post('/api/auth/register').set(H).send({ ...base, role: 'student', username: 'novoaluno', classId: ids.classA, englishLevel: 2 });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('student');
    expect(res.body.data.englishLevel).toBe(2);
  });

  it('professor sem chave é rejeitado', async () => {
    const res = await request(app).post('/api/auth/register').set(H).send({ ...base, role: 'teacher', username: 'semchave' });
    expect(res.status).toBe(400);
  });

  it('chave de professor não cria coordenação; chave é de uso único', async () => {
    const key = generateAccessKey('teacher');
    await db.insert(accessKeys).values({ keyHash: hashAccessKey(key), keyHint: accessKeyHint(key), role: 'teacher', maxUses: 1 });
    const asCoord = await request(app).post('/api/auth/register').set(H).send({ ...base, role: 'coordinator', username: 'golpe', accessKey: key });
    expect(asCoord.status).toBe(400);
    const ok = await request(app).post('/api/auth/register').set(H).send({ ...base, role: 'teacher', username: 'profnovo', accessKey: key.toLowerCase() });
    expect(ok.status).toBe(201);
    expect(ok.body.data.role).toBe('teacher');
    const again = await request(app).post('/api/auth/register').set(H).send({ ...base, role: 'teacher', username: 'profnovo2', accessKey: key });
    expect(again.status).toBe(400);
  });

  it('chave é guardada só como hash', async () => {
    const rows = await db.select().from(accessKeys);
    for (const r of rows) expect(r.keyHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('Autorização (IDOR e atribuições)', () => {
  it('aluno só vê o próprio boletim; rotas de aluno ignoram ids de terceiros', async () => {
    const alice = await login('alice');
    const res = await alice.get('/api/student/grades');
    expect(res.status).toBe(200);
    expect((await alice.get(`/api/teacher/students/${ids.bob}/report`)).status).toBe(403);
    expect((await alice.get('/api/teacher/gradesheet').query({ classId: ids.classB, subjectId: ids.mat, bimester: 1 })).status).toBe(403);
  });

  it('professor lança nota só na turma/matéria atribuída e respeita o máximo 8,0', async () => {
    const t = await login('teacher');
    const ok = await t.put('/api/teacher/gradesheet').set(H).send({
      classId: ids.classA, subjectId: ids.mat, bimester: 1, entries: [{ studentId: ids.alice, component: 'exam1', score: 7.5 }],
    });
    expect(ok.status).toBe(200);
    const otherSubject = await t.put('/api/teacher/gradesheet').set(H).send({
      classId: ids.classA, subjectId: ids.por, bimester: 1, entries: [{ studentId: ids.alice, component: 'exam1', score: 7 }],
    });
    expect(otherSubject.status).toBe(403);
    const tooHigh = await t.put('/api/teacher/gradesheet').set(H).send({
      classId: ids.classA, subjectId: ids.mat, bimester: 1, entries: [{ studentId: ids.alice, component: 'exam2', score: 9 }],
    });
    expect(tooHigh.status).toBe(400);
    const otherClassStudent = await t.put('/api/teacher/gradesheet').set(H).send({
      classId: ids.classA, subjectId: ids.mat, bimester: 1, entries: [{ studentId: ids.bob, component: 'exam1', score: 5 }],
    });
    expect(otherClassStudent.status).toBe(403);
  });

  it('a nota lançada aparece no boletim do aluno', async () => {
    const alice = await login('alice');
    const res = await alice.get('/api/student/grades');
    const mat = res.body.data.subjects.find((s: { subject: { id: number } }) => s.subject.id === ids.mat);
    expect(mat.bimesters[0].scores.exam1).toBe(7.5);
  });

  it('aluno e professor não acessam rotas de admin', async () => {
    expect((await (await login('alice')).get('/api/admin/users')).status).toBe(403);
    expect((await (await login('teacher')).get('/api/admin/users')).status).toBe(403);
    expect((await (await login('admin')).get('/api/admin/users')).status).toBe(200);
  });

  it('professor não publica aviso para a escola inteira nem para turma que não leciona', async () => {
    const t = await login('teacher');
    expect((await t.post('/api/announcements').set(H).send({ title: 'Oi', body: 'x', classId: null })).status).toBe(403);
    expect((await t.post('/api/announcements').set(H).send({ title: 'Oi', body: 'x', classId: ids.classB })).status).toBe(403);
    expect((await t.post('/api/announcements').set(H).send({ title: 'Oi', body: 'x', classId: ids.classA })).status).toBe(201);
  });

  it('aluno da turma B não vê aviso da turma A', async () => {
    const bob = await login('bob');
    const res = await bob.get('/api/announcements');
    expect(res.body.data.every((a: { classId: number | null }) => a.classId !== ids.classA)).toBe(true);
  });
});

describe('Senha temporária (reset pelo admin)', () => {
  it('obriga a trocar a senha antes de usar o app', async () => {
    await user('frank', 'student', ids.classA);
    const [frank] = await db.select().from(users).where(eq(users.username, 'frank'));
    const admin = await login('admin');
    const reset = await admin.post(`/api/admin/users/${frank!.id}/reset-password`).set(H);
    const temp = reset.body.data.temporaryPassword as string;
    const f = await login('frank', temp);
    expect((await f.get('/api/student/grades')).body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await f.post('/api/me/password').set(H).send({ currentPassword: temp, newPassword: 'minhaSenha9' })).status).toBe(200);
    expect((await f.get('/api/student/grades')).status).toBe(200);
  });
});

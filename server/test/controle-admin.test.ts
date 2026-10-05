// Controle total do Administrador (pedido de 2026-10-05): apagar contas, editar turmas, editar avisos/tarefas/eventos.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { createDb, migrate, type Db } from '../src/db/client.js';
import { grades, schoolClasses, subjects, teachingAssignments, users } from '../src/db/schema.js';
import { hashSecret, normalizeAnswer } from '../src/lib/crypto.js';

let app: Express;
let db: Db;
const H = { 'X-Requested-With': 'escola' };
const ids: Record<string, number> = {};

async function user(username: string, role: 'student' | 'teacher' | 'coordinator' | 'admin') {
  const [u] = await db.insert(users).values({
    username, fullName: username, role, classId: role === 'student' ? ids.cls! : null, englishLevel: role === 'student' ? 3 : null,
    passwordHash: await hashSecret('senha12345'), securityQuestion: 'Pergunta?', securityAnswerHash: await hashSecret(normalizeAnswer('x')),
  }).returning();
  return u!.id;
}

async function login(username: string) {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').set(H).send({ username, password: 'senha12345' })).status).toBe(200);
  return agent;
}

beforeAll(async () => {
  const conn = createDb('file::memory:');
  db = conn.db;
  await migrate(conn.client);
  app = createApp(db, conn.client);
  const [c] = await db.insert(schoolClasses).values({ name: '9º Ano', schoolYear: 2026 }).returning();
  ids.cls = c!.id;
  const [s] = await db.insert(subjects).values({ name: 'Física' }).returning();
  ids.fis = s!.id;
  ids.admin = await user('admin', 'admin');
  ids.coord = await user('coord', 'coordinator');
  ids.prof = await user('prof', 'teacher');
  ids.prof2 = await user('prof2', 'teacher');
  ids.aluno = await user('aluno', 'student');
  await db.insert(teachingAssignments).values([
    { teacherId: ids.prof, classId: ids.cls, subjectId: ids.fis },
    { teacherId: ids.prof2, classId: ids.cls, subjectId: ids.fis },
  ]);
  await db.insert(grades).values({ studentId: ids.aluno, classId: ids.cls, subjectId: ids.fis, bimester: 1, component: 'exam1', score: 7 });
});

describe('Apagar contas', () => {
  it('Coordenação não apaga contas', async () => {
    const coord = await login('coord');
    expect((await coord.delete(`/api/admin/users/${ids.aluno}`).set(H)).status).toBe(403);
  });

  it('Administrador não apaga a própria conta', async () => {
    const admin = await login('admin');
    expect((await admin.delete(`/api/admin/users/${ids.admin}`).set(H)).status).toBe(403);
  });

  it('Administrador apaga um aluno, junto com as notas dele, e fica registrado na auditoria', async () => {
    const admin = await login('admin');
    expect((await admin.delete(`/api/admin/users/${ids.aluno}`).set(H)).status).toBe(204);
    expect(await db.select().from(users).where(eq(users.id, ids.aluno!))).toHaveLength(0);
    expect(await db.select().from(grades).where(eq(grades.studentId, ids.aluno!))).toHaveLength(0);
    const audit = (await admin.get('/api/admin/audit')).body.data;
    expect(audit.some((a: { action: string }) => a.action === 'user.delete')).toBe(true);
    // a sessão do apagado deixa de valer
    expect((await request(app).post('/api/auth/login').set(H).send({ username: 'aluno', password: 'senha12345' })).status).toBe(401);
  });
});

describe('Editar turmas', () => {
  it('renomeia a turma', async () => {
    const admin = await login('admin');
    const res = await admin.patch(`/api/admin/classes/${ids.cls}`).set(H).send({ name: '9º Ano A' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('9º Ano A');
  });
});

describe('Editar avisos, tarefas e eventos', () => {
  it('Administrador edita o que um professor publicou; outro professor não', async () => {
    const prof = await login('prof');
    const ann = (await prof.post('/api/announcements').set(H).send({ title: 'Aviso', body: 'texto', classId: ids.cls })).body.data;
    const hw = (await prof.post('/api/homework').set(H).send({ title: 'Lista', classId: ids.cls, subjectId: ids.fis, dueDate: '2026-12-01' })).body.data;
    const ev = (await prof.post('/api/calendar').set(H).send({ title: 'Prova', eventType: 'exam', startsOn: '2026-12-02', classId: ids.cls, subjectId: ids.fis })).body.data;

    const prof2 = await login('prof2');
    expect((await prof2.put(`/api/announcements/${ann.id}`).set(H).send({ title: 'Invasão', body: 'x', classId: ids.cls })).status).toBe(403);

    const admin = await login('admin');
    const a2 = await admin.put(`/api/announcements/${ann.id}`).set(H).send({ title: 'Aviso corrigido', body: 'novo texto', classId: null, isPinned: true });
    expect(a2.status).toBe(200);
    expect(a2.body.data).toMatchObject({ title: 'Aviso corrigido', classId: null, isPinned: true });

    const h2 = await admin.put(`/api/homework/${hw.id}`).set(H).send({ title: 'Lista 2', classId: ids.cls, subjectId: ids.fis, dueDate: '2026-12-05' });
    expect(h2.body.data).toMatchObject({ title: 'Lista 2', dueDate: '2026-12-05' });

    const e2 = await admin.put(`/api/calendar/${ev.id}`).set(H).send({ title: 'Prova adiada', eventType: 'exam', startsOn: '2026-12-09', classId: ids.cls, subjectId: ids.fis });
    expect(e2.body.data).toMatchObject({ title: 'Prova adiada', startsOn: '2026-12-09', source: 'manual' });
  });
});

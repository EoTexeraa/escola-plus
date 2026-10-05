// Regras pedidas em 2026-10-04: Administrador único, coordenação, aluno lança notas, inglês por nível,
// calendário de provas por grupos e conteúdos.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { createDb, migrate, type Db } from '../src/db/client.js';
import { homework, schoolClasses, studyContents, subjects, users } from '../src/db/schema.js';
import { hashSecret, normalizeAnswer } from '../src/lib/crypto.js';
import { planExams } from '../src/routes/exams.js';

let app: Express;
let db: Db;
const H = { 'X-Requested-With': 'escola' };
const ids: Record<string, number> = {};
const base = { password: 'senhaForte123', securityQuestion: 'Qual o nome da sua escola?', securityAnswer: 'escola' };

async function user(username: string, role: 'student' | 'teacher' | 'coordinator' | 'admin', englishLevel: number | null = null) {
  const [u] = await db.insert(users).values({
    username, fullName: username, role, classId: role === 'student' ? ids.cls! : null, englishLevel,
    passwordHash: await hashSecret('senha12345'), securityQuestion: 'Pergunta?', securityAnswerHash: await hashSecret(normalizeAnswer('x')),
  }).returning();
  return u!.id;
}

async function login(username: string, password = 'senha12345') {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').set(H).send({ username, password })).status).toBe(200);
  return agent;
}

const findSubject = (body: { data: { subjects: Array<{ subject: { id: number } }> } }, id: number) =>
  body.data.subjects.find((x) => x.subject.id === id) as unknown as { bimesters: Array<{ scores: Record<string, number>; authors: Record<string, string> }> };

beforeAll(async () => {
  const conn = createDb('file::memory:');
  db = conn.db;
  await migrate(conn.client);
  app = createApp(db, conn.client);
  const [c] = await db.insert(schoolClasses).values({ name: '9º Ano', schoolYear: 2026 }).returning();
  ids.cls = c!.id;
  const s = await db.insert(subjects).values([
    { name: 'Gramática', examGroup: 1, examWeekday: 2 },
    { name: 'Física', examGroup: 1, examWeekday: 4 },
    { name: 'Álgebra', examGroup: 2, examWeekday: 2 },
    { name: 'Biologia', examGroup: 2, examWeekday: 4 },
    { name: 'Inglês 2', examGroup: 2, examWeekday: 5, englishLevel: 2 },
    { name: 'Inglês 3', examGroup: 2, examWeekday: 5, englishLevel: 3 },
  ]).returning();
  for (const x of s) ids[x.name] = x.id;
  ids.aluno2 = await user('aluno2', 'student', 2);
  ids.aluno3 = await user('aluno3', 'student', 3);
  ids.coord = await user('coord', 'coordinator');
});

describe('Administrador único', () => {
  it('a opção existe até o primeiro Administrador ser criado e depois some', async () => {
    expect((await request(app).get('/api/meta/setup')).body.data.adminAvailable).toBe(true);
    const ok = await request(app).post('/api/auth/register').set(H).send({ ...base, role: 'admin', username: 'dono', fullName: 'Dono' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.role).toBe('admin');
    expect((await request(app).get('/api/meta/setup')).body.data.adminAvailable).toBe(false);
    const again = await request(app).post('/api/auth/register').set(H).send({ ...base, role: 'admin', username: 'intruso', fullName: 'Intruso' });
    expect(again.status).toBe(409);
  });

  it('Administrador vê auditoria e backup; Coordenação não, mas gerencia o resto', async () => {
    const dono = await login('dono', 'senhaForte123');
    expect((await dono.get('/api/admin/audit')).status).toBe(200);
    const coord = await login('coord');
    expect((await coord.get('/api/admin/audit')).status).toBe(403);
    expect((await coord.get('/api/admin/backup/download')).status).toBe(403);
    expect((await coord.get('/api/admin/users')).status).toBe(200);
  });

  it('Coordenação não redefine senha nem desativa o Administrador', async () => {
    const coord = await login('coord');
    const list = await coord.get('/api/admin/users').query({ role: 'admin' });
    const adminId = list.body.data[0].id;
    expect((await coord.post(`/api/admin/users/${adminId}/reset-password`).set(H)).status).toBe(403);
    expect((await coord.patch(`/api/admin/users/${adminId}`).set(H).send({ isActive: false })).status).toBe(403);
  });
});

describe('Aluno lança as próprias notas', () => {
  it('lança, aparece como lançada pelo aluno e respeita o máximo', async () => {
    const a = await login('aluno3');
    const ok = await a.put('/api/student/grades').set(H)
      .send({ subjectId: ids['Gramática'], bimester: 1, entries: [{ component: 'exam1', score: 7 }, { component: 'project', score: 1 }] });
    expect(ok.status).toBe(200);
    const g = findSubject(ok.body, ids['Gramática']!);
    expect(g.bimesters[0]!.scores.exam1).toBe(7);
    expect(g.bimesters[0]!.authors.exam1).toBe('student');
    const tooHigh = await a.put('/api/student/grades').set(H)
      .send({ subjectId: ids['Gramática'], bimester: 1, entries: [{ component: 'exam2', score: 8.5 }] });
    expect(tooHigh.status).toBe(400);
  });

  it('não lança nota no Inglês de outro nível', async () => {
    const a = await login('aluno3');
    const res = await a.put('/api/student/grades').set(H)
      .send({ subjectId: ids['Inglês 2'], bimester: 1, entries: [{ component: 'exam1', score: 5 }] });
    expect(res.status).toBe(403);
  });

  it('apagar (null) remove a nota', async () => {
    const a = await login('aluno3');
    const res = await a.put('/api/student/grades').set(H)
      .send({ subjectId: ids['Gramática'], bimester: 1, entries: [{ component: 'project', score: null }] });
    expect(findSubject(res.body, ids['Gramática']!).bimesters[0]!.scores.project).toBeUndefined();
  });
});

describe('Inglês por nível', () => {
  it('o boletim só traz o Inglês do nível do aluno', async () => {
    const a = await login('aluno2');
    const names = (await a.get('/api/student/grades')).body.data.subjects.map((x: { subject: { name: string } }) => x.subject.name);
    expect(names).toContain('Inglês 2');
    expect(names).not.toContain('Inglês 3');
  });

  it('tarefas e conteúdos de outro nível não aparecem', async () => {
    await db.insert(homework).values({ title: 'Tarefa Inglês 3', classId: ids.cls!, subjectId: ids['Inglês 3']!, dueDate: '2099-01-01' });
    await db.insert(studyContents).values({ subjectId: ids['Inglês 3']!, bimester: 1, examNumber: 1, title: 'Conteúdo Inglês 3', body: 'x' });
    const a2 = await login('aluno2');
    expect((await a2.get('/api/homework')).body.data.some((h: { title: string }) => h.title === 'Tarefa Inglês 3')).toBe(false);
    expect((await a2.get('/api/contents')).body.data.some((c: { title: string }) => c.title === 'Conteúdo Inglês 3')).toBe(false);
    const a3 = await login('aluno3');
    expect((await a3.get('/api/contents')).body.data.some((c: { title: string }) => c.title === 'Conteúdo Inglês 3')).toBe(true);
  });

  it('o painel inicial também não mostra tarefa nem prova de Inglês de outro nível', async () => {
    const { calendarEvents } = await import('../src/db/schema.js');
    const { todayIso } = await import('../src/lib/access.js');
    await db.insert(calendarEvents).values({ title: 'P1 — Inglês 3', eventType: 'exam', startsOn: todayIso(2), subjectId: ids['Inglês 3']! });
    await db.insert(homework).values({ title: 'Tarefa próxima Inglês 3', classId: ids.cls!, subjectId: ids['Inglês 3']!, dueDate: todayIso(3) });
    const a2 = await login('aluno2');
    const ov = (await a2.get('/api/student/overview')).body.data;
    expect(ov.upcomingEvents.some((e: { title: string }) => e.title === 'P1 — Inglês 3')).toBe(false);
    expect(ov.pendingHomework.some((h: { title: string }) => h.title === 'Tarefa próxima Inglês 3')).toBe(false);
    const a3 = await login('aluno3');
    const ov3 = (await a3.get('/api/student/overview')).body.data;
    expect(ov3.upcomingEvents.some((e: { title: string }) => e.title === 'P1 — Inglês 3')).toBe(true);
  });
});

describe('Calendário de provas por grupos', () => {
  const subj = [
    { id: 1, name: 'Gramática', examGroup: 1, examWeekday: 2 }, { id: 2, name: 'Física', examGroup: 1, examWeekday: 4 },
    { id: 3, name: 'Álgebra', examGroup: 2, examWeekday: 2 }, { id: 4, name: 'Biologia', examGroup: 2, examWeekday: 4 },
    { id: 5, name: 'Inglês 3', examGroup: 2, examWeekday: 5 },
  ];

  it('alterna G1/G2 por 8 semanas: cada matéria tem P1..P4 no dia certo', () => {
    const plan = planExams('2026-10-06', 1, subj); // terça
    const of = (id: number) => plan.filter((p) => p.subjectId === id);
    expect(of(1).map((p) => p.date)).toEqual(['2026-10-06', '2026-10-20', '2026-11-03', '2026-11-17']); // G1 terça
    expect(of(2).map((p) => p.date)).toEqual(['2026-10-08', '2026-10-22', '2026-11-05', '2026-11-19']); // G1 quinta
    expect(of(3).map((p) => p.date)).toEqual(['2026-10-13', '2026-10-27', '2026-11-10', '2026-11-24']); // G2 terça
    expect(of(5).map((p) => p.date)).toEqual(['2026-10-16', '2026-10-30', '2026-11-13', '2026-11-27']); // G2 sexta (Inglês)
    expect(of(1).map((p) => p.examNumber)).toEqual([1, 2, 3, 4]);
  });

  it('começando pelo Grupo 2, a primeira semana é do Grupo 2', () => {
    const plan = planExams('2026-10-06', 2, subj);
    expect(plan[0]).toMatchObject({ subjectId: 3, date: '2026-10-06', examNumber: 1 });
  });

  it('coordenação gera pela API; data precisa ser terça; regenerar não duplica; aluno não gera', async () => {
    const coord = await login('coord');
    expect((await coord.put('/api/exam-schedule/1').set(H).send({ firstTuesday: '2026-10-07' })).status).toBe(400); // quarta
    const r1 = await coord.put('/api/exam-schedule/1').set(H).send({ firstTuesday: '2026-10-06', startingGroup: 1 });
    expect(r1.status).toBe(200);
    const r2 = await coord.put('/api/exam-schedule/1').set(H).send({ firstTuesday: '2026-10-06', startingGroup: 1 });
    expect(r2.body.data.created).toBe(r1.body.data.created);
    const cal = await coord.get('/api/calendar').query({ from: '2026-10-01', to: '2026-12-31' });
    expect(cal.body.data.events.filter((e: { source: string }) => e.source === 'auto').length).toBe(r1.body.data.created);
    const aluno = await login('aluno3');
    expect((await aluno.put('/api/exam-schedule/1').set(H).send({ firstTuesday: '2026-10-06' })).status).toBe(403);
  });
});

describe('Conteúdos', () => {
  it('coordenação publica; aluno só lê e vê a data da prova', async () => {
    const coord = await login('coord');
    const ok = await coord.post('/api/contents').set(H)
      .send({ subjectId: ids['Física'], bimester: 1, examNumber: 2, title: 'Eletricidade', body: 'Lei de Ohm' });
    expect(ok.status).toBe(201);
    const aluno = await login('aluno3');
    expect((await aluno.post('/api/contents').set(H).send({ subjectId: ids['Física'], bimester: 1, title: 'x', body: 'y' })).status).toBe(403);
    const list = (await aluno.get('/api/contents').query({ bimester: 1 })).body.data;
    const c = list.find((x: { title: string }) => x.title === 'Eletricidade');
    expect(c.examDate).toBe('2026-10-22'); // P2 de Física (G1, quinta) no calendário gerado acima
  });
});

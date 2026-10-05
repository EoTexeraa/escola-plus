// Dados de demonstração do 9º ano: `npm run seed` (só roda com o banco vazio).
import { createDb, migrate } from './client.js';
import {
  announcements, calendarEvents, examSchedules, grades, homework, schoolClasses, studyContents, studyRoutines,
  subjects, teachingAssignments, users, type GradeComponent,
} from './schema.js';
import { hashSecret, normalizeAnswer } from '../lib/crypto.js';
import { todayIso } from '../lib/access.js';
import { planExams } from '../routes/exams.js';
import { curriculumRows } from './curriculum.js';

const { client, db } = createDb();
await migrate(client);

const existing = await db.select({ id: users.id }).from(users).limit(1);
if (existing.length) {
  console.log('O banco já tem usuários — seed ignorado. Apague data/escola.db para recomeçar.');
  process.exit(0);
}

const today = todayIso();
const year = Number(today.slice(0, 4));
const Q = 'Qual o nome do seu primeiro animal de estimação?';
const answer = await hashSecret(normalizeAnswer('rex'));

const [nono] = await db.insert(schoolClasses).values([{ name: '9º Ano', schoolYear: year }]).returning();
const classId = nono!.id;

// Currículo do 9º ano + agenda fixa de provas (definido em curriculum.ts)
const subs = await db.insert(subjects).values(curriculumRows()).returning();
const S = Object.fromEntries(subs.map((s) => [s.name, s]));

const mk = async (username: string, fullName: string, role: 'student' | 'teacher' | 'coordinator' | 'admin', password: string,
  extra: { englishLevel?: number } = {}) =>
  (await db.insert(users).values({
    username, fullName, role, passwordHash: await hashSecret(password),
    classId: role === 'student' ? classId : null, englishLevel: role === 'student' ? extra.englishLevel ?? 3 : null,
    securityQuestion: Q, securityAnswerHash: answer,
  }).returning())[0]!;

const admin = await mk('admin', 'Administrador', 'admin', 'admin12345');
const coord = await mk('coordenacao', 'Coordenação 9º Ano', 'coordinator', 'coord12345');
const carla = await mk('professor', 'Prof. Carla Mendes', 'teacher', 'professor123');
const marcos = await mk('marcos', 'Prof. Marcos Silva', 'teacher', 'professor123');
const alunos = [
  await mk('aluno', 'Lucas Oliveira', 'student', 'aluno123', { englishLevel: 3 }),
  await mk('ana', 'Ana Souza', 'student', 'aluno123', { englishLevel: 2 }),
  await mk('pedro', 'Pedro Lima', 'student', 'aluno123', { englishLevel: 4 }),
  await mk('julia', 'Júlia Castro', 'student', 'aluno123', { englishLevel: 3 }),
];

// Carla: linguagens + matemática; Marcos: ciências, humanas e Inglês
const carlaSubs = ['Gramática', 'Literatura', 'Redação', 'Álgebra', 'Geometria', 'Artes', 'Educação Física'];
await db.insert(teachingAssignments).values([
  ...carlaSubs.map((n) => ({ teacherId: carla.id, classId, subjectId: S[n]!.id })),
  ...subs.filter((s) => !carlaSubs.includes(s.name)).map((s) => ({ teacherId: marcos.id, classId, subjectId: s.id })),
]);

// Notas: B1–B3 completos; B4 (atual) com P1 e P2. Parte lançada pelo próprio aluno, parte pelo professor.
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const halfStep = (n: number, max: number) => Math.max(0, Math.min(max, Math.round(n * 2) / 2));
const rows: (typeof grades.$inferInsert)[] = [];
for (const [si, s] of alunos.entries()) {
  const mine = subs.filter((x) => x.englishLevel === null || x.englishLevel === s.englishLevel);
  for (const [ji, sub] of mine.entries()) {
    const base = 3.5 + ((si * 3 + ji * 5) % 7) * 0.6; // 3,5 a 7,1 (provas valem até 8)
    const teacher = carlaSubs.includes(sub.name) ? carla.id : marcos.id;
    for (let b = 1; b <= 4; b++) {
      const exams = b === 4 ? 2 : 4;
      const put = (component: GradeComponent, score: number) => rows.push({
        studentId: s.id, classId, subjectId: sub.id, bimester: b, component, score,
        gradedBy: (ji + b) % 3 === 0 ? s.id : teacher, // ~1/3 lançado pelo aluno
      });
      for (let e = 1; e <= exams; e++) put(`exam${e}` as GradeComponent, halfStep(base + rand() * 2 - 1, 8));
      if (b < 4) {
        put('project', halfStep(0.5 + rand() * 0.6, 1));
        put('homework', halfStep(0.4 + rand() * 0.7, 1));
        if (rand() > 0.6) put('mock', halfStep(rand(), 1));
      }
    }
  }
}
for (let i = 0; i < rows.length; i += 200) await db.insert(grades).values(rows.slice(i, i + 200));

// Calendário de provas do 4º bimestre: P1 e P2 já passaram; P3 começa na próxima terça
const nextTuesday = (() => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + ((2 - d.getUTCDay() + 7) % 7 || 7)); return d.toISOString().slice(0, 10); })();
const firstTuesday = (() => { const d = new Date(`${nextTuesday}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 28); return d.toISOString().slice(0, 10); })();
const plan = planExams(firstTuesday, 1, subs);
for (const p of plan) {
  await db.insert(calendarEvents).values({
    title: p.title, eventType: 'exam', startsOn: p.date, subjectId: p.subjectId, bimester: 4, examNumber: p.examNumber,
    source: 'auto', description: `4º bimestre · Grupo ${p.group}`, authorId: coord.id,
  });
}
await db.insert(examSchedules).values({ schoolYear: year, bimester: 4, firstTuesday, startingGroup: 1, updatedBy: coord.id });

const d = (offset: number) => todayIso(offset);
await db.insert(calendarEvents).values([
  { title: 'Reunião de pais', eventType: 'meeting', startsOn: d(4), description: 'Auditório, 19h', authorId: coord.id },
  { title: 'Feira de Ciências', eventType: 'event', startsOn: d(12), endsOn: d(13), description: 'Projetos no pátio', authorId: coord.id },
  { title: 'Feriado', eventType: 'holiday', startsOn: d(29), description: 'Não haverá aula', authorId: coord.id },
]);

await db.insert(announcements).values([
  { title: 'Bem-vindos ao Escola+!', body: 'Acompanhe notas, conteúdos das provas, tarefas e o calendário do 9º ano direto pelo celular.', category: 'general', isPinned: true, authorId: admin.id, createdAt: `${d(-3)} 08:00:00` },
  { title: 'P3 começa na terça', body: 'Semana do Grupo 1: terça (Gramática, Literatura, Redação, Ed. Física) e quinta (Física, Química, Artes). Os conteúdos já estão na aba Conteúdos.', category: 'exam', classId, authorId: coord.id, createdAt: `${d(0)} 07:15:00` },
  { title: 'Reunião de pais e mestres', body: 'A reunião acontecerá no auditório às 19h.', category: 'event', authorId: coord.id, createdAt: `${d(-1)} 10:30:00` },
]);

await db.insert(homework).values([
  { title: 'Lista de equações do 2º grau', description: 'Exercícios 1 a 15 da página 84.', classId, subjectId: S['Álgebra']!.id, dueDate: d(2), authorId: carla.id },
  { title: 'Redação dissertativa', description: 'Tema: tecnologia e juventude. 25 a 30 linhas.', classId, subjectId: S['Redação']!.id, dueDate: d(5), authorId: carla.id },
  { title: 'Questionário de genética', description: 'Capítulo 7, questões 1 a 10.', classId, subjectId: S['Biologia']!.id, dueDate: d(8), authorId: marcos.id },
  { title: 'Reading — Unit 6', description: 'Texto e exercícios A–C.', classId, subjectId: S['Inglês 3']!.id, dueDate: d(3), authorId: marcos.id },
]);

const p3 = (n: string) => plan.find((p) => p.subjectId === S[n]!.id && p.examNumber === 3)?.date;
await db.insert(studyContents).values([
  { subjectId: S['Gramática']!.id, bimester: 4, examNumber: 3, title: 'Orações subordinadas', body: '• Orações subordinadas substantivas (6 tipos)\n• Orações subordinadas adjetivas restritivas e explicativas\n• Pontuação com orações adjetivas\n\nLivro: capítulo 9, páginas 120–138.', authorId: admin.id },
  { subjectId: S['Física']!.id, bimester: 4, examNumber: 3, title: 'Eletricidade', body: '• Carga elétrica e processos de eletrização\n• Corrente, tensão e resistência (Lei de Ohm)\n• Associação de resistores em série e paralelo\n\nRefaça os exercícios da lista 5.', authorId: admin.id },
  { subjectId: S['Álgebra']!.id, bimester: 4, examNumber: 3, title: 'Funções do 2º grau', body: '• Raízes e discriminante\n• Vértice e concavidade\n• Gráfico da parábola\n\nCaderno de exercícios: páginas 40 a 52.', authorId: coord.id },
  { subjectId: S['Inglês 3']!.id, bimester: 4, examNumber: 3, title: 'Present perfect', body: '• Present perfect × simple past\n• for / since / already / yet\n• Vocabulário da Unit 6', authorId: coord.id },
]);

const lucas = alunos[0]!;
await db.insert(studyRoutines).values([
  { studentId: lucas.id, weekday: 1, startTime: '14:00', endTime: '15:00', subjectId: S['Gramática']!.id, activity: 'Revisar orações subordinadas' },
  { studentId: lucas.id, weekday: 1, startTime: '15:30', endTime: '16:15', subjectId: S['Física']!.id, activity: 'Lista 5 de eletricidade' },
  { studentId: lucas.id, weekday: 2, startTime: '14:00', endTime: '15:00', subjectId: S['Química']!.id, activity: 'Tabela periódica' },
  { studentId: lucas.id, weekday: 3, startTime: '14:00', endTime: '15:30', subjectId: S['Álgebra']!.id, activity: 'Funções do 2º grau' },
  { studentId: lucas.id, weekday: 4, startTime: '14:00', endTime: '15:00', subjectId: S['Inglês 3']!.id, activity: 'Present perfect' },
]);

console.log(`
✔ Dados de demonstração do 9º ano criados (${rows.length} notas, ${plan.length} provas no calendário do 4º bimestre).
  Próxima semana de provas (P3, Grupo 1): ${p3('Gramática')} (terça) e ${p3('Física')} (quinta).

  Contas (resposta de segurança de todas: "rex"):
    Administrador  admin        / admin12345
    Coordenação    coordenacao  / coord12345
    Professora     professor    / professor123
    Professor      marcos       / professor123
    Aluno          aluno        / aluno123   (Lucas — Inglês 3)
    Alunos         ana (Inglês 2), pedro (Inglês 4), julia (Inglês 3) / aluno123
`);
client.close();

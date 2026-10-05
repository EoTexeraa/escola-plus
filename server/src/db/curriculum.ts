// Estrutura base do 9º ano: criada automaticamente quando o banco está vazio (ex.: primeira vez em produção).
// Não cria nenhuma conta — o primeiro acesso é "Criar conta → Administrador".
import { sql } from 'drizzle-orm';
import type { Db } from './client.js';
import { schoolClasses, subjects } from './schema.js';

/** [nome, cor, grupo de prova, dia (2 = terça, 4 = quinta, 5 = sexta), nível de inglês] */
export const CURRICULUM: Array<[string, string, 1 | 2, 2 | 4 | 5, (2 | 3 | 4)?]> = [
  ['Gramática', '#1D4ED8', 1, 2], ['Literatura', '#BE185D', 1, 2], ['Redação', '#7C3AED', 1, 2], ['Educação Física', '#DC2626', 1, 2],
  ['Física', '#0E7490', 1, 4], ['Química', '#047857', 1, 4], ['Artes', '#EA580C', 1, 4],
  ['Álgebra', '#2563EB', 2, 2], ['Geometria', '#0891B2', 2, 2], ['Geografia', '#15803D', 2, 2],
  ['Filosofia', '#9333EA', 2, 4], ['Biologia', '#16A34A', 2, 4], ['História', '#B45309', 2, 4],
  ['Inglês 2', '#4F46E5', 2, 5, 2], ['Inglês 3', '#4338CA', 2, 5, 3], ['Inglês 4', '#3730A3', 2, 5, 4],
];

export const curriculumRows = () => CURRICULUM.map(([name, colorHex, examGroup, examWeekday, englishLevel]) => (
  { name, colorHex, examGroup, examWeekday, englishLevel: englishLevel ?? null }
));

/** Cria a turma do 9º ano e as matérias se ainda não existir nenhuma. Idempotente. */
export async function ensureCurriculum(db: Db, year = new Date().getFullYear()) {
  const [{ n: nSubjects } = { n: 0 }] = await db.select({ n: sql<number>`count(*)` }).from(subjects);
  const [{ n: nClasses } = { n: 0 }] = await db.select({ n: sql<number>`count(*)` }).from(schoolClasses);
  const created: string[] = [];
  if (!nClasses) {
    await db.insert(schoolClasses).values({ name: '9º Ano', schoolYear: year });
    created.push('turma 9º Ano');
  }
  if (!nSubjects) {
    await db.insert(subjects).values(curriculumRows());
    created.push(`${CURRICULUM.length} matérias`);
  }
  return created;
}

// Checagens de autorização por recurso (modelo de ameaças: IDOR e professor fora da atribuição).
import { and, eq, isNull, or, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { subjects, teachingAssignments, type Role } from '../db/schema.js';
import type { SessionUser } from '../middleware/auth.js';
import { forbidden } from './http.js';

/** Coordenação e Administrador gerenciam a escola; só o Administrador vê auditoria e backup. */
export const MANAGERS: Role[] = ['coordinator', 'admin'];
export const isManager = (role: Role) => role === 'coordinator' || role === 'admin';

/**
 * Matérias que um usuário enxerga: aluno vê as gerais + o Inglês do SEU nível; equipe vê todas.
 * Use em qualquer consulta de notas, conteúdos, tarefas ou eventos ligada a uma matéria.
 */
export function subjectVisibleTo(user: SessionUser, col: typeof subjects.englishLevel = subjects.englishLevel): SQL | undefined {
  if (user.role !== 'student') return undefined;
  return user.englishLevel ? or(isNull(col), eq(col, user.englishLevel)) : isNull(col);
}

export async function teacherAssignments(db: Db, teacherId: number) {
  return db.select().from(teachingAssignments).where(eq(teachingAssignments.teacherId, teacherId));
}

/** Professor só atua em (turma, matéria) atribuídas pela coordenação; coordenação/admin atuam em tudo. */
export async function assertCanTeach(db: Db, user: SessionUser, classId: number, subjectId: number) {
  if (isManager(user.role)) return;
  if (user.role !== 'teacher') throw forbidden();
  const [row] = await db.select({ id: teachingAssignments.id }).from(teachingAssignments)
    .where(and(
      eq(teachingAssignments.teacherId, user.id),
      eq(teachingAssignments.classId, classId),
      eq(teachingAssignments.subjectId, subjectId),
    )).limit(1);
  if (!row) throw forbidden('Você não leciona essa matéria nessa turma.');
}

/** Professor pode publicar para uma turma em que leciona qualquer matéria; só a coordenação/admin publica para a escola toda. */
export async function assertCanPublishToClass(db: Db, user: SessionUser, classId: number | null) {
  if (isManager(user.role)) return;
  if (user.role !== 'teacher') throw forbidden();
  if (classId === null) throw forbidden('Somente a coordenação publica para a escola inteira.');
  const [row] = await db.select({ id: teachingAssignments.id }).from(teachingAssignments)
    .where(and(eq(teachingAssignments.teacherId, user.id), eq(teachingAssignments.classId, classId))).limit(1);
  if (!row) throw forbidden('Você não leciona nessa turma.');
}

/** Turmas visíveis: aluno → a própria; professor → as atribuídas; coordenação/admin → null (todas). */
export async function visibleClassIds(db: Db, user: SessionUser): Promise<number[] | null> {
  if (isManager(user.role)) return null;
  if (user.role === 'student') return user.classId ? [user.classId] : [];
  const rows = await teacherAssignments(db, user.id);
  return [...new Set(rows.map((r) => r.classId))];
}

// Datas "de calendário" no fuso da escola (o servidor pode rodar em UTC)
const SCHOOL_TZ = process.env.SCHOOL_TZ || 'America/Sao_Paulo';
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: SCHOOL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** AAAA-MM-DD no fuso da escola, deslocado em `days`. */
export const todayIso = (days = 0) => dateFmt.format(new Date(Date.now() + days * 86_400_000));

/** 0 = domingo … 6 = sábado, no fuso da escola. */
export const todayWeekday = () => new Date(`${todayIso()}T12:00:00Z`).getUTCDay();

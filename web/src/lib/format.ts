import type { BimesterStatus, GradeComponent, YearStatus } from '../api/types';

/** Mesma regra do servidor: 1 casa decimal TRUNCADA (5,95 → "5,9"). */
export function formatGrade(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  const truncated = Math.floor(Math.round(n * 100) / 100 * 10 + 1e-9) / 10;
  return truncated.toFixed(1).replace('.', ',');
}

export const COMPONENT_LABEL: Record<GradeComponent, string> = {
  exam1: 'P1', exam2: 'P2', exam3: 'P3', exam4: 'P4', project: 'Projeto', homework: 'Tarefa', mock: 'Simulado',
};
export const COMPONENTS: GradeComponent[] = ['exam1', 'exam2', 'exam3', 'exam4', 'project', 'homework', 'mock'];

export const BIMESTER_STATUS: Record<BimesterStatus, { label: string; tone: Tone }> = {
  passing: { label: 'Na média', tone: 'success' },
  recovery: { label: 'Recuperação', tone: 'warning' },
  partial: { label: 'Parcial', tone: 'neutral' },
  empty: { label: 'Sem notas', tone: 'neutral' },
};

export const YEAR_STATUS: Record<YearStatus, { label: string; tone: Tone }> = {
  approved: { label: 'Aprovado', tone: 'success' },
  final_recovery: { label: 'Recuperação final', tone: 'danger' },
  in_progress: { label: 'Em andamento', tone: 'neutral' },
};

export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'primary';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const longFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

/** "AAAA-MM-DD" → Date local ao meio-dia (evita pular de dia por fuso). */
export const parseDay = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);
export const toIsoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayIso = () => toIsoDay(new Date());

export const shortDate = (iso: string) => dateFmt.format(parseDay(iso)).replace('.', '');
export const longDate = (iso: string) => longFmt.format(parseDay(iso));

export function relativeDay(iso: string): string {
  const diff = Math.round((parseDay(iso).getTime() - parseDay(todayIso()).getTime()) / 86_400_000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  if (diff > 1 && diff < 7) return `Em ${diff} dias`;
  if (diff < 0) return `Há ${-diff} dias`;
  return shortDate(iso);
}

export function timeAgo(sqlDateTime: string): string {
  const t = new Date(sqlDateTime.replace(' ', 'T') + (sqlDateTime.includes('Z') ? '' : 'Z')).getTime();
  const mins = Math.round((Date.now() - t) / 60_000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export const firstName = (full: string) => full.replace(/^Prof(a)?\.\s*/i, '').split(' ')[0] ?? full;

export const ROLE_LABEL = { student: 'Aluno', teacher: 'Professor', coordinator: 'Coordenação', admin: 'Administrador' } as const;

/** Coordenação e Administrador gerenciam a escola (o Administrador também vê auditoria e backup). */
export const isManager = (role: string | undefined) => role === 'coordinator' || role === 'admin';

export const WEEKDAY_NAME: Record<number, string> = { 2: 'Terça', 4: 'Quinta', 5: 'Sexta' };

export const EVENT_TYPE: Record<string, { label: string; tone: Tone }> = {
  exam: { label: 'Prova', tone: 'danger' },
  holiday: { label: 'Feriado', tone: 'success' },
  event: { label: 'Evento', tone: 'primary' },
  meeting: { label: 'Reunião', tone: 'warning' },
  deadline: { label: 'Prazo', tone: 'neutral' },
};

export const ANNOUNCEMENT_CATEGORY: Record<string, { label: string; tone: Tone }> = {
  general: { label: 'Geral', tone: 'primary' },
  exam: { label: 'Provas', tone: 'danger' },
  event: { label: 'Evento', tone: 'success' },
  urgent: { label: 'Urgente', tone: 'warning' },
};

/** "Quanto falta": arredonda PARA CIMA (faltam 0,05 → "0,1"), para nunca subestimar. */
export function formatNeeded(n: number): string {
  return (Math.ceil(Math.round(n * 100) / 100 * 10 - 1e-9) / 10).toFixed(1).replace('.', ',');
}

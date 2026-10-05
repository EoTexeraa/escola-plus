import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, Bell, BookOpen, CalendarDays, CircleCheck, ClipboardList, GraduationCap, KeyRound, NotebookPen,
  Pin, School, Sparkles, Users,
} from 'lucide-react';
import { api } from '../../api/client';
import type { Assignment, Overview } from '../../api/types';
import { useMe } from '../../lib/auth';
import {
  ANNOUNCEMENT_CATEGORY, BIMESTER_STATUS, EVENT_TYPE, firstName, formatGrade, greeting, longDate, relativeDay, todayIso,
} from '../../lib/format';
import { Badge, Card, CountUp, cx, EmptyState, ErrorState, GradeValue, PageSkeleton, ProgressRing } from '../../components/ui';

export default function HomePage() {
  const { data: me } = useMe();
  if (!me) return null;
  if (me.role === 'student') return <StudentHome name={me.fullName} />;
  if (me.role === 'teacher') return <TeacherHome name={me.fullName} />;
  return <AdminHome name={me.fullName} />;
}

function SectionTitle({ icon: Icon, title, to, linkLabel = 'Ver tudo' }: { icon: typeof Bell; title: string; to?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="flex items-center gap-2 font-semibold"><Icon className="size-5 text-primary" aria-hidden />{title}</h2>
      {to && <Link to={to} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline">{linkLabel}<ArrowRight className="size-4" aria-hidden /></Link>}
    </div>
  );
}

// ======================= ALUNO =======================
function StudentHome({ name }: { name: string }) {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['student', 'overview'], queryFn: () => api.get<Overview>('/student/overview') });

  const toggleRoutine = useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) =>
      done ? api.del(`/routines/${id}/check`, { date: todayIso() }) : api.post(`/routines/${id}/check`, { date: todayIso() }),
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: ['student', 'overview'] });
      qc.setQueryData<Overview>(['student', 'overview'], (o) => o && { ...o, todayRoutine: o.todayRoutine.map((r) => (r.id === id ? { ...r, done: !done } : r)) });
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ['student', 'overview'] }); qc.invalidateQueries({ queryKey: ['routines'] }); },
  });

  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;

  const avg = data.overallAverage;
  const partialAll = data.subjects.length > 0 && data.subjects.every((s) => s.status === 'partial' || s.status === 'empty');
  const tone = avg === null || partialAll ? 'primary' : avg >= 6 ? 'success' : 'warning';
  const routineDone = data.todayRoutine.filter((r) => r.done).length;

  return (
    <div className="space-y-5">
      {/* Destaque */}
      <section className="brand-gradient relative overflow-hidden rounded-xl p-5 text-white shadow-lg sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-white/10" aria-hidden />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-sm font-medium opacity-90 first-letter:uppercase">{longDate(todayIso())}</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{greeting()}, {firstName(name)}!</h1>
            <p className="mt-2 max-w-md opacity-95">
              {data.class?.name} · {data.bimester}º bimestre.{' '}
              {partialAll
                ? 'Bimestre em andamento: as médias ainda são parciais.'
                : data.recoveryCount > 0
                ? `${data.recoveryCount} matéria${data.recoveryCount > 1 ? 's' : ''} precisa${data.recoveryCount > 1 ? 'm' : ''} de atenção.`
                : 'Tudo em dia nas médias. Continue assim!'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/notas" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-white px-4 font-semibold text-[#1E40AF] shadow-sm transition-transform hover:scale-[1.03]">
                <GraduationCap className="size-5" aria-hidden /> Minhas notas
              </Link>
              {data.unreadAnnouncements > 0 && (
                <Link to="/avisos" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-white/15 px-4 font-semibold backdrop-blur hover:bg-white/25">
                  <Bell className="size-5" aria-hidden /> {data.unreadAnnouncements} aviso{data.unreadAnnouncements > 1 ? 's' : ''} novo{data.unreadAnnouncements > 1 ? 's' : ''}
                </Link>
              )}
            </div>
          </div>
          <div className="rounded-full bg-white p-2 shadow-lg">
            <ProgressRing value={avg ?? 0} max={10} tone={tone} fixedLight track="#E2E8F0" label={`Média geral do bimestre: ${formatGrade(avg)}`}>
              <div>
                <p className={cx('text-3xl font-bold tabular-nums', tone === 'success' ? 'text-[#047857]' : tone === 'warning' ? 'text-[#B45309]' : 'text-[#1D4ED8]')}>
                  {avg === null ? '—' : <CountUp value={avg} format={formatGrade} />}
                </p>
                <p className="text-xs font-medium text-[#475569]">{partialAll ? 'média parcial' : 'média geral'}</p>
              </div>
            </ProgressRing>
          </div>
        </div>
      </section>

      {/* Matérias */}
      <Card className="animate-fade-up [animation-delay:60ms]">
        <SectionTitle icon={GraduationCap} title={`Médias do ${data.bimester}º bimestre`} to="/notas" />
        {data.subjects.length === 0 ? <p className="text-muted">Nenhuma nota lançada ainda.</p> : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 stagger">
            {data.subjects.map((s, i) => {
              const st = BIMESTER_STATUS[s.status];
              return (
                <li key={s.subject.id} style={{ ['--i' as string]: i }}>
                  <Link to="/notas" className="flex h-full flex-col gap-1 rounded-lg border border-line p-3 transition-transform hover:-translate-y-0.5 hover:shadow-md">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.subject.color }} aria-hidden />
                      <span className="truncate">{s.subject.name}</span>
                    </span>
                    <GradeValue value={s.average} tone={st.tone} className="text-2xl" />
                    <Badge tone={st.tone} className="self-start">{st.label}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        {/* Tarefas */}
        <Card className="animate-fade-up [animation-delay:120ms]">
          <SectionTitle icon={ClipboardList} title="Tarefas pendentes" to="/tarefas" />
          {data.pendingHomework.length === 0 ? (
            <p className="flex items-center gap-2 text-success"><CircleCheck className="size-5" aria-hidden />Nenhuma tarefa pendente. 🎉</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.pendingHomework.map((h) => (
                <li key={h.id} className="flex items-center gap-3 py-2.5">
                  <span className="h-10 w-1 shrink-0 rounded-full" style={{ background: h.color }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{h.title}</p>
                    <p className="text-sm text-muted">{h.subject}</p>
                  </div>
                  <Badge tone={relativeDay(h.dueDate) === 'Hoje' || relativeDay(h.dueDate) === 'Amanhã' ? 'warning' : 'neutral'} icon={false}>{relativeDay(h.dueDate)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Rotina de hoje */}
        <Card className="animate-fade-up [animation-delay:180ms]">
          <SectionTitle icon={Sparkles} title="Rotina de estudos de hoje" to="/rotina" linkLabel="Editar" />
          {data.todayRoutine.length === 0 ? (
            <p className="text-muted">Nada planejado para hoje. <Link to="/rotina" className="font-medium text-primary hover:underline">Montar rotina</Link></p>
          ) : (
            <>
              <div className="mb-3 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={data.todayRoutine.length} aria-valuenow={routineDone} aria-label="Progresso da rotina de hoje">
                <div className="h-full origin-left rounded-full bg-success transition-transform duration-500" style={{ transform: `scaleX(${routineDone / data.todayRoutine.length})` }} />
              </div>
              <ul className="space-y-1">
                {data.todayRoutine.map((r) => (
                  <li key={r.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-bg">
                      <input type="checkbox" checked={r.done} onChange={() => toggleRoutine.mutate({ id: r.id, done: r.done })} className="size-5 accent-[var(--color-success)]" />
                      <span className="w-24 shrink-0 text-sm tabular-nums text-muted">{r.startTime}–{r.endTime}</span>
                      <span className={cx('flex-1 transition-colors', r.done && 'text-muted line-through')}>{r.activity}</span>
                      {r.subject && <span className="hidden text-sm text-muted sm:inline">{r.subject}</span>}
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {/* Próximos eventos */}
        <Card className="animate-fade-up [animation-delay:240ms]">
          <SectionTitle icon={CalendarDays} title="Próximos 14 dias" to="/calendario" />
          {data.upcomingEvents.length === 0 ? <p className="text-muted">Nenhum evento próximo.</p> : (
            <ul className="space-y-2">
              {data.upcomingEvents.map((e) => (
                <li key={e.id} className="flex items-center gap-3">
                  <div className="grid w-14 shrink-0 place-items-center rounded-md bg-primary-soft py-1 text-on-primary-soft">
                    <span className="text-lg font-bold leading-tight">{e.startsOn.slice(8, 10)}</span>
                    <span className="text-xs uppercase">{new Date(`${e.startsOn}T12:00`).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.title}</p>
                    <p className="text-sm text-muted">{relativeDay(e.startsOn)}</p>
                  </div>
                  <Badge tone={EVENT_TYPE[e.eventType]?.tone} icon={false}>{EVENT_TYPE[e.eventType]?.label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Avisos */}
        <Card className="animate-fade-up [animation-delay:300ms]">
          <SectionTitle icon={Bell} title="Últimos avisos" to="/avisos" />
          {data.latestAnnouncements.length === 0 ? <p className="text-muted">Nenhum aviso.</p> : (
            <ul className="space-y-2">
              {data.latestAnnouncements.map((a) => (
                <li key={a.id}>
                  <Link to="/avisos" className="flex items-center gap-3 rounded-md p-2 hover:bg-bg">
                    {a.isPinned ? <Pin className="size-4 shrink-0 text-primary" aria-label="Fixado" /> : <span className={cx('size-2.5 shrink-0 rounded-full', a.read ? 'bg-line' : 'bg-primary')} aria-label={a.read ? 'Lido' : 'Não lido'} />}
                    <span className={cx('min-w-0 flex-1 truncate', !a.read && 'font-semibold')}>{a.title}</span>
                    <Badge tone={ANNOUNCEMENT_CATEGORY[a.category]?.tone} icon={false}>{ANNOUNCEMENT_CATEGORY[a.category]?.label}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

// ======================= PROFESSOR =======================
function TeacherHome({ name }: { name: string }) {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['teacher', 'assignments'], queryFn: () => api.get<Assignment[]>('/teacher/assignments') });
  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  const classes = [...new Map(data.map((a) => [a.classId, a])).values()];
  return (
    <div className="space-y-5">
      <section className="brand-gradient rounded-xl p-6 text-white shadow-lg animate-fade-up">
        <p className="text-sm opacity-90 first-letter:uppercase">{longDate(todayIso())}</p>
        <h1 className="mt-1 text-3xl font-bold">{greeting()}, {firstName(name)}!</h1>
        <p className="mt-2 opacity-95">Você leciona {data.length} matéria{data.length !== 1 ? 's' : ''} em {classes.length} turma{classes.length !== 1 ? 's' : ''}.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/lancar-notas" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-white px-4 font-semibold text-[#1E40AF] shadow-sm hover:scale-[1.03] transition-transform"><NotebookPen className="size-5" aria-hidden /> Lançar notas</Link>
          <Link to="/avisos" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-white/15 px-4 font-semibold hover:bg-white/25"><Bell className="size-5" aria-hidden /> Publicar aviso</Link>
        </div>
      </section>
      {data.length === 0 ? (
        <Card><EmptyState icon={School} title="Nenhuma turma atribuída" text="A administração ainda não vinculou você a turmas e matérias. Assim que isso for feito, elas aparecem aqui." /></Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger">
          {data.map((a, i) => (
            <li key={a.id} style={{ ['--i' as string]: i }}>
              <Link to={`/lancar-notas?turma=${a.classId}&materia=${a.subjectId}`} className="card flex h-full flex-col gap-3 p-5 transition-transform hover:-translate-y-1 hover:shadow-lg">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-lg text-white" style={{ background: a.color }}><BookOpen className="size-5" aria-hidden /></span>
                  <div>
                    <p className="font-semibold">{a.subject}</p>
                    <p className="text-sm text-muted">{a.className} · {a.schoolYear}</p>
                  </div>
                </div>
                <p className="flex items-center gap-2 text-sm text-muted"><Users className="size-4" aria-hidden />{a.students} aluno{a.students !== 1 ? 's' : ''}</p>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-primary">Abrir planilha de notas <ArrowRight className="size-4" aria-hidden /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ======================= ADMIN =======================
interface Stats { students: number; teachers: number; coordinators: number; classes: number; subjects: number; grades: number; announcements: number; homework: number; activeKeys: number }

function AdminHome({ name }: { name: string }) {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api.get<Stats>('/admin/stats') });
  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  const tiles = [
    { label: 'Alunos ativos', value: data.students, icon: GraduationCap, to: '/admin/usuarios' },
    { label: 'Professores', value: data.teachers, icon: Users, to: '/admin/usuarios' },
    { label: 'Turmas', value: data.classes, icon: School, to: '/admin/escola' },
    { label: 'Matérias', value: data.subjects, icon: BookOpen, to: '/admin/escola' },
    { label: 'Notas lançadas', value: data.grades, icon: NotebookPen, to: '/lancar-notas' },
    { label: 'Avisos', value: data.announcements, icon: Bell, to: '/avisos' },
    { label: 'Tarefas', value: data.homework, icon: ClipboardList, to: '/tarefas' },
    { label: 'Chaves ativas', value: data.activeKeys, icon: KeyRound, to: '/admin/chaves' },
  ];
  return (
    <div className="space-y-5">
      <section className="brand-gradient rounded-xl p-6 text-white shadow-lg animate-fade-up">
        <p className="text-sm opacity-90 first-letter:uppercase">{longDate(todayIso())}</p>
        <h1 className="mt-1 text-3xl font-bold">{greeting()}, {firstName(name)}!</h1>
        <p className="mt-2 opacity-95">Painel da administração da escola.</p>
      </section>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 stagger">
        {tiles.map(({ label, value, icon: Icon, to }, i) => (
          <li key={label} style={{ ['--i' as string]: i }}>
            <Link to={to} className="card flex h-full items-center gap-3 p-4 transition-transform hover:-translate-y-1 hover:shadow-md">
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary-soft text-on-primary-soft"><Icon className="size-5" aria-hidden /></span>
              <div>
                <p className="text-2xl font-bold tabular-nums"><CountUp value={value} /></p>
                <p className="text-sm text-muted">{label}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

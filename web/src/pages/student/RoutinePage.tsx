import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Check, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { api } from '../../api/client';
import type { Routine } from '../../api/types';
import { useSubjects } from '../../lib/queries';
import { parseDay, toIsoDay, todayIso, WEEKDAYS, WEEKDAYS_SHORT } from '../../lib/format';
import { Button, Card, cx, EmptyState, ErrorState, IconButton, Input, Modal, PageHeader, PageSkeleton, Select, useToast } from '../../components/ui';

interface Week { from: string; to: string; routines: Routine[]; checks: Array<{ routineId: number; doneOn: string }> }

const Schema = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Informe o horário'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Informe o horário'),
  subjectId: z.string().optional(),
  activity: z.string().trim().min(2, 'Descreva a atividade').max(120),
}).refine((v) => v.endTime > v.startTime, { path: ['endTime'], message: 'Termina depois de começar' });
type Form = z.input<typeof Schema>;

export default function RoutinePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['routines'], queryFn: () => api.get<Week>('/routines') });
  const [selectedDay, setSelectedDay] = useState(() => parseDay(todayIso()).getDay());
  const [editing, setEditing] = useState<Routine | 'new' | null>(null);

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['routines'] }); qc.invalidateQueries({ queryKey: ['student', 'overview'] }); };

  const toggle = useMutation({
    mutationFn: ({ id, date, done }: { id: number; date: string; done: boolean }) =>
      done ? api.del(`/routines/${id}/check`, { date }) : api.post(`/routines/${id}/check`, { date }),
    onMutate: async ({ id, date, done }) => {
      await qc.cancelQueries({ queryKey: ['routines'] });
      qc.setQueryData<Week>(['routines'], (w) => w && {
        ...w, checks: done ? w.checks.filter((c) => !(c.routineId === id && c.doneOn === date)) : [...w.checks, { routineId: id, doneOn: date }],
      });
    },
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/routines/${id}`),
    onSuccess: () => { toast('Atividade removida'); invalidate(); },
  });

  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;

  const dateOf = (weekday: number) => { const d = parseDay(data.from); d.setDate(d.getDate() + weekday); return toIsoDay(d); };
  const isDone = (id: number, weekday: number) => data.checks.some((c) => c.routineId === id && c.doneOn === dateOf(weekday));
  const total = data.routines.length;
  const doneWeek = data.checks.length;
  const dayItems = data.routines.filter((r) => r.weekday === selectedDay);
  const todayWd = parseDay(todayIso()).getDay();
  const minutes = (r: Routine) => { const [a, b] = [r.startTime, r.endTime].map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))); return b! - a!; };
  const weekMinutes = data.routines.reduce((s, r) => s + minutes(r), 0);

  return (
    <div>
      <PageHeader title="Rotina de estudos" subtitle="Planeje sua semana e marque o que concluiu."
        actions={<Button icon={Plus} onClick={() => setEditing('new')}>Nova atividade</Button>} />

      <div className="mb-5 grid gap-4 sm:grid-cols-3 stagger">
        <Card style={{ ['--i' as string]: 0 }}>
          <p className="text-sm text-muted">Concluídas na semana</p>
          <p className="mt-1 text-3xl font-bold">{doneWeek}<span className="text-lg text-muted">/{total}</span></p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full origin-left rounded-full bg-success transition-transform duration-700" style={{ transform: `scaleX(${total ? doneWeek / total : 0})` }} />
          </div>
        </Card>
        <Card style={{ ['--i' as string]: 1 }}>
          <p className="text-sm text-muted">Tempo planejado</p>
          <p className="mt-1 text-3xl font-bold">{Math.floor(weekMinutes / 60)}h{String(weekMinutes % 60).padStart(2, '0')}</p>
          <p className="text-sm text-muted">por semana</p>
        </Card>
        <Card style={{ ['--i' as string]: 2 }}>
          <p className="text-sm text-muted">Dias com estudo</p>
          <p className="mt-1 text-3xl font-bold">{new Set(data.routines.map((r) => r.weekday)).size}<span className="text-lg text-muted">/7</span></p>
        </Card>
      </div>

      {/* Seletor de dia */}
      <div role="tablist" aria-label="Dia da semana" className="mb-4 grid grid-cols-7 gap-1 rounded-lg border border-line bg-surface p-1 shadow-sm">
        {WEEKDAYS_SHORT.map((d, i) => {
          const count = data.routines.filter((r) => r.weekday === i).length;
          return (
            <button key={d} role="tab" aria-selected={selectedDay === i} aria-label={`${WEEKDAYS[i]}, ${count} atividades`} onClick={() => setSelectedDay(i)}
              className={cx('relative flex min-h-14 flex-col items-center justify-center rounded-md text-sm font-medium transition-all',
                selectedDay === i ? 'bg-primary text-on-primary shadow-sm' : 'text-muted hover:bg-primary-soft hover:text-on-primary-soft')}>
              {d}
              <span className={cx('text-xs', selectedDay === i ? 'opacity-90' : '')}>{parseDay(dateOf(i)).getDate()}</span>
              {i === todayWd && <span className={cx('absolute top-1 right-1 size-1.5 rounded-full', selectedDay === i ? 'bg-on-primary' : 'bg-primary')} aria-hidden />}
            </button>
          );
        })}
      </div>

      <Card>
        <h2 className="mb-3 font-semibold">{WEEKDAYS[selectedDay]}{selectedDay === todayWd ? ' (hoje)' : ''}</h2>
        {dayItems.length === 0 ? (
          <EmptyState icon={ListChecks} title="Nada planejado" text="Adicione uma atividade de estudo para este dia."
            action={<Button variant="secondary" icon={CalendarPlus} onClick={() => setEditing('new')}>Adicionar</Button>} />
        ) : (
          <ul className="space-y-2" key={selectedDay}>
            {dayItems.map((r, i) => {
              const done = isDone(r.id, selectedDay);
              return (
                <li key={r.id} className={cx('flex items-center gap-3 rounded-lg border p-3 transition-colors animate-fade-up', done ? 'border-success/40 bg-success-soft/50' : 'border-line')} style={{ animationDelay: `${i * 40}ms` }}>
                  <button onClick={() => toggle.mutate({ id: r.id, date: dateOf(selectedDay), done })}
                    aria-pressed={done} aria-label={done ? `Desmarcar ${r.activity}` : `Marcar ${r.activity} como feita`}
                    className={cx('grid size-11 shrink-0 place-items-center rounded-full border-2 transition-all active:scale-90',
                      done ? 'border-success bg-success text-surface' : 'border-control text-transparent hover:border-success')}>
                    <Check className={cx('size-5 transition-transform', done ? 'scale-100' : 'scale-0')} aria-hidden />
                  </button>
                  <span className="h-10 w-1 shrink-0 rounded-full" style={{ background: r.color ?? 'var(--color-line)' }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className={cx('font-medium', done && 'text-muted line-through')}>{r.activity}</p>
                    <p className="text-sm text-muted tabular-nums">{r.startTime}–{r.endTime}{r.subject ? ` · ${r.subject}` : ''}</p>
                  </div>
                  <IconButton label="Editar" icon={Pencil} onClick={() => setEditing(r)} />
                  <IconButton label="Excluir" icon={Trash2} onClick={() => remove.mutate(r.id)} className="hover:bg-danger-soft hover:text-danger" />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {editing && <RoutineForm routine={editing === 'new' ? null : editing} defaultDay={selectedDay} onClose={() => setEditing(null)} onSaved={invalidate} />}
    </div>
  );
}

function RoutineForm({ routine, defaultDay, onClose, onSaved }: { routine: Routine | null; defaultDay: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const subjects = useSubjects();
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: routine
      ? { weekday: routine.weekday, startTime: routine.startTime, endTime: routine.endTime, subjectId: routine.subjectId ? String(routine.subjectId) : '', activity: routine.activity }
      : { weekday: defaultDay, startTime: '14:00', endTime: '15:00', subjectId: '', activity: '' },
  });
  const save = useMutation({
    mutationFn: (f: Form) => {
      const body = { weekday: Number(f.weekday), startTime: f.startTime, endTime: f.endTime, subjectId: f.subjectId ? Number(f.subjectId) : null, activity: f.activity };
      return routine ? api.put(`/routines/${routine.id}`, body) : api.post('/routines', body);
    },
    onSuccess: () => { toast(routine ? 'Atividade atualizada' : 'Atividade adicionada'); onSaved(); onClose(); },
    onError: (e) => toast(e.message, 'danger'),
  });
  return (
    <Modal open onClose={onClose} title={routine ? 'Editar atividade' : 'Nova atividade'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" form="routine-form" loading={save.isPending}>Salvar</Button></>}>
      <form id="routine-form" className="space-y-4" onSubmit={handleSubmit((f) => save.mutate(f))} noValidate>
        <Select label="Dia da semana" {...register('weekday')}>
          {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Início" type="time" error={errors.startTime?.message} {...register('startTime')} />
          <Input label="Fim" type="time" error={errors.endTime?.message} {...register('endTime')} />
        </div>
        <Select label="Matéria (opcional)" {...register('subjectId')}>
          <option value="">Nenhuma</option>
          {subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Input label="Atividade" placeholder="Ex.: Revisar exercícios de frações" error={errors.activity?.message} {...register('activity')} />
      </form>
    </Modal>
  );
}

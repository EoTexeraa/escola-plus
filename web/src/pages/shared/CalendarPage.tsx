import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCog, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react';
import { ExamScheduleModal } from '../../components/ExamScheduleModal';
import { z } from 'zod';
import { api } from '../../api/client';
import type { CalendarEvent } from '../../api/types';
import { useMe } from '../../lib/auth';
import { usePublishTargets, useSubjects } from '../../lib/queries';
import { EVENT_TYPE, longDate, toIsoDay, todayIso, WEEKDAYS_SHORT, type Tone, isManager } from '../../lib/format';
import { Badge, Button, Card, cx, ErrorState, IconButton, Input, Modal, PageHeader, PageSkeleton, Select, Textarea, useToast } from '../../components/ui';

interface CalData { events: CalendarEvent[]; homework: Array<{ id: number; title: string; dueDate: string; subject: string; color: string }> }

const DOT: Record<Tone, string> = { danger: 'bg-danger', success: 'bg-success', primary: 'bg-primary', warning: 'bg-warning', neutral: 'bg-control' };
const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

export default function CalendarPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selected, setSelected] = useState(todayIso());
  const [editing, setEditing] = useState<CalendarEvent | 'new' | null>(null);
  const [scheduling, setScheduling] = useState(false);

  // Grade de 6 semanas começando no domingo
  const days = useMemo(() => {
    const start = new Date(cursor); start.setDate(1 - start.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [cursor]);
  const from = toIsoDay(days[0]!);
  const to = toIsoDay(days[41]!);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['calendar', from, to],
    queryFn: () => api.get<CalData>('/calendar', { from, to }),
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/calendar/${id}`),
    onSuccess: () => { toast('Evento removido'); qc.invalidateQueries({ queryKey: ['calendar'] }); },
    onError: (e) => toast(e.message, 'danger'),
  });

  const byDay = useMemo(() => {
    const m = new Map<string, Array<{ key: string; tone: Tone; label: string }>>();
    const add = (day: string, item: { key: string; tone: Tone; label: string }) => m.set(day, [...(m.get(day) ?? []), item]);
    for (const e of data?.events ?? []) {
      const end = e.endsOn ?? e.startsOn;
      for (let d = new Date(`${e.startsOn}T12:00`); toIsoDay(d) <= end; d.setDate(d.getDate() + 1)) {
        add(toIsoDay(d), { key: `e${e.id}`, tone: EVENT_TYPE[e.eventType]!.tone, label: e.title });
      }
    }
    for (const h of data?.homework ?? []) add(h.dueDate, { key: `h${h.id}`, tone: 'neutral', label: `Entrega: ${h.title}` });
    return m;
  }, [data]);

  if (isLoading && !data) return <PageSkeleton />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;

  const today = todayIso();
  const dayEvents = data.events.filter((e) => e.startsOn <= selected && (e.endsOn ?? e.startsOn) >= selected);
  const dayHomework = data.homework.filter((h) => h.dueDate === selected);
  const move = (n: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));
  const monthEvents = data.events.filter((e) => e.startsOn.slice(0, 7) === toIsoDay(cursor).slice(0, 7));

  return (
    <div>
      <PageHeader title="Calendário escolar" subtitle="Provas, eventos, feriados e entregas."
        actions={me && me.role !== 'student' && <>
          {isManager(me.role) && <Button variant="secondary" icon={CalendarCog} onClick={() => setScheduling(true)}>Calendário de provas</Button>}
          <Button icon={Plus} onClick={() => setEditing('new')}>Novo evento</Button>
        </>} />

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <Card className="p-3 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <IconButton label="Mês anterior" icon={ChevronLeft} onClick={() => move(-1)} />
            <h2 className="text-lg font-semibold first-letter:uppercase" aria-live="polite">{monthFmt.format(cursor)}</h2>
            <IconButton label="Próximo mês" icon={ChevronRight} onClick={() => move(1)} />
          </div>
          <div className="grid grid-cols-7 text-center text-xs font-medium text-muted" aria-hidden>
            {WEEKDAYS_SHORT.map((d) => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1" role="group" aria-label="Dias do mês" key={from}>
            {days.map((d, i) => {
              const iso = toIsoDay(d);
              const inMonth = d.getMonth() === cursor.getMonth();
              const items = byDay.get(iso) ?? [];
              const isSel = iso === selected;
              return (
                <button key={iso} onClick={() => setSelected(iso)} aria-pressed={isSel}
                  aria-label={`${longDate(iso)}${items.length ? `, ${items.length} item(ns): ${items.map((x) => x.label).join('; ')}` : ''}`}
                  className={cx('flex aspect-square min-h-11 flex-col items-center justify-start gap-1 rounded-md pt-1.5 text-sm transition-all animate-fade-in',
                    inMonth ? 'font-medium' : 'text-muted font-normal text-xs', isSel ? 'bg-primary text-on-primary shadow-md scale-105' : 'hover:bg-primary-soft',
                    iso === today && !isSel && 'ring-2 ring-primary font-bold')}
                  style={{ animationDelay: `${i * 6}ms` }}>
                  <span>{d.getDate()}</span>
                  <span className="flex flex-wrap justify-center gap-0.5">
                    {items.slice(0, 3).map((x) => <span key={x.key} className={cx('size-1.5 rounded-full', isSel ? 'bg-on-primary' : DOT[x.tone])} />)}
                  </span>
                </button>
              );
            })}
          </div>
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted" aria-label="Legenda">
            {Object.entries(EVENT_TYPE).filter(([k]) => k !== 'deadline').map(([k, v]) => (
              <li key={k} className="flex items-center gap-1.5"><span className={cx('size-2.5 rounded-full', DOT[v.tone])} />{v.label}</li>
            ))}
            <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-control" />Entrega de tarefa</li>
          </ul>
        </Card>

        <div className="space-y-5">
          <Card>
            <h2 className="mb-3 font-semibold first-letter:uppercase">{longDate(selected)}</h2>
            {dayEvents.length === 0 && dayHomework.length === 0 ? <p className="text-muted">Nada marcado neste dia.</p> : (
              <ul className="space-y-3" key={selected}>
                {dayEvents.map((e) => (
                  <EventItem key={e.id} e={e}
                    canManage={!!me && me.role !== 'student' && (isManager(me.role) || e.authorId === me.id)}
                    onEdit={() => setEditing(e)}
                    onDelete={() => { if (confirm('Excluir este evento?')) remove.mutate(e.id); }} />
                ))}
                {dayHomework.map((h) => (
                  <li key={h.id} className="flex gap-3 animate-fade-up">
                    <ClipboardList className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
                    <div><p className="font-medium">{h.title}</p><p className="text-sm text-muted">Entrega de tarefa · {h.subject}</p></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><CalendarDays className="size-5 text-primary" aria-hidden />Neste mês</h2>
            {monthEvents.length === 0 ? <p className="text-muted">Nenhum evento.</p> : (
              <ul className="divide-y divide-line">
                {monthEvents.map((e) => (
                  <li key={e.id}>
                    <button onClick={() => setSelected(e.startsOn)} className="flex min-h-11 w-full items-center gap-3 py-2 text-left hover:text-primary">
                      <span className="w-8 text-center font-bold tabular-nums">{e.startsOn.slice(8)}</span>
                      <span className="flex-1 truncate">{e.title}</span>
                      <Badge tone={EVENT_TYPE[e.eventType]!.tone} icon={false}>{EVENT_TYPE[e.eventType]!.label}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      {editing && me && me.role !== 'student' && <EventForm role={me.role} date={selected} initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {scheduling && <ExamScheduleModal onClose={() => setScheduling(false)} />}
    </div>
  );
}

function EventItem({ e, canManage, onEdit, onDelete }: { e: CalendarEvent; canManage: boolean; onEdit: () => void; onDelete: () => void }) {
  const t = EVENT_TYPE[e.eventType]!;
  return (
    <li className="flex gap-3 animate-fade-up">
      <span className={cx('mt-1.5 size-3 shrink-0 rounded-full', DOT[t.tone])} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{e.title}</p>
        <p className="text-sm text-muted">{t.label} · {e.className ?? 'Toda a escola'}{e.subject && !e.title.includes(e.subject) ? ` · ${e.subject}` : ''}</p>
        {e.description && <p className="mt-1 text-sm">{e.description}</p>}
      </div>
      {canManage && (
        <div className="flex shrink-0">
          <IconButton label={`Editar ${e.title}`} icon={Pencil} onClick={onEdit} />
          <IconButton label={`Excluir ${e.title}`} icon={Trash2} onClick={onDelete} className="hover:bg-danger-soft hover:text-danger" />
        </div>
      )}
    </li>
  );
}

const Schema = z.object({
  title: z.string().trim().min(3, 'Título muito curto').max(120),
  eventType: z.enum(['exam', 'holiday', 'event', 'meeting', 'deadline']),
  startsOn: z.string().min(10, 'Informe a data'),
  endsOn: z.string().optional(),
  classId: z.string(),
  subjectId: z.string().optional(),
  description: z.string().max(1000).optional(),
}).refine((v) => !v.endsOn || v.endsOn >= v.startsOn, { path: ['endsOn'], message: 'Termina depois de começar' });
type Form = z.infer<typeof Schema>;

function EventForm({ role, date, initial, onClose }: { role: 'teacher' | 'coordinator' | 'admin'; date: string; initial: CalendarEvent | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const targets = usePublishTargets(role);
  const allSubjects = useSubjects();
  const { register, handleSubmit, watch, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: initial
      ? {
        title: initial.title, eventType: initial.eventType, startsOn: initial.startsOn, endsOn: initial.endsOn ?? '',
        classId: initial.classId ? String(initial.classId) : '', subjectId: initial.subjectId ? String(initial.subjectId) : '',
        description: initial.description ?? '',
      }
      : { eventType: 'exam', startsOn: date, classId: '' },
  });
  const classId = Number(watch('classId'));
  // Professor: só as matérias que leciona na turma; coordenação/administrador: todas
  const subjects = role === 'teacher'
    ? (targets.assignments ?? []).filter((a) => a.classId === classId).map((a) => ({ id: a.subjectId, name: a.subject }))
    : (allSubjects.data ?? []).map((x) => ({ id: x.id, name: x.name }));
  const save = useMutation({
    mutationFn: (f: Form) => {
      const body = {
        ...f, classId: f.classId ? Number(f.classId) : null, subjectId: f.subjectId ? Number(f.subjectId) : null,
        endsOn: f.endsOn || null, description: f.description || null,
      };
      return initial ? api.put(`/calendar/${initial.id}`, body) : api.post('/calendar', body);
    },
    onSuccess: () => {
      toast(initial ? 'Evento atualizado' : 'Evento criado');
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['contents'] });
      onClose();
    },
    onError: (e) => toast(e.message, 'danger'),
  });
  return (
    <Modal open onClose={onClose} title={initial ? 'Editar evento' : 'Novo evento'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" form="ev-form" loading={save.isPending}>{initial ? 'Salvar' : 'Criar'}</Button></>}>
      <form id="ev-form" className="space-y-4" onSubmit={handleSubmit((f) => save.mutate(f))} noValidate>
        <Input label="Título" placeholder="Ex.: P3 — Matemática" error={errors.title?.message} {...register('title')} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Tipo" {...register('eventType')}>
            {Object.entries(EVENT_TYPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Select label="Para" {...register('classId')}>
            {isManager(role) ? <option value="">Toda a escola</option> : <option value="">Escolha a turma</option>}
            {targets.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        {subjects.length > 0 && (
          <Select label="Matéria (opcional)" {...register('subjectId')}>
            <option value="">Nenhuma</option>
            {subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Data" type="date" error={errors.startsOn?.message} {...register('startsOn')} />
          <Input label="Até (opcional)" type="date" error={errors.endsOn?.message} {...register('endsOn')} />
        </div>
        <Textarea label="Descrição (opcional)" {...register('description')} />
      </form>
    </Modal>
  );
}

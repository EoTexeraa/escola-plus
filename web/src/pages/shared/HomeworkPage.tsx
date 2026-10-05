import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { api } from '../../api/client';
import type { Homework } from '../../api/types';
import { useMe } from '../../lib/auth';
import { usePublishTargets, useSubjects } from '../../lib/queries';
import { longDate, relativeDay, todayIso, isManager } from '../../lib/format';
import { Badge, Button, Card, cx, EmptyState, ErrorState, IconButton, Input, Modal, PageHeader, PageSkeleton, Select, Textarea, useToast } from '../../components/ui';

type Filter = 'pending' | 'done' | 'all';

export default function HomeworkPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const isStudent = me?.role === 'student';
  const [filter, setFilter] = useState<Filter>(isStudent ? 'pending' : 'all');
  const [editing, setEditing] = useState<Homework | 'new' | null>(null);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['homework'], queryFn: () => api.get<Homework[]>('/homework') });

  const toggle = useMutation({
    mutationFn: (h: Homework) => h.done ? api.del(`/homework/${h.id}/complete`) : api.post(`/homework/${h.id}/complete`),
    onMutate: async (h) => {
      await qc.cancelQueries({ queryKey: ['homework'] });
      qc.setQueryData<Homework[]>(['homework'], (list) => list?.map((x) => (x.id === h.id ? { ...x, done: !h.done, overdue: false } : x)));
    },
    onSuccess: (_d, h) => { if (!h.done) toast('Tarefa concluída! 🎉'); },
    onSettled: () => { qc.invalidateQueries({ queryKey: ['homework'] }); qc.invalidateQueries({ queryKey: ['student', 'overview'] }); },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/homework/${id}`),
    onSuccess: () => { toast('Tarefa removida'); qc.invalidateQueries({ queryKey: ['homework'] }); },
    onError: (e) => toast(e.message, 'danger'),
  });

  const groups = useMemo(() => {
    const list = (data ?? []).filter((h) => filter === 'all' || (filter === 'done' ? h.done : !h.done));
    const today = todayIso();
    const past = (h: Homework) => h.dueDate < today;
    const out: Array<{ title: string; items: Homework[] }> = [
      { title: 'Atrasadas', items: list.filter((h) => isStudent && !h.done && past(h)) },
      { title: 'Próximas', items: list.filter((h) => !past(h)) },
      { title: 'Anteriores', items: list.filter((h) => past(h) && (!isStudent || h.done)).reverse() },
    ];
    return out.filter((g) => g.items.length);
  }, [data, filter, isStudent]);

  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  const pending = data.filter((h) => !h.done).length;

  return (
    <div>
      <PageHeader title="Tarefas de casa"
        subtitle={isStudent ? (pending ? `${pending} tarefa${pending > 1 ? 's' : ''} pendente${pending > 1 ? 's' : ''}` : 'Tudo em dia!') : 'Tarefas das suas turmas'}
        actions={!isStudent && <Button icon={Plus} onClick={() => setEditing('new')}>Nova tarefa</Button>} />

      {isStudent && (
        <div role="tablist" className="mb-4 inline-flex gap-1 rounded-lg border border-line bg-surface p-1 shadow-sm">
          {([['pending', 'Pendentes'], ['done', 'Feitas'], ['all', 'Todas']] as const).map(([f, label]) => (
            <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
              className={cx('min-h-11 rounded-md px-4 font-medium transition-all', filter === f ? 'bg-primary text-on-primary' : 'text-muted hover:bg-primary-soft hover:text-on-primary-soft')}>
              {label}
            </button>
          ))}
        </div>
      )}

      {groups.length === 0 ? (
        <Card><EmptyState icon={ClipboardList} title={filter === 'pending' ? 'Nenhuma tarefa pendente' : 'Nenhuma tarefa'} text={filter === 'pending' ? 'Aproveite para revisar o conteúdo! 📚' : undefined} /></Card>
      ) : groups.map((g) => (
        <section key={g.title} className="mb-6">
          <h2 className={cx('mb-2 text-sm font-semibold uppercase tracking-wide', g.title === 'Atrasadas' ? 'text-danger' : 'text-muted')}>{g.title}</h2>
          <ul className="space-y-2 stagger">
            {g.items.map((h, i) => (
              <li key={h.id} style={{ ['--i' as string]: i }}>
                <Card className={cx('flex gap-3 p-3 sm:p-4 transition-colors', h.done && 'opacity-80')}>
                  {isStudent && (
                    <button onClick={() => toggle.mutate(h)} aria-pressed={h.done} aria-label={h.done ? `Marcar "${h.title}" como pendente` : `Marcar "${h.title}" como feita`}
                      className={cx('grid size-11 shrink-0 place-items-center rounded-full border-2 transition-all active:scale-90',
                        h.done ? 'border-success bg-success text-surface' : 'border-control text-transparent hover:border-success')}>
                      <Check className={cx('size-5 transition-transform duration-300', h.done ? 'scale-100' : 'scale-0')} aria-hidden />
                    </button>
                  )}
                  <span className="w-1 shrink-0 rounded-full" style={{ background: h.color }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className={cx('font-semibold', h.done && 'line-through text-muted')}>{h.title}</h3>
                      {h.overdue && <Badge tone="danger">Atrasada</Badge>}
                    </div>
                    {h.description && <p className="mt-1 text-sm text-muted">{h.description}</p>}
                    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
                      <span className="font-medium text-text">{h.subject}</span>
                      {!isStudent && <span>{h.className}</span>}
                      <span title={longDate(h.dueDate)}>Entrega: {relativeDay(h.dueDate)}</span>
                      {h.authorName && <span>{h.authorName}</span>}
                    </p>
                  </div>
                  {!isStudent && (isManager(me?.role) || h.authorId === me?.id) && (
                    <div className="flex shrink-0">
                      <IconButton label={`Editar tarefa ${h.title}`} icon={Pencil} onClick={() => setEditing(h)} />
                      <IconButton label={`Excluir tarefa ${h.title}`} icon={Trash2} onClick={() => { if (confirm('Excluir esta tarefa?')) remove.mutate(h.id); }} className="hover:bg-danger-soft hover:text-danger" />
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {editing && me && me.role !== 'student' && <HomeworkForm role={me.role} initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

const Schema = z.object({
  classId: z.string().min(1, 'Escolha a turma'),
  subjectId: z.string().min(1, 'Escolha a matéria'),
  title: z.string().trim().min(3, 'Título muito curto').max(120),
  description: z.string().max(2000).optional(),
  dueDate: z.string().min(10, 'Informe a data de entrega'),
});
type Form = z.infer<typeof Schema>;

function HomeworkForm({ role, initial, onClose }: { role: 'teacher' | 'coordinator' | 'admin'; initial: Homework | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const targets = usePublishTargets(role);
  const allSubjects = useSubjects();
  const { register, handleSubmit, watch, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: initial
      ? { classId: String(initial.classId), subjectId: String(initial.subjectId), title: initial.title, description: initial.description ?? '', dueDate: initial.dueDate }
      : { dueDate: todayIso() },
  });
  const classId = Number(watch('classId'));
  // Professor: só as matérias que leciona na turma escolhida
  const subjects = targets.assignments
    ? targets.assignments.filter((a) => a.classId === classId).map((a) => ({ id: a.subjectId, name: a.subject }))
    : allSubjects.data?.map((s) => ({ id: s.id, name: s.name })) ?? [];

  const save = useMutation({
    mutationFn: (f: Form) => {
      const body = { ...f, classId: Number(f.classId), subjectId: Number(f.subjectId), description: f.description || null };
      return initial ? api.put(`/homework/${initial.id}`, body) : api.post('/homework', body);
    },
    onSuccess: () => {
      toast(initial ? 'Tarefa atualizada' : 'Tarefa publicada');
      qc.invalidateQueries({ queryKey: ['homework'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      onClose();
    },
    onError: (e) => toast(e.message, 'danger'),
  });

  return (
    <Modal open onClose={onClose} title={initial ? 'Editar tarefa' : 'Nova tarefa de casa'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" form="hw-form" loading={save.isPending}>{initial ? 'Salvar' : 'Publicar'}</Button></>}>
      <form id="hw-form" className="space-y-4" onSubmit={handleSubmit((f) => save.mutate(f))} noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Turma" error={errors.classId?.message} {...register('classId')}>
            <option value="">Escolha</option>
            {targets.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select label="Matéria" error={errors.subjectId?.message} {...register('subjectId')} disabled={!classId && role === 'teacher'}>
            <option value="">Escolha</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <Input label="Título" error={errors.title?.message} {...register('title')} />
        <Textarea label="Descrição (opcional)" {...register('description')} />
        <Input label="Data de entrega" type="date" error={errors.dueDate?.message} {...register('dueDate')} />
      </form>
    </Modal>
  );
}

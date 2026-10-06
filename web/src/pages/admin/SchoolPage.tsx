import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Check, Link2, Pencil, Plus, School, Trash2, X } from 'lucide-react';
import { api } from '../../api/client';
import type { AdminUser, SchoolClass } from '../../api/types';
import { useAssignments, useSubjects } from '../../lib/queries';
import { WEEKDAY_NAME } from '../../lib/format';
import { Button, Card, cx, ErrorState, IconButton, Input, PageHeader, PageSkeleton, useToast } from '../../components/ui';

const selectClass = 'min-h-11 w-full rounded-md border border-control bg-surface px-3 focus:outline-none focus:ring-2 focus:ring-focus';

export default function SchoolPage() {
  const [tab, setTab] = useState<'classes' | 'subjects' | 'assignments'>('assignments');
  const tabs = [
    { k: 'assignments', label: 'Professores × turmas', icon: Link2 },
    { k: 'classes', label: 'Turmas', icon: School },
    { k: 'subjects', label: 'Matérias', icon: BookOpen },
  ] as const;
  return (
    <div>
      <PageHeader title="Turmas e matérias" subtitle="Estrutura da escola e quem leciona o quê." />
      <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1 shadow-sm">
        {tabs.map(({ k, label, icon: Icon }) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cx('flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 font-medium transition-all',
              tab === k ? 'bg-primary text-on-primary' : 'text-muted hover:bg-primary-soft hover:text-on-primary-soft')}>
            <Icon className="size-4" aria-hidden />{label}
          </button>
        ))}
      </div>
      <div key={tab} className="animate-fade-up">
        {tab === 'classes' ? <Classes /> : tab === 'subjects' ? <Subjects /> : <Assignments />}
      </div>
    </div>
  );
}

function Classes() {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'classes'], queryFn: () => api.get<SchoolClass[]>('/admin/classes') });
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['admin', 'classes'] }); qc.invalidateQueries({ queryKey: ['classes'] }); };
  const create = useMutation({
    mutationFn: () => api.post('/admin/classes', { name, schoolYear: year }),
    onSuccess: () => { toast('Turma criada'); setName(''); invalidate(); },
    onError: (e) => toast(e.message, 'danger'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/admin/classes/${id}`),
    onSuccess: () => { toast('Turma excluída'); invalidate(); },
    onError: (e) => toast(e.message, 'danger'),
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editYear, setEditYear] = useState(year);
  const rename = useMutation({
    mutationFn: ({ id, ...body }: { id: number; name: string; schoolYear: number }) => api.patch(`/admin/classes/${id}`, body),
    onSuccess: () => { toast('Turma atualizada'); setEditingId(null); invalidate(); },
    onError: (e) => toast(e.message, 'danger'),
  });
  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem] [&>*]:min-w-0">
      <Card className="p-0 sm:p-0">
        <ul className="divide-y divide-line">
          {data.map((c) => (
            <li key={c.id} className="flex items-center gap-3 p-3 sm:px-5">
              <School className="size-5 shrink-0 text-muted" aria-hidden />
              {editingId === c.id ? (
                <form className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                  onSubmit={(e) => { e.preventDefault(); if (editName.trim().length >= 2) rename.mutate({ id: c.id, name: editName.trim(), schoolYear: editYear }); }}>
                  <input aria-label="Nome da turma" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus
                    className="min-h-11 min-w-0 flex-1 rounded-md border border-control bg-surface px-3 focus:outline-none focus:ring-2 focus:ring-focus" />
                  <input aria-label="Ano letivo" type="number" value={editYear} onChange={(e) => setEditYear(Number(e.target.value))}
                    className="min-h-11 w-24 rounded-md border border-control bg-surface px-3 focus:outline-none focus:ring-2 focus:ring-focus" />
                  <IconButton type="submit" label="Salvar turma" icon={Check} />
                  <IconButton type="button" label="Cancelar edição" icon={X} onClick={() => setEditingId(null)} />
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                  <span className="text-sm text-muted">{c.schoolYear} · {c.students} aluno{c.students !== 1 ? 's' : ''}</span>
                  <IconButton label={`Editar ${c.name}`} icon={Pencil}
                    onClick={() => { setEditingId(c.id); setEditName(c.name); setEditYear(c.schoolYear); }} />
                </>
              )}
              <IconButton label={`Excluir ${c.name}`} icon={Trash2} className="hover:bg-danger-soft hover:text-danger" onClick={() => { if (confirm(`Excluir a turma ${c.name}?`)) remove.mutate(c.id); }} />
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Nova turma</h2>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) create.mutate(); }}>
          <Input label="Nome" placeholder="Ex.: 3º Ano B" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Ano letivo" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          <Button type="submit" icon={Plus} loading={create.isPending} className="w-full">Criar turma</Button>
        </form>
      </Card>
    </div>
  );
}

/** Dias de prova possíveis: Grupo 1/2 às terças e quintas; Inglês às sextas do Grupo 2. */
const EXAM_SLOTS: Array<[1 | 2, 2 | 4 | 5]> = [[1, 2], [1, 4], [2, 2], [2, 4], [2, 5]];

function Subjects() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, error, refetch } = useSubjects();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#1D4ED8');
  const invalidate = () => qc.invalidateQueries({ queryKey: ['subjects'] });
  const create = useMutation({
    mutationFn: () => api.post('/admin/subjects', { name, colorHex: color }),
    onSuccess: () => { toast('Matéria criada'); setName(''); invalidate(); },
    onError: (e) => toast(e.message, 'danger'),
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: number; colorHex?: string; examGroup?: number | null; examWeekday?: number | null }) =>
      api.patch(`/admin/subjects/${id}`, body),
    onSuccess: invalidate,
    onError: (e) => toast(e.message, 'danger'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/admin/subjects/${id}`),
    onSuccess: () => { toast('Matéria excluída'); invalidate(); },
    onError: (e) => toast(e.message, 'danger'),
  });
  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem] [&>*]:min-w-0">
      <Card className="p-0 sm:p-0">
        <ul className="divide-y divide-line">
          {data.map((s) => (
            <li key={s.id} className="flex items-center gap-3 p-3 sm:px-5">
              <input type="color" aria-label={`Cor de ${s.name}`} value={s.colorHex} onChange={(e) => update.mutate({ id: s.id, colorHex: e.target.value })}
                className="size-11 cursor-pointer rounded-md border border-control bg-surface p-1" />
              <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
              <select aria-label={`Dia de prova de ${s.name}`} value={s.examGroup ? `${s.examGroup}-${s.examWeekday}` : ''}
                onChange={(e) => {
                  const [g, wd] = e.target.value ? e.target.value.split('-').map(Number) : [null, null];
                  update.mutate({ id: s.id, examGroup: g ?? null, examWeekday: wd ?? null });
                }}
                className="min-h-11 rounded-md border border-control bg-surface px-2 text-base">
                <option value="">Sem prova fixa</option>
                {EXAM_SLOTS.map(([g, wd]) => <option key={`${g}-${wd}`} value={`${g}-${wd}`}>Grupo {g} · {WEEKDAY_NAME[wd]}</option>)}
              </select>
              <IconButton label={`Excluir ${s.name}`} icon={Trash2} className="hover:bg-danger-soft hover:text-danger" onClick={() => { if (confirm(`Excluir ${s.name}?`)) remove.mutate(s.id); }} />
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Nova matéria</h2>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) create.mutate(); }}>
          <Input label="Nome" placeholder="Ex.: Química" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="flex items-center gap-3">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="size-11 rounded-md border border-control bg-surface p-1" />
            <span className="text-sm font-medium">Cor de identificação</span>
          </label>
          <Button type="submit" icon={Plus} loading={create.isPending} className="w-full">Criar matéria</Button>
        </form>
      </Card>
    </div>
  );
}

function Assignments() {
  const qc = useQueryClient();
  const toast = useToast();
  const assignments = useAssignments();
  const subjects = useSubjects();
  const classes = useQuery({ queryKey: ['admin', 'classes'], queryFn: () => api.get<SchoolClass[]>('/admin/classes') });
  const teachers = useQuery({ queryKey: ['admin', 'users', 'teacher'], queryFn: () => api.get<AdminUser[]>('/admin/users', { role: 'teacher' }) });
  const [form, setForm] = useState({ teacherId: '', classId: '', subjectId: '' });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['teacher', 'assignments'] });
  const create = useMutation({
    mutationFn: () => api.post('/admin/assignments', { teacherId: Number(form.teacherId), classId: Number(form.classId), subjectId: Number(form.subjectId) }),
    onSuccess: () => { toast('Atribuição criada'); setForm((f) => ({ ...f, subjectId: '' })); invalidate(); },
    onError: (e) => toast(e.message, 'danger'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/admin/assignments/${id}`),
    onSuccess: () => { toast('Atribuição removida'); invalidate(); },
  });
  if (assignments.isLoading) return <PageSkeleton />;
  if (assignments.error || !assignments.data) return <ErrorState error={assignments.error} onRetry={() => assignments.refetch()} />;

  const byTeacher = new Map<string, typeof assignments.data>();
  for (const a of assignments.data) byTeacher.set(a.teacherName, [...(byTeacher.get(a.teacherName) ?? []), a]);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem] [&>*]:min-w-0">
      <div className="space-y-4">
        {byTeacher.size === 0 && <Card><p className="text-muted">Nenhuma atribuição ainda. Professores só lançam notas e tarefas nas turmas/matérias atribuídas aqui.</p></Card>}
        {[...byTeacher.entries()].map(([teacher, list]) => (
          <Card key={teacher}>
            <h2 className="mb-2 font-semibold">{teacher}</h2>
            <ul className="flex flex-wrap gap-2">
              {list.map((a) => (
                <li key={a.id} className="flex items-center gap-1 rounded-full border border-line py-1 pl-3 pr-1 text-sm">
                  <span className="size-2.5 rounded-full" style={{ background: a.color }} aria-hidden />
                  {a.subject} · {a.className}
                  <button aria-label={`Remover ${a.subject} de ${a.className}`} onClick={() => remove.mutate(a.id)}
                    className="grid size-11 place-items-center rounded-full text-muted hover:bg-danger-soft hover:text-danger">
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <Card>
        <h2 className="mb-3 font-semibold">Nova atribuição</h2>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (form.teacherId && form.classId && form.subjectId) create.mutate(); }}>
          {([
            ['teacherId', 'Professor', teachers.data?.filter((t) => t.isActive).map((t) => [t.id, t.fullName])],
            ['classId', 'Turma', classes.data?.map((c) => [c.id, `${c.name} (${c.schoolYear})`])],
            ['subjectId', 'Matéria', subjects.data?.map((s) => [s.id, s.name])],
          ] as const).map(([k, label, opts]) => (
            <label key={k} className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{label}</span>
              <select value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} className={selectClass}>
                <option value="">Escolha</option>
                {opts?.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </select>
            </label>
          ))}
          <Button type="submit" icon={Plus} loading={create.isPending} className="w-full" disabled={!form.teacherId || !form.classId || !form.subjectId}>Atribuir</Button>
        </form>
      </Card>
    </div>
  );
}

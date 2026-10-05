import { Fragment, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpenText, CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { api } from '../../api/client';
import type { CalendarEvent, ExamScheduleInfo, StudyContent } from '../../api/types';
import { useMe } from '../../lib/auth';
import { useSubjects } from '../../lib/queries';
import { isManager, longDate, relativeDay, toIsoDay, todayIso } from '../../lib/format';
import { Badge, Button, Card, cx, EmptyState, ErrorState, IconButton, Input, Modal, PageHeader, PageSkeleton, Select, Textarea, useToast } from '../../components/ui';

/** Transforma URLs http(s) do texto em links (sem HTML do usuário — o React escapa todo o resto). */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g);
  return (
    <>
      {parts.map((p, i) => (/^https?:\/\//.test(p)
        ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-primary underline underline-offset-2">{p}</a>
        : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

/** Bimestre "atual": o último cujo calendário de provas já começou (1 se nenhum). */
function currentBimester(info: ExamScheduleInfo | undefined) {
  const today = todayIso();
  const started = info?.schedules.filter((s) => s.firstTuesday <= today) ?? [];
  return started.length ? Math.max(...started.map((s) => s.bimester)) : 1;
}

export default function ContentsPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const canEdit = isManager(me?.role);
  const schedule = useQuery({ queryKey: ['exam-schedule'], queryFn: () => api.get<ExamScheduleInfo>('/exam-schedule') });
  const [bimester, setBimester] = useState<number | null>(null);
  const [subjectId, setSubjectId] = useState('');
  const [editing, setEditing] = useState<StudyContent | 'new' | null>(null);
  const bim = bimester ?? currentBimester(schedule.data);

  const contents = useQuery({
    queryKey: ['contents', bim],
    queryFn: () => api.get<StudyContent[]>('/contents', { bimester: bim }),
    enabled: !schedule.isLoading,
  });
  const upcoming = useQuery({
    queryKey: ['calendar', 'upcoming-exams'],
    queryFn: () => api.get<{ events: CalendarEvent[] }>('/calendar', { from: todayIso(), to: toIsoDay(new Date(Date.now() + 14 * 86_400_000)) }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/contents/${id}`),
    onSuccess: () => { toast('Conteúdo removido'); qc.invalidateQueries({ queryKey: ['contents'] }); },
  });

  const list = useMemo(
    () => (contents.data ?? []).filter((c) => !subjectId || c.subjectId === Number(subjectId)),
    [contents.data, subjectId],
  );
  const groups = useMemo(() => {
    const by = new Map<string, StudyContent[]>();
    for (const c of list) {
      const k = c.examNumber ? `P${c.examNumber}` : 'Geral';
      by.set(k, [...(by.get(k) ?? []), c]);
    }
    return [...by.entries()];
  }, [list]);
  const nextExams = (upcoming.data?.events ?? []).filter((e) => e.eventType === 'exam').slice(0, 8);

  if (schedule.isLoading || contents.isLoading) return <PageSkeleton />;
  if (contents.error) return <ErrorState error={contents.error} onRetry={() => contents.refetch()} />;
  const subjectsInBim = [...new Map((contents.data ?? []).map((c) => [c.subjectId, c.subject])).entries()];

  return (
    <div>
      <PageHeader title="Conteúdos das provas" subtitle="O que estudar para cada prova do bimestre."
        actions={canEdit && <Button icon={Plus} onClick={() => setEditing('new')}>Novo conteúdo</Button>} />

      {nextExams.length > 0 && (
        <Card className="mb-5 animate-fade-up">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><CalendarClock className="size-5 text-primary" aria-hidden />Próximas provas</h2>
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {nextExams.map((e) => (
              <li key={e.id} className="min-w-36 shrink-0 rounded-lg border border-line p-3">
                <p className="text-xs font-semibold uppercase text-muted">{relativeDay(e.startsOn)}</p>
                <p className="mt-1 flex items-center gap-1.5 font-semibold">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: e.color ?? 'var(--color-control)' }} aria-hidden />
                  <span className="truncate">{e.subject ?? e.title}</span>
                </p>
                <p className="text-sm text-muted">{e.examNumber ? `P${e.examNumber}` : 'Prova'} · {longDate(e.startsOn).split(',')[0]}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div role="tablist" aria-label="Bimestre" className="flex gap-1 rounded-lg border border-line bg-surface p-1 shadow-sm">
          {[1, 2, 3, 4].map((b) => (
            <button key={b} role="tab" aria-selected={bim === b} onClick={() => setBimester(b)}
              className={cx('min-h-11 rounded-md px-4 font-medium transition-all', bim === b ? 'bg-primary text-on-primary' : 'text-muted hover:bg-primary-soft hover:text-on-primary-soft')}>
              {b}º<span className="hidden sm:inline"> bimestre</span>
            </button>
          ))}
        </div>
        {subjectsInBim.length > 1 && (
          <label className="flex min-w-48 flex-1 flex-col gap-1.5 sm:flex-none">
            <span className="text-sm font-medium">Matéria</span>
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}
              className="min-h-11 rounded-md border border-control bg-surface px-3 focus:outline-none focus:ring-2 focus:ring-focus">
              <option value="">Todas</option>
              {subjectsInBim.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
        )}
      </div>

      {groups.length === 0 ? (
        <Card><EmptyState icon={BookOpenText} title="Nenhum conteúdo neste bimestre"
          text={canEdit ? 'Publique o que vai cair em cada prova.' : 'Quando a coordenação publicar, os conteúdos aparecem aqui.'}
          action={canEdit ? <Button variant="secondary" icon={Plus} onClick={() => setEditing('new')}>Novo conteúdo</Button> : undefined} /></Card>
      ) : groups.map(([label, items]) => (
        <section key={label} className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{label === 'Geral' ? 'Conteúdo geral do bimestre' : `Prova ${label}`}</h2>
          <ul className="grid gap-3 md:grid-cols-2 stagger [&>*]:min-w-0">
            {items.map((c, i) => (
              <li key={c.id} style={{ ['--i' as string]: i }}>
                <Card className="h-full">
                  <div className="mb-2 flex items-start gap-3">
                    <span className="mt-1 h-10 w-1 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-muted">{c.subject}</p>
                      <h3 className="text-lg font-semibold">{c.title}</h3>
                    </div>
                    {canEdit && (
                      <div className="flex shrink-0">
                        <IconButton label={`Editar ${c.title}`} icon={Pencil} onClick={() => setEditing(c)} />
                        <IconButton label={`Excluir ${c.title}`} icon={Trash2} className="hover:bg-danger-soft hover:text-danger"
                          onClick={() => { if (confirm('Excluir este conteúdo?')) remove.mutate(c.id); }} />
                      </div>
                    )}
                  </div>
                  {c.examDate && (
                    <Badge tone={c.examDate < todayIso() ? 'neutral' : 'primary'} icon={false} className="mb-3">
                      Prova {relativeDay(c.examDate).toLowerCase()} · {longDate(c.examDate).split(',')[0]}
                    </Badge>
                  )}
                  <p className="whitespace-pre-line text-text"><Linkified text={c.body} /></p>
                  {c.authorName && <p className="mt-3 text-xs text-muted">Publicado por {c.authorName}</p>}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {editing && <ContentForm content={editing === 'new' ? null : editing} defaultBimester={bim} onClose={() => setEditing(null)} />}
    </div>
  );
}

const Schema = z.object({
  subjectId: z.string().min(1, 'Escolha a matéria'),
  bimester: z.string(),
  examNumber: z.string(),
  title: z.string().trim().min(3, 'Título muito curto').max(120),
  body: z.string().trim().min(3, 'Escreva o conteúdo').max(10_000),
});
type Form = z.infer<typeof Schema>;

function ContentForm({ content, defaultBimester, onClose }: { content: StudyContent | null; defaultBimester: number; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const subjects = useSubjects();
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: content
      ? { subjectId: String(content.subjectId), bimester: String(content.bimester), examNumber: content.examNumber ? String(content.examNumber) : '', title: content.title, body: content.body }
      : { subjectId: '', bimester: String(defaultBimester), examNumber: '', title: '', body: '' },
  });
  const save = useMutation({
    mutationFn: (f: Form) => {
      const body = { subjectId: Number(f.subjectId), bimester: Number(f.bimester), examNumber: f.examNumber ? Number(f.examNumber) : null, title: f.title, body: f.body };
      return content ? api.put(`/contents/${content.id}`, body) : api.post('/contents', body);
    },
    onSuccess: () => { toast(content ? 'Conteúdo atualizado' : 'Conteúdo publicado'); qc.invalidateQueries({ queryKey: ['contents'] }); onClose(); },
    onError: (e) => toast(e.message, 'danger'),
  });
  return (
    <Modal open onClose={onClose} title={content ? 'Editar conteúdo' : 'Novo conteúdo'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" form="content-form" loading={save.isPending}>Publicar</Button></>}>
      <form id="content-form" className="space-y-4" onSubmit={handleSubmit((f) => save.mutate(f))} noValidate>
        <Select label="Matéria" error={errors.subjectId?.message} {...register('subjectId')}>
          <option value="">Escolha</option>
          {subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Bimestre" {...register('bimester')}>
            {[1, 2, 3, 4].map((b) => <option key={b} value={b}>{b}º bimestre</option>)}
          </Select>
          <Select label="Prova" {...register('examNumber')}>
            <option value="">Geral do bimestre</option>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>P{n}</option>)}
          </Select>
        </div>
        <Input label="Título" placeholder="Ex.: Orações subordinadas" error={errors.title?.message} {...register('title')} />
        <Textarea label="Conteúdo" rows={8} hint="Dica: um tópico por linha. Links (https://…) ficam clicáveis." error={errors.body?.message} {...register('body')} />
      </form>
    </Modal>
  );
}

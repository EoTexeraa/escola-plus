import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, ChevronDown, Megaphone, Pencil, Pin, Plus, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { api } from '../../api/client';
import type { Announcement } from '../../api/types';
import { useMe } from '../../lib/auth';
import { usePublishTargets } from '../../lib/queries';
import { ANNOUNCEMENT_CATEGORY, timeAgo, isManager } from '../../lib/format';
import { Badge, Button, Card, cx, EmptyState, ErrorState, IconButton, Input, Modal, PageHeader, PageSkeleton, Select, Textarea, useToast } from '../../components/ui';

export default function AnnouncementsPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState<number | null>(null);
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['announcements'], queryFn: () => api.get<Announcement[]>('/announcements') });

  const markRead = useMutation({
    mutationFn: (id: number) => api.post(`/announcements/${id}/read`),
    onMutate: (id) => qc.setQueryData<Announcement[]>(['announcements'], (l) => l?.map((a) => (a.id === id ? { ...a, read: true } : a))),
    onSettled: () => qc.invalidateQueries({ queryKey: ['student', 'overview'] }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/announcements/${id}`),
    onSuccess: () => { toast('Aviso removido'); qc.invalidateQueries({ queryKey: ['announcements'] }); },
    onError: (e) => toast(e.message, 'danger'),
  });

  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  const unread = data.filter((a) => !a.read).length;
  const list = onlyUnread ? data.filter((a) => !a.read) : data;

  const expand = (a: Announcement) => {
    setOpen(open === a.id ? null : a.id);
    if (!a.read) markRead.mutate(a.id);
  };

  return (
    <div>
      <PageHeader title="Avisos" subtitle={unread ? `${unread} não lido${unread > 1 ? 's' : ''}` : 'Você leu todos os avisos'}
        actions={<>
          {unread > 0 && <Button variant="secondary" onClick={() => setOnlyUnread((v) => !v)} aria-pressed={onlyUnread}>{onlyUnread ? 'Mostrar todos' : 'Só não lidos'}</Button>}
          {me && me.role !== 'student' && <Button icon={Plus} onClick={() => setEditing('new')}>Novo aviso</Button>}
        </>} />

      {list.length === 0 ? <Card><EmptyState icon={Bell} title="Nenhum aviso" /></Card> : (
        <ul className="space-y-3 stagger">
          {list.map((a, i) => {
            const cat = ANNOUNCEMENT_CATEGORY[a.category]!;
            const isOpen = open === a.id;
            return (
              <li key={a.id} style={{ ['--i' as string]: i }}>
                <Card className={cx('p-0 sm:p-0 overflow-hidden transition-shadow', isOpen && 'shadow-md', !a.read && 'border-l-4 border-l-primary')}>
                  <div className="flex items-start">
                    <button onClick={() => expand(a)} aria-expanded={isOpen} className="flex flex-1 items-start gap-3 p-4 text-left">
                      <span className={cx('mt-0.5 grid size-10 shrink-0 place-items-center rounded-full', a.isPinned ? 'bg-primary text-on-primary' : 'bg-primary-soft text-on-primary-soft')}>
                        {a.isPinned ? <Pin className="size-5" aria-label="Fixado" /> : <Megaphone className="size-5" aria-hidden />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className={cx('text-base', a.read ? 'font-medium' : 'font-bold')}>{a.title}</h2>
                          {!a.read && <span className="sr-only">(não lido)</span>}
                        </div>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                          <Badge tone={cat.tone} icon={false}>{cat.label}</Badge>
                          <span>{a.className ?? 'Toda a escola'}</span>·<span>{a.authorName ?? 'Escola'}</span>·<span>{timeAgo(a.createdAt)}</span>
                        </p>
                        {!isOpen && <p className="mt-2 line-clamp-2 text-muted">{a.body}</p>}
                      </div>
                      <ChevronDown className={cx('mt-2 size-5 shrink-0 text-muted transition-transform duration-300', isOpen && 'rotate-180')} aria-hidden />
                    </button>
                    {me && (isManager(me.role) || a.authorId === me.id) && me.role !== 'student' && (
                      <div className="m-2 flex">
                        <IconButton label={`Editar aviso ${a.title}`} icon={Pencil} onClick={() => setEditing(a)} />
                        <IconButton label={`Excluir aviso ${a.title}`} icon={Trash2} className="hover:bg-danger-soft hover:text-danger" onClick={() => { if (confirm('Excluir este aviso?')) remove.mutate(a.id); }} />
                      </div>
                    )}
                  </div>
                  {isOpen && <p className="whitespace-pre-line px-4 pb-4 pl-[4.25rem] animate-fade-in">{a.body}</p>}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {editing && me && me.role !== 'student' && <AnnouncementForm role={me.role} initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

const Schema = z.object({
  title: z.string().trim().min(3, 'Título muito curto').max(120),
  body: z.string().trim().min(3, 'Escreva o aviso').max(4000),
  category: z.enum(['general', 'exam', 'event', 'urgent']),
  classId: z.string(),
  isPinned: z.boolean().optional(),
});
type Form = z.infer<typeof Schema>;

function AnnouncementForm({ role, initial, onClose }: { role: 'teacher' | 'coordinator' | 'admin'; initial: Announcement | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const targets = usePublishTargets(role);
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: initial
      ? { title: initial.title, body: initial.body, category: initial.category, classId: initial.classId ? String(initial.classId) : '', isPinned: initial.isPinned }
      : { category: 'general', classId: isManager(role) ? '' : undefined, isPinned: false },
  });
  const save = useMutation({
    mutationFn: (f: Form) => {
      const body = { ...f, classId: f.classId ? Number(f.classId) : null };
      return initial ? api.put(`/announcements/${initial.id}`, body) : api.post('/announcements', body);
    },
    onSuccess: () => { toast(initial ? 'Aviso atualizado' : 'Aviso publicado'); qc.invalidateQueries({ queryKey: ['announcements'] }); onClose(); },
    onError: (e) => toast(e.message, 'danger'),
  });
  return (
    <Modal open onClose={onClose} title={initial ? 'Editar aviso' : 'Novo aviso'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" form="ann-form" loading={save.isPending}>{initial ? 'Salvar' : 'Publicar'}</Button></>}>
      <form id="ann-form" className="space-y-4" onSubmit={handleSubmit((f) => save.mutate(f))} noValidate>
        <Input label="Título" error={errors.title?.message} {...register('title')} />
        <Textarea label="Mensagem" rows={5} error={errors.body?.message} {...register('body')} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Para" {...register('classId')}>
            {isManager(role) && <option value="">Toda a escola</option>}
            {targets.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select label="Categoria" {...register('category')}>
            {Object.entries(ANNOUNCEMENT_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>
        {isManager(role) && (
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5 accent-[var(--color-primary)]" {...register('isPinned')} />Fixar no topo</label>
        )}
      </form>
    </Modal>
  );
}

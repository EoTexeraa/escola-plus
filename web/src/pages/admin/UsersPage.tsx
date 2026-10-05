import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Lock, Search, Trash2, UserRoundCheck, UserRoundX, Users } from 'lucide-react';
import { api } from '../../api/client';
import type { AdminUser, Role } from '../../api/types';
import { useAllClasses } from '../../lib/queries';
import { useMe } from '../../lib/auth';
import { ROLE_LABEL } from '../../lib/format';
import { Alert, Badge, Button, Card, cx, EmptyState, ErrorState, IconButton, Modal, PageHeader, PageSkeleton, useToast } from '../../components/ui';

export default function UsersPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const classes = useAllClasses();
  const [role, setRole] = useState<Role | ''>('');
  const [classId, setClassId] = useState('');
  const [search, setSearch] = useState('');
  const [temp, setTemp] = useState<{ name: string; password: string } | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'users', role, classId, search],
    queryFn: () => api.get<AdminUser[]>('/admin/users', { role: role || undefined, classId: classId || undefined, search: search || undefined }),
    placeholderData: keepPreviousData,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'users'] });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => api.patch(`/admin/users/${id}`, body),
    onSuccess: () => { toast('Usuário atualizado'); invalidate(); },
    onError: (e) => toast(e.message, 'danger'),
  });
  // Só o Administrador apaga contas (o servidor também exige isso)
  const removeUser = useMutation({
    mutationFn: (u: AdminUser) => api.del(`/admin/users/${u.id}`),
    onSuccess: (_d, u) => { toast(`Conta de ${u.fullName} apagada`); invalidate(); },
    onError: (e) => toast(e.message, 'danger'),
  });
  const reset = useMutation({
    mutationFn: (u: AdminUser) => api.post<{ temporaryPassword: string }>(`/admin/users/${u.id}/reset-password`),
    onSuccess: (r, u) => { setTemp({ name: u.fullName, password: r.temporaryPassword }); invalidate(); },
    onError: (e) => toast(e.message, 'danger'),
  });

  const selectClass = 'min-h-11 rounded-md border border-control bg-surface px-3 focus:outline-none focus:ring-2 focus:ring-focus';

  return (
    <div>
      <PageHeader title="Usuários" subtitle="Alunos, professores e administração." />
      <Card className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <label className="relative">
          <span className="sr-only">Buscar por nome ou usuário</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou usuário"
            className={cx(selectClass, 'w-full pl-10')} />
        </label>
        <select aria-label="Filtrar por perfil" value={role} onChange={(e) => setRole(e.target.value as Role | '')} className={selectClass}>
          <option value="">Todos os perfis</option>
          <option value="student">Alunos</option><option value="teacher">Professores</option>
          <option value="coordinator">Coordenação</option><option value="admin">Administrador</option>
        </select>
        <select aria-label="Filtrar por turma" value={classId} onChange={(e) => setClassId(e.target.value)} className={selectClass}>
          <option value="">Todas as turmas</option>
          {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.schoolYear})</option>)}
        </select>
      </Card>

      {isLoading ? <PageSkeleton /> : error || !data ? <ErrorState error={error} onRetry={() => refetch()} /> : data.length === 0 ? (
        <Card><EmptyState icon={Users} title="Nenhum usuário encontrado" /></Card>
      ) : (
        <Card className={cx('p-0 sm:p-0 overflow-hidden transition-opacity', isFetching && 'opacity-70')}>
          <ul className="divide-y divide-line">
            {data.map((u) => {
              const locked = u.lockedUntil && Date.parse(u.lockedUntil) > Date.now();
              return (
                <li key={u.id} className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
                  <div className={cx('grid size-10 shrink-0 place-items-center rounded-full font-bold', u.isActive ? 'bg-primary-soft text-on-primary-soft' : 'bg-line text-muted')} aria-hidden>
                    {u.fullName.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cx('font-semibold', !u.isActive && 'text-muted line-through')}>{u.fullName}</p>
                    <p className="text-sm text-muted">@{u.username}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={u.role === 'admin' ? 'danger' : u.role === 'coordinator' ? 'warning' : u.role === 'teacher' ? 'primary' : 'neutral'} icon={false}>{ROLE_LABEL[u.role]}</Badge>
                    {!u.isActive && <Badge tone="neutral">Desativado</Badge>}
                    {locked && <Badge tone="warning">Bloqueado</Badge>}
                    {u.role === 'student' && (
                      <select aria-label={`Turma de ${u.fullName}`} value={u.classId ?? ''}
                        onChange={(e) => patch.mutate({ id: u.id, body: { classId: e.target.value ? Number(e.target.value) : null } })}
                        className="min-h-11 rounded-md border border-control bg-surface px-2 text-sm">
                        <option value="">Sem turma</option>
                        {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.schoolYear})</option>)}
                      </select>
                    )}
                    {u.role === 'student' && (
                      <select aria-label={`Nível de inglês de ${u.fullName}`} value={u.englishLevel ?? ''}
                        onChange={(e) => patch.mutate({ id: u.id, body: { englishLevel: Number(e.target.value) } })}
                        className="min-h-11 rounded-md border border-control bg-surface px-2 text-sm">
                        {u.englishLevel === null && <option value="">Inglês ?</option>}
                        {[2, 3, 4].map((lv) => <option key={lv} value={lv}>Inglês {lv}</option>)}
                      </select>
                    )}
                    {locked && <IconButton label={`Desbloquear ${u.fullName}`} icon={Lock} onClick={() => patch.mutate({ id: u.id, body: { unlock: true } })} />}
                    {(u.role !== 'admin' || me?.role === 'admin') && <IconButton label={`Redefinir senha de ${u.fullName}`} icon={KeyRound}
                      onClick={() => { if (confirm(`Gerar senha temporária para ${u.fullName}? A senha atual deixará de funcionar.`)) reset.mutate(u); }} />}
                    {u.id !== me?.id && u.role !== 'admin' && (
                      <IconButton label={u.isActive ? `Desativar ${u.fullName}` : `Reativar ${u.fullName}`} icon={u.isActive ? UserRoundX : UserRoundCheck}
                        className={u.isActive ? 'hover:bg-danger-soft hover:text-danger' : ''}
                        onClick={() => patch.mutate({ id: u.id, body: { isActive: !u.isActive } })} />
                    )}
                    {me?.role === 'admin' && u.id !== me.id && (
                      <IconButton label={`Apagar a conta de ${u.fullName}`} icon={Trash2} className="hover:bg-danger-soft hover:text-danger"
                        onClick={() => {
                          const extra = u.role === 'student' ? ' Todas as notas e rotinas dessa pessoa também serão apagadas.' : '';
                          if (confirm(`Apagar definitivamente a conta de ${u.fullName} (@${u.username})?${extra} Isso não pode ser desfeito.`)) removeUser.mutate(u);
                        }} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Modal open={!!temp} onClose={() => setTemp(null)} title="Senha temporária gerada"
        footer={<Button onClick={() => setTemp(null)}>Entendi</Button>}>
        {temp && (
          <div className="space-y-4">
            <p>Entregue esta senha para <strong>{temp.name}</strong>. No primeiro acesso, será obrigatório criar uma nova senha.</p>
            <div className="flex items-center gap-2 rounded-lg bg-bg p-4">
              <code className="flex-1 text-center text-2xl font-bold tracking-widest">{temp.password}</code>
              <IconButton label="Copiar senha" icon={Copy} onClick={() => { navigator.clipboard?.writeText(temp.password); toast('Copiada'); }} />
            </div>
            <Alert tone="warning">Por segurança, ela não será exibida de novo.</Alert>
          </div>
        )}
      </Modal>
    </div>
  );
}

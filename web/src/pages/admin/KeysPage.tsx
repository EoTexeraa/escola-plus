import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Copy, KeyRound, Plus } from 'lucide-react';
import { api } from '../../api/client';
import type { AccessKeyRow } from '../../api/types';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, IconButton, Input, Modal, PageHeader, PageSkeleton, Select, useToast } from '../../components/ui';

interface Created { id: number; key: string; role: 'teacher' | 'coordinator'; maxUses: number; expiresAt: string }
interface Form { role: 'teacher' | 'coordinator'; label: string; maxUses: number; expiresInDays: number }

function status(k: AccessKeyRow) {
  if (k.revokedAt) return { label: 'Revogada', tone: 'neutral' as const };
  if (k.useCount >= k.maxUses) return { label: 'Esgotada', tone: 'neutral' as const };
  if (k.expiresAt && Date.parse(k.expiresAt) < Date.now()) return { label: 'Expirada', tone: 'neutral' as const };
  return { label: 'Ativa', tone: 'success' as const };
}

export default function KeysPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'keys'], queryFn: () => api.get<AccessKeyRow[]>('/admin/keys') });
  const { register, handleSubmit, reset } = useForm<Form>({ defaultValues: { role: 'teacher', label: '', maxUses: 1, expiresInDays: 7 } });

  const create = useMutation({
    mutationFn: (f: Form) => api.post<Created>('/admin/keys', { role: f.role, label: f.label || undefined, maxUses: Number(f.maxUses), expiresInDays: Number(f.expiresInDays) }),
    onSuccess: (k) => { setCreating(false); setCreated(k); reset(); qc.invalidateQueries({ queryKey: ['admin', 'keys'] }); },
    onError: (e) => toast(e.message, 'danger'),
  });
  const revoke = useMutation({
    mutationFn: (id: number) => api.post(`/admin/keys/${id}/revoke`),
    onSuccess: () => { toast('Chave revogada'); qc.invalidateQueries({ queryKey: ['admin', 'keys'] }); },
    onError: (e) => toast(e.message, 'danger'),
  });

  return (
    <div>
      <PageHeader title="Chaves de acesso" subtitle="Necessárias para criar contas de professor e de coordenação."
        actions={<Button icon={Plus} onClick={() => setCreating(true)}>Gerar chave</Button>} />
      <div className="mb-4"><Alert tone="primary">A chave completa aparece <strong>uma única vez</strong>, ao ser gerada. No sistema fica guardado só um código irreversível (hash) e a dica com os últimos caracteres.</Alert></div>

      {isLoading ? <PageSkeleton /> : error || !data ? <ErrorState error={error} onRetry={() => refetch()} /> : data.length === 0 ? (
        <Card><EmptyState icon={KeyRound} title="Nenhuma chave" /></Card>
      ) : (
        <Card className="overflow-x-auto p-0 sm:p-0">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-line bg-bg text-muted">
              <tr>{['Chave', 'Para', 'Descrição', 'Usos', 'Validade', 'Situação', ''].map((h) => <th key={h} scope="col" className="p-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((k) => {
                const st = status(k);
                return (
                  <tr key={k.id}>
                    <td className="p-3 font-mono">{k.keyHint}</td>
                    <td className="p-3"><Badge tone={k.role === 'coordinator' ? 'warning' : 'primary'} icon={false}>{k.role === 'coordinator' ? 'Coordenação' : 'Professor'}</Badge></td>
                    <td className="p-3">{k.label ?? '—'}</td>
                    <td className="p-3 tabular-nums">{k.useCount}/{k.maxUses}</td>
                    <td className="p-3">{k.expiresAt ? new Date(k.expiresAt).toLocaleDateString('pt-BR') : 'Sem validade'}</td>
                    <td className="p-3"><Badge tone={st.tone}>{st.label}</Badge></td>
                    <td className="p-1 text-right">
                      {st.label === 'Ativa' && <IconButton label="Revogar chave" icon={Ban} className="hover:bg-danger-soft hover:text-danger" onClick={() => { if (confirm('Revogar esta chave? Ela deixará de funcionar.')) revoke.mutate(k.id); }} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Gerar chave de acesso"
        footer={<><Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button><Button type="submit" form="key-form" loading={create.isPending}>Gerar</Button></>}>
        <form id="key-form" className="space-y-4" onSubmit={handleSubmit((f) => create.mutate(f))}>
          <Select label="Para quem" {...register('role')}>
            <option value="teacher">Professor</option>
            <option value="coordinator">Coordenação</option>
          </Select>
          <Input label="Descrição (opcional)" placeholder="Ex.: Prof. de Química — Maria" {...register('label')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Número de usos" type="number" min={1} max={100} hint="1 = uma pessoa" {...register('maxUses')} />
            <Input label="Válida por (dias)" type="number" min={1} max={365} {...register('expiresInDays')} />
          </div>
        </form>
      </Modal>

      <Modal open={!!created} onClose={() => setCreated(null)} title="Chave gerada" footer={<Button onClick={() => setCreated(null)}>Já copiei</Button>}>
        {created && (
          <div className="space-y-4">
            <p>Envie esta chave para a pessoa que vai se cadastrar como <strong>{created.role === 'coordinator' ? 'coordenação' : 'professor'}</strong>.</p>
            <div className="flex items-center gap-2 rounded-lg bg-bg p-4">
              <code className="flex-1 break-all text-center text-lg font-bold tracking-wider">{created.key}</code>
              <IconButton label="Copiar chave" icon={Copy} onClick={() => { navigator.clipboard?.writeText(created.key); toast('Chave copiada'); }} />
            </div>
            <Alert tone="warning">Ela não será exibida de novo. Vale para {created.maxUses} uso(s) até {new Date(created.expiresAt).toLocaleDateString('pt-BR')}.</Alert>
          </div>
        )}
      </Modal>
    </div>
  );
}

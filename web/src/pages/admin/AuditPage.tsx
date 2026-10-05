import { useQuery } from '@tanstack/react-query';
import { Download, History } from 'lucide-react';
import { api } from '../../api/client';
import { Badge, Card, EmptyState, ErrorState, PageHeader, PageSkeleton } from '../../components/ui';
import type { Tone } from '../../lib/format';

interface Row { id: number; action: string; entity: string; entityId: number | null; details: string | null; createdAt: string; actor: string | null }

const ACTION: Record<string, { label: string; tone: Tone }> = {
  'login.success': { label: 'Login', tone: 'success' },
  'login.failure': { label: 'Senha errada', tone: 'warning' },
  'login.locked': { label: 'Conta bloqueada', tone: 'danger' },
  'password.reset.success': { label: 'Senha trocada (pergunta)', tone: 'primary' },
  'password.reset.failure': { label: 'Resposta errada', tone: 'warning' },
  'password.change': { label: 'Senha alterada', tone: 'primary' },
  'password.admin_reset': { label: 'Senha redefinida (admin)', tone: 'warning' },
  'user.register': { label: 'Cadastro', tone: 'success' },
  'user.update': { label: 'Usuário alterado', tone: 'neutral' },
  'user.delete': { label: 'Conta apagada', tone: 'danger' },
  'data.reset': { label: 'Dados zerados', tone: 'danger' },
  'access_key.create': { label: 'Chave criada', tone: 'primary' },
  'access_key.revoke': { label: 'Chave revogada', tone: 'warning' },
  'access_key.use': { label: 'Chave usada', tone: 'primary' },
  'grade.upsert': { label: 'Notas lançadas', tone: 'success' },
  'assignment.create': { label: 'Atribuição criada', tone: 'neutral' },
  'assignment.delete': { label: 'Atribuição removida', tone: 'neutral' },
};

export default function AuditPage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'audit'], queryFn: () => api.get<Row[]>('/admin/audit', { limit: 200 }) });
  return (
    <div>
      <PageHeader title="Auditoria" subtitle="Registro de acessos e alterações sensíveis (somente leitura)."
        actions={<a href="/api/admin/backup/download" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-control/40 bg-surface px-4 font-medium hover:bg-primary-soft hover:text-on-primary-soft">
          <Download className="size-5" aria-hidden />Baixar backup do banco
        </a>} />
      {isLoading ? <PageSkeleton /> : error || !data ? <ErrorState error={error} onRetry={() => refetch()} /> : data.length === 0 ? (
        <Card><EmptyState icon={History} title="Sem registros" /></Card>
      ) : (
        <Card className="overflow-x-auto p-0 sm:p-0">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-line bg-bg text-muted">
              <tr>{['Quando', 'Quem', 'Ação', 'Detalhes'].map((h) => <th key={h} scope="col" className="p-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((r) => {
                const a = ACTION[r.action] ?? { label: r.action, tone: 'neutral' as Tone };
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap p-3 tabular-nums">{new Date(r.createdAt.replace(' ', 'T') + 'Z').toLocaleString('pt-BR')}</td>
                    <td className="p-3">{r.actor ?? '—'}</td>
                    <td className="p-3"><Badge tone={a.tone} icon={false}>{a.label}</Badge></td>
                    <td className="max-w-md truncate p-3 font-mono text-xs text-muted" title={r.details ?? ''}>{r.details ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChartColumn, CircleCheck, Clock, Table2, TriangleAlert, Trophy } from 'lucide-react';
import { api } from '../../api/client';
import type { BimesterStatus, Summary } from '../../api/types';
import { BIMESTER_STATUS, formatGrade, formatNeeded } from '../../lib/format';
import { Badge, Card, cx, EmptyState, ErrorState, PageHeader, PageSkeleton } from '../../components/ui';

// Cores de status validadas pela skill dataviz (tokens --color-chart-*); sempre com ícone + rótulo.
const BAR_COLOR: Record<BimesterStatus, string> = {
  passing: 'var(--color-chart-good)',
  recovery: 'var(--color-chart-warn)',
  partial: 'var(--color-chart-neutral)',
  empty: 'var(--color-chart-neutral)',
};

export default function SummaryPage() {
  const [bimester, setBimester] = useState<number | undefined>();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['student', 'summary', bimester ?? 'current'],
    queryFn: () => api.get<Summary>('/student/summary', { bimester }),
  });

  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  const b = data.bimester;

  return (
    <div>
      <PageHeader title="Resumo do bimestre" subtitle="Como você está em cada matéria." actions={
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium">Bimestre</span>
          <select value={b} onChange={(e) => setBimester(Number(e.target.value))}
            className="min-h-11 rounded-md border border-control bg-surface px-3 focus:outline-none focus:ring-2 focus:ring-focus">
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}º bimestre</option>)}
          </select>
        </label>
      } />

      {data.subjects.every((s) => s.status === 'empty') ? (
        <Card><EmptyState icon={ChartColumn} title="Sem notas neste bimestre" text="Escolha outro bimestre ou aguarde os lançamentos." /></Card>
      ) : (
        <div className="space-y-5" key={b}>
          {/* Número em destaque + contagens (a história é um número → stat tile) */}
          <div className="grid gap-4 sm:grid-cols-4 stagger">
            <Card className="sm:col-span-1" style={{ ['--i' as string]: 0 }}>
              <p className="text-sm text-muted">Média geral</p>
              <p className="mt-1 text-5xl font-bold">{formatGrade(data.overallAverage)}</p>
              <p className="mt-1 text-sm text-muted">entre {data.subjects.filter((s) => s.average !== null).length} matérias</p>
            </Card>
            <StatTile i={1} icon={CircleCheck} tone="text-success" label="Na média" value={data.counts.passing} />
            <StatTile i={2} icon={TriangleAlert} tone="text-warning" label="Recuperação" value={data.counts.recovery} />
            <StatTile i={3} icon={Clock} tone="text-muted" label="Parciais" value={data.counts.partial} />
          </div>

          <BarChart data={data} />

          <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
            <Card>
              <h2 className="mb-3 flex items-center gap-2 font-semibold"><Trophy className="size-5 text-primary" aria-hidden />Melhores desempenhos</h2>
              <ol className="space-y-2">
                {data.best.map((x, i) => (
                  <li key={x.subject.id} className="flex items-center gap-3">
                    <span className="grid size-8 place-items-center rounded-full bg-primary-soft text-sm font-bold text-on-primary-soft">{i + 1}º</span>
                    <span className="size-2.5 rounded-full" style={{ background: x.subject.color }} aria-hidden />
                    <span className="flex-1">{x.subject.name}</span>
                    <span className="font-semibold tabular-nums">{formatGrade(x.average)}</span>
                  </li>
                ))}
              </ol>
            </Card>
            <Card>
              <h2 className="mb-3 flex items-center gap-2 font-semibold"><TriangleAlert className="size-5 text-warning" aria-hidden />Precisa de atenção</h2>
              {data.attention.length === 0 ? (
                <p className="flex items-center gap-2 text-success"><CircleCheck className="size-5" aria-hidden />Nenhuma matéria abaixo da média. Parabéns!</p>
              ) : (
                <ul className="space-y-3">
                  {data.attention.map((x) => (
                    <li key={x.subject.id} className="rounded-md bg-warning-soft p-3 text-warning">
                      <p className="font-semibold">{x.subject.name} — média {formatGrade(x.average)}</p>
                      <p className="text-sm">
                        {x.status === 'recovery'
                          ? `Faltaram ${formatNeeded(x.pointsToPass)} ponto(s) para 6,0. Revise o conteúdo e aproveite o simulado (até +1,0).`
                          : 'Média das provas abaixo de 4,0. Reforce os estudos para as próximas provas.'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function StatTile({ icon: Icon, tone, label, value, i }: { icon: typeof Trophy; tone: string; label: string; value: number; i: number }) {
  return (
    <Card style={{ ['--i' as string]: i }}>
      <p className="flex items-center gap-2 text-sm text-muted"><Icon className={cx('size-4', tone)} aria-hidden />{label}</p>
      <p className="mt-1 text-4xl font-bold">{value}</p>
    </Card>
  );
}

/** Barras horizontais: uma série, escala 0–10, linha de referência em 6,0, dica ao tocar, visão em tabela. */
function BarChart({ data }: { data: Summary }) {
  const [asTable, setAsTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const rows = data.subjects.filter((s) => s.average !== null);
  const pct = (v: number) => `${(v / 10) * 100}%`;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Média do {data.bimester}º bimestre por matéria</h2>
        <button onClick={() => setAsTable((t) => !t)} aria-pressed={asTable}
          className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-primary hover:bg-primary-soft">
          {asTable ? <ChartColumn className="size-4" aria-hidden /> : <Table2 className="size-4" aria-hidden />}
          {asTable ? 'Ver gráfico' : 'Ver como tabela'}
        </button>
      </div>

      {asTable ? (
        <table className="w-full text-left animate-fade-in">
          <thead className="border-b border-line text-sm text-muted">
            <tr><th scope="col" className="py-2 font-medium">Matéria</th><th scope="col" className="py-2 text-right font-medium">Provas</th><th scope="col" className="py-2 text-right font-medium">Média</th><th scope="col" className="py-2 pl-3 font-medium">Situação</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.subjects.map((s) => (
              <tr key={s.subject.id}>
                <th scope="row" className="py-2 font-medium">{s.subject.name}</th>
                <td className="py-2 text-right tabular-nums">{formatGrade(s.examAverage)}</td>
                <td className="py-2 text-right font-semibold tabular-nums">{formatGrade(s.average)}</td>
                <td className="py-2 pl-3"><Badge tone={BIMESTER_STATUS[s.status].tone}>{BIMESTER_STATUS[s.status].label}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <figure aria-label="Gráfico de barras das médias por matéria. Use 'Ver como tabela' para os valores.">
          <div className="relative">
            {/* grade: linhas sólidas finas, recessivas */}
            <div className="pointer-events-none absolute inset-y-0 left-28 right-12 sm:left-36" aria-hidden>
              {[0, 2, 4, 6, 8, 10].map((t) => (
                <div key={t} className={cx('absolute inset-y-0 w-px', t === 6 ? 'bg-control' : 'bg-line')} style={{ left: pct(t) }} />
              ))}
            </div>
            <ul className="relative space-y-3">
              {rows.map((s, i) => {
                const st = BIMESTER_STATUS[s.status];
                return (
                  <li key={s.subject.id} className="relative flex items-center gap-2"
                    onMouseEnter={() => setHover(s.subject.id)} onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(s.subject.id)} onBlur={() => setHover(null)} tabIndex={0}
                    aria-label={`${s.subject.name}: ${formatGrade(s.average)}, ${st.label}`}>
                    <span className="w-26 shrink-0 truncate text-sm sm:w-34">{s.subject.name}</span>
                    <div className="relative mr-12 h-8 flex-1">
                      <div className="absolute inset-y-1 left-0 max-h-6 origin-left rounded-r-[4px] animate-[grow_700ms_var(--ease-out)_both]"
                        style={{ width: pct(s.average!), background: BAR_COLOR[s.status], animationDelay: `${i * 60}ms`, opacity: hover && hover !== s.subject.id ? 0.45 : 1, transition: 'opacity 150ms' }} />
                      <span className="absolute top-1/2 -translate-y-1/2 pl-2 text-sm font-semibold tabular-nums" style={{ left: pct(s.average!) }}>
                        {formatGrade(s.average)}
                      </span>
                      {hover === s.subject.id && (
                        <div role="tooltip" className="absolute bottom-full left-0 z-10 mb-1 rounded-md bg-text px-3 py-2 text-sm text-bg shadow-lg animate-fade-in" style={{ left: `min(${pct(s.average!)}, calc(100% - 12rem))` }}>
                          <p className="font-semibold">{s.subject.name}</p>
                          <p>Provas {formatGrade(s.examAverage)} + extras → <strong>{formatGrade(s.average)}</strong></p>
                          <p>{st.label}{s.isPartial ? ` · ${s.examsGraded}/4 provas` : ''}</p>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {/* eixo */}
            <div className="relative ml-28 mr-12 mt-2 h-5 text-xs text-muted sm:ml-36" aria-hidden>
              {[0, 2, 4, 6, 8, 10].map((t) => (
                <span key={t} className={cx('absolute -translate-x-1/2', t === 6 && 'font-semibold text-text')} style={{ left: pct(t) }}>{t}</span>
              ))}
            </div>
          </div>
          <figcaption className="mt-3 flex flex-wrap gap-4 text-sm text-muted">
            <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm" style={{ background: BAR_COLOR.passing }} /><CircleCheck className="size-4" aria-hidden />Na média (≥ 6,0)</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm" style={{ background: BAR_COLOR.recovery }} /><TriangleAlert className="size-4" aria-hidden />Recuperação</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm" style={{ background: BAR_COLOR.partial }} /><Clock className="size-4" aria-hidden />Parcial</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-px bg-control" />Linha de 6,0</span>
          </figcaption>
        </figure>
      )}
    </Card>
  );
}

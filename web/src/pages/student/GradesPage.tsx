import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, GraduationCap, Info, Pencil, TriangleAlert } from 'lucide-react';
import { api } from '../../api/client';
import type { GradeAuthor, GradeComponent, ReportCard, SubjectRef } from '../../api/types';
import { computeBimester, MAX_SCORE, type ComponentScores } from '../../lib/grading';
import { BIMESTER_STATUS, COMPONENT_LABEL, COMPONENTS, formatGrade, formatNeeded, YEAR_STATUS } from '../../lib/format';
import { Alert, Badge, Button, Card, cx, EmptyState, ErrorState, GradeValue, Modal, PageHeader, PageSkeleton, useToast } from '../../components/ui';

type Tab = 1 | 2 | 3 | 4 | 'ano';

export default function GradesPage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['student', 'grades'], queryFn: () => api.get<ReportCard>('/student/grades') });
  const [tab, setTab] = useState<Tab | null>(null);
  const [editing, setEditing] = useState<{ subject: SubjectRef; bimester: number } | null>(null);

  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  const current: Tab = tab ?? (data.currentBimester as Tab);

  return (
    <div>
      <PageHeader title="Minhas notas" subtitle={`${data.class?.name ?? ''} · ano letivo ${data.class?.schoolYear ?? ''}`} />

      <div role="tablist" aria-label="Período" className="mb-5 flex gap-1 overflow-x-auto rounded-lg bg-surface p-1 shadow-sm border border-line">
        {([1, 2, 3, 4, 'ano'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={current === t} onClick={() => setTab(t)}
            className={cx('min-h-11 flex-1 whitespace-nowrap rounded-md px-2 font-medium transition-all',
              current === t ? 'bg-primary text-on-primary shadow-sm' : 'text-muted hover:bg-primary-soft hover:text-on-primary-soft')}>
            {t === 'ano' ? 'Ano' : <>{t}º<span className="hidden sm:inline"> bimestre</span></>}
          </button>
        ))}
      </div>

      {data.subjects.length === 0 ? (
        <Card><EmptyState icon={GraduationCap} title="Nenhuma matéria ainda" text="Assim que a escola cadastrar as matérias, elas aparecem aqui." /></Card>
      ) : current === 'ano' ? <YearView data={data} />
        : <BimesterView data={data} bimester={current} onEdit={(subject) => setEditing({ subject, bimester: current })} />}

      {editing && <GradeEditor data={data} {...editing} onClose={() => setEditing(null)} />}

      <details className="mt-6 card p-4">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold"><Info className="size-5 text-primary" aria-hidden />Como a média é calculada?</summary>
        <ul className="mt-3 list-disc space-y-1 pl-6 text-muted">
          <li>São 4 provas por bimestre, cada uma valendo até <strong>8,0</strong>. A referência é ter média <strong>4,0</strong> nas provas.</li>
          <li>Média do bimestre = média das provas + <strong>projeto</strong> (até 1,0) + <strong>tarefa</strong> (até 1,0) + <strong>simulado</strong> (opcional, até 1,0), limitada a 10,0.</li>
          <li>Com <strong>6,0</strong> ou mais no bimestre você não fica de recuperação.</li>
          <li>No ano, a soma das 4 médias bimestrais precisa chegar a <strong>24,0</strong>.</li>
          <li>Você pode lançar suas próprias notas em <strong>Lançar</strong>. O professor também pode lançar ou corrigir; vale a última edição, e cada nota mostra quem lançou.</li>
        </ul>
      </details>
    </div>
  );
}

const AUTHOR_LABEL: Record<GradeAuthor, string> = { student: 'você', staff: 'prof.' };

function Author({ who }: { who?: GradeAuthor }) {
  if (!who) return null;
  return (
    <span className="block text-xs font-medium text-muted" title={who === 'student' ? 'Lançada por você' : 'Lançada pelo professor/coordenação'}>
      {AUTHOR_LABEL[who]}
    </span>
  );
}

function BimesterView({ data, bimester, onEdit }: { data: ReportCard; bimester: number; onEdit: (s: SubjectRef) => void }) {
  const items = data.subjects.map((s) => ({ subject: s.subject, b: s.bimesters[bimester - 1]! }));
  // Celular: lista compacta (matéria · situação · média); um toque abre os detalhes. Telas maiores: tudo aberto.
  const [open, setOpen] = useState<number | null>(null);
  return (
    <ul className="grid gap-2 md:grid-cols-2 md:gap-4 stagger [&>*]:min-w-0" key={bimester}>
      {items.map(({ subject, b }, i) => {
        const st = BIMESTER_STATUS[b.status];
        const isOpen = open === subject.id;
        return (
          <li key={subject.id} style={{ ['--i' as string]: i }}>
            <Card className={cx('h-full p-0 sm:p-0 md:p-5', isOpen && 'shadow-md')}>
              {/* Linha compacta (celular) */}
              <button type="button" onClick={() => setOpen(isOpen ? null : subject.id)} aria-expanded={isOpen}
                className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left md:hidden">
                <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: subject.color }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{subject.name}</span>
                  <Badge tone={st.tone} className="mt-0.5">{st.label}</Badge>
                </span>
                <GradeValue value={b.average} tone={st.tone} className="text-2xl" />
                <ChevronDown className={cx('size-5 shrink-0 text-muted transition-transform duration-300', isOpen && 'rotate-180')} aria-hidden />
              </button>

              <div className={cx(isOpen ? 'block animate-fade-in' : 'hidden', 'border-t border-line px-4 pb-4 pt-3 md:block md:border-0 md:p-0')}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <h2 className="hidden items-center gap-2 text-lg font-semibold md:flex">
                  <span className="size-3 rounded-full" style={{ background: subject.color }} aria-hidden />{subject.name}
                </h2>
                <div className="flex w-full items-center justify-end gap-1 md:w-auto">
                  <span className="hidden md:inline-flex"><Badge tone={st.tone}>{st.label}</Badge></span>
                  <Button variant="secondary" size="sm" icon={Pencil} onClick={() => onEdit(subject)} aria-label={`Lançar notas de ${subject.name}`}
                    className="w-full md:w-auto md:border-0 md:bg-transparent md:shadow-none">
                    Lançar notas
                  </Button>
                </div>
              </div>

              <dl className="grid grid-cols-4 gap-2">
                {(['exam1', 'exam2', 'exam3', 'exam4'] as const).map((c) => (
                  <div key={c} className="rounded-md bg-bg p-2 text-center">
                    <dt className="text-xs font-medium text-muted">{COMPONENT_LABEL[c]}</dt>
                    <dd className="text-lg font-semibold tabular-nums">{formatGrade(b.scores[c])}<Author who={b.authors[c]} /></dd>
                  </div>
                ))}
              </dl>
              <dl className="mt-2 grid grid-cols-3 gap-2">
                {(['project', 'homework', 'mock'] as const).map((c) => (
                  <div key={c} className="rounded-md border border-line p-2 text-center">
                    <dt className="text-xs font-medium text-muted">{COMPONENT_LABEL[c]}{c === 'mock' && ' (extra)'}</dt>
                    <dd className="font-semibold tabular-nums">{b.scores[c] !== undefined ? `+${formatGrade(b.scores[c])}` : '—'}<Author who={b.authors[c]} /></dd>
                  </div>
                ))}
              </dl>

              <div className="mt-4 flex items-end justify-between gap-3 border-t border-line pt-3">
                <div className="min-w-0 text-sm text-muted">
                  <p>Média das provas: <strong className="whitespace-nowrap text-text tabular-nums">{formatGrade(b.examAverage)} <span className="text-xs font-normal text-muted">/ 8,0</span></strong></p>
                  {b.status === 'recovery' && <p className="text-warning">Faltaram <strong>{formatNeeded(b.pointsToPass)}</strong> para 6,0</p>}
                  {b.isPartial && b.status !== 'empty' && <p>{b.examsGraded} de 4 provas lançadas</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">Média do bimestre</p>
                  <GradeValue value={b.average} tone={st.tone} className="text-3xl" />
                </div>
              </div>
              {b.examBelowReference && (
                <p className="mt-3 flex items-center gap-2 rounded-md bg-warning-soft p-2 text-sm text-warning">
                  <TriangleAlert className="size-4 shrink-0" aria-hidden />Média das provas abaixo da referência de 4,0.
                </p>
              )}
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function YearView({ data }: { data: ReportCard }) {
  const anyFinal = data.subjects.some((s) => s.status === 'final_recovery');
  return (
    <div className="space-y-4 animate-fade-up">
      {anyFinal && <Alert tone="danger" title="Atenção">Há matérias em recuperação final. Converse com seus professores.</Alert>}
      {/* Celular: um cartão por matéria */}
      <ul className="space-y-2 md:hidden">
        {data.subjects.map((s) => {
          const ys = YEAR_STATUS[s.status];
          return (
            <li key={s.subject.id}>
              <Card className="p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-2 font-semibold">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.subject.color }} aria-hidden />
                    <span className="truncate">{s.subject.name}</span>
                  </p>
                  <Badge tone={ys.tone}>{ys.label}</Badge>
                </div>
                <dl className="grid grid-cols-5 gap-1 text-center">
                  {s.bimesters.map((b, i) => (
                    <div key={i} className="rounded-md bg-bg py-1.5">
                      <dt className="text-xs text-muted">{i + 1}º bim.</dt>
                      <dd><GradeValue value={b.average} tone={BIMESTER_STATUS[b.status].tone} /></dd>
                    </div>
                  ))}
                  <div className="rounded-md bg-primary-soft py-1.5 text-on-primary-soft">
                    <dt className="text-xs">Soma</dt>
                    <dd className="font-bold tabular-nums">{formatGrade(s.sum)}</dd>
                  </div>
                </dl>
                {s.status !== 'approved' && s.pointsToPass > 0 && <p className="mt-2 text-sm text-muted">Faltam {formatNeeded(s.pointsToPass)} para 24,0</p>}
              </Card>
            </li>
          );
        })}
      </ul>
      <Card className="hidden overflow-x-auto p-0 sm:p-0 md:block">
        <table className="w-full min-w-[36rem] text-left">
          <caption className="sr-only">Resultado anual por matéria</caption>
          <thead className="border-b border-line text-sm text-muted">
            <tr>
              <th scope="col" className="p-3 font-medium">Matéria</th>
              {[1, 2, 3, 4].map((b) => <th key={b} scope="col" className="p-3 text-center font-medium">{b}º</th>)}
              <th scope="col" className="p-3 text-center font-medium">Soma</th>
              <th scope="col" className="p-3 font-medium">Resultado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.subjects.map((s) => {
              const ys = YEAR_STATUS[s.status];
              return (
                <tr key={s.subject.id} className="hover:bg-bg">
                  <th scope="row" className="p-3 font-medium">
                    <span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: s.subject.color }} aria-hidden />{s.subject.name}</span>
                  </th>
                  {s.bimesters.map((b, i) => (
                    <td key={i} className="p-3 text-center"><GradeValue value={b.average} tone={BIMESTER_STATUS[b.status].tone} /></td>
                  ))}
                  <td className="p-3 text-center">
                    <span className="font-bold tabular-nums">{formatGrade(s.sum)}</span>
                    <span className="block text-xs text-muted">de 24,0</span>
                  </td>
                  <td className="p-3">
                    <Badge tone={ys.tone}>{ys.label}</Badge>
                    {s.status !== 'approved' && s.pointsToPass > 0 && <span className="mt-1 block text-xs text-muted">faltam {formatNeeded(s.pointsToPass)}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/** O aluno lança/corrige as próprias notas de uma matéria no bimestre (prévia da média em tempo real). */
function GradeEditor({ data, subject, bimester, onClose }: { data: ReportCard; subject: SubjectRef; bimester: number; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const current = data.subjects.find((s) => s.subject.id === subject.id)?.bimesters[bimester - 1];
  const initial = Object.fromEntries(
    COMPONENTS.map((c) => [c, current?.scores[c] !== undefined ? String(current.scores[c]).replace('.', ',') : '']),
  ) as Record<GradeComponent, string>;
  const [draft, setDraft] = useState(initial);

  const parse = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
  const invalid = COMPONENTS.filter((c) => {
    const n = parse(draft[c]);
    return n !== null && (!Number.isFinite(n) || n < 0 || n > MAX_SCORE[c]);
  });
  const scores: ComponentScores = {};
  for (const c of COMPONENTS) {
    const n = parse(draft[c]);
    if (n !== null && Number.isFinite(n)) scores[c] = n;
  }
  const preview = computeBimester(scores);
  const changed = COMPONENTS.filter((c) => draft[c].trim() !== initial[c].trim());

  const save = useMutation({
    mutationFn: () => api.put<ReportCard>('/student/grades', {
      subjectId: subject.id, bimester, entries: changed.map((c) => ({ component: c, score: parse(draft[c]) })),
    }),
    onSuccess: (card) => {
      qc.setQueryData(['student', 'grades'], card);
      qc.invalidateQueries({ queryKey: ['student', 'overview'] });
      qc.invalidateQueries({ queryKey: ['student', 'summary'] });
      toast('Notas salvas');
      onClose();
    },
    onError: (e) => toast(e.message, 'danger'),
  });

  const st = BIMESTER_STATUS[preview.status];
  return (
    <Modal open onClose={onClose} title={`${subject.name} — ${bimester}º bimestre`}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!changed.length || invalid.length > 0}>Salvar</Button>
      </>}>
      <p className="mb-4 text-sm text-muted">Deixe em branco o que ainda não saiu. Use vírgula ou ponto (7,5).</p>
      <div className="grid grid-cols-4 gap-2">
        {COMPONENTS.map((c) => {
          const bad = invalid.includes(c);
          return (
            <label key={c} className={cx('flex flex-col gap-1', c === 'project' && 'col-start-1')}>
              <span className="text-xs font-medium">{COMPONENT_LABEL[c]} <span className="text-muted">até {formatGrade(MAX_SCORE[c])}</span></span>
              <input inputMode="decimal" value={draft[c]} aria-invalid={bad || undefined}
                onChange={(e) => setDraft((d) => ({ ...d, [c]: e.target.value.replace(/[^\d.,]/g, '') }))}
                className={cx('h-11 w-full rounded-md border bg-surface text-center text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-focus',
                  bad ? 'border-danger bg-danger-soft text-danger' : 'border-control')} />
            </label>
          );
        })}
      </div>
      {invalid.length > 0 && <div className="mt-3"><Alert tone="danger">Provas valem de 0 a 8,0; projeto, tarefa e simulado de 0 a 1,0.</Alert></div>}
      <div className="mt-5 flex items-center justify-between rounded-lg bg-bg p-4">
        <div>
          <p className="text-sm text-muted">Média do bimestre (prévia)</p>
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
        <GradeValue value={preview.average} tone={st.tone} className="text-4xl" />
      </div>
    </Modal>
  );
}

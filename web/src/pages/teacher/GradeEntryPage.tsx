import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NotebookPen, RotateCcw, Save, School } from 'lucide-react';
import { api } from '../../api/client';
import type { GradeComponent, GradeSheet } from '../../api/types';
import { useAssignments } from '../../lib/queries';
import { computeBimester, MAX_SCORE, type ComponentScores } from '../../lib/grading';
import { BIMESTER_STATUS, COMPONENT_LABEL, COMPONENTS, formatGrade } from '../../lib/format';
import { Alert, Badge, Button, Card, cx, EmptyState, ErrorState, PageHeader, PageSkeleton, useToast } from '../../components/ui';

/** Valor digitado por célula: string (aceita vírgula). '' = sem nota. */
type Draft = Record<number, Partial<Record<GradeComponent, string>>>;

const toStr = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','));
const parse = (s: string | undefined): number | null | 'invalid' => {
  if (s === undefined || s.trim() === '') return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 'invalid';
};

export default function GradeEntryPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const assignments = useAssignments();

  const classId = Number(params.get('turma')) || assignments.data?.[0]?.classId || 0;
  const subjectId = Number(params.get('materia')) || assignments.data?.find((a) => a.classId === classId)?.subjectId || 0;
  const bimester = Number(params.get('bimestre')) || 1;
  const setParam = (k: string, v: number) => { const p = new URLSearchParams(params); p.set(k, String(v)); if (k === 'turma') p.delete('materia'); setParams(p, { replace: true }); };

  const sheet = useQuery({
    queryKey: ['gradesheet', classId, subjectId, bimester],
    queryFn: () => api.get<GradeSheet>('/teacher/gradesheet', { classId, subjectId, bimester }),
    enabled: !!classId && !!subjectId,
  });

  const [draft, setDraft] = useState<Draft>({});
  const original = useMemo<Draft>(() => {
    const d: Draft = {};
    for (const s of sheet.data?.students ?? []) d[s.student.id] = Object.fromEntries(COMPONENTS.map((c) => [c, toStr(s.scores[c])]));
    return d;
  }, [sheet.data]);
  useEffect(() => setDraft(original), [original]);

  const changes = useMemo(() => {
    const out: Array<{ studentId: number; component: GradeComponent; score: number | null }> = [];
    const errors = new Set<string>();
    for (const [sid, row] of Object.entries(draft)) {
      for (const c of COMPONENTS) {
        const now = row[c] ?? '';
        const v = parse(now);
        if (v === 'invalid' || (typeof v === 'number' && (v < 0 || v > MAX_SCORE[c]))) errors.add(`${sid}.${c}`);
        if (now.trim() !== (original[Number(sid)]?.[c] ?? '').trim() && v !== 'invalid') out.push({ studentId: Number(sid), component: c, score: v });
      }
    }
    return { out, errors };
  }, [draft, original]);

  const save = useMutation({
    mutationFn: () => api.put<{ upserts: number; deletes: number }>('/teacher/gradesheet', { classId, subjectId, bimester, entries: changes.out }),
    onSuccess: (r) => {
      toast(`${r.upserts + r.deletes} nota${r.upserts + r.deletes !== 1 ? 's' : ''} salva${r.upserts + r.deletes !== 1 ? 's' : ''}`);
      qc.invalidateQueries({ queryKey: ['gradesheet', classId, subjectId, bimester] });
    },
    onError: (e) => toast(e.message, 'danger'),
  });

  // Aviso ao sair com alterações não salvas
  useEffect(() => {
    if (!changes.out.length) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [changes.out.length]);

  if (assignments.isLoading) return <PageSkeleton />;
  if (assignments.error) return <ErrorState error={assignments.error} onRetry={() => assignments.refetch()} />;
  if (!assignments.data?.length) {
    return <><PageHeader title="Lançar notas" /><Card><EmptyState icon={School} title="Nenhuma turma atribuída" text="Peça à administração para vincular você às suas turmas e matérias." /></Card></>;
  }

  const classes = [...new Map(assignments.data.map((a) => [a.classId, a])).values()];
  const subjects = assignments.data.filter((a) => a.classId === classId);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const next = document.querySelector<HTMLInputElement>(`[data-cell="${row + (e.key === 'ArrowUp' ? -1 : 1)}-${col}"]`);
    next?.focus();
    next?.select();
  };

  return (
    <div>
      <PageHeader title="Lançar notas" subtitle="Provas valem até 8,0; projeto, tarefa e simulado até 1,0. A média é calculada na hora."
        actions={<>
          <Button variant="ghost" icon={RotateCcw} disabled={!changes.out.length} onClick={() => setDraft(original)}>Desfazer</Button>
          <Button icon={Save} loading={save.isPending} disabled={!changes.out.length || changes.errors.size > 0} onClick={() => save.mutate()}>
            Salvar{changes.out.length ? ` (${changes.out.length})` : ''}
          </Button>
        </>} />

      <Card className="mb-4 grid gap-3 sm:grid-cols-3">
        <Picker label="Turma" value={classId} onChange={(v) => setParam('turma', v)} options={classes.map((c) => ({ v: c.classId, l: `${c.className} (${c.schoolYear})` }))} />
        <Picker label="Matéria" value={subjectId} onChange={(v) => setParam('materia', v)} options={subjects.map((s) => ({ v: s.subjectId, l: s.subject }))} />
        <Picker label="Bimestre" value={bimester} onChange={(v) => setParam('bimestre', v)} options={[1, 2, 3, 4].map((b) => ({ v: b, l: `${b}º bimestre` }))} />
      </Card>

      {changes.errors.size > 0 && <div className="mb-4"><Alert tone="danger">Há notas inválidas (em vermelho). Provas: 0 a 8,0 · Projeto, tarefa e simulado: 0 a 1,0.</Alert></div>}

      {sheet.isLoading ? <PageSkeleton /> : sheet.error ? <ErrorState error={sheet.error} onRetry={() => sheet.refetch()} /> : !sheet.data?.students.length ? (
        <Card><EmptyState icon={NotebookPen} title="Turma sem alunos" text="Quando alunos se cadastrarem nessa turma, eles aparecem aqui." /></Card>
      ) : (
        <Card className="overflow-hidden p-0 sm:p-0 animate-fade-up">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <caption className="sr-only">Notas do {bimester}º bimestre</caption>
              <thead>
                <tr className="border-b border-line bg-bg text-muted">
                  <th scope="col" className="sticky left-0 z-10 bg-bg p-3 text-left font-medium">Aluno</th>
                  {COMPONENTS.map((c) => (
                    <th key={c} scope="col" className="p-2 text-center font-medium">
                      {COMPONENT_LABEL[c]}<span className="block text-xs font-normal">até {formatGrade(MAX_SCORE[c])}</span>
                    </th>
                  ))}
                  <th scope="col" className="p-3 text-center font-medium">Média</th>
                  <th scope="col" className="p-3 text-left font-medium">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sheet.data.students.map((s, row) => {
                  const d = draft[s.student.id] ?? {};
                  const scores: ComponentScores = {};
                  for (const c of COMPONENTS) { const v = parse(d[c]); if (typeof v === 'number') scores[c] = v; }
                  const r = computeBimester(scores);
                  const st = BIMESTER_STATUS[r.status];
                  return (
                    <tr key={s.student.id} className="hover:bg-bg">
                      <th scope="row" className="sticky left-0 z-10 bg-surface p-3 text-left font-medium">
                        <span className="block max-w-40 truncate">{s.student.fullName}</span>
                      </th>
                      {COMPONENTS.map((c, col) => {
                        const key = `${s.student.id}.${c}`;
                        const bad = changes.errors.has(key);
                        const changed = (d[c] ?? '') !== (original[s.student.id]?.[c] ?? '');
                        return (
                          <td key={c} className="p-1 text-center">
                            <input
                              data-cell={`${row}-${col}`}
                              inputMode="decimal"
                              aria-label={`${COMPONENT_LABEL[c]} de ${s.student.fullName}`}
                              aria-invalid={bad || undefined}
                              value={d[c] ?? ''}
                              onChange={(e) => setDraft((prev) => ({ ...prev, [s.student.id]: { ...prev[s.student.id], [c]: e.target.value.replace(/[^\d.,]/g, '') } }))}
                              onKeyDown={(e) => onKey(e, row, col)}
                              onFocus={(e) => e.target.select()}
                              className={cx('h-11 w-16 rounded-md border bg-surface text-center tabular-nums transition-colors focus:outline-none focus:ring-2 focus:ring-focus',
                                bad ? 'border-danger bg-danger-soft text-danger' : changed ? 'border-primary bg-primary-soft text-on-primary-soft' : 'border-control')}
                            />
                          </td>
                        );
                      })}
                      <td className="p-3 text-center text-base font-bold tabular-nums">{formatGrade(r.average)}</td>
                      <td className="p-3"><Badge tone={st.tone}>{st.label}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line p-3 text-xs text-muted">Dica: use vírgula ou ponto (7,5). Enter desce para o próximo aluno. Apague o campo para remover a nota.</p>
        </Card>
      )}
    </div>
  );
}

function Picker({ label, value, onChange, options }: { label: string; value: number; onChange: (v: number) => void; options: Array<{ v: number; l: string }> }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="min-h-11 rounded-md border border-control bg-surface px-3 focus:outline-none focus:ring-2 focus:ring-focus">
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </label>
  );
}

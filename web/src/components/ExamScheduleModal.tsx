import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { ExamScheduleInfo } from '../api/types';
import { parseDay, shortDate, toIsoDay, WEEKDAY_NAME } from '../lib/format';
import { Alert, Button, cx, Input, Modal, Select, useToast } from './ui';

const WEEKS = 8; // G1/G2 alternados, 4 vezes cada (P1..P4)

/** Próxima terça-feira a partir de hoje (sugestão inicial). */
function nextTuesday() {
  const d = new Date();
  d.setDate(d.getDate() + ((2 - d.getDay() + 7) % 7));
  return toIsoDay(d);
}

export function ExamScheduleModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const info = useQuery({ queryKey: ['exam-schedule'], queryFn: () => api.get<ExamScheduleInfo>('/exam-schedule') });
  const [bimester, setBimester] = useState(1);
  const existing = info.data?.schedules.find((s) => s.bimester === bimester);
  const [firstTuesday, setFirstTuesday] = useState<string | null>(null);
  const [startingGroup, setStartingGroup] = useState<1 | 2 | null>(null);
  const date = firstTuesday ?? existing?.firstTuesday ?? nextTuesday();
  const group = startingGroup ?? existing?.startingGroup ?? 1;
  const isTuesday = parseDay(date).getDay() === 2;

  // Prévia: o que cai em cada semana
  const weeks = useMemo(() => Array.from({ length: WEEKS }, (_, w) => {
    const g = w % 2 === 0 ? group : (3 - group);
    const tue = parseDay(date); tue.setDate(tue.getDate() + 7 * w);
    const subjects = (info.data?.subjects ?? []).filter((s) => s.examGroup === g);
    const byDay = [2, 4, 5].map((wd) => ({ wd, names: subjects.filter((s) => s.examWeekday === wd).map((s) => s.name) })).filter((d) => d.names.length);
    return { w, g, exam: Math.floor(w / 2) + 1, tuesday: toIsoDay(tue), byDay };
  }), [date, group, info.data]);

  const save = useMutation({
    mutationFn: () => api.put<{ created: number; from: string; to: string }>(`/exam-schedule/${bimester}`, { firstTuesday: date, startingGroup: group }),
    onSuccess: (r) => {
      toast(`${r.created} provas no calendário (${shortDate(r.from)} a ${shortDate(r.to)})`);
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['exam-schedule'] });
      qc.invalidateQueries({ queryKey: ['contents'] });
      onClose();
    },
    onError: (e) => toast(e.message, 'danger'),
  });

  return (
    <Modal open onClose={onClose} title="Calendário de provas"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!isTuesday}>{existing ? 'Atualizar provas' : 'Gerar provas'}</Button>
      </>}>
      <p className="mb-4 text-sm text-muted">
        As provas são às terças e quintas (Inglês na sexta do Grupo 2). Os grupos se alternam por 8 semanas seguidas, 4 vezes cada: uma para cada prova (P1 a P4).
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select label="Bimestre" value={bimester} onChange={(e) => { setBimester(Number(e.target.value)); setFirstTuesday(null); setStartingGroup(null); }}>
          {[1, 2, 3, 4].map((b) => <option key={b} value={b}>{b}º bimestre{info.data?.schedules.some((s) => s.bimester === b) ? ' ✓' : ''}</option>)}
        </Select>
        <Input label="1ª terça de provas" type="date" value={date} onChange={(e) => setFirstTuesday(e.target.value)}
          error={isTuesday ? undefined : 'Escolha uma terça-feira'} />
        <Select label="Começa com" value={group} onChange={(e) => setStartingGroup(Number(e.target.value) as 1 | 2)}>
          <option value={1}>Grupo 1</option>
          <option value={2}>Grupo 2</option>
        </Select>
      </div>

      {existing && (
        <div className="mt-3"><Alert tone="warning">Este bimestre já tem provas geradas. Atualizar substitui as provas automáticas dele (os eventos criados à mão continuam).</Alert></div>
      )}

      <ol className="mt-4 space-y-2" aria-label="Prévia das semanas de prova">
        {weeks.map((wk) => (
          <li key={wk.w} className="rounded-lg border border-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-bold', wk.g === 1 ? 'bg-primary-soft text-on-primary-soft' : 'bg-warning-soft text-warning')}>Grupo {wk.g}</span>
              <span className="font-semibold">P{wk.exam}</span>
              <span className="text-sm text-muted">semana de {shortDate(wk.tuesday)}</span>
            </div>
            <ul className="mt-1.5 space-y-0.5 text-sm">
              {wk.byDay.map((d) => <li key={d.wd}><strong>{WEEKDAY_NAME[d.wd]}:</strong> {d.names.join(', ')}</li>)}
            </ul>
          </li>
        ))}
      </ol>
    </Modal>
  );
}

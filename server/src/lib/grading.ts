// Regras de notas — ver docs/regras-de-notas.md (fonte da verdade, com exemplos que viram testes).
import type { GradeComponent } from '../db/schema.js';

export const EXAMS = ['exam1', 'exam2', 'exam3', 'exam4'] as const;
export const MAX_SCORE: Record<GradeComponent, number> = {
  exam1: 8, exam2: 8, exam3: 8, exam4: 8, project: 1, homework: 1, mock: 1,
};
export const EXAM_REFERENCE = 4; // média das provas de referência (não reprova sozinha)
export const BIMESTER_PASS = 6;
export const YEAR_PASS_SUM = 24;
export const BIMESTER_MAX = 10;

export type ComponentScores = Partial<Record<GradeComponent, number>>;

export type BimesterStatus = 'passing' | 'recovery' | 'partial' | 'empty';

export interface BimesterResult {
  scores: ComponentScores;
  examAverage: number | null;   // média das provas lançadas
  average: number | null;       // média do bimestre (limitada a 10)
  examsGraded: number;          // 0..4
  isPartial: boolean;
  status: BimesterStatus;
  examBelowReference: boolean;  // média das provas < 4,0 (apenas alerta)
  pointsToPass: number;         // quanto falta para 6,0 (0 se já passou)
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeBimester(scores: ComponentScores): BimesterResult {
  const exams = EXAMS.map((e) => scores[e]).filter((v): v is number => typeof v === 'number');
  const examsGraded = exams.length;
  if (examsGraded === 0 && scores.project === undefined && scores.homework === undefined && scores.mock === undefined) {
    return {
      scores, examAverage: null, average: null, examsGraded: 0, isPartial: true,
      status: 'empty', examBelowReference: false, pointsToPass: BIMESTER_PASS,
    };
  }
  const examAverage = examsGraded ? exams.reduce((a, b) => a + b, 0) / examsGraded : 0;
  const extras = (scores.project ?? 0) + (scores.homework ?? 0) + (scores.mock ?? 0);
  const average = Math.min(BIMESTER_MAX, examAverage + extras);
  const isPartial = examsGraded < EXAMS.length;
  const status: BimesterStatus = isPartial ? 'partial' : average >= BIMESTER_PASS ? 'passing' : 'recovery';
  return {
    scores,
    examAverage: examsGraded ? round2(examAverage) : null,
    average: round2(average),
    examsGraded,
    isPartial,
    status,
    examBelowReference: examsGraded > 0 && examAverage < EXAM_REFERENCE,
    pointsToPass: round2(Math.max(0, BIMESTER_PASS - average)),
  };
}

export type YearStatus = 'approved' | 'final_recovery' | 'in_progress';

export interface YearResult {
  bimesters: BimesterResult[]; // índices 0..3 = B1..B4
  sum: number;
  status: YearStatus;
  pointsToPass: number;        // quanto falta para 24
}

export function computeYear(byBimester: ComponentScores[]): YearResult {
  const bimesters = [0, 1, 2, 3].map((i) => computeBimester(byBimester[i] ?? {}));
  const sum = bimesters.reduce((acc, b) => acc + (b.average ?? 0), 0);
  const complete = bimesters.every((b) => !b.isPartial);
  const status: YearStatus = sum >= YEAR_PASS_SUM ? 'approved' : complete ? 'final_recovery' : 'in_progress';
  return { bimesters, sum: round2(sum), status, pointsToPass: round2(Math.max(0, YEAR_PASS_SUM - sum)) };
}

/** Exibição: 1 casa decimal TRUNCADA (5,95 → "5,9"), nunca arredondada para cima. */
export function formatGrade(n: number | null): string {
  if (n === null) return '—';
  const truncated = Math.floor(round2(n) * 10 + 1e-9) / 10; // epsilon: 6.3*10 = 62.99999…
  return truncated.toFixed(1).replace('.', ',');
}

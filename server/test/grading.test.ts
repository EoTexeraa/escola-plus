// Exemplos de docs/regras-de-notas.md
import { describe, expect, it } from 'vitest';
import { computeBimester, computeYear, formatGrade } from '../src/lib/grading.js';

const all = (p: number) => ({ exam1: p, exam2: p, exam3: p, exam4: p });

describe('média do bimestre', () => {
  it('#1 limita a 10,0 com simulado', () => {
    const r = computeBimester({ ...all(8), project: 1, homework: 1, mock: 1 });
    expect(r.average).toBe(10);
    expect(r.status).toBe('passing');
  });
  it('#2 provas 4,0 + projeto + tarefa = 6,0 passa', () => {
    const r = computeBimester({ ...all(4), project: 1, homework: 1 });
    expect(r.average).toBe(6);
    expect(r.status).toBe('passing');
    expect(r.examBelowReference).toBe(false);
  });
  it('#3 5,5 fica de recuperação', () => {
    const r = computeBimester({ ...all(4), project: 1, homework: 0.5 });
    expect(r.average).toBe(5.5);
    expect(r.status).toBe('recovery');
    expect(r.pointsToPass).toBe(0.5);
  });
  it('#4 provas abaixo de 4,0 mas média 6,0 passa (4,0 é referência)', () => {
    const r = computeBimester({ ...all(3), project: 1, homework: 1, mock: 1 });
    expect(r.average).toBe(6);
    expect(r.status).toBe('passing');
    expect(r.examBelowReference).toBe(true);
  });
  it('#5 5,95 é recuperação e aparece como 5,9', () => {
    const r = computeBimester({ exam1: 5, exam2: 5, exam3: 5, exam4: 4.8, project: 0.5, homework: 0.5 });
    expect(r.average).toBe(5.95);
    expect(r.status).toBe('recovery');
    expect(formatGrade(r.average)).toBe('5,9');
  });
  it('#6 duas provas lançadas = parcial', () => {
    const r = computeBimester({ exam1: 6, exam2: 7 });
    expect(r.average).toBe(6.5);
    expect(r.isPartial).toBe(true);
    expect(r.status).toBe('partial');
  });
  it('sem nenhuma nota = vazio', () => {
    expect(computeBimester({}).status).toBe('empty');
  });
});

describe('resultado do ano (soma ≥ 24)', () => {
  const bim = (avgExams: number, extra = 0) => ({ ...all(avgExams), project: extra });
  it('#7 soma 24,0 aprova', () => {
    const r = computeYear([bim(6), bim(6), bim(6), bim(6)]);
    expect(r.sum).toBe(24);
    expect(r.status).toBe('approved');
  });
  it('#8 soma 23,5 = recuperação final, faltam 0,5', () => {
    const r = computeYear([bim(7, 1), bim(7), bim(5), bim(3.5)]);
    expect(r.sum).toBe(23.5);
    expect(r.status).toBe('final_recovery');
    expect(r.pointsToPass).toBe(0.5);
  });
  it('ano incompleto abaixo de 24 = em andamento', () => {
    expect(computeYear([bim(6), bim(6)]).status).toBe('in_progress');
  });
});

describe('formatGrade', () => {
  it('trunca, nunca arredonda para cima', () => {
    expect(formatGrade(5.99)).toBe('5,9');
    expect(formatGrade(6)).toBe('6,0');
    expect(formatGrade(7.25)).toBe('7,2');
    expect(formatGrade(null)).toBe('—');
  });
  it('não perde décimos por ponto flutuante', () => {
    for (let t = 0; t <= 100; t++) expect(formatGrade(t / 10)).toBe((t / 10).toFixed(1).replace('.', ','));
  });
});

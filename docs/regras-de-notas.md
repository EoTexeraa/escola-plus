# Regras de notas — Escola+

Definidas pelo responsável pela escola em 2026-09-30. Valem por **matéria** e por **bimestre**.

| Componente | Valor | Observação |
|------------|-------|------------|
| Provas P1, P2, P3, P4 | 0 a **8,0** cada | Referência: a média das provas deve ser ≥ **4,0** |
| Ponto de projeto | 0 a **1,0** | |
| Ponto de tarefa | 0 a **1,0** | |
| Simulado | 0 a **1,0** | **Opcional**, ponto extra |

## Cálculo

```
média das provas   = (P1 + P2 + P3 + P4) / 4                      (0 a 8,0)
média do bimestre  = mín(10,0; média das provas + projeto + tarefa + simulado)
situação bimestre  = média do bimestre ≥ 6,0 → "Na média" ; senão → "Recuperação"
soma do ano        = média B1 + média B2 + média B3 + média B4      (0 a 40)
resultado do ano   = soma ≥ 24,0 → "Aprovado" ; senão → "Recuperação final"
```

- A média das provas ≥ 4,0 é **só referência**: se os pontos extras levarem a média do bimestre a ≥ 6,0, o aluno passa.
- A média do bimestre nunca passa de **10,0**.
- **Notas ainda não lançadas:** a média é marcada como *parcial* e usa só as provas já lançadas. Componentes ausentes contam 0.
  A situação só fica definitiva quando as 4 provas estiverem lançadas.
- Exibição: 1 casa decimal **truncada** (5,95 → 5,9), nunca arredondada para cima; **a comparação usa o valor exato**,
  assim a tela nunca mostra "6,0" para quem está de recuperação.
- "Quanto falta": o app mostra quantos pontos faltam para 6,0 no bimestre e para 24,0 no ano.

## Exemplos (viram testes automatizados)

| # | P1 | P2 | P3 | P4 | Proj. | Tarefa | Simul. | Média provas | Média bimestre | Situação |
|---|----|----|----|----|-------|--------|--------|--------------|----------------|----------|
| 1 | 8,0 | 8,0 | 8,0 | 8,0 | 1,0 | 1,0 | 1,0 | 8,0 | **10,0** (limitada) | Na média |
| 2 | 4,0 | 4,0 | 4,0 | 4,0 | 1,0 | 1,0 | — | 4,0 | 6,0 | Na média |
| 3 | 4,0 | 4,0 | 4,0 | 4,0 | 1,0 | 0,5 | — | 4,0 | 5,5 | Recuperação |
| 4 | 3,0 | 3,0 | 3,0 | 3,0 | 1,0 | 1,0 | 1,0 | 3,0 (abaixo de 4) | 6,0 | Na média (passa) |
| 5 | 5,0 | 5,0 | 5,0 | 4,8 | 0,5 | 0,5 | — | 4,95 | 5,95 (tela: 5,9) | **Recuperação** |
| 6 | 6,0 | 7,0 | — | — | — | — | — | 6,5 (parcial) | 6,5 (parcial) | Parcial |

| # | B1 | B2 | B3 | B4 | Soma | Resultado |
|---|----|----|----|----|------|-----------|
| 7 | 6,0 | 6,0 | 6,0 | 6,0 | 24,0 | Aprovado |
| 8 | 8,0 | 7,0 | 5,0 | 3,5 | 23,5 | Recuperação final (faltam 0,5) |

## Cores (acessíveis, ver docs/design)

- Na média / Aprovado → `success` + ícone ✓
- Recuperação → `warning` + ícone !
- Recuperação final → `danger` + ícone ✕
- Parcial → neutro + rótulo "parcial"

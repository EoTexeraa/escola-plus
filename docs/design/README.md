# Design — Escola+

Skill: `ui-design-system` (2026-09-30). Cor principal escolhida: **azul escolar `#1D4ED8`**, estilo **modern** (Inter, raio 8px, sombras suaves).

| Arquivo | Conteúdo |
|---------|----------|
| `design-tokens.json` / `design-tokens.css` | Saída bruta de `design_token_generator.py "#1D4ED8" --style modern` |
| `tokens.css` | **Tokens finais usados pelo app**, corrigidos para WCAG 2.2 AA, com tema claro e escuro |

## Validação de acessibilidade (passo 5 do workflow da skill)

Correções feitas na saída bruta do gerador:

1. **Cores semânticas reprovadas:** o gerador define `contrast: #FFFFFF` para success/warning/error/info, mas texto branco nessas cores
   fica com 2.15–3.76:1 (mínimo AA = 4.5:1). Substituídas por tons 700 no tema claro (5.02–6.47:1) e tons 300/400 no escuro (6.27–10.39:1).
2. **Escala do primário fora de ordem:** `primary-500` (#5778d8) é mais claro que o `DEFAULT` (#1D4ED8), e `primary-50` (#abbdf2) é escuro demais
   para fundo (1.86:1 contra branco). Substituída por uma escala monotônica.
3. **Borda de campos:** o cinza claro padrão (1.48:1) reprova a WCAG 1.4.11 (controles ≥ 3:1). Foi criado `--color-border-control`
   (4.76:1 no claro, 5.01:1 no escuro).

Resultado: **26/26 pares de texto ≥ 4.5:1** nos dois temas; bordas de controle ≥ 3:1.

## Regras de uso

- Usar só os tokens de `tokens.css`, nunca cores fixas no código.
- Alvos de toque ≥ 44×44px (`--touch-target`).
- Foco visível com `--color-focus-ring` (outline de 2px).
- Animar só `transform` e `opacity`; `prefers-reduced-motion` zera as durações.
- Situação da nota (ver `docs/regras-de-notas.md`): **na média** (bimestre ≥ 6,0) = `success`; **recuperação** (bimestre < 6,0) = `warning`; **recuperação final** (soma do ano < 24) = `danger`.
  A cor nunca é o único indicador: sempre há ícone ou texto junto (daltonismo).

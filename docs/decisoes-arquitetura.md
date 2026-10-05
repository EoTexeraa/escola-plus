# Decisões de arquitetura — Escola+

Registro das perguntas obrigatórias (forcing questions) das skills
`senior-fullstack`, `senior-backend` e `senior-frontend`
(github.com/alirezarezvani/claude-skills), respondidas antes de gerar código.

| # | Pergunta | Resposta | Consequência |
|---|----------|----------|--------------|
| 1 | Tamanho da equipe hoje / em 12 meses | 1 pessoa (o próprio autor) / até 2 | Monólito único (Node.js), sem microserviços |
| 2 | Usuários no 1º ano (alunos + professores + admin) | Até 500 | Um servidor simples + SQLite; pico estimado < 5 req/s, dimensionado com folga de 3x |
| 3 | Orçamento mensal de hospedagem | ~~Até R$ 35/mês~~ → **R$ 0 por enquanto** (revisado na aprovação da stack) | Desenvolvimento 100% local; banco libSQL (SQLite) em arquivo local e, em produção, no plano gratuito do Turso; hospedagem do servidor em plano gratuito decidida no deploy |
| 4 | Sensibilidade dos dados (LGPD, alunos menores) | Mínimo: nome, usuário, turma, notas — sem CPF/endereço/telefone/foto | Senhas com hash scrypt; cada aluno só vê os próprios dados; recuperação de senha por pergunta de segurança (sem e-mail) |
| 5 | Backup — perda aceitável (RPO) / tempo de volta (RTO) | RPO 24h / RTO 4h | Backup automático diário do SQLite pelo próprio servidor, retenção de 14 dias; admin pode baixar backup manual |
| 6 | Aparelho/rede principal | Android de entrada + 4G | Mobile-first; animações só em CSS (transform/opacity); sem frameworks pesados; respeita prefers-reduced-motion |
| 7 | Metas de desempenho | LCP < 2,5s (mobile 4G); API p95 < 200ms; código do front < 150 KB | Medidas antes da entrega (Lighthouse mobile + teste de carga da API) |
| 8 | Acessibilidade | WCAG 2.2 AA | Contraste ≥ 4.5:1, alvos de toque ≥ 44px, foco visível, HTML semântico + ARIA, modo claro/escuro, prefers-reduced-motion |
| 9 | Disponibilidade / cadência | 99,5% mensal / atualizações semanais | Deploy fora do horário de aula; endpoint /api/health para monitoramento; APK gerado por CI a cada versão |

## Resultado das ferramentas de decisão (2026-09-30)

| Skill | Perfil recomendado | Aderência | Segunda opção |
|-------|--------------------|-----------|---------------|
| senior-fullstack | `saas-startup` (monólito modular) | 84% | `internal-tool` (75%) |
| senior-backend | `node-express` | 84% | `fastapi-python` (82%) |
| senior-frontend | `vite-spa` | 75% | — |

### Stack proposta

- **Frontend:** Vite + React + TypeScript (strict) + Tailwind; SPA com code-splitting por rota;
  TanStack Query (dados do servidor), react-hook-form + zod (formulários); PWA instalável.
- **Backend:** Node.js 24 + Express 5 + TypeScript (strict); validação zod em toda requisição;
  helmet + CORS explícito + rate limiting no login; monólito modular (auth, notas, avisos, tarefas, calendário, rotinas, admin).
- **Banco:** libSQL (SQLite) via Drizzle ORM — arquivo local no desenvolvimento, Turso (plano gratuito) em produção; backup diário.
- **Mobile:** Capacitor → APK Android; build do APK via GitHub Actions a cada versão.
- **Testes:** Vitest + Supertest (API), Playwright (fluxos principais), checagem axe (acessibilidade).

### Divergências das recomendações (justificadas)

1. **SQLite em vez de PostgreSQL.** As skills recomendam Postgres, mas o orçamento (~US$ 7/mês)
   e a escala (≤ 500 usuários, < 5 req/s) são atendidos por SQLite no mesmo servidor, com custo zero
   e backup = cópia de arquivo. Drizzle ORM mantém a migração para Postgres barata se a escala crescer.
2. **Cadência semanal** (skill preferia diária): aceitável para 1 pessoa; deploy fora do horário de aula.
3. **Dispositivo Android de entrada** (perfil vite-spa assume desktop): orçamento de bundle apertado para
   **< 150 KB gzip inicial** (meta da pergunta 7, mais rígida que os 200 KB do perfil).

### Metas verificáveis (critério de pronto)

| Métrica | Meta |
|---------|------|
| API p95 | < 200 ms |
| LCP mobile 4G (p75) | < 2,5 s |
| INP (p75) | < 200 ms |
| CLS | < 0,1 |
| Bundle inicial (gzip) | < 150 KB |
| Lighthouse performance / acessibilidade | ≥ 80 / ≥ 90 |
| Disponibilidade mensal | ≥ 99,5% |
| Backup | RPO 24h, RTO 4h |
| Cobertura de testes | ≥ 60% |
| Scan de segurança | nenhum achado alto/crítico |

## Aprovação (2026-09-30)

Stack aprovada pelo responsável técnico (o autor), com uma alteração: **custo zero por enquanto**.

- Banco: libSQL/SQLite (gratuito) — local em arquivo; produção no Turso free tier (5 GB). Mesmo código (Drizzle + `@libsql/client`), muda só a URL.
- **Riscos aceitos com custo zero** (a revisar quando houver orçamento):
  - Hospedagens gratuitas "dormem" após inatividade: o 1º acesso pode levar 30–60 s, violando LCP < 2,5 s e dificultando 99,5% de disponibilidade.
  - Metas de desempenho e disponibilidade valem para o servidor já acordado; a meta de 99,5% fica suspensa até haver hospedagem paga.

## Banco de dados (skill `database-designer`, 2026-09-30)

Arquivos em [`docs/database/`](database/): `schema.sql` (DDL), `schema.json` (entrada das ferramentas),
`query_patterns.json` (14 consultas críticas), `index_report.json`, `erd.mmd` (diagrama Mermaid).

- **Análise (`schema_analyzer.py`):** 14 tabelas, 99 colunas, 25 FKs, todas com PK, sem problemas de normalização.
  Corrigido: colunas de hash `VARCHAR(255)` → tamanhos reais (scrypt `salt:hash` = 161 chars).
- **Índices (`index_optimizer.py`):** 27 sugestões (+135% de custo de escrita) → curadoria para **7 índices compostos**;
  o restante já é coberto por PK/UNIQUE compostas (a ferramenta não reconhece prefixo à esquerda).
- **Verificação independente (`EXPLAIN QUERY PLAN` do SQLite):** 14/14 consultas usam índice, **0 full scans**.
- **Limitações encontradas nas ferramentas da skill** (reportar ao repositório):
  1. `schema_analyzer.py` corta cada `CREATE TABLE` no primeiro `)` (regex não-gulosa) — qualquer `VARCHAR(n)` quebra a análise
     do DDL; contornado com `ddl_to_json.py` (usa o próprio SQLite para ler o schema).
  2. `schema_analyzer.py` ignora o campo `indexes` do JSON ("Total Indexes: 0").
  3. `index_optimizer.py` não considera PKs/UNIQUEs compostas como índices utilizáveis.
- **Privacidade (LGPD):** nenhuma coluna de CPF, endereço, telefone ou foto; respostas de segurança e chaves de acesso
  guardadas só como hash; `audit_log` registra alterações de notas, chaves e senhas.

## Verificação das metas (2026-09-30)

| Métrica | Meta | Medido | Status |
|---------|------|--------|--------|
| API p95 (10 conexões simultâneas, ~40× a carga prevista) | < 200 ms | 26–54 ms (`api_load_tester.py`) | ✓ |
| LCP mobile 4G simulado (Lighthouse) | < 2,5 s | login 2,43 s · início 2,59 s · notas 2,62 s · resumo 2,78 s · calendário 3,02 s | **✗ parcial** |
| INP / TBT | < 200 ms | TBT 30–230 ms | ✓ |
| CLS | < 0,1 | 0 | ✓ |
| Bundle inicial (gzip) | < 150 KB | 141 KB | ✓ |
| Lighthouse desempenho / acessibilidade | ≥ 80 / ≥ 90 | 90–94 / 100 | ✓ |
| Cobertura de testes | ≥ 60% | não medida; 30 testes (regras + mitigações de segurança) | pendente |
| Scan de segredos | 0 alto/crítico | 0 | ✓ |
| `npm audit` | ≤ moderado | 3 moderados, só no `@capacitor/cli` (dependência iOS de desenvolvimento, fora do APK e do servidor) | ✓ aceito |

**Pendência de LCP nas telas logadas:** a cadeia HTML → JS → `/api/me` → página → dados custa ~0,1–0,5 s acima da meta
no 4G simulado lento do Lighthouse. Já aplicado: compressão gzip, fonte hospedada localmente, pré-carregamento da página inicial,
sem animação de opacidade no elemento LCP. Próximos passos possíveis: embutir a sessão no HTML (evita `/api/me`) ou
pré-buscar `/api/student/overview` junto com `/api/me`.

**Correções feitas durante a verificação:** compressão ausente no servidor; fonte do Google bloqueando a renderização;
zod no bundle inicial (39 KB); `role="grid"` inválido no calendário; página mais larga que a tela no celular (itens de grid sem
`min-w-0`); SPA não servida quando o caminho contém pasta com ponto (`.vscode`).

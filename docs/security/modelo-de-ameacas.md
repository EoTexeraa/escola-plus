# Modelo de ameaças — Escola+ (STRIDE / DREAD)

Skill: `senior-security` (`threat_modeler.py`), 2026-09-30.
Saída bruta da ferramenta: `threats_auth.json`, `threats_api.json`, `threats_db.json`.
Responsável por todas as mitigações: o autor (equipe de 1 pessoa, decisão #1).

Regra da skill: toda ameaça com DREAD médio ≥ 7 precisa de uma mitigação com responsável antes do design ser aprovado.
Pronto = scan de segredos sem achados altos ou críticos + todas as linhas abaixo implementadas e testadas.

## Fluxo de dados e fronteiras de confiança

```
[Aluno/Professor/Admin]  --HTTPS-->  [App web / APK (Capacitor WebView)]
                                            | mesma origem (APK carrega a URL do servidor)
                                            v
                              [Servidor Node/Express]  --libSQL/TLS-->  [Banco (arquivo local / Turso)]
```

Fronteiras: (1) internet → servidor; (2) servidor → banco; (3) papel aluno ↔ professor ↔ admin dentro da API.

## Ameaças da ferramenta (genéricas)

| DREAD | STRIDE | Ameaça | Mitigação neste sistema |
|------:|--------|--------|--------------------------|
| **8.2** | S | Roubo de credenciais | Senhas com scrypt (N=2^15) e salt; senha mínima de 8 caracteres (10 para professor e admin); bloqueio progressivo após falhas; auditoria de logins. MFA fica fora do escopo: risco aceito, a revisar para admins. |
| **7.2** | S | Uso indevido de chave de acesso | Chaves de professor/admin geradas aleatoriamente (≥ 96 bits), guardadas **só como hash SHA-256**, de uso único por padrão, com expiração e revogação; o admin vê apenas a "dica" (últimos 4 caracteres). |
| 6.8 | D | Força bruta no login | Rate limit por IP (10/min no login) + contador por usuário; a partir de 5 falhas, bloqueio de 1, 5 e 15 min, progressivo. |
| 6.8 | I | Exposição excessiva de dados | DTOs explícitos por papel (nunca `SELECT *` na resposta); hashes nunca saem do servidor. |
| 6.6 | T | Manipulação de token | Token HMAC-SHA256 com algoritmo fixo no código (nunca lido do token); segredo ≥ 256 bits vindo de variável de ambiente; `token_version` invalida sessões ao trocar a senha. Escolhemos HS256 em vez de RS256 porque há um único serviço, que assina e verifica. |
| 6.6 | T | SQL injection | Somente consultas parametrizadas (Drizzle ORM); validação zod em toda entrada. |
| 6.2 | S | Sequestro de sessão | Token em cookie `HttpOnly; Secure; SameSite=Strict`, sem localStorage; sessão de 8h com renovação. |
| 6.2 | I | Vazamento de hash de senha | scrypt + salt; backups guardados no mesmo nível de proteção do banco. |
| 6.2 | E | Escalada de privilégio | Autorização no servidor em toda rota (RBAC + checagem de dono do recurso); o papel vem do banco, não do cliente. |
| 6.2 | D | DDoS | Rate limit global (300 req / 15 min por IP); o CDN do provedor gratuito é a camada de borda. Risco residual aceito (custo zero). |
| 6.2 | I | Dados em repouso sem criptografia | Dados mínimos (decisão #4); o Turso criptografa em repouso; o arquivo local fica fora da pasta pública. |
| 5.8 | D | Burlar o rate limit | Limite por IP **e** por usuário no login e na troca de senha. |
| 5.2 | I | Interceptação de tráfego | HTTPS obrigatório em produção + HSTS (helmet); o APK não permite tráfego sem TLS (`cleartext: false`). |
| 5.2 | T | Manipulação de requisição | TLS + validação zod + CSRF (SameSite=Strict + header `X-Requested-With` obrigatório em rotas que alteram dados). |
| 5.2 | R | Adulteração do log de auditoria | `audit_log` só permite inserção pela aplicação (não há rota de edição nem de exclusão). |
| 4.8 | R | Negar ter feito um login | Registro de login, falha, troca de senha, alteração de nota e criação de chave, com data/hora e IP. |

## Ameaças específicas do sistema (não cobertas pela ferramenta)

| DREAD | STRIDE | Ameaça | Mitigação |
|------:|--------|--------|-----------|
| **8.0** | E/I | **IDOR**: aluno troca o id na URL e vê notas de outro | Rotas de aluno nunca recebem `student_id`: usam sempre o id da sessão. Rotas de professor verificam `teaching_assignments`. Teste automatizado para cada caso. |
| **7.8** | S | **Tomada de conta pela troca de senha** (a pergunta de segurança é mais fraca que a senha) | Resposta com hash scrypt e normalizada; 5 tentativas erradas bloqueiam a troca por 30 min; a mesma mensagem genérica para usuário inexistente; a troca invalida todas as sessões (`token_version`) e fica registrada na auditoria. Admin e professor também podem pedir a redefinição ao admin. |
| **7.4** | E | **Professor lança nota em turma ou matéria que não é dele** | Toda escrita em `grades` checa `(teacher_id, class_id, subject_id)` em `teaching_assignments`; o admin é o único que atribui. |
| **7.0** | S | **Enumeração de usuários** pelo login ou pela troca de senha | Mesma mensagem e tempo de resposta semelhante para usuário inexistente e senha errada. O aviso de "trocar senha" aparece após 2 erros **no cliente**, sem revelar se o usuário existe. |
| 6.4 | E | Aluno se cadastra como professor sem chave | O papel é definido **só** pela chave validada no servidor; cadastro sem chave cria sempre `student`. |
| 6.0 | I | XSS em avisos ou tarefas | O frontend nunca usa `innerHTML` com dados do usuário (o React escapa por padrão); CSP via helmet. |

## Verificação (critério de pronto)

- [x] `secret_scanner.py` sem achados altos ou críticos (0 encontrados em server/src, web/src e docs)
- [x] Testes de API: IDOR (aluno A ↛ notas de B), professor fora da atribuição → 403, cadastro sem chave → aluno
- [x] Testes de rate limit e bloqueio (login e troca de senha)
- [x] Headers de segurança (helmet) presentes em produção (CSP, HSTS, nosniff, frame-ancestors none)

## Revisão 2026-10-04 — novos papéis e regras

| DREAD | STRIDE | Ameaça | Mitigação / decisão |
|------:|--------|--------|---------------------|
| **8.4** | E | **Alguém cria o Administrador antes do dono** (a opção aparece no cadastro público até ser usada, sem código) | **Risco aceito pelo responsável** (decisão de 2026-10-04: "sem código"). Mitigações: o banco garante **um único** Administrador (`ux_users_single_admin`, à prova de cadastros simultâneos); o servidor avisa no log enquanto não houver Administrador; recomendação operacional: **criar o Administrador logo após publicar**, antes de divulgar o endereço. Se alguém tomar a vaga, só é possível corrigir direto no banco. |
| 7.2 | T | **Aluno altera as próprias notas** | Decisão do responsável: aluno e professor lançam e vale a última edição. Mitigações: o aluno só escreve no **próprio** boletim (id da sessão, sem `student_id` na rota); só em matérias do seu currículo/nível; limites 0–8 / 0–1 validados no servidor; **cada nota mostra quem lançou** (aluno ou equipe); toda alteração vai para a auditoria (`bySelf: true`). As notas servem como acompanhamento, não como registro oficial. |
| 6.8 | E | Coordenação mexe na conta do Administrador | `assertCanManageUser`: a Coordenação não redefine senha nem desativa o Administrador (teste automatizado). |
| 6.0 | I | Aluno vê conteúdo/tarefa/prova do Inglês de outro nível | `subjectVisibleTo`: um único filtro aplicado a boletim, tarefas, calendário, conteúdos e lista de matérias (testes automatizados). |
| 5.0 | E | Coordenação acessa auditoria/backup | Rotas exclusivas do Administrador (`requireRole('admin')`), com teste. |

## Revisão 2026-10-05 — controle total do Administrador

| DREAD | STRIDE | Ameaça | Mitigação |
|------:|--------|--------|-----------|
| 7.0 | T/D | **Exclusão indevida de contas** (apagar conta remove notas e rotinas do aluno) | Exclusivo do Administrador (`requireRole('admin')`); ninguém apaga a própria conta; confirmação explícita na tela; registro `user.delete` na auditoria **antes** de apagar (com usuário, nome e papel); backup diário permite recuperar. Testes automatizados. |
| 5.5 | T | Edição de aviso/tarefa/evento de outra pessoa | Só o autor ou a coordenação/administrador editam (mesma regra da exclusão); professor continua limitado às suas turmas/matérias. Teste: outro professor recebe 403. |
| 4.0 | T | Prova automática editada à mão some ao regenerar o calendário | Evento editado vira `source = 'manual'` e não é apagado ao regenerar. |

# Escola+

**No ar:** https://escola-plus.onrender.com · **APK Android:** [Releases](https://github.com/EoTexeraa/escola-plus/releases/latest)

Sistema de gerenciamento escolar do **9º ano**, com app para celular. Alunos acompanham e **lançam as próprias notas**, veem os **conteúdos das provas**, o resumo do bimestre, tarefas de casa, rotina de estudos, avisos e o calendário escolar, com as provas geradas automaticamente pelos Grupos 1 e 2. Professores lançam notas e publicam tarefas, avisos e eventos. A coordenação gerencia a escola, e o Administrador tem acesso a tudo.

- **App web instalável (PWA)** e **APK Android** (Capacitor)
- Tema claro e escuro, animações leves e acessível (WCAG 2.2 AA)
- Custo zero: SQLite/libSQL local ou Turso (plano gratuito) e hospedagem gratuita

## Perfis

| Perfil | Como cria a conta | O que faz |
|---|---|---|
| **Aluno** | Cadastro livre, escolhendo o **nível de inglês (2, 3 ou 4)** | Vê e lança as próprias notas; vê conteúdos, resumo, tarefas, rotina, avisos e calendário. Só enxerga o Inglês do seu nível |
| **Professor** | Cadastro com **chave de acesso** gerada pela coordenação | Lança notas e publica tarefas, avisos e eventos **só nas turmas e matérias atribuídas a ele** |
| **Coordenação** | Cadastro com **chave de acesso de coordenação** | Tudo do professor, mais usuários, chaves, turmas, matérias, atribuições, **conteúdos das provas** e **calendário de provas** |
| **Administrador** | Opção **única** no cadastro, que aparece só enquanto não existir um Administrador | Tudo da coordenação, mais **auditoria e backup**. A coordenação não pode alterar a conta dele |

> **Importante:** logo depois de publicar o sistema, crie a conta de Administrador antes de divulgar o endereço. Enquanto ela não existir, qualquer pessoa que abrir o cadastro pode escolher essa opção.

**Senha esquecida:** depois de **2 erros** no login, o app oferece "Trocar minha senha" pela pergunta de segurança escolhida no cadastro. A direção também pode gerar uma senha temporária.

## Regras de notas

Por matéria e bimestre: 4 provas valendo até **8,0**, mais projeto (até 1,0), tarefa (até 1,0) e simulado opcional (até +1,0), com teto de 10,0. A média **6,0** no bimestre livra da recuperação, e **24,0** somando os 4 bimestres aprova no ano. Aluno e professor podem lançar; vale a última edição, e cada nota mostra quem lançou. Detalhes e exemplos: [docs/regras-de-notas.md](docs/regras-de-notas.md).

## Matérias e calendário de provas do 9º ano

As provas são às terças e quintas. Os grupos se alternam por 8 semanas seguidas, 4 vezes cada, uma para cada prova (P1 a P4):

| Grupo | Terça | Quinta | Sexta |
|---|---|---|---|
| **1** | Gramática, Literatura, Redação, Educação Física | Física, Química, Artes | — |
| **2** | Álgebra, Geometria, Geografia | Filosofia, Biologia, História | Inglês (níveis 2, 3 e 4) |

Em **Calendário escolar → Calendário de provas**, a coordenação informa a primeira terça de provas do bimestre e qual grupo começa. O app gera todas as provas, e cada data pode ser ajustada depois (feriado, reposição). O dia de prova de cada matéria pode ser alterado em **Turmas e matérias → Matérias**.

## Rodar no computador

Requer **Node.js 22.12 ou superior**.

```powershell
npm install
npm run seed -w server        # dados de demonstração (opcional)
npm run build -w web          # compila o app
npm start                     # http://localhost:3000
```

Para desenvolver com recarga automática, use dois terminais: `npm run dev:server` e `npm run dev:web` (este abre em http://localhost:5173).

### Contas de demonstração (após o `seed`)

A resposta de segurança de todas é `rex`.

| Perfil | Usuário | Senha |
|---|---|---|
| Administrador | `admin` | `admin12345` |
| Coordenação | `coordenacao` | `coord12345` |
| Professora | `professor` | `professor123` |
| Professor | `marcos` | `professor123` |
| Aluno (Inglês 3) | `aluno` | `aluno123` |
| Alunos | `ana` (Inglês 2), `pedro` (Inglês 4), `julia` (Inglês 3) | `aluno123` |

### Sem seed: primeiro acesso

Com o banco vazio, abra **Criar conta → Administrador**. A opção some depois de usada. Em seguida, gere as chaves da coordenação e dos professores em **Chaves de acesso**.

## Publicar de graça (Render + Turso)

1. Crie um banco gratuito no [Turso](https://turso.tech) e anote a URL (`libsql://…`) e um token.
2. Suba este projeto para um repositório no GitHub.
3. No [Render](https://render.com), escolha **New → Blueprint** e selecione o repositório. O arquivo [`render.yaml`](render.yaml) já configura tudo.
4. Preencha `DATABASE_URL` e `DATABASE_AUTH_TOKEN`. O `APP_SECRET` é gerado automaticamente.
5. Abra o site e crie **imediatamente** a conta de Administrador (Criar conta → Administrador).

> O plano gratuito do Render "dorme" após 15 minutos sem uso, e o primeiro acesso depois disso leva de 30 a 60 segundos.

## APK para celular

O APK abre o seu servidor publicado, então publique o servidor antes (seção anterior).

**Pelo GitHub (sem instalar nada):**
1. No repositório, vá em **Settings → Secrets and variables → Actions → Variables** e crie `ESCOLA_SERVER_URL` com o endereço HTTPS do servidor.
2. Vá em **Actions → APK Android → Run workflow**.
3. Quando terminar, baixe o artefato **escola-plus-apk**. Ele contém o `app-debug.apk`.
4. Envie o arquivo para o celular e abra-o. Permita "instalar apps desconhecidos" quando o Android pedir.

Para gerar um APK de release assinado, cadastre também os segredos `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` e `ANDROID_KEY_PASSWORD`. Ao criar uma tag `v1.0.0`, o APK é anexado automaticamente à release.

**No computador (requer o [Android Studio](https://developer.android.com/studio)):**
```powershell
.\scripts\build-apk.ps1 -ServerUrl https://sua-escola.onrender.com
```

**Alternativa sem APK:** no Chrome do celular, abra o site e toque em **⋮ → Instalar app**. O ícone vai para a tela inicial do mesmo jeito.

## Qualidade verificada

| Verificação | Resultado |
|---|---|
| Testes automatizados (regras de notas, segurança e regras do 9º ano) | 43/43 ✓ |
| Latência da API p95 (meta < 200 ms) | 26–54 ms ✓ |
| Carregamento inicial (meta < 150 KB gzip) | 141 KB ✓ |
| Lighthouse celular: desempenho / acessibilidade (metas ≥ 80 / ≥ 90) | 90–94 / 100 ✓ |
| LCP em 4G (meta < 2,5 s) | login 2,4 s ✓ · telas logadas 2,6–3,0 s ✗ (pendente) |
| Varredura de segredos no código | 0 encontrados ✓ |

## Estrutura

```
server/          API Node.js + Express 5 + Drizzle (libSQL/SQLite)
  migrations/    SQL versionado (up/down)
  test/          Vitest + Supertest
web/             App React + Vite + Tailwind (PWA)
  android/       Projeto Android (Capacitor)
docs/            Decisões de arquitetura, banco, segurança, design e regras de notas
scripts/         Geração de ícones (Python) e build local do APK
```

Documentação técnica: [decisões de arquitetura](docs/decisoes-arquitetura.md) · [modelo de ameaças](docs/security/modelo-de-ameacas.md) · [banco de dados](docs/database/) · [design](docs/design/README.md).

# SupportFlow

Sistema full stack de chamados de suporte, organizado como monorepo com React/Vite, Express/TypeScript e PostgreSQL.

## Requisitos

- Node.js 20+
- PostgreSQL 16 acessível pela `DATABASE_URL`
- armazenamento PostgreSQL de testes isolado, via `TEST_DATABASE_URL` ou schema `supportflow_test`

## Configuração

```powershell
Copy-Item .env.example .env
npm install
npm run db:migrate
npm run bootstrap:admin
```

Defina um `JWT_SECRET` aleatório com pelo menos 32 caracteres e credenciais próprias de bootstrap no `.env`. O arquivo `.env` não deve ser versionado.

## Desenvolvimento

```powershell
npm run dev:backend
npm run dev:frontend
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3000/health

## Funcionalidades atuais

- autenticação local JWT Bearer e RBAC;
- administração básica de usuários;
- categorias ativas/inativas;
- abertura, listagem e detalhe de chamados;
- atribuição, prioridade e máquina de estados;
- comentários públicos e internos;
- histórico imutável de eventos;
- políticas SLA por prioridade;
- cálculo de SLA em tempo corrido e estados derivados;
- dashboard operacional com métricas agregadas no PostgreSQL;
- notificações internas (M6);
- diagnóstico técnico por chamado (M7);
- busca no servidor por código, título ou descrição;
- reatribuição de chamado para outro agente ativo;
- hardening do backend: `helmet`, CORS por allowlist e limite de tentativas de login (10 por IP a cada 15 min, aplicado apenas à rota de login);
- interface com navegação por seções, notificações lidas/não lidas e retorno visual de cada ação.

Solicitantes acessam apenas seus próprios chamados e nunca recebem comentários internos nem diagnóstico técnico. Agentes podem assumir chamados para si e atuar no fluxo. Gestores e administradores podem atribuir agentes, alterar prioridade e cancelar chamados.

## SLA e dashboard (M5)

Cada ticket novo resolve sua prioridade, encontra uma política SLA **ativa** e grava um snapshot dos
prazos. Sem uma política para a prioridade, a API responde `409 SLA_POLICY_NOT_CONFIGURED`.

- Tempo corrido: `opened_at + minutos` da política. Como calendário comercial não é implementado nesta
  milestone, a API rejeita `businessHoursOnly=true` e políticas legadas com esse flag não são usadas na
  criação de tickets.
- A primeira resposta vale apenas para o primeiro comentário **público** de `agent`, `manager` ou
  `admin`. Requester, comentário interno, atribuição e mudança de status não contam.
- Resolução usa `resolved_at`. Ao reabrir (`resolved → in_progress`), `resolved_at` é nulo novamente e
  o prazo original é preservado.
- Estados não são persistidos: `pending`, `at_risk`, `met`, `breached`. `at_risk` ocorre quando ainda
  não houve cumprimento e resta no máximo 20% da duração total; `breached` tem precedência.
- Alterar prioridade não recalcula prazos de tickets existentes.
- Não há job automático para criar eventos `sla_breached`.

Políticas:

| Método | Rota                       | Acesso        |
| ------ | -------------------------- | ------------- |
| GET    | `/api/v1/sla-policies`     | autenticado   |
| POST   | `/api/v1/sla-policies`     | manager/admin |
| PATCH  | `/api/v1/sla-policies/:id` | manager/admin |

Dashboard: `GET /api/v1/dashboard/summary`.

- requester recebe `403`;
- agent vê somente tickets atribuídos a ele ou sem responsável;
- manager/admin têm visão global.

As taxas de primeira resposta e resolução são `cumpridos dentro do prazo ÷ tickets concluídos naquela
métrica`. Médias usam apenas tickets com a respectiva conclusão. O frontend oferece dashboard para a
equipe, navegação simples entre Dashboard e Chamados, gestão mínima de políticas para manager/admin e
indicadores textuais de SLA no detalhe do ticket.

## Notificações e diagnóstico técnico (M6/M7)

A M6 adicionou notificações internas autenticadas em `/api/v1/notifications`, sempre escopadas ao usuário
autenticado. A M7 adicionou diagnóstico técnico por chamado em `/api/v1/tickets/:id/technical-diagnostic`,
persistido pela migration `004_ticket_technical_diagnostics.sql` em uma relação 1:1 com `tickets`.

Requester não visualiza nem edita diagnóstico técnico, nem recebe esses dados no detalhe comum do ticket.
Agent acessa tickets sem responsável ou atribuídos a si; manager/admin têm acesso global operacional. Logs,
SQL e mensagens técnicas têm limites e validação contra padrões óbvios de credenciais, mas devem ser
sanitizados antes do envio.

## Validação

**196 testes** em três suítes:

| Suíte             | Testes | O que cobre                                                                                        | Precisa de banco |
| ----------------- | ------ | -------------------------------------------------------------------------------------------------- | ---------------- |
| `packages/shared` | 20     | contrato das listas compartilhadas (papéis, estados, prioridades, SLA, notificações, métodos HTTP) | não              |
| `apps/backend`    | 131    | integração completa: auth, RBAC, tickets, SLA, dashboard, notificações, diagnóstico e segurança    | **sim**          |
| `apps/frontend`   | 45     | camada de API, contexto de autenticação, toasts, listagem, detalhe e painel de notificações        | não              |

A suíte de segurança do backend cobre helmet, CORS (origem permitida, origem bloqueada e preflight) e o
limite de tentativas de login com o middleware ativo — inclusive o **escopo** da proteção, que se aplica
apenas a `POST /auth/login` (10 tentativas por IP a cada 15 minutos); `/auth/me` e `/auth/logout` exigem
token e não consomem a cota. O fluxo completo com navegador real, banco PostgreSQL local e os quatro
perfis está registrado em `review/e2e-v2/` (capturas de tela, evidências de CORS, de rate limiting e de
403 por perfil, além da auditoria de acessibilidade).

Os testes de integração nunca escrevem nas tabelas de desenvolvimento: usam `TEST_DATABASE_URL`
quando definida ou o schema isolado `supportflow_test`. O banco/schema de teste deve existir e receber
as migrations antes da suíte.

```powershell
npm run db:migrate
npm run build
npm run typecheck
npm run lint
npm run format:check
npm run test
npm audit --omit=dev
```

`npm run test` roda as três suítes. Para rodar uma só:

```powershell
npm run test:backend
npm run test:frontend
```

O **CI** (`npm run validate`) roda tudo a cada push: formatação, lint, tipos, build e as
três suítes, com um PostgreSQL 16 de serviço.

### O que o frontend cobre hoje

- a camada de API monta a URL, envia o token, trata `204` e erros sem JSON;
- um `401` em rota autenticada **encerra a sessão e avisa** — antes, a tela ficava
  travada com "não foi possível carregar", sem explicar que o token tinha expirado;
- o login falha de forma previsível, com a mensagem do servidor;
- o formulário se desabilita durante o envio;
- o aviso de sessão expirada aparece na tela de login;
- cada ação concluída devolve um aviso único (toast) — sem duplicar o mesmo
  "chamado criado" em duas camadas;
- erros de API são traduzidos pelo código estável do servidor (`FORBIDDEN`,
  `RATE_LIMITED`, `NOT_FOUND`), com o texto em português;
- listagem e detalhe têm estados reais de carregamento, vazio, erro e **"Tentar
  novamente"**;
- o token vive apenas na memória: recarregar a página encerra a sessão em vez de
  deixar um token de longa duração persistido no navegador;
- a interface é responsiva de 320px ao desktop, com navegação lateral, ordem de
  foco previsível e um único `<h1>` por tela.

Consulte [docs/API.md](docs/API.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) e
[docs/DATABASE.md](docs/DATABASE.md) para contratos, arquitetura e modelo de dados.

## Demonstração do fluxo

O script `demo:fluxo` exercita o caminho completo e verifica também os casos de
rejeição. Ele roda com **dois papéis**, porque as permissões são o heart do
sistema:

- **solicitante** — abre chamado, vê só os próprios, e **não** acessa o
  diagnóstico técnico, o dashboard global nem a lista de usuários;
- **administrador** — acessa os três.

```powershell
$env:DEMO_URL = 'http://127.0.0.1:3000'
$env:DEMO_EMAIL = 'requester@exemplo.invalid'
$env:DEMO_PASSWORD = 'demo-ficticia-123456'
$env:DEMO_ADMIN_EMAIL = 'demo-admin@exemplo.invalid'
$env:DEMO_ADMIN_PASSWORD = 'demo-ficticia-123456'
npm run demo:fluxo
```

A saída é um relatório de verificações e o código de saída é diferente de zero se
alguma falhar. O script não imprime tokens nem dados pessoais.

### Dados de demonstração

`npm run seed:demo` popula o sistema com **dados totalmente fictícios**: e-mails no
domínio `.invalid`, nomes com o prefixo "Demo Ficticia", mensagens inventadas, e as
quatro contas do sistema (solicitante, agente, gestor e administrador).

```powershell
$env:ALLOW_SEED_FICTITIO = 'sim'
npm run seed:demo
```

Se `DEMO_ADMIN_EMAIL` e `DEMO_ADMIN_PASSWORD` não estiverem definidos, o seed cria
uma **conta de demonstração própria**, com e-mail exclusivo (`demo-admin@exemplo.invalid`),
direto no banco — **sem alterar nenhuma conta existente**. Ele é repetível: ao rodar
de novo, desativa apenas os registros de demonstração anteriores.

Detalhes do roteiro, incluindo os cuidados para expor a demonstração publicamente,
em [docs/DEMONSTRACAO.md](docs/DEMONSTRACAO.md).

## Nota sobre finais de linha

O repositório traz `.gitattributes` com `* text=auto eol=lf`. Sem ele, um clone no
Windows (com `core.autocrlf=true`) converte os arquivos para CRLF e o
`npm run format:check` falha em cerca de 110 arquivos, mesmo com o código correto.

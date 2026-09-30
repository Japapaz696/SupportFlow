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
- diagnóstico técnico por chamado (M7).

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

Consulte [docs/API.md](docs/API.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) e
[docs/DATABASE.md](docs/DATABASE.md) para contratos, arquitetura e modelo de dados.

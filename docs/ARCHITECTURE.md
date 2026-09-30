# Arquitetura — SupportFlow

## Visão geral

```text
React/Vite (apps/frontend) → REST API Express (apps/backend) → PostgreSQL
                                  ↓
                         autenticação, RBAC e regras
```

O monorepo usa `packages/shared` para tipos e contratos TypeScript sem dependência de Express, PostgreSQL ou React.

## Backend

Fluxo padrão:

```text
route → controller → validation/service → repository → PostgreSQL
```

- Controllers traduzem HTTP.
- Validação usa allowlist de campos e rejeita mass assignment.
- Services aplicam autorização contextual, transições e transações.
- Repositories usam SQL parametrizado.
- Erros seguem `{ "error": { "code", "message", "details?" } }`.

Mutações compostas usam uma conexão PostgreSQL única com `BEGIN/COMMIT/ROLLBACK`. Ticket é bloqueado com
`SELECT ... FOR UPDATE` antes de atribuição, status, prioridade ou comentário. Categoria ativa e política
SLA são lidas com `FOR SHARE` durante a criação para impedir alteração concorrente após a validação.

## SLA

A criação de um ticket resolve a prioridade enviada ou a prioridade padrão da categoria. Dentro da mesma
transação, consulta a política ativa correspondente e calcula os deadlines em tempo corrido:

```text
sla_first_response_due_at = opened_at + first_response_minutes
sla_resolution_due_at    = opened_at + resolution_minutes
```

Os deadlines são snapshot: alterar a prioridade depois não os recalcula. Como não há calendário
comercial nesta milestone, a API rejeita `business_hours_only=true` e policies legadas com esse flag não
são selecionadas para criação.

First response é iniciado somente pelo primeiro comentário público de `agent`, `manager` ou `admin`.
`requester`, comentário interno, atribuição e status não contam. Resolution usa `resolved_at`; reabertura
para `in_progress` zera `resolved_at` sem remover o deadline original.

`pending`, `at_risk`, `met` e `breached` são derivados na leitura. `at_risk` usa o limite de 20% da
duração original. `breached` tem precedência. O contrato compartilhado inclui `sla_breached` para alinhar
o CHECK de `ticket_events`, mas não há job/evento automático nesta milestone.

A lógica fica centralizada em `apps/backend/src/domain/clock.ts` (relógio substituível) e
`apps/backend/src/domain/sla.ts` (deadline e avaliação). Isso torna os testes determinísticos.

## Políticas e dashboard

Rotas SLA seguem `route → controller → validation → service → repository`; GET é autenticado, POST/PATCH
são manager/admin. A listagem retorna políticas ativas e inativas para permitir reativação.

O dashboard executa `COUNT`, `FILTER`, `GROUP BY` e `AVG` no PostgreSQL. Requester recebe 403; agent é
limitado a tickets atribuídos a ele ou sem responsável; manager/admin têm visão global. A lista de atenção
considera no máximo 20 tickets operacionais sem responsável, vencidos, em risco ou críticos, com ordem
determinística. Cancelados ficam fora das métricas ativas e da lista de atenção.

## Autenticação e papéis

JWT Bearer HS256 com expiração. Role e ativação são recarregados do banco em cada requisição. Senhas usam bcrypt custo 12.

- `requester`: cria e acessa somente seus chamados; comentário público.
- `agent`: acessa fila operacional, assume para si, altera status e comenta interna/publicamente.
- `manager`: atribui agentes, altera prioridade/status, comenta, administra SLA e acessa histórico completo.
- `admin`: mesmas ações operacionais de manager, administra SLA e usuários.

Autorização puramente global usa middleware; regras dependentes do recurso ficam no service.

## Tickets e auditoria

- Códigos `SF-NNNNNN` são gerados por sequence PostgreSQL.
- Requester/author/actor vêm sempre do usuário autenticado.
- Eventos são inseridos automaticamente na mesma transação da ação correspondente.
- `ticket_events` é imutável por trigger e não possui endpoint de escrita.
- Comentários internos são filtrados no SQL para requesters, assim como seus eventos associados.

## Frontend

O frontend mantém JWT somente em memória. A UI implementa login, navegação simples entre Dashboard e
Chamados para a equipe, abertura, lista, detalhe, comentários, ações operacionais, notificações internas,
gestão mínima de políticas SLA para manager/admin e painel de diagnóstico técnico para equipe. O detalhe
mostra deadlines e status textual de first response/resolution. O diagnóstico é carregado por endpoint
protegido separado e não faz parte do payload comum do ticket. Condições visuais são conveniência; o backend
continua sendo a autoridade.

## Testes e isolamento

Os testes usam `TEST_DATABASE_URL` ou derivam a URL com `search_path=supportflow_test` quando somente
`DATABASE_URL` existe. O guard de configuração rejeita testes apontados para `public`. A suíte backend é
executada com um worker e sem paralelismo entre arquivos para impedir colisão entre fixtures de políticas.

## Milestones

- M1 — arquitetura e scaffold: concluída.
- M2 — PostgreSQL e migrations: concluída.
- M3 — identidade, autenticação e usuários: concluída.
- M4 — categorias, tickets, comentários e fluxo de atendimento: concluída.
- M6 — notificações internas: concluída (migration 003, endpoints, RBAC e tipos compartilhados).
- M7 — diagnóstico técnico: concluída (migration 004, endpoint separado, RBAC, painel interno).

Não há calendário comercial, persistência de estados derivados, cron de `sla_breached`, e-mail,
WhatsApp, anexos, OAuth, refresh tokens, WebSocket, IA, billing, multi-tenant ou M8.

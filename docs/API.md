# API — SupportFlow

Base: `/api/v1`. JSON em todas as requisições/respostas. Rotas protegidas usam `Authorization: Bearer <token>`. IDs são UUIDs. Erros seguem `{ "error": { "code", "message", "details?" } }`.

## Autenticação

| Método | Rota           | Acesso      |
| ------ | -------------- | ----------- |
| POST   | `/auth/login`  | público     |
| POST   | `/auth/logout` | autenticado |
| GET    | `/auth/me`     | autenticado |

## Usuários

| Método | Rota                        | Acesso |
| ------ | --------------------------- | ------ |
| GET    | `/users?page=1&pageSize=20` | admin  |
| GET    | `/users/:id`                | admin  |
| POST   | `/users`                    | admin  |
| PATCH  | `/users/:id`                | admin  |

## Categorias

| Método | Rota              | Acesso                      |
| ------ | ----------------- | --------------------------- |
| GET    | `/categories`     | autenticado; somente ativas |
| POST   | `/categories`     | manager/admin               |
| PATCH  | `/categories/:id` | manager/admin               |

Criação aceita `name`, `description?` e `defaultPriority?`. Atualização aceita esses campos e `isActive`. Tickets novos só podem usar categoria ativa.

## Tickets

| Método | Rota                                | Acesso/finalidade                                           |
| ------ | ----------------------------------- | ----------------------------------------------------------- |
| GET    | `/tickets`                          | lista paginada e filtrada                                   |
| POST   | `/tickets`                          | cria chamado para o usuário autenticado                     |
| GET    | `/tickets/:id`                      | detalhe, comentários, histórico e SLA                       |
| PATCH  | `/tickets/:id/assignee`             | atribuição/claim                                            |
| PATCH  | `/tickets/:id/status`               | transição de estado da equipe                               |
| PATCH  | `/tickets/:id/priority`             | manager/admin; não recalcula o SLA                          |
| POST   | `/tickets/:id/comments`             | comentário público/interno autorizado                       |
| GET    | `/tickets/:id/technical-diagnostic` | agent responsável, manager/admin; diagnóstico interno       |
| PUT    | `/tickets/:id/technical-diagnostic` | agent responsável, manager/admin; cria/atualiza diagnóstico |

O diagnóstico técnico é uma entidade 1:1 persistida em `ticket_technical_diagnostics` pela migration 004.
Ele contém ambiente, sistema afetado, endpoint/método/status HTTP, resumo do erro, logs, evidências SQL,
status do serviço, notas e auditoria de criação/última atualização. Requester recebe `404` no endpoint e
nunca recebe esses dados no `GET /tickets/:id`. Agent pode acessar tickets sem responsável ou atribuídos a si;
um ticket atribuído a outro agent responde `403`. Manager e admin têm acesso global, e tickets fechados/cancelados
são somente leitura. Logs e SQL devem ser sanitizados: não envie senhas, tokens, headers Authorization,
cookies, chaves de API, secrets ou strings de conexão.

### Criação

```json
{
  "title": "Erro ao emitir relatório",
  "description": "A exportação não conclui.",
  "categoryId": "uuid",
  "priority": "high"
}
```

`requesterId`, `assigneeId`, status inicial, `code`, `openedAt`, `firstResponseAt`, `resolvedAt`,
`closedAt`, `slaFirstResponseDueAt` e `slaResolutionDueAt` não são aceitos. A prioridade omitida usa
`categories.default_priority`. O backend usa o usuário autenticado, lê uma política SLA ativa da
prioridade e calcula `opened_at + minutos` para os dois deadlines. Sem política ativa, responde
`409 SLA_POLICY_NOT_CONFIGURED`.

A resposta de detalhe inclui:

```json
{
  "sla": {
    "firstResponse": {
      "dueAt": "2026-01-15T13:00:00.000Z",
      "completedAt": null,
      "status": "pending",
      "remainingMinutes": 60
    },
    "resolution": {
      "dueAt": "2026-01-15T17:00:00.000Z",
      "completedAt": null,
      "status": "pending",
      "remainingMinutes": 300
    }
  }
}
```

Estados derivados são `pending`, `at_risk`, `met` e `breached`. `at_risk` significa que o prazo não
foi cumprido e restam no máximo 20% da duração original; `breached` tem precedência. Nenhum estado é
persistido. First response é somente o primeiro comentário público da equipe. Resolution usa
`resolved_at`; reabertura zera esse campo e preserva o deadline original.

### Listagem

Filtros permitidos: `status`, `priority`, `categoryId`, `assigneeId`, `page`, `pageSize`. Padrão 20,
máximo 100. Requester recebe somente os próprios chamados; equipe recebe a fila completa.

### Atribuição

```json
{ "assigneeId": "uuid-do-agente" }
```

Agent só pode assumir ticket ainda não atribuído ou já atribuído a si; não pode sobrescrever outro agente. Manager/admin podem atribuir, reatribuir ou remover (`null`) um responsável.

### Estados

Estados do banco: `open`, `in_progress`, `waiting_requester`, `resolved`, `closed`, `cancelled`.

Transições: `open → in_progress`; `in_progress → waiting_requester | resolved`; `waiting_requester → in_progress`; `resolved → in_progress | closed`; estados não terminais podem ir para `cancelled` somente por manager/admin; `closed` e `cancelled` são terminais.

### Comentários

```json
{ "body": "Texto", "visibility": "public" }
```

Requester pode comentar publicamente no próprio ticket. Equipe pode usar `public` ou `internal`. `authorId` sempre vem da autenticação. Comentários internos e seus eventos não são retornados ao requester.

## Políticas SLA

| Método | Rota                | Acesso                                         |
| ------ | ------------------- | ---------------------------------------------- |
| GET    | `/sla-policies`     | autenticado; lista políticas ativas e inativas |
| POST   | `/sla-policies`     | manager/admin                                  |
| PATCH  | `/sla-policies/:id` | manager/admin                                  |

Criação aceita `priority`, `firstResponseMinutes`, `resolutionMinutes`, `businessHoursOnly?` e
`isActive?`. Minutos devem ser inteiros positivos, limitados a 5.256.000 (dez anos); campos extras,
prioridade inválida, UUID inválido e duplicidade são rejeitados. A prioridade é única no banco.
Atualização não aceita alterar `priority`. Como o calendário comercial está fora desta milestone,
`businessHoursOnly=true` é rejeitado e uma política legada marcada assim não pode ser ativada nem usada
para criar tickets; ela pode ser normalizada com `businessHoursOnly=false`.

## Dashboard

`GET /dashboard/summary`.

- requester: `403 FORBIDDEN`;
- agent: somente tickets atribuídos a ele ou sem responsável;
- manager/admin: visão global.

O resumo contém contagens por estado, sem responsável, por prioridade, por categoria, first response e
resolution `breached`/`at_risk`, taxas de cumprimento, médias em minutos e lista de atenção. As
agregações são executadas no PostgreSQL.

Denominadores:

- taxa de first response = first response cumprida dentro do prazo / tickets com `first_response_at`;
- taxa de resolution = resolution cumprida dentro do prazo / tickets com `resolved_at`;
- média de first response = média de minutos entre `opened_at` e `first_response_at` quando existe;
- média de resolution = média de minutos entre `opened_at` e `resolved_at` quando existe.

A lista de atenção inclui no máximo 20 tickets operacionais (`open`, `in_progress` ou
`waiting_requester`) sem responsável, vencidos, em risco ou críticos, ordenados por atualização e UUID.
Tickets `cancelled` continuam nos breakdowns por prioridade/categoria e não entram nas métricas ativas de
risco/vencimento nem na lista de atenção. Os cards de estado os omitem deliberadamente. Não há
persistência de estado derivado nem criação automática do evento `sla_breached` nesta milestone.

## Segurança e limites

- Requester recebe `404` para ticket alheio, evitando enumeração.
- Payloads com campos desconhecidos são rejeitados (mass assignment).
- SQL usa parâmetros.
- Criação lê a política com `FOR SHARE`; mutações de ticket bloqueiam a linha com `FOR UPDATE` e
  persistem ticket/evento na mesma transação.
- `ticket_events` não possui endpoint de criação/edição e permanece imutável no PostgreSQL.
- `password_hash`, secrets, SQL e stack traces não são expostos.
- `business_hours_only=true` não é operacional sem calendário comercial.
- Notificações internas da M6 estão disponíveis em `/notifications`; o diagnóstico técnico da M7 usa endpoints próprios e não aparece no detalhe comum do ticket.
- Não há cron/e-mail/WhatsApp/WebSocket/IA/billing/multi-tenant.

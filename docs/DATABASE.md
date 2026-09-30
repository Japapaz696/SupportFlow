# Banco de dados — SupportFlow

## Convenções

PostgreSQL, chaves UUID, `created_at`/`updated_at` em UTC e `snake_case`. Valores controlados usam `CHECK`.

## Entidades

### `users`

`id`, `name`, `email` (único), `password_hash`, `role`, `is_active`, `created_at`, `updated_at`.

Papéis: `requester`, `agent`, `manager`, `admin`.

### `categories`

`id`, `name` (único), `description`, `is_active`, `default_priority`, `created_at`, `updated_at`.

### `tickets`

`id`, `code` (único e legível, ex.: `SF-000123`), `title`, `description`, `status`, `priority`,
`category_id`, `requester_id`, `assignee_id` (nulo), `opened_at`, `first_response_at` (nulo),
`resolved_at` (nulo), `closed_at` (nulo), `sla_first_response_due_at` (nulo),
`sla_resolution_due_at` (nulo), `created_at`, `updated_at`.

A migration 002 criou `tickets_code_seq`; `tickets.code` usa `SF-` mais seis dígitos gerados pelo
PostgreSQL. A mesma migration tornou os deadlines nullable para compatibilidade com M4; M5 preenche os
prazos de novos tickets quando existe política ativa.

### `ticket_comments`

`id`, `ticket_id`, `author_id`, `body`, `visibility` (`public` ou `internal`), `created_at`, `updated_at`.

### `ticket_events`

Registro imutável: `id`, `ticket_id`, `actor_id` (nulo para eventos de sistema), `type`, `from_value`
(JSONB nulo), `to_value` (JSONB nulo), `created_at`.

Tipos mínimos: `created`, `assigned`, `status_changed`, `priority_changed`, `commented`, `sla_breached`,
`resolved`, `closed`, `reopened`. M5 inclui `sla_breached` no contrato TypeScript para alinhar ao CHECK,
mas não insere esse evento automaticamente.

### `sla_policies`

`id`, `priority` (única), `first_response_minutes` (positivo), `resolution_minutes` (positivo),
`business_hours_only`, `is_active`, `created_at`, `updated_at`.

A política é consultada no momento de criação do ticket. A relação com tickets é lógica: os minutos são
materializados nos deadlines do ticket; não existe FK por política e alterações posteriores não afetam
snapshots existentes.

## Relacionamentos

```text
users (requester) 1 ── N tickets
users (assignee)  0 ── N tickets
categories        1 ── N tickets
tickets           1 ── N ticket_comments
users             1 ── N ticket_comments
tickets           1 ── N ticket_events
users             0 ── N ticket_events
sla_policies      1 ── N tickets (snapshot lógico por prioridade)
```

## Índices mínimos

- `users(email)` único;
- `tickets(code)` único;
- `tickets(status, priority, created_at DESC)`;
- `tickets(requester_id, created_at DESC)`;
- `tickets(assignee_id, status, updated_at DESC)`;
- `ticket_comments(ticket_id, created_at)`;
- `ticket_events(ticket_id, created_at)`.

Não foi adicionado índice novo na M5; os índices existentes são suficientes para o volume atual.

## Modelo de SLA

Tempo corrido:

```text
first_response_due = opened_at + first_response_minutes * 1 minuto
resolution_due     = opened_at + resolution_minutes * 1 minuto
```

`business_hours_only` não implementa calendário comercial nesta milestone. A API rejeita o valor `true`
e policies legadas marcadas assim são ignoradas na criação, que responde
`409 SLA_POLICY_NOT_CONFIGURED`. Durações aceitas pela API vão de 1 a 5.256.000 minutos.

First response é somente o primeiro comentário público da equipe. `first_response_at` usa `COALESCE` e
não é sobrescrito. Resolution usa `resolved_at`; reabertura para `in_progress` zera o timestamp,
mas preserva o deadline original.

Estados derivados (não armazenados):

- `pending`: ainda não vencido e fora da janela de risco;
- `at_risk`: ainda não cumprido, prazo restante `<= 20% * (due_at - opened_at)`;
- `met`: concluído até o deadline;
- `breached`: deadline ultrapassado ou concluído depois dele.

`breached` tem precedência sobre `at_risk`. Taxa de first response é cumpridos no prazo / tickets com
`first_response_at`; taxa de resolution é cumpridos no prazo / tickets com `resolved_at`. Médias usam
somente timestamps existentes.

## Teste isolado

Em testes, `TEST_DATABASE_URL` tem precedência; se ausente, o backend deriva a URL de `DATABASE_URL`
com `search_path=supportflow_test`. A configuração rejeita armazenamento em `public` durante Vitest.
As migrations devem ser aplicadas ao schema isolado antes da suíte. A base real de desenvolvimento e o
administrador real não são usados como fixtures.

## Migrations

- `001_initial_schema.sql`: tabelas, constraints, triggers e índices iniciais.
- `002_prepare_tickets_for_m4.sql`: prazos SLA nullable, sequence/código dos tickets.

Nenhuma migration 003 foi necessária para M5.

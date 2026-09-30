# SupportFlow — Contexto para agentes

## Estado atual

M7 — diagnóstico técnico implementada sobre PostgreSQL 16 real. M1–M6 permanecem concluídas.
M6 adicionou notificações internas na migration 003; M7 adicionou diagnóstico técnico na migration 004.
Não iniciar M8 neste contexto.

## Arquitetura

- Monorepo: `apps/frontend`, `apps/backend`, `packages/shared`.
- Frontend: React + Vite + TypeScript.
- API: Express + TypeScript, REST em `/api/v1`.
- Banco: PostgreSQL via `pg`, migrations SQL transacionais/versionadas.
- Backend: route → controller → service → repository.
- JWT Bearer HS256, token somente em memória no frontend, bcrypt custo 12.

## M5 entregue

- Migrations `001_initial_schema.sql` e `002_prepare_tickets_for_m4.sql` permanecem inalteradas;
  não criar migration `003` sem autorização.
- `sla_policies` é usada por prioridade. Ticket novo resolve prioridade, bloqueia/leia política ativa
  com `FOR SHARE`, calcula e persiste os dois deadlines na mesma transação do ticket/evento.
- Sem política ativa: `409 SLA_POLICY_NOT_CONFIGURED`.
- Tempo corrido: `opened_at + minutos`; `business_hours_only=true` é rejeitado pela API e uma policy
  legada com esse flag não é operacional enquanto não existir calendário comercial.
- First response: primeiro comentário público de `agent`/`manager`/`admin`; requester, internal,
  atribuição e status não contam; respostas posteriores não sobrescrevem.
- Resolution usa `resolved_at`; reabrir para `in_progress` zera `resolved_at`, sem alterar deadline.
- SLA snapshot: mudança de prioridade não recalcula deadlines.
- Estados derivados no detalhe: `pending`, `at_risk`, `met`, `breached`; não persistidos.
  `at_risk` quando resta <= 20%, e `breached` tem precedência.
- `sla_breached` consta no contrato TypeScript para alinhar ao CHECK PostgreSQL; não há cron nem evento
  automático nesta milestone.
- Rotas SLA: GET autenticado; POST/PATCH somente manager/admin. Lista inclui ativas e inativas para
  que a administração possa reativá-las.
- Dashboard: requester recebe 403; agent vê `assignee_id = actor.id OR assignee_id IS NULL`; manager/admin
  veem global. Agregações SQL (`COUNT`/`FILTER`/`GROUP BY`/`AVG`) no backend.
- Frontend: Dashboard para equipe, navegação Dashboard/Chamados e Políticas SLA (manager/admin), painel
  textual de first response/resolution e diagnóstico técnico interno no detalhe.
- Notificações M6: endpoints autenticados com escopo por `request.user.id`; migration `003_notifications.sql`.
- Diagnóstico M7: `GET/PUT /tickets/:id/technical-diagnostic`; requester bloqueado no backend; agent só acessa
  ticket sem responsável ou atribuído a si; manager/admin têm acesso global; migration `004_ticket_technical_diagnostics.sql`.
  Logs, SQL e mensagens técnicas têm limites e rejeitam padrões de senhas, tokens, cookies, Authorization, API keys,
  secrets e strings de conexão, mas operadores ainda devem sanitizar as evidências antes do envio.
- Testes: `m5.integration.test.ts` e `m7.integration.test.ts`; clock injetável via `domain/clock.ts`. Suíte usa ambiente isolado
  `TEST_DATABASE_URL` ou schema `supportflow_test`, nunca `public`. Backend executa testes serialmente
  para impedir competição sobre a chave única de `sla_policies.priority`.

## Regras de acesso

- `requester`: cria ticket, lista/abre somente os próprios, comentário público; dashboard global = 403.
- `agent`: fila operacional, assume ticket para si, muda status, comentário público/interno; dashboard
  limitado ao atribuído a si ou sem responsável; não administra SLA.
- `manager`: ações de agent, atribuição/reatribuição, prioridade, cancelamento e políticas SLA;
  dashboard global.
- `admin`: ações operacionais de manager, políticas SLA e administração de usuários.
- Requester recebe `404` para ticket alheio.

## Decisões importantes

- Nunca aceitar `requester_id`, `author_id`, `actor_id`, `code`, status inicial, `opened_at`,
  `first_response_at`, `resolved_at`, `closed_at` ou deadlines SLA do cliente.
- Payloads rejeitam campos desconhecidos.
- Comentário interno é filtrado no SQL para requester; evento `commented` não copia o corpo.
- Ticket + evento usam a mesma transação PostgreSQL.
- `ticket_events` não possui endpoint público de escrita.
- Taxa de SLA: cumpridos dentro do prazo / tickets concluídos naquela métrica. Médias: somente tickets
  concluídos na métrica.

## Fora do escopo atual

Sem horário comercial, cron de SLA, e-mail, WhatsApp, WebSocket, IA, automações, anexos, OAuth,
refresh tokens, billing, multi-tenant e M8.

# Migrations

As migrations PostgreSQL são arquivos SQL numerados e executados em ordem pelo script `db:migrate`.

- `001_initial_schema.sql`: schema inicial — usuários, categorias, tickets, comentários, eventos e `sla_policies`.
- `002_prepare_tickets_for_m4.sql`: torna os deadlines SLA nullable durante M4 e cria a sequence PostgreSQL para códigos `SF-NNNNNN`.
- `schema_migrations`: tabela de controle criada automaticamente pelo executor.

M5 não exigiu alteração de schema e não criou migration 003. Ela utiliza a tabela `sla_policies` e os
campos de `tickets` já existentes. Cada migration pendente é executada em uma transação e registrada
somente após sucesso.

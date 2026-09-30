LOCK TABLE tickets IN ACCESS EXCLUSIVE MODE;

ALTER TABLE tickets
  ALTER COLUMN sla_first_response_due_at DROP NOT NULL,
  ALTER COLUMN sla_resolution_due_at DROP NOT NULL;

CREATE SEQUENCE tickets_code_seq;

SELECT setval(
  'tickets_code_seq',
  COALESCE(MAX((substring(code FROM '^SF-([0-9]{6})$'))::BIGINT), 1),
  COUNT(*) > 0
)
FROM tickets
WHERE code ~ '^SF-[0-9]{6}$';

ALTER TABLE tickets
  ALTER COLUMN code SET DEFAULT (
    'SF-' || LPAD(nextval('tickets_code_seq'::REGCLASS)::TEXT, 6, '0')
  );

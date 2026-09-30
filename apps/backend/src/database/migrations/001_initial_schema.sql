CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  email TEXT NOT NULL UNIQUE CHECK (btrim(email) <> ''),
  password_hash TEXT NOT NULL CHECK (btrim(password_hash) <> ''),
  role TEXT NOT NULL CHECK (role IN ('requester', 'agent', 'manager', 'admin')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (btrim(name) <> ''),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  default_priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (default_priority IN ('critical', 'high', 'medium', 'low')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (btrim(code) <> ''),
  title TEXT NOT NULL CHECK (btrim(title) <> ''),
  description TEXT NOT NULL CHECK (btrim(description) <> ''),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'waiting_requester', 'resolved', 'closed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  category_id UUID NOT NULL,
  requester_id UUID NOT NULL,
  assignee_id UUID,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  sla_first_response_due_at TIMESTAMPTZ NOT NULL,
  sla_resolution_due_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT tickets_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES categories (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tickets_requester_id_fkey
    FOREIGN KEY (requester_id) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tickets_assignee_id_fkey
    FOREIGN KEY (assignee_id) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT tickets_first_response_after_opened_check
    CHECK (first_response_at IS NULL OR first_response_at >= opened_at),
  CONSTRAINT tickets_resolved_after_opened_check
    CHECK (resolved_at IS NULL OR resolved_at >= opened_at),
  CONSTRAINT tickets_closed_after_resolved_check
    CHECK (closed_at IS NULL OR (resolved_at IS NOT NULL AND closed_at >= resolved_at)),
  CONSTRAINT tickets_sla_first_response_due_after_opened_check
    CHECK (sla_first_response_due_at >= opened_at),
  CONSTRAINT tickets_sla_resolution_due_after_opened_check
    CHECK (sla_resolution_due_at >= opened_at)
);

CREATE TABLE ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL,
  author_id UUID NOT NULL,
  body TEXT NOT NULL CHECK (btrim(body) <> ''),
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'internal')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ticket_comments_ticket_id_fkey
    FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT ticket_comments_author_id_fkey
    FOREIGN KEY (author_id) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE ticket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL,
  actor_id UUID,
  type TEXT NOT NULL
    CHECK (
      type IN (
        'created',
        'assigned',
        'status_changed',
        'priority_changed',
        'commented',
        'sla_breached',
        'resolved',
        'closed',
        'reopened'
      )
    ),
  from_value JSONB,
  to_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ticket_events_ticket_id_fkey
    FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT ticket_events_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES users (id) ON UPDATE RESTRICT ON DELETE SET NULL
);

CREATE TABLE sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  priority TEXT NOT NULL UNIQUE
    CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  first_response_minutes INTEGER NOT NULL CHECK (first_response_minutes > 0),
  resolution_minutes INTEGER NOT NULL CHECK (resolution_minutes > 0),
  business_hours_only BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tickets_status_priority_created_at
  ON tickets (status, priority, created_at DESC);

CREATE INDEX idx_tickets_requester_id_created_at
  ON tickets (requester_id, created_at DESC);

CREATE INDEX idx_tickets_assignee_id_status_updated_at
  ON tickets (assignee_id, status, updated_at DESC);

CREATE INDEX idx_ticket_comments_ticket_id_created_at
  ON ticket_comments (ticket_id, created_at);

CREATE INDEX idx_ticket_events_ticket_id_created_at
  ON ticket_events (ticket_id, created_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER categories_set_updated_at
BEFORE UPDATE ON categories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER sla_policies_set_updated_at
BEFORE UPDATE ON sla_policies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER tickets_set_updated_at
BEFORE UPDATE ON tickets
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER ticket_comments_set_updated_at
BEFORE UPDATE ON ticket_comments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION prevent_ticket_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ticket_events rows are immutable';
END;
$$;

CREATE TRIGGER ticket_events_prevent_mutation
BEFORE UPDATE OR DELETE ON ticket_events
FOR EACH ROW EXECUTE FUNCTION prevent_ticket_event_mutation();
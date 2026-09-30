CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (
    type IN ('ticket_assigned', 'ticket_reassigned', 'ticket_status_changed', 'ticket_priority_changed',
             'ticket_comment_public', 'ticket_comment_internal', 'ticket_resolved', 'ticket_reopened',
             'ticket_closed', 'ticket_sla_breached')
  ),
  ticket_id UUID NULL REFERENCES tickets(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (trim(title) <> ''),
  message TEXT NOT NULL CHECK (trim(message) <> ''),
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;
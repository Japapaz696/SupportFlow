CREATE TABLE ticket_technical_diagnostics (
  ticket_id UUID PRIMARY KEY,
  environment TEXT,
  affected_system TEXT,
  api_endpoint TEXT,
  api_method TEXT,
  http_status_code INTEGER,
  error_summary TEXT,
  logs TEXT,
  sql_evidence TEXT,
  service_status TEXT,
  notes TEXT,
  created_by UUID NOT NULL,
  updated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT ticket_technical_diagnostics_ticket_id_fkey
    FOREIGN KEY (ticket_id)
    REFERENCES tickets (id)
    ON UPDATE RESTRICT
    ON DELETE CASCADE,

  CONSTRAINT ticket_technical_diagnostics_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES users (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,

  CONSTRAINT ticket_technical_diagnostics_updated_by_fkey
    FOREIGN KEY (updated_by)
    REFERENCES users (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,

  CONSTRAINT ticket_technical_diagnostics_api_method_check
    CHECK (
      api_method IS NULL OR
      api_method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD')
    ),

  CONSTRAINT ticket_technical_diagnostics_http_status_code_check
    CHECK (
      http_status_code IS NULL OR
      (http_status_code >= 100 AND http_status_code <= 599)
    )
);

CREATE INDEX idx_ticket_technical_diagnostics_updated_at
  ON ticket_technical_diagnostics (updated_at DESC);

CREATE TRIGGER ticket_technical_diagnostics_set_updated_at
BEFORE UPDATE ON ticket_technical_diagnostics
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
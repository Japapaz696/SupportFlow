import type { HttpMethod, TicketTechnicalDiagnostic } from '@supportflow/shared';

export type TicketTechnicalDiagnosticRow = {
  ticket_id: string;
  environment: string | null;
  affected_system: string | null;
  api_endpoint: string | null;
  api_method: HttpMethod | null;
  http_status_code: number | null;
  error_summary: string | null;
  logs: string | null;
  sql_evidence: string | null;
  service_status: string | null;
  notes: string | null;
  created_by: string;
  created_by_name: string;
  updated_by: string;
  updated_by_name: string;
  created_at: Date;
  updated_at: Date;
};

export function toTicketTechnicalDiagnostic(
  row: TicketTechnicalDiagnosticRow,
): TicketTechnicalDiagnostic {
  return {
    ticketId: row.ticket_id,
    environment: row.environment,
    affectedSystem: row.affected_system,
    apiEndpoint: row.api_endpoint,
    apiMethod: row.api_method,
    httpStatusCode: row.http_status_code,
    errorSummary: row.error_summary,
    logs: row.logs,
    sqlEvidence: row.sql_evidence,
    serviceStatus: row.service_status,
    notes: row.notes,
    createdBy: { id: row.created_by, name: row.created_by_name },
    updatedBy: { id: row.updated_by, name: row.updated_by_name },
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

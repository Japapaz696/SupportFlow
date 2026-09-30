import type { TicketTechnicalDiagnosticUpsert } from '@supportflow/shared';
import type { PoolClient } from 'pg';

import { pool } from '../database/pool.js';
import type { TicketTechnicalDiagnosticRow } from '../domain/ticket-technical-diagnostics.js';

type QueryExecutor = Pick<typeof pool, 'query'> | PoolClient;

const diagnosticSelect = `
  d.ticket_id,
  d.environment,
  d.affected_system,
  d.api_endpoint,
  d.api_method,
  d.http_status_code,
  d.error_summary,
  d.logs,
  d.sql_evidence,
  d.service_status,
  d.notes,
  d.created_by,
  creator.name AS created_by_name,
  d.updated_by,
  updater.name AS updated_by_name,
  d.created_at,
  d.updated_at
`;

const diagnosticJoins = `
  JOIN users creator ON creator.id = d.created_by
  JOIN users updater ON updater.id = d.updated_by
`;

export async function findTicketTechnicalDiagnostic(
  ticketId: string,
  executor: QueryExecutor = pool,
): Promise<TicketTechnicalDiagnosticRow | null> {
  const result = await executor.query<TicketTechnicalDiagnosticRow>(
    `
      SELECT ${diagnosticSelect}
      FROM ticket_technical_diagnostics d
      ${diagnosticJoins}
      WHERE d.ticket_id = $1
    `,
    [ticketId],
  );

  return result.rows[0] ?? null;
}

export async function upsertTicketTechnicalDiagnostic(
  ticketId: string,
  input: TicketTechnicalDiagnosticUpsert,
  actorId: string,
  client: PoolClient,
): Promise<TicketTechnicalDiagnosticRow> {
  await client.query(
    `
      INSERT INTO ticket_technical_diagnostics (
        ticket_id,
        environment,
        affected_system,
        api_endpoint,
        api_method,
        http_status_code,
        error_summary,
        logs,
        sql_evidence,
        service_status,
        notes,
        created_by,
        updated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
      ON CONFLICT (ticket_id) DO UPDATE SET
        environment = EXCLUDED.environment,
        affected_system = EXCLUDED.affected_system,
        api_endpoint = EXCLUDED.api_endpoint,
        api_method = EXCLUDED.api_method,
        http_status_code = EXCLUDED.http_status_code,
        error_summary = EXCLUDED.error_summary,
        logs = EXCLUDED.logs,
        sql_evidence = EXCLUDED.sql_evidence,
        service_status = EXCLUDED.service_status,
        notes = EXCLUDED.notes,
        updated_by = EXCLUDED.updated_by
    `,
    [
      ticketId,
      input.environment ?? null,
      input.affectedSystem ?? null,
      input.apiEndpoint ?? null,
      input.apiMethod ?? null,
      input.httpStatusCode ?? null,
      input.errorSummary ?? null,
      input.logs ?? null,
      input.sqlEvidence ?? null,
      input.serviceStatus ?? null,
      input.notes ?? null,
      actorId,
    ],
  );

  const diagnostic = await findTicketTechnicalDiagnostic(ticketId, client);

  if (!diagnostic) {
    throw new Error('Technical diagnostic was not persisted');
  }

  return diagnostic;
}

import type {
  AuthUser,
  TicketTechnicalDiagnostic,
  TicketTechnicalDiagnosticUpsert,
} from '@supportflow/shared';

import { withTransaction } from '../database/transaction.js';
import { toTicketTechnicalDiagnostic } from '../domain/ticket-technical-diagnostics.js';
import { HttpError } from '../errors/http-error.js';
import {
  findTicketTechnicalDiagnostic,
  upsertTicketTechnicalDiagnostic,
} from '../repositories/ticket-technical-diagnostics.repository.js';
import { findTicketById, findTicketByIdForUpdate } from '../repositories/tickets.repository.js';

export async function getTicketTechnicalDiagnostic(
  ticketId: string,
  actor: AuthUser,
): Promise<TicketTechnicalDiagnostic | null> {
  if (actor.role === 'requester') {
    throw new HttpError(404, 'TICKET_NOT_FOUND', 'Ticket not found');
  }

  const ticket = await findTicketById(ticketId);
  if (!ticket) {
    throw new HttpError(404, 'TICKET_NOT_FOUND', 'Ticket not found');
  }

  ensureAgentResponsibility(ticket.assignee_id, actor);

  const diagnostic = await findTicketTechnicalDiagnostic(ticketId);
  return diagnostic ? toTicketTechnicalDiagnostic(diagnostic) : null;
}

export async function saveTicketTechnicalDiagnostic(
  ticketId: string,
  payload: TicketTechnicalDiagnosticUpsert,
  actor: AuthUser,
): Promise<TicketTechnicalDiagnostic> {
  if (actor.role === 'requester') {
    throw new HttpError(404, 'TICKET_NOT_FOUND', 'Ticket not found');
  }

  return withTransaction(async (client) => {
    const ticket = await findTicketByIdForUpdate(ticketId, client);

    if (!ticket) {
      throw new HttpError(404, 'TICKET_NOT_FOUND', 'Ticket not found');
    }

    ensureAgentResponsibility(ticket.assignee_id, actor);

    if (ticket.status === 'closed' || ticket.status === 'cancelled') {
      throw new HttpError(409, 'TICKET_NOT_MUTABLE', 'Ticket can no longer be changed');
    }

    const diagnostic = await upsertTicketTechnicalDiagnostic(ticketId, payload, actor.id, client);
    return toTicketTechnicalDiagnostic(diagnostic);
  });
}

function ensureAgentResponsibility(assigneeId: string | null, actor: AuthUser): void {
  if (actor.role === 'agent' && assigneeId !== null && assigneeId !== actor.id) {
    throw new HttpError(
      403,
      'FORBIDDEN',
      'Agents can only access diagnostics for tickets assigned to themselves',
    );
  }
}

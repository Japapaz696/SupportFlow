import type { RequestHandler } from 'express';

import { HttpError } from '../errors/http-error.js';
import {
  getTicketTechnicalDiagnostic,
  saveTicketTechnicalDiagnostic,
} from '../services/ticket-technical-diagnostics.service.js';
import { parseTicketTechnicalDiagnosticPayload } from '../validation/ticket-technical-diagnostics.validation.js';
import { validateUuid } from '../validation/common.validation.js';

function requireUser(request: Parameters<RequestHandler>[0]) {
  if (!request.user) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required');
  }

  return request.user;
}

export const getTicketTechnicalDiagnosticController: RequestHandler = async (
  request,
  response,
  next,
) => {
  try {
    const ticketId = validateUuid(String(request.params.id ?? ''), 'ticketId');
    const diagnostic = await getTicketTechnicalDiagnostic(ticketId, requireUser(request));
    response.json({ diagnostic });
  } catch (error) {
    next(error);
  }
};

export const saveTicketTechnicalDiagnosticController: RequestHandler = async (
  request,
  response,
  next,
) => {
  try {
    const ticketId = validateUuid(String(request.params.id ?? ''), 'ticketId');
    const diagnostic = await saveTicketTechnicalDiagnostic(
      ticketId,
      parseTicketTechnicalDiagnosticPayload(request.body),
      requireUser(request),
    );
    response.json({ diagnostic });
  } catch (error) {
    next(error);
  }
};

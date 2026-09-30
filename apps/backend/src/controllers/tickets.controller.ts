import type { RequestHandler } from 'express';

import { HttpError } from '../errors/http-error.js';
import {
  addTicketComment,
  assignTicket,
  changeTicketPriority,
  changeTicketStatus,
  createTicket,
  getTicket,
  listTickets,
} from '../services/tickets.service.js';
import { validateUuid } from '../validation/common.validation.js';
import {
  parseAssignPayload,
  parseCommentPayload,
  parseCreateTicketPayload,
  parsePriorityPayload,
  parseStatusPayload,
  parseTicketFilters,
} from '../validation/tickets.validation.js';

function requireUser(request: Parameters<RequestHandler>[0]) {
  if (!request.user) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required');
  }

  return request.user;
}

export const createTicketController: RequestHandler = async (request, response, next) => {
  try {
    const ticket = await createTicket(parseCreateTicketPayload(request.body), requireUser(request));
    response.status(201).json({ ticket });
  } catch (error) {
    next(error);
  }
};

export const listTicketsController: RequestHandler = async (request, response, next) => {
  try {
    response.json(await listTickets(parseTicketFilters(request.query), requireUser(request)));
  } catch (error) {
    next(error);
  }
};

export const getTicketController: RequestHandler = async (request, response, next) => {
  try {
    const id = validateUuid(String(request.params.id ?? ''), 'ticketId');
    response.json({ ticket: await getTicket(id, requireUser(request)) });
  } catch (error) {
    next(error);
  }
};

export const assignTicketController: RequestHandler = async (request, response, next) => {
  try {
    const id = validateUuid(String(request.params.id ?? ''), 'ticketId');
    response.json({
      ticket: await assignTicket(id, parseAssignPayload(request.body), requireUser(request)),
    });
  } catch (error) {
    next(error);
  }
};

export const changeStatusController: RequestHandler = async (request, response, next) => {
  try {
    const id = validateUuid(String(request.params.id ?? ''), 'ticketId');
    const { status } = parseStatusPayload(request.body);
    response.json({ ticket: await changeTicketStatus(id, status, requireUser(request)) });
  } catch (error) {
    next(error);
  }
};

export const changePriorityController: RequestHandler = async (request, response, next) => {
  try {
    const id = validateUuid(String(request.params.id ?? ''), 'ticketId');
    const { priority } = parsePriorityPayload(request.body);
    response.json({ ticket: await changeTicketPriority(id, priority, requireUser(request)) });
  } catch (error) {
    next(error);
  }
};

export const addCommentController: RequestHandler = async (request, response, next) => {
  try {
    const id = validateUuid(String(request.params.id ?? ''), 'ticketId');
    const comment = await addTicketComment(
      id,
      parseCommentPayload(request.body),
      requireUser(request),
    );
    response.status(201).json({ comment });
  } catch (error) {
    next(error);
  }
};

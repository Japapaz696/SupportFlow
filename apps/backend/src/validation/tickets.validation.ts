import {
  type CommentVisibility,
  type TicketPriority,
  type TicketStatus,
} from '@supportflow/shared';

import { isCommentVisibility, isTicketPriority, isTicketStatus } from '../domain/tickets.js';
import { HttpError } from '../errors/http-error.js';
import {
  parsePagination,
  readObject,
  rejectUnknownFields,
  validateText,
  validateUuid,
  type Pagination,
} from './common.validation.js';

export type CreateTicketPayload = {
  title: string;
  description: string;
  categoryId: string;
  priority?: TicketPriority;
};

export type TicketFilters = Pagination & {
  status?: TicketStatus;
  priority?: TicketPriority;
  categoryId?: string;
  assigneeId?: string;
};

export type CommentPayload = {
  body: string;
  visibility: CommentVisibility;
};

export type AssignPayload = {
  assigneeId?: string | null;
};

export type StatusPayload = {
  status: TicketStatus;
};

export type PriorityPayload = {
  priority: TicketPriority;
};

export function parseCreateTicketPayload(value: unknown): CreateTicketPayload {
  const payload = readObject(value);
  rejectUnknownFields(payload, ['title', 'description', 'categoryId', 'priority']);

  let priority: TicketPriority | undefined;

  if ('priority' in payload) {
    if (!isTicketPriority(payload.priority)) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'priority must be supported');
    }

    priority = payload.priority;
  }

  return {
    title: validateText(payload.title, 'title', 160),
    description: validateText(payload.description, 'description', 5000),
    categoryId: validateUuid(String(payload.categoryId ?? ''), 'categoryId'),
    priority,
  };
}

export function parseTicketFilters(value: unknown): TicketFilters {
  const query = readObject(value);
  rejectUnknownFields(query, [
    'status',
    'priority',
    'categoryId',
    'assigneeId',
    'page',
    'pageSize',
  ]);
  const pagination = parsePagination(query);
  const filters: TicketFilters = { ...pagination };

  if ('status' in query) {
    if (!isTicketStatus(query.status)) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'status must be supported');
    }

    filters.status = query.status;
  }

  if ('priority' in query) {
    if (!isTicketPriority(query.priority)) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'priority must be supported');
    }

    filters.priority = query.priority;
  }

  if ('categoryId' in query) {
    filters.categoryId = validateUuid(String(query.categoryId ?? ''), 'categoryId');
  }

  if ('assigneeId' in query) {
    filters.assigneeId = validateUuid(String(query.assigneeId ?? ''), 'assigneeId');
  }

  return filters;
}

export function parseCommentPayload(value: unknown): CommentPayload {
  const payload = readObject(value);
  rejectUnknownFields(payload, ['body', 'visibility']);
  const visibility = payload.visibility ?? 'public';

  if (!isCommentVisibility(visibility)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'visibility must be supported');
  }

  return {
    body: validateText(payload.body, 'body', 5000),
    visibility,
  };
}

export function parseAssignPayload(value: unknown): AssignPayload {
  const payload = readObject(value);
  rejectUnknownFields(payload, ['assigneeId']);

  if (!('assigneeId' in payload) || payload.assigneeId === null) {
    return { assigneeId: null };
  }

  return { assigneeId: validateUuid(String(payload.assigneeId), 'assigneeId') };
}

export function parseStatusPayload(value: unknown): StatusPayload {
  const payload = readObject(value);
  rejectUnknownFields(payload, ['status']);

  if (!isTicketStatus(payload.status)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'status must be supported');
  }

  return { status: payload.status };
}

export function parsePriorityPayload(value: unknown): PriorityPayload {
  const payload = readObject(value);
  rejectUnknownFields(payload, ['priority']);

  if (!isTicketPriority(payload.priority)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'priority must be supported');
  }

  return { priority: payload.priority };
}

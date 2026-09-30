import { ticketPriorities, type TicketPriority } from '@supportflow/shared';

import type { CreateCategoryInput, UpdateCategoryInput } from '../domain/categories.js';
import { HttpError } from '../errors/http-error.js';
import { readObject, rejectUnknownFields, validateText } from './common.validation.js';

function isTicketPriority(value: unknown): value is TicketPriority {
  return typeof value === 'string' && ticketPriorities.includes(value as TicketPriority);
}

function parseDescription(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'description must be a string');
  }

  const description = value.trim();
  return description.length === 0 ? null : description;
}

export function parseCreateCategoryPayload(value: unknown): CreateCategoryInput {
  const payload = readObject(value);
  rejectUnknownFields(payload, ['name', 'description', 'defaultPriority']);

  const defaultPriority = payload.defaultPriority ?? 'medium';

  if (!isTicketPriority(defaultPriority)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'defaultPriority must be supported');
  }

  return {
    name: validateText(payload.name, 'name', 120),
    description: parseDescription(payload.description),
    defaultPriority,
  };
}

export function parseUpdateCategoryPayload(value: unknown): UpdateCategoryInput {
  const payload = readObject(value);
  rejectUnknownFields(payload, ['name', 'description', 'defaultPriority', 'isActive']);
  const input: UpdateCategoryInput = {};

  if ('name' in payload) {
    input.name = validateText(payload.name, 'name', 120);
  }

  if ('description' in payload) {
    input.description = parseDescription(payload.description);
  }

  if ('defaultPriority' in payload) {
    if (!isTicketPriority(payload.defaultPriority)) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'defaultPriority must be supported');
    }

    input.defaultPriority = payload.defaultPriority;
  }

  if ('isActive' in payload) {
    if (typeof payload.isActive !== 'boolean') {
      throw new HttpError(400, 'VALIDATION_ERROR', 'isActive must be a boolean');
    }

    input.isActive = payload.isActive;
  }

  if (Object.keys(input).length === 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'At least one updatable field is required');
  }

  return input;
}

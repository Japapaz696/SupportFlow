import { HttpError } from '../errors/http-error.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type Pagination = {
  page: number;
  pageSize: number;
};

export function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body must be an object');
  }

  return value as Record<string, unknown>;
}

export function rejectUnknownFields(
  payload: Record<string, unknown>,
  allowedFields: string[],
): void {
  const unknownFields = Object.keys(payload).filter((field) => !allowedFields.includes(field));

  if (unknownFields.length > 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body contains unsupported fields', {
      fields: unknownFields,
    });
  }
}

export function validateUuid(value: string, field = 'id'): string {
  if (!uuidPattern.test(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', `${field} must be a valid UUID`);
  }

  return value;
}

export function validateText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', `${field} is required`);
  }

  const text = value.trim();

  if (text.length === 0 || text.length > maxLength) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${field} must contain between 1 and ${maxLength} characters`,
    );
  }

  return text;
}

export function parsePagination(query: Record<string, unknown>): Pagination {
  const parsePositiveInteger = (field: 'page' | 'pageSize', fallback: number): number => {
    const rawValue = query[field];

    if (rawValue === undefined) {
      return fallback;
    }

    if (typeof rawValue !== 'string' || !/^\d+$/.test(rawValue)) {
      throw new HttpError(400, 'VALIDATION_ERROR', `${field} must be a positive integer`);
    }

    const parsedValue = Number(rawValue);

    if (!Number.isSafeInteger(parsedValue) || parsedValue < 1) {
      throw new HttpError(400, 'VALIDATION_ERROR', `${field} must be a positive integer`);
    }

    return parsedValue;
  };

  const page = parsePositiveInteger('page', 1);
  const pageSize = parsePositiveInteger('pageSize', 20);

  if (pageSize > 100) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'pageSize must not exceed 100');
  }

  return { page, pageSize };
}

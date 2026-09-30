import type { UserRole } from '@supportflow/shared';

import { isUserRole, type UpdateUserInput } from '../domain/users.js';
import { HttpError } from '../errors/http-error.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreateUserPayload = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
};

export type LoginPayload = Pick<CreateUserPayload, 'email' | 'password'>;

function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body must be an object');
  }

  return value as Record<string, unknown>;
}

function rejectUnknownFields(payload: Record<string, unknown>, allowedFields: string[]): void {
  const unknownFields = Object.keys(payload).filter((field) => !allowedFields.includes(field));

  if (unknownFields.length > 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body contains unsupported fields', {
      fields: unknownFields,
    });
  }
}

export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Email must be a valid email address');
  }

  const email = value.trim().toLowerCase();

  if (!emailPattern.test(email) || email.length > 320) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Email must be a valid email address');
  }

  return email;
}

export function validatePassword(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length < 12 ||
    value.length > 128 ||
    Buffer.byteLength(value, 'utf8') > 72
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Password must contain at least 12 characters and at most 72 UTF-8 bytes',
    );
  }

  return value;
}

export function validateName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Name is required');
  }

  const name = value.trim();

  if (name.length < 2 || name.length > 120) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Name must contain between 2 and 120 characters');
  }

  return name;
}

export function validateUuid(value: string): string {
  if (!uuidPattern.test(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'User id must be a valid UUID');
  }

  return value;
}

export function parseLoginPayload(value: unknown): LoginPayload {
  const payload = readObject(value);
  rejectUnknownFields(payload, ['email', 'password']);

  if (typeof payload.password !== 'string' || payload.password.length > 128) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  return {
    email: normalizeEmail(payload.email),
    password: payload.password,
  };
}

export function parseCreateUserPayload(value: unknown): CreateUserPayload {
  const payload = readObject(value);
  rejectUnknownFields(payload, ['name', 'email', 'password', 'role']);

  if (!isUserRole(payload.role)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Role must be a supported user role');
  }

  return {
    name: validateName(payload.name),
    email: normalizeEmail(payload.email),
    password: validatePassword(payload.password),
    role: payload.role,
  };
}

export function parseUpdateUserPayload(value: unknown): UpdateUserInput {
  const payload = readObject(value);
  rejectUnknownFields(payload, ['name', 'role', 'isActive']);
  const input: UpdateUserInput = {};

  if ('name' in payload) {
    input.name = validateName(payload.name);
  }

  if ('role' in payload) {
    if (!isUserRole(payload.role)) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Role must be a supported user role');
    }

    input.role = payload.role;
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

export type UserListQuery = {
  page: number;
  pageSize: number;
};

export function parseUserListQuery(value: unknown): UserListQuery {
  const query = readObject(value);
  rejectUnknownFields(query, ['page', 'pageSize']);

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

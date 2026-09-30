import {
  httpMethods,
  type HttpMethod,
  type TicketTechnicalDiagnosticUpsert,
} from '@supportflow/shared';

import { HttpError } from '../errors/http-error.js';
import { readObject, rejectUnknownFields } from './common.validation.js';

const allowedFields = [
  'environment',
  'affectedSystem',
  'apiEndpoint',
  'apiMethod',
  'httpStatusCode',
  'errorSummary',
  'logs',
  'sqlEvidence',
  'serviceStatus',
  'notes',
];

const sensitivePatterns = [
  /authorization\s*:/i,
  /bearer\s+[A-Za-z0-9._~+/-]+=*/i,
  /\bset-cookie\s*:/i,
  /\bcookie\s*:/i,
  /\b(password|passwd|pwd|token|api[_-]?key|secret|client[_-]?secret)\b\s*[:=]/i,
  /\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]+@/,
];

function parseNullableText(
  value: unknown,
  field: string,
  maxLength: number,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', `${field} must be a string or null`);
  }

  const text = value.trim();

  if (text.length > maxLength) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${field} must not exceed ${maxLength} characters`,
    );
  }

  if (sensitivePatterns.some((pattern) => pattern.test(text))) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${field} must not contain passwords, tokens, credentials or authorization headers`,
    );
  }

  return text.length === 0 ? null : text;
}

export function parseTicketTechnicalDiagnosticPayload(
  value: unknown,
): TicketTechnicalDiagnosticUpsert {
  const payload = readObject(value);
  rejectUnknownFields(payload, allowedFields);

  const apiMethod = parseNullableText(payload.apiMethod, 'apiMethod', 7);
  if (apiMethod && !httpMethods.includes(apiMethod as HttpMethod)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'apiMethod must be supported');
  }

  let httpStatusCode: number | null | undefined;
  if ('httpStatusCode' in payload) {
    if (payload.httpStatusCode === null) {
      httpStatusCode = null;
    } else if (
      typeof payload.httpStatusCode !== 'number' ||
      !Number.isInteger(payload.httpStatusCode) ||
      payload.httpStatusCode < 100 ||
      payload.httpStatusCode > 599
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'httpStatusCode must be an integer between 100 and 599 or null',
      );
    } else {
      httpStatusCode = payload.httpStatusCode;
    }
  }

  return {
    environment: parseNullableText(payload.environment, 'environment', 120),
    affectedSystem: parseNullableText(payload.affectedSystem, 'affectedSystem', 160),
    apiEndpoint: parseNullableText(payload.apiEndpoint, 'apiEndpoint', 500),
    apiMethod: apiMethod as HttpMethod | null | undefined,
    httpStatusCode,
    errorSummary: parseNullableText(payload.errorSummary, 'errorSummary', 2000),
    logs: parseNullableText(payload.logs, 'logs', 10000),
    sqlEvidence: parseNullableText(payload.sqlEvidence, 'sqlEvidence', 10000),
    serviceStatus: parseNullableText(payload.serviceStatus, 'serviceStatus', 1000),
    notes: parseNullableText(payload.notes, 'notes', 10000),
  };
}

import { ticketPriorities, type TicketPriority } from '@supportflow/shared';
import type { SlaPolicyCreate, SlaPolicyUpdate } from '@supportflow/shared';
import { HttpError } from '../errors/http-error.js';
import { readObject, rejectUnknownFields } from './common.validation.js';

function isTicketPriority(value: unknown): value is TicketPriority {
  return typeof value === 'string' && ticketPriorities.includes(value as TicketPriority);
}

function validatePositiveInt(value: unknown, name: string): number {
  const maximumMinutes = 5_256_000;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > maximumMinutes
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${name} must be a positive integer no greater than ${maximumMinutes}`,
    );
  }
  return value;
}

export function parseCreatePolicyPayload(value: unknown): SlaPolicyCreate {
  const payload = readObject(value);
  rejectUnknownFields(payload, [
    'priority',
    'firstResponseMinutes',
    'resolutionMinutes',
    'businessHoursOnly',
    'isActive',
  ]);

  const priority = payload.priority;
  if (!isTicketPriority(priority)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'priority must be supported');
  }

  const firstResponseMinutes = validatePositiveInt(
    payload.firstResponseMinutes,
    'firstResponseMinutes',
  );
  const resolutionMinutes = validatePositiveInt(payload.resolutionMinutes, 'resolutionMinutes');

  if (typeof payload.businessHoursOnly === 'undefined') {
    // allowed; default handled downstream
  } else if (typeof payload.businessHoursOnly !== 'boolean') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'businessHoursOnly must be a boolean');
  } else if (payload.businessHoursOnly) {
    throw new HttpError(
      400,
      'BUSINESS_HOURS_NOT_SUPPORTED',
      'Business-hours SLA calculation is not supported in this milestone',
    );
  }

  if (typeof payload.isActive === 'undefined') {
    // allowed
  } else if (typeof payload.isActive !== 'boolean') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'isActive must be a boolean');
  }

  return {
    priority,
    firstResponseMinutes,
    resolutionMinutes,
    businessHoursOnly: false,
    isActive: payload.isActive === true ? true : payload.isActive === false ? false : true,
  };
}

export function parseUpdatePolicyPayload(value: unknown): Partial<SlaPolicyUpdate> {
  const payload = readObject(value);
  rejectUnknownFields(payload, [
    'firstResponseMinutes',
    'resolutionMinutes',
    'businessHoursOnly',
    'isActive',
  ]);
  const input: Partial<SlaPolicyUpdate> = {};

  if ('firstResponseMinutes' in payload) {
    input.firstResponseMinutes = validatePositiveInt(
      payload.firstResponseMinutes,
      'firstResponseMinutes',
    );
  }
  if ('resolutionMinutes' in payload) {
    input.resolutionMinutes = validatePositiveInt(payload.resolutionMinutes, 'resolutionMinutes');
  }
  if ('businessHoursOnly' in payload) {
    if (typeof payload.businessHoursOnly !== 'boolean') {
      throw new HttpError(400, 'VALIDATION_ERROR', 'businessHoursOnly must be a boolean');
    }
    if (payload.businessHoursOnly) {
      throw new HttpError(
        400,
        'BUSINESS_HOURS_NOT_SUPPORTED',
        'Business-hours SLA calculation is not supported in this milestone',
      );
    }
    input.businessHoursOnly = payload.businessHoursOnly;
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

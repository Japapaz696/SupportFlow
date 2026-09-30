import type { SlaPolicy, SlaPolicyCreate, SlaPolicyUpdate } from '@supportflow/shared';
import type { DatabaseError } from 'pg';

import { HttpError } from '../errors/http-error.js';
import {
  createPolicy,
  findPolicyById,
  listPolicies,
  updatePolicy,
} from '../repositories/sla-policies.repository.js';

function isUniqueViolation(error: unknown): error is DatabaseError {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export async function listSlaPolicies(): Promise<SlaPolicy[]> {
  return listPolicies();
}

export async function createSlaPolicy(input: SlaPolicyCreate): Promise<SlaPolicy> {
  try {
    return await createPolicy(input);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(
        409,
        'SLA_POLICY_ALREADY_EXISTS',
        'An SLA policy already exists for this priority',
      );
    }
    throw error;
  }
}

export async function updateSlaPolicy(id: string, input: SlaPolicyUpdate): Promise<SlaPolicy> {
  const existing = await findPolicyById(id);
  if (!existing) {
    throw new HttpError(404, 'SLA_POLICY_NOT_FOUND', 'SLA policy not found');
  }

  const resultingBusinessHoursOnly = input.businessHoursOnly ?? existing.businessHoursOnly;
  const resultingIsActive = input.isActive ?? existing.isActive;
  if (resultingBusinessHoursOnly && resultingIsActive) {
    throw new HttpError(
      400,
      'BUSINESS_HOURS_NOT_SUPPORTED',
      'A business-hours policy cannot be active until that calendar is implemented',
    );
  }

  const policy = await updatePolicy(id, input);
  if (!policy) {
    throw new HttpError(404, 'SLA_POLICY_NOT_FOUND', 'SLA policy not found');
  }
  return policy;
}

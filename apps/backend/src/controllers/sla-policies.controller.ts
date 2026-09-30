import type { RequestHandler } from 'express';

import {
  createSlaPolicy,
  listSlaPolicies,
  updateSlaPolicy,
} from '../services/sla-policies.service.js';
import { validateUuid } from '../validation/common.validation.js';
import {
  parseCreatePolicyPayload,
  parseUpdatePolicyPayload,
} from '../validation/sla-policies.validation.js';

export const listSlaPoliciesController: RequestHandler = async (_request, response, next) => {
  try {
    response.json({ policies: await listSlaPolicies() });
  } catch (error) {
    next(error);
  }
};

export const createSlaPolicyController: RequestHandler = async (request, response, next) => {
  try {
    const policy = await createSlaPolicy(parseCreatePolicyPayload(request.body));
    response.status(201).json({ policy });
  } catch (error) {
    next(error);
  }
};

export const updateSlaPolicyController: RequestHandler = async (request, response, next) => {
  try {
    const id = validateUuid(String(request.params.id ?? ''), 'slaPolicyId');
    const policy = await updateSlaPolicy(id, parseUpdatePolicyPayload(request.body));
    response.json({ policy });
  } catch (error) {
    next(error);
  }
};

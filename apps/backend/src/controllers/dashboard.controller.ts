import type { RequestHandler } from 'express';

import { HttpError } from '../errors/http-error.js';
import { getDashboardSummary } from '../services/dashboard.service.js';

function requireUser(request: Parameters<RequestHandler>[0]) {
  if (!request.user) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required');
  }
  return request.user;
}

export const dashboardSummaryController: RequestHandler = async (request, response, next) => {
  try {
    response.json({ summary: await getDashboardSummary(requireUser(request)) });
  } catch (error) {
    next(error);
  }
};

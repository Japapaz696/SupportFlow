import type { RequestHandler } from 'express';

import { HttpError } from '../errors/http-error.js';
import { getAuthenticatedUser, verifyToken } from '../services/auth.service.js';

export const requireAuth: RequestHandler = async (request, _response, next) => {
  try {
    const authorization = request.header('authorization');

    if (!authorization?.startsWith('Bearer ')) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required');
    }

    const token = authorization.slice('Bearer '.length).trim();

    if (!token) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required');
    }

    const payload = verifyToken(token);
    request.user = await getAuthenticatedUser(payload.sub);
    next();
  } catch (error) {
    next(error);
  }
};

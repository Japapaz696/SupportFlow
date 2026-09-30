import type { RequestHandler } from 'express';

import { HttpError } from '../errors/http-error.js';
import { login } from '../services/auth.service.js';
import { parseLoginPayload } from '../validation/users.validation.js';

export const loginController: RequestHandler = async (request, response, next) => {
  try {
    response.json(await login(parseLoginPayload(request.body)));
  } catch (error) {
    next(error);
  }
};

export const logoutController: RequestHandler = (_request, response) => {
  response.status(204).send();
};

export const meController: RequestHandler = (request, response, next) => {
  if (!request.user) {
    next(new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required'));
    return;
  }

  response.json({ user: request.user });
};

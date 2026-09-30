import type { RequestHandler } from 'express';
import type { UserRole } from '@supportflow/shared';

import { HttpError } from '../errors/http-error.js';

export function requireRoles(...roles: UserRole[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.user) {
      next(new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required'));
      return;
    }

    if (!roles.includes(request.user.role)) {
      next(new HttpError(403, 'FORBIDDEN', 'You do not have permission to perform this action'));
      return;
    }

    next();
  };
}

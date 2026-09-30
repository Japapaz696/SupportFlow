import type { AuthUser } from '@supportflow/shared';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};

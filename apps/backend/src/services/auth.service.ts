import jwt, { type SignOptions } from 'jsonwebtoken';
import type { AuthUser, LoginResponse } from '@supportflow/shared';

import { env } from '../config/env.js';
import { toAuthUser } from '../domain/users.js';
import { HttpError } from '../errors/http-error.js';
import { findUserByEmail, findUserById } from '../repositories/users.repository.js';
import { verifyPassword } from './password.service.js';
import type { LoginPayload } from '../validation/users.validation.js';

type AuthTokenPayload = {
  sub: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function login(input: LoginPayload): Promise<LoginResponse> {
  const user = await findUserByEmail(input.email);

  if (!user || !user.is_active || !(await verifyPassword(input.password, user.password_hash))) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  return {
    token: signToken(user.id),
    user: toAuthUser(user),
  };
}

export async function getAuthenticatedUser(id: string): Promise<AuthUser> {
  const user = await findUserById(id);

  if (!user || !user.is_active) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required');
  }

  return toAuthUser(user);
}

export function signToken(id: string): string {
  return jwt.sign({}, env.jwtSecret, {
    algorithm: 'HS256',
    subject: id,
    expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): AuthTokenPayload {
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });

    if (
      typeof payload === 'string' ||
      typeof payload.sub !== 'string' ||
      !uuidPattern.test(payload.sub)
    ) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required');
    }

    return { sub: payload.sub };
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required');
  }
}

import type { RequestHandler } from 'express';

import { createUser, getUser, listUsers, updateUser } from '../services/users.service.js';
import { hashPassword } from '../services/password.service.js';
import {
  parseCreateUserPayload,
  parseUserListQuery,
  parseUpdateUserPayload,
  validateUuid,
} from '../validation/users.validation.js';

export const listUsersController: RequestHandler = async (request, response, next) => {
  try {
    const { page, pageSize } = parseUserListQuery(request.query);
    const { users, total } = await listUsers(page, pageSize);
    response.json({ users, page, pageSize, total });
  } catch (error) {
    next(error);
  }
};

export const getUserController: RequestHandler = async (request, response, next) => {
  try {
    const id = validateUuid(String(request.params.id ?? ''));
    response.json({ user: await getUser(id) });
  } catch (error) {
    next(error);
  }
};

export const createUserController: RequestHandler = async (request, response, next) => {
  try {
    const payload = parseCreateUserPayload(request.body);
    const user = await createUser({
      name: payload.name,
      email: payload.email,
      passwordHash: await hashPassword(payload.password),
      role: payload.role,
    });

    response.status(201).json({ user });
  } catch (error) {
    next(error);
  }
};

export const updateUserController: RequestHandler = async (request, response, next) => {
  try {
    const id = validateUuid(String(request.params.id ?? ''));
    const user = await updateUser(id, parseUpdateUserPayload(request.body));
    response.json({ user });
  } catch (error) {
    next(error);
  }
};

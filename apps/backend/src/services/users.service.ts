import type { User } from '@supportflow/shared';

import { toUser, type CreateUserInput, type UpdateUserInput } from '../domain/users.js';
import { HttpError } from '../errors/http-error.js';
import {
  createUser as createUserRecord,
  findUserByEmail,
  findUserById,
  listUsers as listUserRecords,
  updateUser as updateUserRecord,
} from '../repositories/users.repository.js';

export async function listUsers(
  page: number,
  pageSize: number,
): Promise<{ users: User[]; total: number }> {
  const result = await listUserRecords(pageSize, (page - 1) * pageSize);

  return { users: result.users.map(toUser), total: result.total };
}

export async function getUser(id: string): Promise<User> {
  const user = await findUserById(id);

  if (!user) {
    throw new HttpError(404, 'USER_NOT_FOUND', 'User not found');
  }

  return toUser(user);
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const existingUser = await findUserByEmail(input.email);

  if (existingUser) {
    throw new HttpError(409, 'EMAIL_ALREADY_IN_USE', 'Email is already in use');
  }

  try {
    return toUser(await createUserRecord(input));
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === '23505' &&
      'constraint' in error &&
      error.constraint === 'users_email_key'
    ) {
      throw new HttpError(409, 'EMAIL_ALREADY_IN_USE', 'Email is already in use');
    }

    throw error;
  }
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  const user = await updateUserRecord(id, input);

  if (!user) {
    throw new HttpError(404, 'USER_NOT_FOUND', 'User not found');
  }

  return toUser(user);
}

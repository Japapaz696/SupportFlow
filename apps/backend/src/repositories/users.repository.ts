import type { PoolClient } from 'pg';

import type { CreateUserInput, UpdateUserInput, UserRow } from '../domain/users.js';
import { pool } from '../database/pool.js';

const userFields = `
  id,
  name,
  email,
  password_hash,
  role,
  is_active,
  created_at,
  updated_at
`;

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(`SELECT ${userFields} FROM users WHERE email = $1`, [
    email,
  ]);

  return result.rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(`SELECT ${userFields} FROM users WHERE id = $1`, [id]);

  return result.rows[0] ?? null;
}

export async function findUserByIdForShare(
  id: string,
  client: PoolClient,
): Promise<UserRow | null> {
  const result = await client.query<UserRow>(
    `SELECT ${userFields} FROM users WHERE id = $1 FOR SHARE`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function findAnyAdmin(): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `SELECT ${userFields} FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1`,
  );

  return result.rows[0] ?? null;
}

export async function listUsers(
  limit: number,
  offset: number,
): Promise<{ users: UserRow[]; total: number }> {
  const [usersResult, countResult] = await Promise.all([
    pool.query<UserRow>(
      `SELECT ${userFields} FROM users ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
    pool.query<{ total: string }>('SELECT COUNT(*) AS total FROM users'),
  ]);

  return { users: usersResult.rows, total: Number(countResult.rows[0]?.total ?? 0) };
}

export async function createUser(input: CreateUserInput): Promise<UserRow> {
  const result = await pool.query<UserRow>(
    `
      INSERT INTO users (name, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING ${userFields}
    `,
    [input.name, input.email, input.passwordHash, input.role],
  );

  return result.rows[0];
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<UserRow | null> {
  const fields: string[] = [];
  const values: Array<string | boolean> = [];

  if (input.name !== undefined) {
    values.push(input.name);
    fields.push(`name = $${values.length}`);
  }

  if (input.role !== undefined) {
    values.push(input.role);
    fields.push(`role = $${values.length}`);
  }

  if (input.isActive !== undefined) {
    values.push(input.isActive);
    fields.push(`is_active = $${values.length}`);
  }

  if (fields.length === 0) {
    return findUserById(id);
  }

  values.push(id);
  const result = await pool.query<UserRow>(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING ${userFields}`,
    values,
  );

  return result.rows[0] ?? null;
}

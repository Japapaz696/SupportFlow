import type { PoolClient } from 'pg';

import { pool } from '../database/pool.js';
import type {
  CategoryRow,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../domain/categories.js';

type QueryExecutor = Pick<typeof pool, 'query'> | PoolClient;

const categoryFields = `
  id,
  name,
  description,
  is_active,
  default_priority
`;

export async function listCategories(
  includeInactive: boolean,
  executor: QueryExecutor = pool,
): Promise<CategoryRow[]> {
  const result = await executor.query<CategoryRow>(
    `SELECT ${categoryFields} FROM categories ${includeInactive ? '' : 'WHERE is_active = TRUE'} ORDER BY name ASC`,
  );

  return result.rows;
}

export async function listActiveCategories(executor: QueryExecutor = pool): Promise<CategoryRow[]> {
  return listCategories(false, executor);
}

export async function findCategoryById(
  id: string,
  executor: QueryExecutor = pool,
): Promise<CategoryRow | null> {
  const result = await executor.query<CategoryRow>(
    `SELECT ${categoryFields} FROM categories WHERE id = $1`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function findCategoryByIdForShare(
  id: string,
  client: PoolClient,
): Promise<CategoryRow | null> {
  const result = await client.query<CategoryRow>(
    `SELECT ${categoryFields} FROM categories WHERE id = $1 FOR SHARE`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function createCategory(
  input: CreateCategoryInput,
  executor: QueryExecutor = pool,
): Promise<CategoryRow> {
  const result = await executor.query<CategoryRow>(
    `
      INSERT INTO categories (name, description, default_priority)
      VALUES ($1, $2, $3)
      RETURNING ${categoryFields}
    `,
    [input.name, input.description, input.defaultPriority],
  );

  return result.rows[0];
}

export async function updateCategory(
  id: string,
  input: UpdateCategoryInput,
  executor: QueryExecutor = pool,
): Promise<CategoryRow | null> {
  const fields: string[] = [];
  const values: Array<string | boolean | null> = [];

  if (input.name !== undefined) {
    values.push(input.name);
    fields.push(`name = $${values.length}`);
  }

  if (input.description !== undefined) {
    values.push(input.description);
    fields.push(`description = $${values.length}`);
  }

  if (input.defaultPriority !== undefined) {
    values.push(input.defaultPriority);
    fields.push(`default_priority = $${values.length}`);
  }

  if (input.isActive !== undefined) {
    values.push(input.isActive);
    fields.push(`is_active = $${values.length}`);
  }

  values.push(id);
  const result = await executor.query<CategoryRow>(
    `UPDATE categories SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING ${categoryFields}`,
    values,
  );

  return result.rows[0] ?? null;
}

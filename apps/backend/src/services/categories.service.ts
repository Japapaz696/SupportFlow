import type { AuthUser, Category } from '@supportflow/shared';

import {
  toCategory,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from '../domain/categories.js';
import { HttpError } from '../errors/http-error.js';
import {
  createCategory as createCategoryRecord,
  findCategoryById,
  listActiveCategories,
  listCategories as listCategoryRecords,
  updateCategory as updateCategoryRecord,
} from '../repositories/categories.repository.js';

export async function listCategories(
  actor: AuthUser,
  includeInactive = false,
): Promise<Category[]> {
  if (includeInactive && actor.role !== 'manager' && actor.role !== 'admin') {
    throw new HttpError(403, 'FORBIDDEN', 'You do not have permission to view inactive categories');
  }

  const categories = includeInactive
    ? await listCategoryRecords(true)
    : await listActiveCategories();

  return categories.map(toCategory);
}

export async function createCategory(input: CreateCategoryInput): Promise<Category> {
  try {
    return toCategory(await createCategoryRecord(input));
  } catch (error) {
    if (isUniqueViolation(error, 'categories_name_key')) {
      throw new HttpError(409, 'CATEGORY_ALREADY_EXISTS', 'Category name is already in use');
    }

    throw error;
  }
}

export async function updateCategory(id: string, input: UpdateCategoryInput): Promise<Category> {
  try {
    const category = await updateCategoryRecord(id, input);

    if (!category) {
      throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
    }

    return toCategory(category);
  } catch (error) {
    if (isUniqueViolation(error, 'categories_name_key')) {
      throw new HttpError(409, 'CATEGORY_ALREADY_EXISTS', 'Category name is already in use');
    }

    throw error;
  }
}

export async function ensureActiveCategory(id: string): Promise<Category> {
  const category = await findCategoryById(id);

  if (!category || !category.is_active) {
    throw new HttpError(400, 'CATEGORY_NOT_AVAILABLE', 'Category is not available');
  }

  return toCategory(category);
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === constraint
  );
}

import type { RequestHandler } from 'express';

import { HttpError } from '../errors/http-error.js';
import { createCategory, listCategories, updateCategory } from '../services/categories.service.js';
import {
  parseCreateCategoryPayload,
  parseUpdateCategoryPayload,
} from '../validation/categories.validation.js';
import { validateUuid } from '../validation/common.validation.js';

function requireUser(request: Parameters<RequestHandler>[0]) {
  if (!request.user) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required');
  }

  return request.user;
}

function parseIncludeInactive(value: unknown): boolean {
  if (value === undefined) {
    return false;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new HttpError(400, 'VALIDATION_ERROR', 'includeInactive must be true or false');
}

export const listCategoriesController: RequestHandler = async (request, response, next) => {
  try {
    response.json({
      categories: await listCategories(
        requireUser(request),
        parseIncludeInactive(request.query.includeInactive),
      ),
    });
  } catch (error) {
    next(error);
  }
};

export const createCategoryController: RequestHandler = async (request, response, next) => {
  try {
    const category = await createCategory(parseCreateCategoryPayload(request.body));
    response.status(201).json({ category });
  } catch (error) {
    next(error);
  }
};

export const updateCategoryController: RequestHandler = async (request, response, next) => {
  try {
    const id = validateUuid(String(request.params.id ?? ''), 'categoryId');
    const category = await updateCategory(id, parseUpdateCategoryPayload(request.body));
    response.json({ category });
  } catch (error) {
    next(error);
  }
};

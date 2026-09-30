import { Router } from 'express';

import {
  createCategoryController,
  listCategoriesController,
  updateCategoryController,
} from '../controllers/categories.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRoles } from '../middleware/authorize.middleware.js';

export const categoriesRouter = Router();

categoriesRouter.use(requireAuth);
categoriesRouter.get('/', listCategoriesController);
categoriesRouter.post('/', requireRoles('manager', 'admin'), createCategoryController);
categoriesRouter.patch('/:id', requireRoles('manager', 'admin'), updateCategoryController);

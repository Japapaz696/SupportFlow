import { Router } from 'express';

import {
  createUserController,
  getUserController,
  listUsersController,
  updateUserController,
} from '../controllers/users.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRoles } from '../middleware/authorize.middleware.js';

export const usersRouter = Router();

usersRouter.use(requireAuth, requireRoles('admin'));
usersRouter.get('/', listUsersController);
usersRouter.get('/:id', getUserController);
usersRouter.post('/', createUserController);
usersRouter.patch('/:id', updateUserController);

import { Router } from 'express';

import {
  createUserController,
  getUserController,
  listAssignableUsersController,
  listUsersController,
  updateUserController,
} from '../controllers/users.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRoles } from '../middleware/authorize.middleware.js';

export const usersRouter = Router();

// Lista de atribuicao: qualquer membro de equipe pode consultar quem pode
// receber chamados. Fica ANTES do gate admin-only das demais rotas.
usersRouter.get(
  '/assignable',
  requireAuth,
  requireRoles('agent', 'manager', 'admin'),
  listAssignableUsersController,
);

// Administracao de usuarios: apenas admin.
usersRouter.use(requireAuth, requireRoles('admin'));
usersRouter.get('/', listUsersController);
usersRouter.get('/:id', getUserController);
usersRouter.post('/', createUserController);
usersRouter.patch('/:id', updateUserController);

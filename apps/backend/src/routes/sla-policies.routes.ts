import { Router } from 'express';
import {
  listSlaPoliciesController,
  createSlaPolicyController,
  updateSlaPolicyController,
} from '../controllers/sla-policies.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRoles } from '../middleware/authorize.middleware.js';

export const slaPoliciesRouter = Router();

slaPoliciesRouter.use(requireAuth);
slaPoliciesRouter.get('/', listSlaPoliciesController);
slaPoliciesRouter.post('/', requireRoles('manager', 'admin'), createSlaPolicyController);
slaPoliciesRouter.patch('/:id', requireRoles('manager', 'admin'), updateSlaPolicyController);

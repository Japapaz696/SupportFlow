import { Router } from 'express';

import { dashboardSummaryController } from '../controllers/dashboard.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);
dashboardRouter.get('/summary', dashboardSummaryController);

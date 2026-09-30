import { Router } from 'express';

import { loginController, logoutController, meController } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const authRouter = Router();

authRouter.post('/login', loginController);
authRouter.post('/logout', requireAuth, logoutController);
authRouter.get('/me', requireAuth, meController);

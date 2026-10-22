import { Router } from 'express';

import { loginController, logoutController, meController } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { authRateLimiter } from '../middleware/security.middleware.js';

export const authRouter = Router();

// O limitador cobre apenas o login: e o unico endpoint que confere
// credenciais. `/me` e `/logout` exigem token, entao nao sao vetor de forca
// bruta e nao devem consumir a cota de tentativas.
authRouter.post('/login', authRateLimiter, loginController);
authRouter.post('/logout', requireAuth, logoutController);
authRouter.get('/me', requireAuth, meController);

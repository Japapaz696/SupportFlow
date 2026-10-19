import { Router } from 'express';

import { healthController, readinessController } from '../controllers/health.controller.js';

export const healthRouter = Router();

// Liveness: o processo responde. Nao depende do banco.
healthRouter.get('/health', healthController);

// Readiness: o servico consegue atender. Consulta o banco.
healthRouter.get('/ready', readinessController);

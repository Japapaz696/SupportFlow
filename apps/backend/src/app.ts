import cors from 'cors';
import express from 'express';

import { authRateLimiter, corsOptions, securityHeaders } from './middleware/security.middleware.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { authRouter } from './routes/auth.routes.js';
import { categoriesRouter } from './routes/categories.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { ticketsRouter } from './routes/tickets.routes.js';
import { usersRouter } from './routes/users.routes.js';
import { notificationsRouter } from './routes/notifications.routes.js';
import { slaPoliciesRouter } from './routes/sla-policies.routes.js';

export const app = express();

// Atras de proxy (Render/Vercel) confiamos em 1 hop para que o IP real do
// cliente seja usado no rate limiting. Em teste nao ha proxy.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security headers
app.use(securityHeaders);

// CORS
app.use(cors(corsOptions));

// Rate limiting on auth endpoints.
// Em testes o limiter e desativado para nao interferir nas demais suites; o
// comportamento real e provado em security-middleware.test.ts, que instancia
// o limiter ativo.
const applyAuthLimiter = process.env.VITEST ? [] : [authRateLimiter];

app.use(express.json());
app.use(healthRouter);
app.use('/api/v1/auth', ...applyAuthLimiter, authRouter);
app.use('/api/v1/categories', categoriesRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/tickets', ticketsRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/notifications', notificationsRouter);
app.use('/api/v1/sla-policies', slaPoliciesRouter);
app.use(notFoundHandler);
app.use(errorHandler);

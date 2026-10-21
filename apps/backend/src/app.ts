import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

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

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const app = express();

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// Rate limiting on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.VITEST ? 10000 : 10, // generous in tests
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => Boolean(process.env.VITEST),
  message: { error: { message: 'Muitas tentativas. Tente novamente mais tarde.' } },
});

app.use(express.json());
app.use(healthRouter);
app.use('/api/v1/auth', authLimiter, authRouter);
app.use('/api/v1/categories', categoriesRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/tickets', ticketsRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/notifications', notificationsRouter);
app.use('/api/v1/sla-policies', slaPoliciesRouter);
app.use(notFoundHandler);
app.use(errorHandler);

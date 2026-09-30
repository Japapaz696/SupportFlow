import express from 'express';

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

app.use(express.json());
app.use(healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/categories', categoriesRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/tickets', ticketsRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/notifications', notificationsRouter);
app.use('/api/v1/sla-policies', slaPoliciesRouter);
app.use(notFoundHandler);
app.use(errorHandler);

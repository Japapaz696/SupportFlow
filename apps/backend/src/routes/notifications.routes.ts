import { Router } from 'express';

import {
  listNotificationsController,
  readAllNotificationsController,
  readNotificationController,
  unreadNotificationCountController,
} from '../controllers/notifications.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);
notificationsRouter.get('/', listNotificationsController);
notificationsRouter.get('/unread-count', unreadNotificationCountController);
notificationsRouter.patch('/read-all', readAllNotificationsController);
notificationsRouter.patch('/:id/read', readNotificationController);

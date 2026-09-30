import type { RequestHandler } from 'express';

import { HttpError } from '../errors/http-error.js';
import {
  getUnreadNotificationCount,
  listNotifications,
  readAllNotifications,
  readNotification,
} from '../services/notifications.service.js';
import {
  parseNotificationId,
  parseNotificationPagination,
} from '../validation/notifications.validation.js';

function requireUser(request: Parameters<RequestHandler>[0]) {
  if (!request.user) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required');
  }

  return request.user;
}

export const listNotificationsController: RequestHandler = async (request, response, next) => {
  try {
    response.json(
      await listNotifications(requireUser(request), parseNotificationPagination(request.query)),
    );
  } catch (error) {
    next(error);
  }
};

export const unreadNotificationCountController: RequestHandler = async (
  request,
  response,
  next,
) => {
  try {
    response.json({ unread: await getUnreadNotificationCount(requireUser(request)) });
  } catch (error) {
    next(error);
  }
};

export const readNotificationController: RequestHandler = async (request, response, next) => {
  try {
    const id = parseNotificationId(String(request.params.id ?? ''));
    response.json({ notification: await readNotification(id, requireUser(request)) });
  } catch (error) {
    next(error);
  }
};

export const readAllNotificationsController: RequestHandler = async (request, response, next) => {
  try {
    response.json(await readAllNotifications(requireUser(request)));
  } catch (error) {
    next(error);
  }
};

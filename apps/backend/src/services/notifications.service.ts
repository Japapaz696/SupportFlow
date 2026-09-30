import type { AuthUser, Notification, Paginated } from '@supportflow/shared';

import { withTransaction } from '../database/transaction.js';
import { toNotification } from '../domain/notifications.js';
import { HttpError } from '../errors/http-error.js';
import {
  countUnreadNotifications,
  listNotifications as listNotificationRecords,
  markAllNotificationsRead,
  markNotificationRead,
} from '../repositories/notifications.repository.js';
import type { Pagination } from '../validation/common.validation.js';

export async function listNotifications(
  actor: AuthUser,
  pagination: Pagination,
): Promise<Paginated<Notification>> {
  const result = await listNotificationRecords(actor.id, {
    limit: pagination.pageSize,
    offset: (pagination.page - 1) * pagination.pageSize,
  });

  return {
    items: result.notifications.map(toNotification),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total: result.total,
  };
}

export async function getUnreadNotificationCount(actor: AuthUser): Promise<number> {
  return countUnreadNotifications(actor.id);
}

export async function readNotification(id: string, actor: AuthUser): Promise<Notification> {
  return withTransaction(async (client) => {
    const notification = await markNotificationRead(id, actor.id, client);

    if (!notification) {
      throw new HttpError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found');
    }

    return toNotification(notification);
  });
}

export async function readAllNotifications(actor: AuthUser): Promise<{ updated: number }> {
  return withTransaction(async (client) => ({
    updated: await markAllNotificationsRead(actor.id, client),
  }));
}

import type { NotificationType } from '@supportflow/shared';
import type { PoolClient } from 'pg';

import { pool } from '../database/pool.js';
import type { NotificationRow } from '../domain/notifications.js';

type QueryExecutor = Pick<typeof pool, 'query'> | PoolClient;

const notificationFields = `
  id,
  user_id,
  type,
  ticket_id,
  title,
  message,
  read_at,
  created_at
`;

export async function createNotification(
  input: {
    userId: string;
    type: NotificationType;
    ticketId: string | null;
    title: string;
    message: string;
  },
  client: PoolClient,
): Promise<NotificationRow> {
  const result = await client.query<NotificationRow>(
    `
      INSERT INTO notifications (user_id, type, ticket_id, title, message)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING ${notificationFields}
    `,
    [input.userId, input.type, input.ticketId, input.title, input.message],
  );

  return result.rows[0];
}

export async function listNotifications(
  userId: string,
  pagination: { limit: number; offset: number },
  executor: QueryExecutor = pool,
): Promise<{ notifications: NotificationRow[]; total: number }> {
  const [notificationsResult, countResult] = await Promise.all([
    executor.query<NotificationRow>(
      `
        SELECT ${notificationFields}
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2 OFFSET $3
      `,
      [userId, pagination.limit, pagination.offset],
    ),
    executor.query<{ total: string }>(
      'SELECT COUNT(*) AS total FROM notifications WHERE user_id = $1',
      [userId],
    ),
  ]);

  return {
    notifications: notificationsResult.rows,
    total: Number(countResult.rows[0]?.total ?? 0),
  };
}

export async function countUnreadNotifications(
  userId: string,
  executor: QueryExecutor = pool,
): Promise<number> {
  const result = await executor.query<{ total: string }>(
    'SELECT COUNT(*) AS total FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [userId],
  );

  return Number(result.rows[0]?.total ?? 0);
}

export async function markNotificationRead(
  id: string,
  userId: string,
  client: PoolClient,
): Promise<NotificationRow | null> {
  const result = await client.query<NotificationRow>(
    `
      UPDATE notifications
      SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
      WHERE id = $1 AND user_id = $2
      RETURNING ${notificationFields}
    `,
    [id, userId],
  );

  return result.rows[0] ?? null;
}

export async function markAllNotificationsRead(
  userId: string,
  client: PoolClient,
): Promise<number> {
  const result = await client.query(
    `
      UPDATE notifications
      SET read_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND read_at IS NULL
    `,
    [userId],
  );

  return result.rowCount ?? 0;
}

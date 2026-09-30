import type { Notification, NotificationType } from '@supportflow/shared';

export type NotificationRow = {
  id: string;
  user_id: string;
  type: NotificationType;
  ticket_id: string | null;
  title: string;
  message: string;
  read_at: Date | null;
  created_at: Date;
};

export function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    type: row.type,
    ticketId: row.ticket_id,
    title: row.title,
    message: row.message,
    readAt: row.read_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

import { parsePagination, validateUuid } from './common.validation.js';

export function parseNotificationId(value: string): string {
  return validateUuid(value, 'notificationId');
}

export function parseNotificationPagination(query: Record<string, unknown>) {
  return parsePagination(query);
}

import { useCallback, useEffect, useState } from 'react';
import type { Notification } from '@supportflow/shared';

import { useAuth } from '../auth/AuthContext';
import {
  ApiError,
  getUnreadNotificationCount,
  listNotifications,
  readAllNotifications,
  readNotification,
} from '../services/api';

type Props = {
  onOpenTicket: (id: string) => void;
};

export function NotificationsPanel({ onOpenTicket }: Props) {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [message, setMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setMessage('');
    setSuccessMessage('');
    try {
      const [list, count] = await Promise.all([
        listNotifications(token, { page: 1, pageSize: 20 }),
        getUnreadNotificationCount(token),
      ]);
      setNotifications(list.items);
      setUnread(count);
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : 'Não foi possível carregar as notificações.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(notification: Notification) {
    if (!token || notification.readAt) return notification;
    const updated = await readNotification(token, notification.id);
    setNotifications((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setUnread((current) => Math.max(0, current - 1));
    return updated;
  }

  async function markNotificationRead(notification: Notification) {
    setIsSubmitting(true);
    setMessage('');
    setSuccessMessage('');
    try {
      await markRead(notification);
      setSuccessMessage('Notificação marcada como lida.');
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : 'Não foi possível atualizar a notificação.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function openNotification(notification: Notification) {
    setIsSubmitting(true);
    setMessage('');
    setSuccessMessage('');
    try {
      const updated = await markRead(notification);
      if (updated.ticketId) {
        onOpenTicket(updated.ticketId);
      }
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : 'Não foi possível atualizar a notificação.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function markAllRead() {
    if (!token) return;
    setIsSubmitting(true);
    setMessage('');
    setSuccessMessage('');
    try {
      await readAllNotifications(token);
      setNotifications((current) =>
        current.map((item) => ({
          ...item,
          readAt: item.readAt ?? new Date().toISOString(),
        })),
      );
      setUnread(0);
      setSuccessMessage('Todas as notificações foram marcadas como lidas.');
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : 'Não foi possível marcar as notificações.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="notifications-panel" aria-labelledby="notifications-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">Central</p>
          <h1 id="notifications-title">Notificações</h1>
          <p className="supporting-text">
            Acompanhe atualizações dos chamados relacionados a você.
          </p>
        </div>
        <div className="notification-actions">
          <button className="secondary-button" type="button" onClick={() => void load()}>
            Atualizar
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={isSubmitting || unread === 0}
            onClick={() => void markAllRead()}
          >
            Marcar todas como lidas
          </button>
        </div>
      </div>

      {message ? (
        <div className="form-error" role="alert">
          <p>{message}</p>
          <button className="secondary-button" type="button" onClick={() => void load()}>
            Tentar novamente
          </button>
        </div>
      ) : null}
      {successMessage && (
        <p className="form-success" role="alert">
          {successMessage}
        </p>
      )}
      {isLoading ? <p role="status">Carregando notificações…</p> : null}
      {!isLoading && notifications.length === 0 ? (
        <p className="empty-state">Nenhuma notificação por enquanto.</p>
      ) : null}
      <ul className="notification-list">
        {notifications.map((notification) => {
          const unreadItem = notification.readAt === null;
          return (
            <li key={notification.id} className={unreadItem ? 'notification-unread' : ''}>
              <button
                className="notification-card"
                type="button"
                disabled={isSubmitting}
                onClick={() => void openNotification(notification)}
              >
                <span className="ticket-code">
                  {unreadItem ? 'Não lida' : 'Lida'} ·{' '}
                  {new Date(notification.createdAt).toLocaleString('pt-BR')}
                </span>
                <strong>{notification.title}</strong>
                <span>{notification.message}</span>
                {notification.ticketId ? <span>Abrir chamado relacionado</span> : null}
              </button>
              {unreadItem ? (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void markNotificationRead(notification)}
                >
                  Marcar como lida
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function NotificationBell({ onOpen }: { onOpen: () => void }) {
  const { token } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!token) return;
    getUnreadNotificationCount(token)
      .then(setUnread)
      .catch(() => setUnread(0));
  }, [token]);

  return (
    <button
      className="notification-bell"
      type="button"
      onClick={onOpen}
      aria-label="Abrir notificações"
    >
      <span aria-hidden="true">🔔</span>
      <span>Notificações</span>
      {unread > 0 ? <span className="notification-badge">{unread}</span> : null}
    </button>
  );
}

import { useCallback, useEffect, useState } from 'react';
import type { Notification } from '@supportflow/shared';

import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import {
  ApiError,
  getUnreadNotificationCount,
  listNotifications,
  readAllNotifications,
  readNotification,
} from '../services/api';

type Props = {
  onOpenTicket: (id: string) => void;
  /**
   * Mantem o contador do sino (NotificationBell) em dia. Sem isso, marcar uma
   * notificacao como lida deixava o badge exibindo o total antigo.
   */
  onUnreadChange: (count: number) => void;
};

export function NotificationsPanel({ onOpenTicket, onUnreadChange }: Props) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setMessage('');
    try {
      const [list, count] = await Promise.all([
        listNotifications(token, { page: 1, pageSize: 20 }),
        getUnreadNotificationCount(token),
      ]);
      setNotifications(list.items);
      setUnread(count);
      onUnreadChange(count);
    } catch (error) {
      const msg =
        error instanceof ApiError ? error.message : 'Não foi possível carregar as notificações.';
      setMessage(msg);
      showToast('error', msg);
    } finally {
      setIsLoading(false);
    }
  }, [onUnreadChange, showToast, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(notification: Notification) {
    if (!token || notification.readAt) return notification;
    const updated = await readNotification(token, notification.id);
    setNotifications((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    const remaining = Math.max(0, unread - 1);
    setUnread(remaining);
    onUnreadChange(remaining);
    return updated;
  }

  async function markNotificationRead(notification: Notification) {
    setIsSubmitting(true);
    setMessage('');
    try {
      await markRead(notification);
      showToast('success', 'Notificação marcada como lida.');
    } catch (error) {
      const msg =
        error instanceof ApiError ? error.message : 'Não foi possível atualizar a notificação.';
      setMessage(msg);
      showToast('error', msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function openNotification(notification: Notification) {
    setIsSubmitting(true);
    setMessage('');
    try {
      const updated = await markRead(notification);
      if (updated.ticketId) {
        onOpenTicket(updated.ticketId);
      }
    } catch (error) {
      const msg =
        error instanceof ApiError ? error.message : 'Não foi possível atualizar a notificação.';
      setMessage(msg);
      showToast('error', msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function markAllRead() {
    if (!token) return;
    setIsSubmitting(true);
    setMessage('');
    try {
      await readAllNotifications(token);
      setNotifications((current) =>
        current.map((item) => ({
          ...item,
          readAt: item.readAt ?? new Date().toISOString(),
        })),
      );
      setUnread(0);
      onUnreadChange(0);
      showToast('success', 'Todas as notificações foram marcadas como lidas.');
    } catch (error) {
      const msg =
        error instanceof ApiError ? error.message : 'Não foi possível marcar as notificações.';
      setMessage(msg);
      showToast('error', msg);
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
      {isLoading ? (
        <div className="skeleton-stack" aria-hidden="true">
          <div className="skeleton skeleton--title" />
          <div className="skeleton skeleton--block" />
        </div>
      ) : null}
      {!isLoading && notifications.length === 0 ? (
        <div className="empty-state-box">
          <h3>Nenhuma notificação</h3>
          <p className="supporting-text">
            Avisos sobre chamados atribuídos a você e respostas da equipe aparecem aqui.
          </p>
        </div>
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

export function NotificationBell({
  onOpen,
  unread,
  onUnreadChange,
}: {
  onOpen: () => void;
  unread: number;
  onUnreadChange: (count: number) => void;
}) {
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;
    getUnreadNotificationCount(token)
      .then(onUnreadChange)
      .catch(() => onUnreadChange(0));
  }, [onUnreadChange, token]);

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

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import type { Notification } from '@supportflow/shared';

import { AuthProvider, useAuth } from '../auth/AuthContext';
import { ToastProvider } from '../components/Toast';
import {
  getUnreadNotificationCount,
  listNotifications,
  loginRequest,
  meRequest,
  readAllNotifications,
  readNotification,
  setUnauthorizedHandler,
} from '../services/api';
import { NotificationBell, NotificationsPanel } from './NotificationsPanel';

/**
 * Prova de integracao do contador de notificacoes: o badge do sino e o painel
 * precisam compartilhar a mesma fonte de verdade. Antes, cada um mantinha o
 * proprio estado e marcar uma notificacao como lida nao atualizava o badge.
 */

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    loginRequest: vi.fn(),
    meRequest: vi.fn(),
    listNotifications: vi.fn(),
    getUnreadNotificationCount: vi.fn(),
    readNotification: vi.fn(),
    readAllNotifications: vi.fn(),
  };
});

const USUARIO = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Solicitante de Teste',
  email: 'solicitante@exemplo.invalid',
  role: 'requester' as const,
};

function notificacao(overrides: Partial<Notification> = {}): Notification {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    type: 'ticket_status_changed',
    ticketId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    title: 'Status atualizado: resolved',
    message: 'SF-0001: Impressora sem resposta',
    readAt: null,
    createdAt: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

function sessaoAutenticada() {
  vi.mocked(loginRequest).mockResolvedValue({ token: 'token-de-teste', user: USUARIO });
  vi.mocked(meRequest).mockResolvedValue(USUARIO);
}

/** Reproduz o arranjo da HomePage: sino e painel dividindo o contador. */
function PainelComSino() {
  const { user, isLoading, login } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) {
      void login('solicitante@exemplo.invalid', 'senha-de-teste').catch(() => undefined);
    }
  }, [login, user]);

  if (isLoading || !user) return <p>Preparando sessao</p>;
  return (
    <>
      <NotificationBell onOpen={() => undefined} unread={unread} onUnreadChange={setUnread} />
      <NotificationsPanel onOpenTicket={() => undefined} onUnreadChange={setUnread} />
    </>
  );
}

function renderizar() {
  return render(
    <AuthProvider>
      <ToastProvider>
        <PainelComSino />
      </ToastProvider>
    </AuthProvider>,
  );
}

describe('Notificacoes: contador compartilhado', () => {
  beforeEach(() => {
    setUnauthorizedHandler(null);
    sessaoAutenticada();
  });

  afterEach(() => {
    setUnauthorizedHandler(null);
    vi.resetAllMocks();
  });

  it('mostra no badge a quantidade de notificacoes nao lidas', async () => {
    vi.mocked(getUnreadNotificationCount).mockResolvedValue(2);
    vi.mocked(listNotifications).mockResolvedValue({
      items: [notificacao(), notificacao({ id: '33333333-3333-4333-8333-333333333333' })],
      page: 1,
      pageSize: 20,
      total: 2,
    });

    renderizar();

    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
    expect(screen.getAllByText(/Não lida/)).toHaveLength(2);
  });

  it('atualiza o badge ao marcar uma notificacao como lida', async () => {
    vi.mocked(getUnreadNotificationCount).mockResolvedValue(2);
    vi.mocked(listNotifications).mockResolvedValue({
      items: [notificacao(), notificacao({ id: '33333333-3333-4333-8333-333333333333' })],
      page: 1,
      pageSize: 20,
      total: 2,
    });
    vi.mocked(readNotification).mockResolvedValue(
      notificacao({ readAt: '2026-01-01T11:00:00.000Z' }),
    );

    renderizar();

    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());

    await userEvent.click(screen.getAllByRole('button', { name: 'Marcar como lida' })[0]);

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
    expect(vi.mocked(readNotification)).toHaveBeenCalledWith('token-de-teste', expect.any(String));
  });

  it('zera o badge ao marcar todas como lidas', async () => {
    vi.mocked(getUnreadNotificationCount).mockResolvedValue(2);
    vi.mocked(listNotifications).mockResolvedValue({
      items: [notificacao(), notificacao({ id: '33333333-3333-4333-8333-333333333333' })],
      page: 1,
      pageSize: 20,
      total: 2,
    });
    vi.mocked(readAllNotifications).mockResolvedValue(2);

    renderizar();

    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Marcar todas como lidas' }));

    await waitFor(() => expect(screen.queryByText('2')).not.toBeInTheDocument());
    expect(screen.getAllByText(/^Lida/)).toHaveLength(2);
  });

  it('mostra estado vazio quando nao ha notificacoes', async () => {
    vi.mocked(getUnreadNotificationCount).mockResolvedValue(0);
    vi.mocked(listNotifications).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });

    renderizar();

    expect(await screen.findByText('Nenhuma notificação')).toBeInTheDocument();
    expect(
      screen.queryByText('Notificações', { selector: '.notification-badge' }),
    ).not.toBeInTheDocument();
  });
});

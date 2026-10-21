import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import type { TicketDetail, TicketListItem } from '@supportflow/shared';

import { AuthProvider, useAuth } from '../auth/AuthContext';
import { ToastProvider } from '../components/Toast';
import {
  ApiError,
  getTicket,
  listAssignableUsers,
  listTickets,
  loginRequest,
  meRequest,
  setUnauthorizedHandler,
} from '../services/api';
import { TicketsPage } from './TicketsPage';

/**
 * Prova de integracao da listagem de chamados: busca no servidor, estados de
 * loading/vazio/erro com retentativa, toast de erro e navegacao para o
 * detalhe. A API e simulada no limite da tela (services/api), que e onde
 * mora o contrato com o backend.
 */

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    loginRequest: vi.fn(),
    meRequest: vi.fn(),
    listTickets: vi.fn(),
    getTicket: vi.fn(),
    listAssignableUsers: vi.fn(),
  };
});

const USUARIO = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Gestora de Teste',
  email: 'gestora@exemplo.invalid',
  role: 'manager' as const,
};

const CHAMADO: TicketListItem = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  code: 'SF-0001',
  title: 'Impressora sem resposta',
  status: 'open',
  priority: 'high',
  category: { id: 'c', name: 'Hardware' },
  requester: { id: 'r', name: 'Requerente' },
  assignee: null,
  openedAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
  version: 1,
};

const DETALHE: TicketDetail = {
  ...CHAMADO,
  description: 'Nao imprime',
  firstResponseAt: null,
  resolvedAt: null,
  closedAt: null,
  slaFirstResponseDueAt: null,
  slaResolutionDueAt: null,
  comments: [],
  events: [],
  sla: {
    firstResponse: { dueAt: null, completedAt: null, status: 'pending', remainingMinutes: null },
    resolution: { dueAt: null, completedAt: null, status: 'pending', remainingMinutes: null },
  },
};

function sessaoAutenticada() {
  vi.mocked(loginRequest).mockResolvedValue({ token: 'token-de-teste', user: USUARIO });
  vi.mocked(meRequest).mockResolvedValue(USUARIO);
}

function SessaoComApp() {
  const { user, isLoading, login } = useAuth();

  useEffect(() => {
    if (!user) {
      void login('gestora@exemplo.invalid', 'senha-de-teste').catch(() => undefined);
    }
  }, [login, user]);

  if (isLoading || !user) return <p>Preparando sessao</p>;
  return <TicketsPage />;
}

function renderizar() {
  return render(
    <AuthProvider>
      <ToastProvider>
        <SessaoComApp />
      </ToastProvider>
    </AuthProvider>,
  );
}

describe('TicketsPage: listagem integrada', () => {
  beforeEach(() => {
    setUnauthorizedHandler(null);
    sessaoAutenticada();
    vi.mocked(listAssignableUsers).mockResolvedValue([]);
  });

  afterEach(() => {
    setUnauthorizedHandler(null);
    // resetAllMocks descarta as implementacoes "once" enfileiradas: um teste
    // que falha antes de consumir a fila nao pode vazar estado para o
    // seguinte.
    vi.resetAllMocks();
  });

  it('mostra o skeleton enquanto carrega e depois a tabela', async () => {
    let liberar: (() => void) | undefined;
    const pendente = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    vi.mocked(listTickets).mockImplementation(async () => {
      await pendente;
      return { items: [CHAMADO], page: 1, pageSize: 10, total: 1 };
    });

    const { container } = renderizar();

    await waitFor(() => expect(container.querySelector('.skeleton-stack')).not.toBeNull());

    liberar?.();

    expect(await screen.findByRole('table')).toBeInTheDocument();
    const tabela = screen.getByRole('table');
    expect(within(tabela).getByText('Impressora sem resposta')).toBeInTheDocument();
    expect(within(tabela).getByText('SF-0001')).toBeInTheDocument();
    expect(container.querySelector('.skeleton-stack')).toBeNull();
  });

  it('mostra estado vazio com chamada para abrir chamado', async () => {
    vi.mocked(listTickets).mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });

    renderizar();

    expect(await screen.findByText('Nenhum chamado ainda')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir chamado' })).toBeInTheDocument();
  });

  it('mostra erro com botao de retentativa e dispara toast', async () => {
    vi.mocked(listTickets)
      .mockRejectedValueOnce(new ApiError(500, 'Falha ao carregar chamados.'))
      .mockResolvedValueOnce({ items: [CHAMADO], page: 1, pageSize: 10, total: 1 });

    renderizar();

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Falha ao carregar chamados.');
    // A mensagem aparece no alerta e tambem no toast de erro.
    expect(await screen.findAllByText('Falha ao carregar chamados.')).not.toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(vi.mocked(listTickets)).toHaveBeenCalledTimes(2);
  });

  it('envia o termo de busca ao servidor', async () => {
    vi.mocked(listTickets).mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });

    renderizar();
    await screen.findByText('Nenhum chamado ainda');

    await userEvent.type(screen.getByLabelText('Buscar'), 'impressora');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => {
      expect(vi.mocked(listTickets)).toHaveBeenCalledWith(
        'token-de-teste',
        expect.objectContaining({ search: 'impressora' }),
      );
    });
  });

  it('filtra por status e prioridade tambem no servidor', async () => {
    vi.mocked(listTickets).mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });

    renderizar();
    await screen.findByText('Nenhum chamado ainda');

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'in_progress');
    await waitFor(() => {
      expect(vi.mocked(listTickets)).toHaveBeenCalledWith(
        'token-de-teste',
        expect.objectContaining({ status: 'in_progress' }),
      );
    });

    await userEvent.selectOptions(screen.getByLabelText('Prioridade'), 'critical');
    await waitFor(() => {
      expect(vi.mocked(listTickets)).toHaveBeenCalledWith(
        'token-de-teste',
        expect.objectContaining({ priority: 'critical' }),
      );
    });
  });

  it('limpa os filtros aplicados', async () => {
    vi.mocked(listTickets).mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });

    renderizar();
    await screen.findByText('Nenhum chamado ainda');

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'resolved');
    await waitFor(() => {
      expect(vi.mocked(listTickets)).toHaveBeenCalledWith(
        'token-de-teste',
        expect.objectContaining({ status: 'resolved' }),
      );
    });

    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));

    await waitFor(() => {
      const ultima = vi.mocked(listTickets).mock.calls.at(-1)?.[1];
      expect(ultima?.status).toBe('');
      expect(ultima?.priority).toBe('');
      expect(ultima?.search).toBe('');
    });
  });

  it('abre o detalhe do chamado ao clicar no titulo', async () => {
    vi.mocked(listTickets).mockResolvedValue({ items: [CHAMADO], page: 1, pageSize: 10, total: 1 });
    vi.mocked(getTicket).mockResolvedValue(DETALHE);

    renderizar();

    const tabela = await screen.findByRole('table');
    await userEvent.click(within(tabela).getByText('Impressora sem resposta'));

    expect(
      await screen.findByRole('heading', { name: 'Impressora sem resposta' }),
    ).toBeInTheDocument();
  });
});

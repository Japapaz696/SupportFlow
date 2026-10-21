import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import type { AssignableUser, TicketComment, TicketDetail } from '@supportflow/shared';

import { AuthProvider, useAuth } from '../auth/AuthContext';
import { ToastProvider } from '../components/Toast';
import {
  addComment,
  ApiError,
  assignTicket,
  getTicket,
  getTicketTechnicalDiagnostic,
  listAssignableUsers,
  loginRequest,
  meRequest,
  setUnauthorizedHandler,
} from '../services/api';
import { TicketDetailPage } from './TicketDetailPage';

/**
 * Prova de integracao do detalhe do chamado: seletor de responsavel
 * (somente gestor/admin), validacao de comentario, toast de sucesso/erro,
 * protecao contra envio duplicado e tratamento de 403 da API.
 */

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    loginRequest: vi.fn(),
    meRequest: vi.fn(),
    getTicket: vi.fn(),
    getTicketTechnicalDiagnostic: vi.fn(),
    listAssignableUsers: vi.fn(),
    addComment: vi.fn(),
    assignTicket: vi.fn(),
  };
});

const GESTOR = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Gestora de Teste',
  email: 'gestora@exemplo.invalid',
  role: 'manager' as const,
};

const AGENTE = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Agente de Teste',
  email: 'agente@exemplo.invalid',
  role: 'agent' as const,
};

const AGENTES: AssignableUser[] = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Agente Disponivel',
    email: 'a1@exemplo.invalid',
    role: 'agent',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Agente Secundario',
    email: 'a2@exemplo.invalid',
    role: 'agent',
  },
];

const CHAMADO: TicketDetail = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  code: 'SF-0001',
  title: 'Impressora sem resposta',
  description: 'A impressora do terceiro andar nao imprime.',
  status: 'open',
  priority: 'high',
  category: { id: 'c', name: 'Hardware' },
  requester: { id: 'r', name: 'Requerente' },
  assignee: null,
  openedAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
  version: 1,
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

const COMENTARIO: TicketComment = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  author: { id: 'g', name: 'Gestora de Teste' },
  body: 'Ja verificamos o cabo de rede.',
  visibility: 'public',
  createdAt: '2026-01-02T10:00:00.000Z',
};

function sessao(usuario: typeof GESTOR | typeof AGENTE) {
  vi.mocked(loginRequest).mockResolvedValue({ token: 'token-de-teste', user: usuario });
  vi.mocked(meRequest).mockResolvedValue(usuario);
}

function SessaoComApp() {
  const { user, isLoading, login } = useAuth();

  useEffect(() => {
    if (!user) {
      void login('usuario@exemplo.invalid', 'senha-de-teste').catch(() => undefined);
    }
  }, [login, user]);

  if (isLoading || !user) return <p>Preparando sessao</p>;
  return <TicketDetailPage id={CHAMADO.id} onBack={() => undefined} onChanged={() => undefined} />;
}

function renderizar(usuario: typeof GESTOR | typeof AGENTE = GESTOR) {
  sessao(usuario);
  return render(
    <AuthProvider>
      <ToastProvider>
        <SessaoComApp />
      </ToastProvider>
    </AuthProvider>,
  );
}

describe('TicketDetailPage: integracao do detalhe', () => {
  beforeEach(() => {
    setUnauthorizedHandler(null);
    sessao(GESTOR);
    vi.mocked(getTicket).mockResolvedValue(CHAMADO);
    vi.mocked(getTicketTechnicalDiagnostic).mockResolvedValue(null);
    vi.mocked(listAssignableUsers).mockResolvedValue(AGENTES);
  });

  afterEach(() => {
    setUnauthorizedHandler(null);
    vi.resetAllMocks();
  });

  it('lista os agentes ativos no seletor de responsavel', async () => {
    renderizar(GESTOR);

    const seletor = await screen.findByLabelText('Responsável');
    expect(seletor).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Agente Disponivel' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Agente Secundario' })).toBeInTheDocument();
    expect(vi.mocked(listAssignableUsers)).toHaveBeenCalledWith('token-de-teste');
  });

  it('nao mostra o seletor de responsavel para agente', async () => {
    renderizar(AGENTE);

    await screen.findByRole('heading', { name: 'Impressora sem resposta' });
    expect(screen.queryByLabelText('Responsável')).toBeNull();
    expect(screen.getByRole('button', { name: 'Assumir para mim' })).toBeInTheDocument();
    expect(vi.mocked(listAssignableUsers)).not.toHaveBeenCalled();
  });

  it('salva o responsavel escolhido e mostra toast de sucesso', async () => {
    vi.mocked(assignTicket).mockResolvedValue({
      ...CHAMADO,
      assignee: { id: AGENTES[0].id, name: AGENTES[0].name },
    });

    renderizar(GESTOR);

    const seletor = await screen.findByLabelText('Responsável');
    await userEvent.selectOptions(seletor, AGENTES[0].id);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar responsável' }));

    await waitFor(() => {
      expect(vi.mocked(assignTicket)).toHaveBeenCalledWith(
        'token-de-teste',
        CHAMADO.id,
        AGENTES[0].id,
      );
    });
    expect(await screen.findByText('Responsável atualizado.')).toBeInTheDocument();
  });

  it('trata 403 da API com mensagem visivel e toast de erro', async () => {
    vi.mocked(assignTicket).mockRejectedValue(
      new ApiError(403, 'Apenas gestores podem reatribuir chamados.'),
    );

    renderizar(GESTOR);

    const seletor = await screen.findByLabelText('Responsável');
    await userEvent.selectOptions(seletor, AGENTES[0].id);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar responsável' }));

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Apenas gestores podem reatribuir chamados.');
    expect(
      await screen.findAllByText('Apenas gestores podem reatribuir chamados.'),
    ).not.toHaveLength(0);
  });

  it('exige comentario com pelo menos 2 caracteres e nao chama a API', async () => {
    renderizar(GESTOR);

    const campo = await screen.findByLabelText('Novo comentário');
    await userEvent.type(campo, 'a');
    await userEvent.click(screen.getByRole('button', { name: 'Comentar' }));

    expect(await screen.findByText('Escreva ao menos 2 caracteres.')).toBeInTheDocument();
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(vi.mocked(addComment)).not.toHaveBeenCalled();
  });

  it('publica o comentario e mostra toast de sucesso', async () => {
    vi.mocked(addComment).mockResolvedValue(COMENTARIO);
    renderizar(GESTOR);

    const campo = await screen.findByLabelText('Novo comentário');
    await userEvent.type(campo, 'Ja verificamos o cabo de rede.');
    await userEvent.click(screen.getByRole('button', { name: 'Comentar' }));

    await waitFor(() => {
      expect(vi.mocked(addComment)).toHaveBeenCalledWith('token-de-teste', CHAMADO.id, {
        body: 'Ja verificamos o cabo de rede.',
        visibility: 'public',
      });
    });
    expect(await screen.findByText('Comentário publicado.')).toBeInTheDocument();
    expect(campo).toHaveValue('');
  });

  it('impede envio duplicado enquanto a requisicao esta em andamento', async () => {
    let liberar: (() => void) | undefined;
    const pendente = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    vi.mocked(addComment).mockImplementation(async () => {
      await pendente;
      return COMENTARIO;
    });

    renderizar(GESTOR);

    const campo = await screen.findByLabelText('Novo comentário');
    await userEvent.type(campo, 'Comentario unico para nao duplicar.');
    await userEvent.click(screen.getByRole('button', { name: 'Comentar' }));

    const botao = await screen.findByRole('button', { name: 'Enviando…' });
    expect(botao).toBeDisabled();

    await userEvent.click(botao);
    expect(vi.mocked(addComment)).toHaveBeenCalledTimes(1);

    liberar?.();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Comentar' })).toBeEnabled());
  });
});

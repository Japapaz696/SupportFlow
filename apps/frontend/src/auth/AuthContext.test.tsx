import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuthProvider, useAuth } from '../auth/AuthContext';
import { setUnauthorizedHandler } from '../services/api';

type Resposta = { status: number; body?: unknown; texto?: string };

function mockFetch(resposta: Resposta) {
  const spy = vi.fn().mockImplementation(async () => {
    const texto =
      resposta.texto ?? (resposta.body === undefined ? '' : JSON.stringify(resposta.body));
    return {
      ok: resposta.status >= 200 && resposta.status < 300,
      status: resposta.status,
      json: async () => (resposta.body === undefined ? JSON.parse('null') : resposta.body),
      text: async () => texto,
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

const USUARIO = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Pessoa de Teste',
  email: 'teste@exemplo.invalid',
  role: 'requester' as const,
  isActive: true,
};

function Painel() {
  const { user, isLoading, sessionNotice, login, logout } = useAuth();
  return (
    <div>
      <p data-testid="estado">{isLoading ? 'carregando' : 'pronto'}</p>
      <p data-testid="usuario">{user ? user.name : 'sem usuario'}</p>
      <p data-testid="aviso">{sessionNotice || 'sem aviso'}</p>
      <button
        type="button"
        onClick={() => {
          // O login pode rejeitar; a tela de login real trata o erro.
          void login('a@b.c', 'senha-de-teste').catch(() => undefined);
        }}
      >
        entrar
      </button>
      <button type="button" onClick={() => void logout()}>
        sair
      </button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    setUnauthorizedHandler(null);
  });

  afterEach(() => {
    setUnauthorizedHandler(null);
    vi.unstubAllGlobals();
  });

  it('comeca sem usuario e fora de carregamento', () => {
    mockFetch({ status: 200, body: {} });
    render(
      <AuthProvider>
        <Painel />
      </AuthProvider>,
    );

    expect(screen.getByTestId('estado')).toHaveTextContent('pronto');
    expect(screen.getByTestId('usuario')).toHaveTextContent('sem usuario');
  });

  it('guarda o usuario depois do login', async () => {
    mockFetch({ status: 200, body: { token: 'token-de-teste', user: USUARIO } });
    const usuario = userEvent.setup();

    render(
      <AuthProvider>
        <Painel />
      </AuthProvider>,
    );

    await usuario.click(screen.getByRole('button', { name: 'entrar' }));

    await waitFor(() => {
      expect(screen.getByTestId('usuario')).toHaveTextContent(USUARIO.name);
    });
  });

  it('nao guarda o usuario quando o login falha', async () => {
    mockFetch({ status: 401, body: { error: { message: 'Invalid email or password' } } });
    const usuario = userEvent.setup();

    render(
      <AuthProvider>
        <Painel />
      </AuthProvider>,
    );

    await usuario.click(screen.getByRole('button', { name: 'entrar' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    expect(screen.getByTestId('usuario')).toHaveTextContent('sem usuario');
  });

  it('encerra a sessao e avisa quando a API responde 401', async () => {
    const fetchSpy = mockFetch({ status: 200, body: { token: 'token-de-teste', user: USUARIO } });
    const usuario = userEvent.setup();

    render(
      <AuthProvider>
        <Painel />
      </AuthProvider>,
    );

    await usuario.click(screen.getByRole('button', { name: 'entrar' }));
    await waitFor(() => {
      expect(screen.getByTestId('usuario')).toHaveTextContent(USUARIO.name);
    });

    // O token expira: a proxima chamada autenticada volta 401.
    fetchSpy.mockImplementation(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Authentication is required' } }),
      text: async () => JSON.stringify({ error: { message: 'Authentication is required' } }),
    })) as unknown as typeof fetch;

    const { listNotifications } = await import('../services/api');
    await expect(listNotifications('token-expirado', { page: 1, pageSize: 20 })).rejects.toThrow();

    await waitFor(() => {
      expect(screen.getByTestId('usuario')).toHaveTextContent('sem usuario');
    });
    expect(screen.getByTestId('aviso')).toHaveTextContent('sessao expirou');
  });

  it('limpa a sessao ao sair, mesmo se o servidor falhar', async () => {
    const fetchSpy = mockFetch({ status: 200, body: { token: 'token-de-teste', user: USUARIO } });
    const usuario = userEvent.setup();

    render(
      <AuthProvider>
        <Painel />
      </AuthProvider>,
    );

    await usuario.click(screen.getByRole('button', { name: 'entrar' }));
    await waitFor(() => {
      expect(screen.getByTestId('usuario')).toHaveTextContent(USUARIO.name);
    });

    // A partir de agora, o logout falha.
    fetchSpy.mockImplementation(async () => {
      throw new Error('rede indisponivel');
    });

    await usuario.click(screen.getByRole('button', { name: 'sair' }));

    await waitFor(() => {
      expect(screen.getByTestId('usuario')).toHaveTextContent('sem usuario');
    });
  });

  it('limpa o aviso de sessao expirada quando o usuario entra de novo', async () => {
    mockFetch({ status: 200, body: { token: 'token-de-teste', user: USUARIO } });
    const usuario = userEvent.setup();

    render(
      <AuthProvider>
        <Painel />
      </AuthProvider>,
    );

    await usuario.click(screen.getByRole('button', { name: 'entrar' }));
    await waitFor(() => {
      expect(screen.getByTestId('usuario')).toHaveTextContent(USUARIO.name);
    });
    expect(screen.getByTestId('aviso')).toHaveTextContent('sem aviso');
  });
});

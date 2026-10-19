import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuthProvider } from '../auth/AuthContext';
import { setUnauthorizedHandler } from '../services/api';
import { LoginPage } from './LoginPage';

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

function renderizar() {
  return render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    setUnauthorizedHandler(null);
  });

  afterEach(() => {
    setUnauthorizedHandler(null);
    vi.unstubAllGlobals();
  });

  it('mostra os campos de e-mail e senha com rotulos', () => {
    mockFetch({ status: 200, body: {} });
    renderizar();

    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('marca o e-mail como campo de usuario e a senha como atual', () => {
    mockFetch({ status: 200, body: {} });
    renderizar();

    expect(screen.getByLabelText('E-mail')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('autocomplete', 'current-password');
  });

  it('exige no minimo 12 caracteres na senha', () => {
    mockFetch({ status: 200, body: {} });
    renderizar();

    expect(screen.getByLabelText('Senha')).toHaveAttribute('minlength', '12');
  });

  it('mostra a mensagem do servidor quando o login falha', async () => {
    mockFetch({ status: 401, body: { error: { message: 'Invalid email or password' } } });
    const usuario = userEvent.setup();
    renderizar();

    await usuario.type(screen.getByLabelText('E-mail'), 'teste@exemplo.invalid');
    await usuario.type(screen.getByLabelText('Senha'), 'senha-de-teste-123');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password');
    });
  });

  it('desabilita o formulario enquanto envia', async () => {
    // O resolver fica numa caixa propria para o TypeScript nao estreitar o
    // tipo para "never" depois do primeiro await.
    const controle: { resolver: (() => void) | null } = { resolver: null };
    const spy = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          controle.resolver = () =>
            resolve({
              ok: true,
              status: 200,
              json: async () => ({ token: 't', user: USUARIO }),
              text: async () => '{}',
            } as unknown as Response);
        }),
    );
    vi.stubGlobal('fetch', spy);
    const usuario = userEvent.setup();
    renderizar();

    await usuario.type(screen.getByLabelText('E-mail'), 'teste@exemplo.invalid');
    await usuario.type(screen.getByLabelText('Senha'), 'senha-de-teste-123');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Entrando…' })).toBeDisabled();
    });
    expect(screen.getByLabelText('E-mail')).toBeDisabled();

    controle.resolver?.();
  });

  it('avisa que a sessao expirou quando a API responde 401 depois do login', async () => {
    const spy = mockFetch({ status: 200, body: { token: 'token-de-teste', user: USUARIO } });
    const usuario = userEvent.setup();
    renderizar();

    await usuario.type(screen.getByLabelText('E-mail'), 'teste@exemplo.invalid');
    await usuario.type(screen.getByLabelText('Senha'), 'senha-de-teste-123');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(spy).toHaveBeenCalled();
    });

    // Agora o token expira e a API responde 401.
    spy.mockImplementation(
      async () =>
        ({
          ok: false,
          status: 401,
          json: async () => ({ error: { message: 'Authentication is required' } }),
          text: async () => '{"error":{"message":"Authentication is required"}}',
        }) as unknown as Response,
    );

    const { listNotifications } = await import('../services/api');
    await listNotifications('token-de-teste', { page: 1, pageSize: 20 }).catch(() => undefined);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('sessao expirou');
    });
  });
});

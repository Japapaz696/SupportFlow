import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { ApiError, setUnauthorizedHandler } from './api';

const BASE = '/api/v1';

type Resposta = {
  status: number;
  body?: unknown;
  texto?: string;
};

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

describe('camada de API', () => {
  beforeEach(() => {
    setUnauthorizedHandler(null);
  });

  afterEach(() => {
    setUnauthorizedHandler(null);
    vi.unstubAllGlobals();
  });

  it('monta a URL com o prefixo da API', async () => {
    const fetchSpy = mockFetch({ status: 200, body: { categories: [] } });
    const { listCategories } = await import('./api');

    await listCategories('token-de-teste');

    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE}/categories`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('envia o token no cabecalho Authorization', async () => {
    const fetchSpy = mockFetch({ status: 200, body: { categories: [] } });
    const { listCategories } = await import('./api');

    await listCategories('token-de-teste');

    const [, opcoes] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = opcoes.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer token-de-teste');
  });

  it('nao envia Content-Type em requisicoes sem corpo', async () => {
    const fetchSpy = mockFetch({ status: 200, body: { categories: [] } });
    const { listCategories } = await import('./api');

    await listCategories('token-de-teste');

    const [, opcoes] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((opcoes.headers as Headers).get('Content-Type')).toBeNull();
  });

  it('envia Content-Type quando ha corpo', async () => {
    const fetchSpy = mockFetch({ status: 201, body: { category: { id: '1' } } });
    const { createCategory } = await import('./api');

    await createCategory('token', { name: 'Falha', description: null, defaultPriority: 'high' });

    const [, opcoes] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((opcoes.headers as Headers).get('Content-Type')).toBe('application/json');
  });

  it('lanca ApiError com a mensagem do servidor', async () => {
    mockFetch({ status: 400, body: { error: { message: 'categoryId must be a valid UUID' } } });
    const { createCategory } = await import('./api');

    await expect(
      createCategory('token', { name: 'x', description: null, defaultPriority: 'high' }),
    ).rejects.toThrowError('categoryId must be a valid UUID');
  });

  it('usa a mensagem generica quando a resposta nao e JSON', async () => {
    mockFetch({ status: 502, texto: '<html>gateway</html>' });
    const { listCategories } = await import('./api');

    await expect(listCategories('token')).rejects.toThrowError(
      'Não foi possível concluir a solicitação.',
    );
  });

  it('preserva o codigo de status no ApiError', async () => {
    mockFetch({ status: 403, body: { error: { message: 'Sem permissao' } } });
    const { listCategories } = await import('./api');

    await expect(listCategories('token')).rejects.toMatchObject({ status: 403 });
  });

  it('devolve undefined em respostas 204', async () => {
    mockFetch({ status: 204 });
    const { logoutRequest } = await import('./api');

    await expect(logoutRequest('token')).resolves.toBeUndefined();
  });

  it('avisa sobre sessao expirada quando a API responde 401', async () => {
    const avisado = vi.fn();
    setUnauthorizedHandler(avisado);
    mockFetch({ status: 401, body: { error: { message: 'Authentication is required' } } });
    const { listCategories } = await import('./api');

    await expect(listCategories('token')).rejects.toThrow();
    expect(avisado).toHaveBeenCalledTimes(1);
  });

  it('nao avisa sobre sessao expirada quando o login falha', async () => {
    // Credencial errada no login responde 401, mas a sessao nao expirou.
    const avisado = vi.fn();
    setUnauthorizedHandler(avisado);
    mockFetch({ status: 401, body: { error: { message: 'Invalid email or password' } } });
    const { loginRequest } = await import('./api');

    await expect(loginRequest('a@b.c', 'errada')).rejects.toThrow();
    expect(avisado).not.toHaveBeenCalled();
  });

  it('nao avisa quando a requisicao deu certo', async () => {
    const avisado = vi.fn();
    setUnauthorizedHandler(avisado);
    mockFetch({ status: 200, body: { categories: [] } });
    const { listCategories } = await import('./api');

    await listCategories('token');
    expect(avisado).not.toHaveBeenCalled();
  });

  it('mantem a lista de chamados paginada', async () => {
    mockFetch({ status: 200, body: { items: [], page: 1, pageSize: 20, total: 0 } });
    const { listTickets } = await import('./api');

    const resultado = await listTickets('token', { page: 2, pageSize: 10, status: 'open' });

    expect(resultado.total).toBe(0);
    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toContain('page=2');
    expect(url).toContain('pageSize=10');
    expect(url).toContain('status=open');
  });

  it('nao envia filtro vazio de status', async () => {
    mockFetch({ status: 200, body: { items: [], page: 1, pageSize: 20, total: 0 } });
    const { listTickets } = await import('./api');

    await listTickets('token', { page: 1, pageSize: 20 });

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).not.toContain('status=');
  });
});

describe('classe ApiError', () => {
  it('guarda o status e a mensagem', () => {
    const erro = new ApiError(422, 'campo invalido');
    expect(erro).toBeInstanceOf(Error);
    expect(erro.status).toBe(422);
    expect(erro.message).toBe('campo invalido');
    expect(erro.name).toBe('ApiError');
  });
});

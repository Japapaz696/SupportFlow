#!/usr/bin/env node
// Demonstra o fluxo completo do SupportFlow contra um servidor em execucao.
//
//   DEMO_URL=http://localhost:3000 \
//   DEMO_EMAIL=admin@example.com \
//   DEMO_PASSWORD=... \
//   node scripts/demo-fluxo.mjs
//
// Cria os dados de apoio que faltam (categoria e politica SLA), exercita o
// fluxo e imprime um relatorio. Nao imprime dados pessoais nem tokens.

const BASE = (process.env.DEMO_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const EMAIL = process.env.DEMO_EMAIL;
const PASSWORD = process.env.DEMO_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('Defina DEMO_EMAIL e DEMO_PASSWORD.');
  process.exit(1);
}

const relatorio = {};

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const texto = await response.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = texto.slice(0, 120);
  }
  return { status: response.status, json };
}

function registrar(nome, ok, detalhe) {
  relatorio[nome] = ok ? `OK (${detalhe})` : `FALHA (${detalhe})`;
}

const health = await api('/health');
registrar('GET /health', health.status === 200, health.status);

const loginInvalido = await api('/api/v1/auth/login', {
  method: 'POST',
  body: { email: EMAIL, password: 'senha-errada-de-proposito' },
});
registrar('login com senha errada', loginInvalido.status === 401, loginInvalido.status);

const login = await api('/api/v1/auth/login', {
  method: 'POST',
  body: { email: EMAIL, password: PASSWORD },
});
const token = login.json?.token ?? login.json?.accessToken;
registrar('login com senha correta', login.status === 200 && Boolean(token), login.status);
if (!token) {
  console.log(JSON.stringify(relatorio, null, 2));
  process.exit(1);
}

const semToken = await api('/api/v1/tickets');
registrar('rota protegida sem token', semToken.status === 401, semToken.status);

const tokenInvalido = await api('/api/v1/tickets', { token: 'token.invalido' });
registrar('token invalido', tokenInvalido.status === 401, tokenInvalido.status);

// Uma instalacao nova nao tem categorias nem politica SLA; o administrador
// cria pelas rotas de administracao.
const categoriasResposta = await api('/api/v1/categories', { token });
let categorias = categoriasResposta.json?.categories ?? [];
registrar(
  'GET /categories',
  categoriasResposta.status === 200,
  `${categorias.length} categoria(s)`,
);

if (categorias.length === 0) {
  const criada = await api('/api/v1/categories', {
    method: 'POST',
    token,
    body: {
      name: 'Incidente de software',
      description: 'Falhas e indisponibilidades do sistema.',
      defaultPriority: 'high',
    },
  });
  categorias = criada.json?.category ? [criada.json.category] : [];
  registrar('POST /categories', criada.status === 201, criada.status);
}

const politicasResposta = await api('/api/v1/sla-policies', { token });
if ((politicasResposta.json?.policies ?? []).length === 0) {
  const politica = await api('/api/v1/sla-policies', {
    method: 'POST',
    token,
    body: { priority: 'high', firstResponseMinutes: 60, resolutionMinutes: 480 },
  });
  registrar('POST /sla-policies', politica.status === 201, politica.status);
} else {
  registrar('politica SLA ja existente', true, 'reaproveitada');
}

const categoriaId = categorias[0]?.id;
let ticketId = null;
if (categoriaId) {
  const criado = await api('/api/v1/tickets', {
    method: 'POST',
    token,
    body: {
      title: 'Falha de demonstracao',
      description: 'Ticket criado pelo script de demonstracao do fluxo completo.',
      categoryId: categoriaId,
      priority: 'high',
    },
  });
  ticketId = criado.json?.ticket?.id ?? criado.json?.id ?? null;
  registrar('POST /tickets', criado.status === 201, criado.status);
} else {
  registrar('POST /tickets', false, 'sem categoria disponivel');
}

const listagem = await api('/api/v1/tickets', { token });
const itens =
  listagem.json?.items ??
  listagem.json?.tickets ??
  (Array.isArray(listagem.json) ? listagem.json : []);
registrar(
  'GET /tickets',
  listagem.status === 200,
  `${itens.length} ticket(s) de ${listagem.json?.total ?? itens.length}`,
);

if (ticketId) {
  const detalhe = await api(`/api/v1/tickets/${ticketId}`, { token });
  registrar('GET /tickets/:id', detalhe.status === 200, detalhe.status);

  const comentario = await api(`/api/v1/tickets/${ticketId}/comments`, {
    method: 'POST',
    token,
    body: { body: 'Comentario de demonstracao.' },
  });
  registrar('POST /tickets/:id/comments', comentario.status === 201, comentario.status);

  const diagnostico = await api(`/api/v1/tickets/${ticketId}/technical-diagnostic`, { token });
  registrar(
    'GET /tickets/:id/technical-diagnostic',
    diagnostico.status === 200,
    diagnostico.status,
  );
}

const dashboard = await api('/api/v1/dashboard/summary', { token });
registrar('GET /dashboard/summary', dashboard.status === 200, dashboard.status);

const notificacoes = await api('/api/v1/notifications', { token });
registrar('GET /notifications', notificacoes.status === 200, notificacoes.status);

const usuarios = await api('/api/v1/users', { token });
registrar('GET /users', usuarios.status === 200, usuarios.status);

// Payload com campo desconhecido deve ser rejeitado: o cliente nao decide
// status, actor_id nem prazo de SLA.
const campoExtra = await api('/api/v1/tickets', {
  method: 'POST',
  token,
  body: {
    title: 'x',
    description: 'y',
    categoryId: categoriaId,
    priority: 'high',
    status: 'closed',
    actor_id: '00000000-0000-0000-0000-000000000000',
  },
});
registrar('payload com campo desconhecido', campoExtra.status === 400, campoExtra.status);

const inexistente = await api('/api/v1/rota-que-nao-existe');
registrar('rota inexistente', inexistente.status === 404, inexistente.status);

console.log(JSON.stringify(relatorio, null, 2));

const falhas = Object.entries(relatorio).filter(([, valor]) => String(valor).startsWith('FALHA'));
const total = Object.keys(relatorio).length;
console.log(`\n${total - falhas.length}/${total} verificacoes OK`);
process.exitCode = falhas.length ? 1 : 0;

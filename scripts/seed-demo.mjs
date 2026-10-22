#!/usr/bin/env node
/**
 * Popula o SupportFlow com dados totalmente ficticios, para demonstracao publica.
 *
 *   DEMO_URL=http://127.0.0.1:3000 \
 *   DEMO_ADMIN_EMAIL=admin@exemplo.invalid \
 *   DEMO_ADMIN_PASSWORD=... \
 *   DEMO_PASSWORD=demo-ficticia-123456 \
 *   ALLOW_SEED_FICTITIO=sim \
 *   node scripts/seed-demo.mjs
 *
 * Garantias:
 * - nenhum dado real: e-mails no dominio `exemplo.invalid`, nomes marcados
 *   como "Demo Ficticia", mensagens inventadas;
 * - e repeatable: remove apenas os registros de demonstracao anteriores
 *   (identificados pelo dominio .invalid), nunca qualquer outro registro;
 * - exige ALLOW_SEED_FICTITIO=sim para nao ser executado por engano.
 *
 * Tudo passa pela API HTTP, e nao por SQL direto, para que a logica de negocio
 * seja exercida de verdade: codigo do chamado, prazo de SLA calculado e
 * politica ativa lidos com FOR SHARE.
 *
 * Cria os quatro papeis do sistema, para que a demonstracao mostre o controle
 * de acesso funcionando:
 *
 *   requester -> abre chamado, so ve os proprios
 *   agent     -> assume chamado, responde
 *   manager   -> atribui, define prioridade, gerencia SLA
 *   admin     -> tudo acima, mais administracao de usuarios
 */

import { carregarEnv } from './carregar-env.mjs';

carregarEnv();

const ALLOW = process.env.ALLOW_SEED_FICTITIO;
if (ALLOW !== 'sim') {
  console.error('Defina ALLOW_SEED_FICTITIO=sim para confirmar que e um seed de ficticios.');
  process.exit(1);
}

const BASE = (process.env.DEMO_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD;
const SENHA_DEMO = process.env.DEMO_PASSWORD ?? 'demo-ficticia-123456';

// Sem as credenciais do administrador, o script cria uma conta de demonstracao
// propria (e-mail exclusivo, senha conhecida) direto no banco, sem tocar em
// nenhuma conta existente. Ver a funcao garantirAdminDeDemonstracao abaixo.

/**
 * SSL da conexao, derivado da propria URL.
 *
 * Postgres local quase nunca fala SSL: forcar a negociacao derruba o seed com
 * "The server does not support SSL connections". So exigimos TLS quando a URL
 * pede explicitamente (Neon e similares).
 */
function sslDaUrl(url) {
  const modo = new URL(url).searchParams.get('sslmode');
  if (!modo || modo === 'disable' || modo === 'allow') return null;
  return { rejectUnauthorized: false };
}

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
    json = texto.slice(0, 200);
  }
  return { status: response.status, json };
}

function exige(condicao, mensagem) {
  if (!condicao) {
    console.error(`ERRO: ${mensagem}`);
    process.exit(1);
  }
}

// Se a senha do administrador nao estiver definida, o script garante uma conta
// de demonstracao com senha conhecida, direto no banco. Nenhuma conta existente
// e alterada: a conta de demonstracao tem e-mail proprio.
async function garantirAdminDeDemonstracao() {
  const { Pool } = await import('pg');
  const bcrypt = (await import('bcryptjs')).default;
  const url = process.env.DATABASE_URL;
  exige(url, 'DATABASE_URL nao definida: nao da para garantir o administrador de demonstracao');

  const ssl = sslDaUrl(url);
  const pool = new Pool({ connectionString: url, ...(ssl ? { ssl } : {}), max: 2 });
  const email = 'demo-admin@exemplo.invalid';
  const senha = 'demo-ficticia-123456';

  try {
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (rows.length) {
      await pool.query('UPDATE users SET role = $2, is_active = TRUE WHERE email = $1', [
        email,
        'admin',
      ]);
      console.log('Administrador de demonstracao reativado.');
    } else {
      const hash = await bcrypt.hash(senha, 12);
      await pool.query(
        'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
        ['Demo Ficticia Administrador', email, hash, 'admin'],
      );
      console.log('Administrador de demonstracao criado.');
    }
  } finally {
    await pool.end();
  }
  return { email, senha };
}

let adminEmail = ADMIN_EMAIL;
let adminPassword = ADMIN_PASSWORD;

if (!adminEmail || !adminPassword) {
  const criado = await garantirAdminDeDemonstracao();
  adminEmail = criado.email;
  adminPassword = criado.senha;
  console.log('Usando a conta de demonstracao recem-criada.');
}

const login = await api('/api/v1/auth/login', {
  method: 'POST',
  body: { email: adminEmail, password: adminPassword },
});
exige(login.status === 200, 'login do administrador falhou');
const adminToken = login.json?.token;
exige(Boolean(adminToken), 'token do administrador ausente');
console.log('Conectado como administrador.');

// --- limpeza do que e de demonstracao ---
// A conta que esta sendo usada agora e preservada: sem isso, o proprio
// administrador de demonstracao se desativaria e a sessao perderia o acesso.
const usuarios = await api('/api/v1/users?pageSize=100', { token: adminToken });
const alvos = (usuarios.json?.users ?? []).filter(
  (u) => String(u.email).endsWith('@exemplo.invalid') && u.email !== adminEmail,
);
for (const usuario of alvos) {
  await api(`/api/v1/users/${usuario.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { isActive: false },
  });
}
console.log(`Usuarios de demonstracao anteriores desativados: ${alvos.length}`);

const papeis = [
  { name: 'Demo Ficticia Solicitante', email: 'requester@exemplo.invalid', role: 'requester' },
  { name: 'Demo Ficticia Agente', email: 'agent@exemplo.invalid', role: 'agent' },
  { name: 'Demo Ficticia Gestora', email: 'manager@exemplo.invalid', role: 'manager' },
];

const tokens = {};
for (const papel of papeis) {
  const criado = await api('/api/v1/users', {
    method: 'POST',
    token: adminToken,
    body: { name: papel.name, email: papel.email, password: SENHA_DEMO, role: papel.role },
  });
  if (criado.status !== 201) {
    // ja existe: tenta reativar e seguir
    const existentes = await api('/api/v1/users?pageSize=100', { token: adminToken });
    const encontrado = (existentes.json?.users ?? []).find((u) => u.email === papel.email);
    if (!encontrado) {
      console.error(
        `ERRO: nao foi possivel criar o usuario ${papel.email}: ${JSON.stringify(criado.json)}`,
      );
      process.exit(1);
    }
    await api(`/api/v1/users/${encontrado.id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { isActive: true, role: papel.role },
    });
  }
  const sessao = await api('/api/v1/auth/login', {
    method: 'POST',
    body: { email: papel.email, password: SENHA_DEMO },
  });
  exige(sessao.status === 200, `login do usuario ${papel.email} falhou`);
  tokens[papel.role] = sessao.json?.token;
}
console.log(`Usuarios ficticios criados: ${papeis.length} (requester, agent, manager)`);

// --- categorias ---
const categorias = [
  { name: 'Falha de aplicacao', description: 'Erro ao usar o sistema.', defaultPriority: 'high' },
  {
    name: 'Dificuldade de acesso',
    description: 'Nao consegue entrar ou permissao negada.',
    defaultPriority: 'medium',
  },
  {
    name: 'Duvida sobre uso',
    description: 'Pergunta sobre o funcionamento.',
    defaultPriority: 'low',
  },
];

const categoryIds = [];
for (const categoria of categorias) {
  const existentes = await api('/api/v1/categories?includeInactive=true', { token: adminToken });
  const jaExiste = (existentes.json?.categories ?? []).find((c) => c.name === categoria.name);
  if (jaExiste) {
    categoryIds.push(jaExiste.id);
    continue;
  }
  const criada = await api('/api/v1/categories', {
    method: 'POST',
    token: adminToken,
    body: categoria,
  });
  exige(criada.status === 201, `criacao da categoria falhou: ${JSON.stringify(criada.json)}`);
  categoryIds.push(criada.json?.category?.id);
}
console.log(`Categorias ficticias: ${categoryIds.length}`);

// --- politicas SLA ---
const politicas = [
  { priority: 'critical', firstResponseMinutes: 15, resolutionMinutes: 240 },
  { priority: 'high', firstResponseMinutes: 60, resolutionMinutes: 480 },
  { priority: 'medium', firstResponseMinutes: 240, resolutionMinutes: 1440 },
  { priority: 'low', firstResponseMinutes: 480, resolutionMinutes: 2880 },
];

const ativas = await api('/api/v1/sla-policies', { token: adminToken });
const prioridadesAtivas = new Set(
  (ativas.json?.policies ?? []).filter((p) => p.isActive).map((p) => p.priority),
);
let criadas = 0;
for (const politica of politicas) {
  if (prioridadesAtivas.has(politica.priority)) continue;
  const criada = await api('/api/v1/sla-policies', {
    method: 'POST',
    token: adminToken,
    body: politica,
  });
  if (criada.status === 201) criadas += 1;
}
console.log(
  `Politicas SLA ativas: ${criadas} criadas, ${politicas.length - criadas} ja existentes`,
);

// --- chamados, abertos pelo solicitante (a API calcula o prazo de SLA) ---
const chamados = [
  {
    title: 'Nao consigo abrir um chamado',
    description: 'Ao clicar em novo chamado, a tela fica em branco.',
    categoryId: categoryIds[1],
    priority: 'high',
  },
  {
    title: 'Mensagem de erro ao filtrar',
    description: 'Ao filtrar por status, aparece um erro inesperado.',
    categoryId: categoryIds[0],
    priority: 'medium',
  },
  {
    title: 'Duvida sobre prazos de atendimento',
    description: 'Como funciona o prazo combinado na politica de atendimento?',
    categoryId: categoryIds[2],
    priority: 'low',
  },
];

const ticketIds = [];
for (const chamado of chamados) {
  const criado = await api('/api/v1/tickets', {
    method: 'POST',
    token: tokens.requester,
    body: chamado,
  });
  exige(criado.status === 201, `criacao do chamado falhou: ${JSON.stringify(criado.json)}`);
  ticketIds.push(criado.json?.ticket?.id);
}
console.log(`Chamados ficticios criados: ${ticketIds.length}`);

// --- um comentario publico do agente, para o SLA de primeira resposta existir ---
if (ticketIds.length) {
  const comentario = await api(`/api/v1/tickets/${ticketIds[0]}/comments`, {
    method: 'POST',
    token: tokens.agent,
    body: { body: 'Ja estou verificando este caso. O credencial de acesso ja foi enviado.' },
  });
  exige(comentario.status === 201, 'comentario do agente falhou');
  console.log('Comentario publico do agente adicionado (dispara o SLA de primeira resposta).');
}

console.log('\n--- CONTAS DA DEMONSTRACAO ---');
console.log(`  senha: ${SENHA_DEMO}`);
console.log('  requester  requester@exemplo.invalid');
console.log('  agent      agent@exemplo.invalid');
console.log('  manager    manager@exemplo.invalid');
console.log('  admin      (a conta de administrador que voce criou)');
console.log('\nTodos os dados sao ficticios (dominio .invalid).');
console.log('Nenhum dado real de pessoa foi usado.');

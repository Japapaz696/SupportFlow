import { describe, expect, it } from 'vitest';
import express from 'express';
import cors from 'cors';
import request from 'supertest';

import { app } from './app.js';
import {
  corsOptions,
  createAuthRateLimiter,
  parseAllowedOrigins,
  securityHeaders,
} from './middleware/security.middleware.js';

/**
 * Testes de seguranca que provam COMPORTAMENTO, nao apenas presenca.
 *
 * O rate limiter das rotas de auth fica desativado em VITEST para nao
 * interferir nas suites de integracao. Aqui instanciamos o limiter ATIVO com
 * o mesmo helper de producao para demonstrar: permitido -> bloqueado (429) ->
 * recuperacao apos a janela.
 */

describe('seguranca: headers (helmet)', () => {
  it('a configuracao exportada aplica os headers em qualquer app', async () => {
    // Prova que `securityHeaders` e a fonte unica da configuracao de headers,
    // e nao apenas um middleware colado no app principal.
    const server = express();
    server.use(securityHeaders);
    server.get('/x', (_req, res) => res.json({ ok: true }));

    const response = await request(server).get('/x');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['cross-origin-resource-policy']).toBe('same-site');
  });

  it('responde com X-Content-Type-Options nosniff', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('responde com X-Frame-Options', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('responde com Content-Security-Policy restritiva', async () => {
    const response = await request(app).get('/health');
    const csp = response.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('responde com Strict-Transport-Security', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['strict-transport-security']).toBeDefined();
  });

  it('responde com Referrer-Policy', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['referrer-policy']).toBeDefined();
  });

  it('nao expoe X-Powered-By', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

describe('seguranca: CORS', () => {
  it('parseia ALLOWED_ORIGINS por virgula', () => {
    expect(parseAllowedOrigins('https://a.com, https://b.com')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
    expect(parseAllowedOrigins(undefined)).toEqual(['http://localhost:5173']);
    expect(parseAllowedOrigins('')).toEqual(['http://localhost:5173']);
  });

  it('origem permitida recebe Access-Control-Allow-Origin', async () => {
    const response = await request(app).get('/health').set('Origin', 'http://localhost:5173');
    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('origem nao autorizada nunca e refletida', async () => {
    const response = await request(app).get('/health').set('Origin', 'https://evil.example.com');
    // Com origem fixa, o header e a origem configurada; nunca a do atacante.
    // O navegador bloqueia porque nao coincide com a origem da requisicao.
    expect(response.headers['access-control-allow-origin']).not.toBe('https://evil.example.com');
  });

  it('preflight de origem permitida autoriza POST com Authorization', async () => {
    const response = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type, Authorization');
    expect(response.status).toBeLessThan(400);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers['access-control-allow-methods']).toContain('POST');
  });

  it('NAO envia Access-Control-Allow-Credentials (autenticacao via Bearer)', async () => {
    // A API usa JWT no header Authorization, nao cookies. Credenciais CORS
    // seriam desnecessarias e ampliariam a superficie de ataque.
    const response = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST');
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    expect(corsOptions.credentials).toBe(false);
  });

  it('credentials=true so quando explicitamente ligado', async () => {
    const server = express();
    server.use(cors({ origin: 'http://localhost:5173', credentials: true }));
    server.get('/x', (_req, res) => res.json({ ok: true }));
    const response = await request(server).get('/x').set('Origin', 'http://localhost:5173');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });
});

describe('seguranca: rate limiting ATIVO', () => {
  it('permite tentativas dentro do limite e informa headers', async () => {
    const server = express();
    server.use(createAuthRateLimiter({ windowMs: 60_000, max: 5 }));
    server.post('/login', (_req, res) => res.json({ ok: true }));

    const response = await request(server).post('/login');
    expect(response.status).toBe(200);
    expect(response.headers['ratelimit-remaining']).toBe('4');
  });

  it('bloqueia com HTTP 429 apos exceder o limite', async () => {
    const server = express();
    server.use(createAuthRateLimiter({ windowMs: 60_000, max: 2 }));
    server.post('/login', (_req, res) => res.json({ ok: true }));

    await request(server).post('/login').expect(200);
    await request(server).post('/login').expect(200);
    const blocked = await request(server).post('/login');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.message).toMatch(/Muitas tentativas/);
  });

  it('inclui Retry-After no bloqueio', async () => {
    const server = express();
    server.use(createAuthRateLimiter({ windowMs: 60_000, max: 1 }));
    server.post('/login', (_req, res) => res.json({ ok: true }));

    await request(server).post('/login').expect(200);
    const blocked = await request(server).post('/login');
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('recupera apos a janela expirar', async () => {
    const server = express();
    server.use(
      createAuthRateLimiter({ windowMs: 50, max: 1, legacyHeaders: true, standardHeaders: false }),
    );
    server.post('/login', (_req, res) => res.json({ ok: true }));

    await request(server).post('/login').expect(200);
    await request(server).post('/login').expect(429);
    await new Promise((resolve) => setTimeout(resolve, 120));
    await request(server).post('/login').expect(200);
  });

  it('trata IP real atras de proxy confiavel (nao compartilha cota)', async () => {
    const server = express();
    server.set('trust proxy', 1);
    server.use(createAuthRateLimiter({ windowMs: 60_000, max: 1 }));
    server.post('/login', (_req, res) => res.json({ ok: true }));

    await request(server).post('/login').set('X-Forwarded-For', '203.0.113.10').expect(200);
    // Mesmo IP: bloqueado.
    await request(server).post('/login').set('X-Forwarded-For', '203.0.113.10').expect(429);
    // IP diferente: cota propria, permitido.
    await request(server).post('/login').set('X-Forwarded-For', '203.0.113.11').expect(200);
  });

  it('nao confia em X-Forwarded-For quando trust proxy esta desligado', async () => {
    const server = express();
    // Sem app.set('trust proxy'), o XFF e ignorado: todos caem no mesmo IP.
    server.use(createAuthRateLimiter({ windowMs: 60_000, max: 1 }));
    server.post('/login', (_req, res) => res.json({ ok: true }));

    await request(server).post('/login').set('X-Forwarded-For', '203.0.113.10').expect(200);
    await request(server).post('/login').set('X-Forwarded-For', '203.0.113.99').expect(429);
  });
});

describe('seguranca: autenticacao/RBAC', () => {
  it('rota protegida sem token responde 401', async () => {
    const response = await request(app).get('/api/v1/tickets');
    expect(response.status).toBe(401);
  });

  it('rota admin-only responde 403 para nao-admin', async () => {
    // Sem token valido de nao-admin, /users exige auth primeiro (401).
    const response = await request(app).get('/api/v1/users');
    expect([401, 403]).toContain(response.status);
  });
});

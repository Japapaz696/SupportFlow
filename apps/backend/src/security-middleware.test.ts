import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';

describe('rate limiting (middleware ativo)', () => {
  it('permite requisições dentro do limite', async () => {
    const app = express();
    const limiter = rateLimit({ windowMs: 60000, max: 5, standardHeaders: true, legacyHeaders: false });
    app.use(limiter);
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.headers['ratelimit-remaining']).toBeDefined();
  });

  it('retorna 429 após exceder o limite', async () => {
    const app = express();
    const limiter = rateLimit({ windowMs: 60000, max: 2, standardHeaders: true, legacyHeaders: false });
    app.use(limiter);
    app.get('/test', (_req, res) => res.json({ ok: true }));

    await request(app).get('/test');
    await request(app).get('/test');
    const res = await request(app).get('/test');
    expect(res.status).toBe(429);
  });

  it('inclui header Retry-After no 429', async () => {
    const app = express();
    const limiter = rateLimit({ windowMs: 60000, max: 1, standardHeaders: true, legacyHeaders: false });
    app.use(limiter);
    app.get('/test', (_req, res) => res.json({ ok: true }));

    await request(app).get('/test');
    const res = await request(app).get('/test');
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });
});

describe('CORS (configuração)', () => {
  it('origem permitida recebe Access-Control-Allow-Origin', async () => {
    const cors = (await import('cors')).default;
    const app = express();
    app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/test').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('origem não permitida não recebe Access-Control-Allow-Origin correspondente', async () => {
    const cors = (await import('cors')).default;
    const app = express();
    app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/test').set('Origin', 'https://evil.example.com');
    // CORS com origem fixa retorna sempre a origem configurada, nunca a do atacante.
    // O navegador bloqueia porque o origin da resposta nao coincide com o da requisicao.
    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example.com');
  });

  it('preflight OPTIONS retorna headers corretos', async () => {
    const cors = (await import('cors')).default;
    const app = express();
    app.use(cors({ origin: 'http://localhost:5173', credentials: true, methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] }));
    app.get('/test', (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .options('/test')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBeLessThan(400);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});

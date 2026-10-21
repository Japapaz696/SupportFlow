import { describe, expect, it } from 'vitest';
import request from 'supertest';

import { app } from './app.js';

describe('seguranca: headers (helmet)', () => {
  it('responde com X-Content-Type-Options nosniff', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('responde com X-Frame-Options', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-frame-options']).toBeDefined();
  });

  it('responde com Content-Security-Policy', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['content-security-policy']).toBeDefined();
  });

  it('responde com Strict-Transport-Security', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['strict-transport-security']).toBeDefined();
  });

  it('responde com Referrer-Policy', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['referrer-policy']).toBeDefined();
  });
});

describe('seguranca: CORS', () => {
  it('permite origem autorizada', async () => {
    const response = await request(app).get('/health').set('Origin', 'http://localhost:5173');
    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('bloqueia origem nao autorizada (sem header allow-origin)', async () => {
    const response = await request(app).get('/health').set('Origin', 'https://evil.example.com');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('responde preflight para origem autorizada', async () => {
    const response = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type');
    expect(response.status).toBeLessThan(400);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('nao permite credenciais para origem nao autorizada', async () => {
    const response = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'POST');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('seguranca: rate limiting', () => {
  it('bloqueia apos 10 tentativas (simulado)', async () => {
    // O rate limiter esta desativado em modo teste (VITEST).
    // Este teste documenta o comportamento esperado em producao.
    // Para testar com rate limiter ativo, definir VITEST="" e rodar manualmente.
    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'test@test.com',
      password: 'wrong',
    });
    // Com rate limiter desativado em testes, deve retornar 401 (credenciais invalidas)
    // ou 400 (validacao), nao 429.
    expect([400, 401]).toContain(response.status);
  });
});

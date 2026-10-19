import { describe, expect, it } from 'vitest';
import request from 'supertest';

import { app } from './app.js';

describe('health e readiness', () => {
  it('responde 200 em /health sem depender do banco', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('responde 200 em /ready quando o banco esta acessivel', async () => {
    const response = await request(app).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', database: 'ok' });
  });

  it('nao exige autenticacao', async () => {
    await request(app).get('/health').expect(200);
    await request(app).get('/ready').expect(200);
  });
});

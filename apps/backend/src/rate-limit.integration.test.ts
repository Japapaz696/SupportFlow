import { randomUUID } from 'node:crypto';

import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Escopo do limitador de tentativas de login, provado contra a aplicacao
 * real (nao contra um servidor de teste isolado).
 *
 * O limitador deve cobrir apenas `POST /auth/login`, que e o unico endpoint
 * que confere credenciais. `/auth/me` e `/auth/logout` exigem token: se
 * compartilhassem a cota, cada login pela interface consumiria duas
 * tentativas e o usuario seria bloqueado depois de ~5 entradas em 15 minutos.
 *
 * O limite e desligado por padrao nas suites de integracao; a variavel abaixo
 * o religa antes do import da aplicacao.
 */
process.env.SUPPORTFLOW_RATE_LIMIT_ACTIVE = '1';

const { app } = await import('./app.js');
const { pool } = await import('./database/pool.js');

const testRunId = randomUUID();
const testPassword = 'CorrectHorseBatteryStaple42';
const email = `rate-limit-${testRunId}@example.test`;
let userId = '';

describe('limitador de tentativas de login (escopo)', () => {
  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(testPassword, 12);
    const result = await pool.query<{ id: string }>(
      'INSERT INTO users (name, email, password_hash, role, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      ['Rate Limit Test', email, passwordHash, 'requester', true],
    );
    userId = result.rows[0].id;
  });

  afterAll(async () => {
    if (userId) {
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    await pool.end();
  });

  it('bloqueia o login na 11a tentativa e nao afeta /auth/me', async () => {
    let token = '';

    for (let tentativa = 1; tentativa <= 10; tentativa++) {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: testPassword });

      expect(response.status, `tentativa ${tentativa}`).toBe(200);
      token = response.body.token as string;
    }

    // A cota esta esgotada, mas /auth/me exige token e nao e vetor de forca
    // bruta: precisa continuar respondendo.
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);

    // A 11a tentativa de login e a primeira a ser barrada.
    const blocked = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: testPassword });

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.headers['retry-after']).toBeDefined();
  });
});

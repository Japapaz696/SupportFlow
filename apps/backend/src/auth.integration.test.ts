import { randomUUID } from 'node:crypto';

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from './app.js';
import { env } from './config/env.js';
import { pool } from './database/pool.js';

const testRunId = randomUUID();
const testPassword = 'CorrectHorseBatteryStaple42';
const adminEmail = `m3-admin-${testRunId}@example.test`;
const requesterEmail = `m3-requester-${testRunId}@example.test`;
const agentEmail = `m3-agent-${testRunId}@example.test`;
const managerEmail = `m3-manager-${testRunId}@example.test`;
const mutableEmail = `m3-mutable-${testRunId}@example.test`;
const createdUserEmail = `m3-created-${testRunId}@example.test`;
let adminToken = '';
let requesterToken = '';
let agentToken = '';
let managerToken = '';
let mutableToken = '';
let createdUserId = '';

async function insertUser(
  name: string,
  email: string,
  role: string,
  isActive = true,
): Promise<string> {
  const passwordHash = await bcrypt.hash(testPassword, 12);
  const result = await pool.query<{ id: string }>(
    'INSERT INTO users (name, email, password_hash, role, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [name, email, passwordHash, role, isActive],
  );

  return result.rows[0].id;
}

async function loginAs(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: testPassword })
    .expect(200);

  return response.body.token as string;
}

beforeAll(async () => {
  await insertUser('M3 Test Admin', adminEmail, 'admin');
  await insertUser('M3 Test Requester', requesterEmail, 'requester');
  await insertUser('M3 Test Agent', agentEmail, 'agent');
  await insertUser('M3 Test Manager', managerEmail, 'manager');
  await insertUser('M3 Mutable User', mutableEmail, 'agent');
});

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`m3-%-${testRunId}@example.test`]);
  await pool.end();
});

describe('M3 identity API', () => {
  it('authenticates valid credentials without exposing a password hash', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: adminEmail.toUpperCase(), password: testPassword })
      .expect(200);

    adminToken = response.body.token;

    expect(adminToken).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({ email: adminEmail, role: 'admin' });
    expect(JSON.stringify(response.body)).not.toContain('password_hash');
  });

  it('rejects invalid credentials with a generic response', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: 'IncorrectPassword42' })
      .expect(401);

    expect(response.body.error).toEqual({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    });
  });

  it('returns the same generic authentication failure for a short wrong password', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: 'wrong' })
      .expect(401);

    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('requires authentication for auth/me', async () => {
    await request(app).get('/api/v1/auth/me').expect(401);
  });

  it.each([
    ['malformed', 'not-a-jwt'],
    ['tampered', `${adminToken.slice(0, -1)}x`],
    [
      'expired',
      jwt.sign({}, env.jwtSecret, { algorithm: 'HS256', subject: randomUUID(), expiresIn: -1 }),
    ],
    [
      'unsupported algorithm',
      jwt.sign({}, env.jwtSecret, { algorithm: 'HS512', subject: randomUUID(), expiresIn: '1h' }),
    ],
  ])('rejects a %s token', async (_case, token) => {
    await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('rejects a valid token for a nonexistent user', async () => {
    const token = jwt.sign({}, env.jwtSecret, {
      algorithm: 'HS256',
      subject: randomUUID(),
      expiresIn: '1h',
    });

    await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('returns the authenticated admin through auth/me', async () => {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.user).toMatchObject({ email: adminEmail, role: 'admin' });
    expect(JSON.stringify(response.body)).not.toContain('password_hash');
  });

  it('allows an admin to create a user and does not expose the password hash', async () => {
    const response = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'M3 Created User',
        email: createdUserEmail,
        password: testPassword,
        role: 'agent',
      })
      .expect(201);

    createdUserId = response.body.user.id;
    expect(response.body.user).toMatchObject({ email: createdUserEmail, role: 'agent' });
    expect(JSON.stringify(response.body)).not.toContain('password_hash');

    const storedUser = await pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [createdUserId],
    );
    expect(storedUser.rows[0].password_hash).not.toBe(testPassword);
    expect(bcrypt.getRounds(storedUser.rows[0].password_hash)).toBe(12);
  });

  it('rejects duplicate normalized email addresses', async () => {
    const response = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Duplicate User',
        email: `  ${createdUserEmail.toUpperCase()}  `,
        password: testPassword,
        role: 'agent',
      })
      .expect(409);

    expect(response.body.error.code).toBe('EMAIL_ALREADY_IN_USE');
  });

  it.each([
    [
      'create',
      '/api/v1/users',
      {
        name: 'Extra Field',
        email: `m3-extra-${testRunId}@example.test`,
        password: testPassword,
        role: 'agent',
        password_hash: 'attacker-controlled',
      },
    ],
    [
      'update',
      () => `/api/v1/users/${createdUserId}`,
      { name: 'Still Valid', password_hash: 'attacker-controlled' },
    ],
  ])('rejects unsupported fields in %s payloads', async (_case, path, body) => {
    const resolvedPath = typeof path === 'function' ? path() : path;
    const testRequest =
      _case === 'create' ? request(app).post(resolvedPath) : request(app).patch(resolvedPath);
    const response = await testRequest
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body)
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an invalid user payload', async () => {
    const response = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: '',
        email: 'not-an-email',
        password: 'short',
        role: 'unsupported',
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('denies a requester access to user administration', async () => {
    requesterToken = await loginAs(requesterEmail);

    const response = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${requesterToken}`)
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('denies agents and managers access to user administration', async () => {
    agentToken = await loginAs(agentEmail);
    managerToken = await loginAs(managerEmail);

    for (const token of [agentToken, managerToken]) {
      await request(app).get('/api/v1/users').set('Authorization', `Bearer ${token}`).expect(403);
    }
  });

  it('uses the current database role and active status after token issuance', async () => {
    mutableToken = await loginAs(mutableEmail);

    await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${mutableToken}`)
      .expect(403);

    await pool.query('UPDATE users SET role = $1 WHERE email = $2', ['admin', mutableEmail]);
    await request(app)
      .get('/api/v1/users?pageSize=1')
      .set('Authorization', `Bearer ${mutableToken}`)
      .expect(200);

    await pool.query('UPDATE users SET is_active = FALSE WHERE email = $1', [mutableEmail]);
    await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${mutableToken}`)
      .expect(401);
  });

  it('validates user ids and missing users', async () => {
    await request(app)
      .get('/api/v1/users/not-a-uuid')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    await request(app)
      .get(`/api/v1/users/${randomUUID()}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('paginates user listings, enforces the limit, and omits password hashes', async () => {
    const response = await request(app)
      .get('/api/v1/users?page=1&pageSize=2')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({ page: 1, pageSize: 2 });
    expect(response.body.total).toBeGreaterThanOrEqual(6);
    expect(response.body.users).toHaveLength(2);
    expect(JSON.stringify(response.body)).not.toContain('password_hash');

    await request(app)
      .get('/api/v1/users?pageSize=101')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('lets an admin read and update a user without exposing the password hash', async () => {
    const response = await request(app)
      .patch(`/api/v1/users/${createdUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'M3 Updated User', isActive: false })
      .expect(200);

    expect(response.body.user).toMatchObject({ name: 'M3 Updated User', isActive: false });
    expect(JSON.stringify(response.body)).not.toContain('password_hash');

    const getResponse = await request(app)
      .get(`/api/v1/users/${createdUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(getResponse.body.user).toMatchObject({ id: createdUserId, isActive: false });
    expect(JSON.stringify(getResponse.body)).not.toContain('password_hash');
  });

  it('logs out with a valid token and rejects a call without one', async () => {
    await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    await request(app).post('/api/v1/auth/logout').expect(401);

    await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });
});

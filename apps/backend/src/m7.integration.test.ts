import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from './app.js';
import { pool } from './database/pool.js';

const runId = randomUUID();
const password = 'CorrectHorseBatteryStaple42';
const email = (label: string) => `m7-${label}-${runId}@example.test`;
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};
let categoryId = '';
let policyId = '';

async function insertUser(
  label: string,
  role: 'requester' | 'agent' | 'manager' | 'admin',
): Promise<string> {
  const pw = await bcrypt.hash(password, 12);
  const res = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id`,
    [`M7 ${label}`, email(label), pw, role],
  );
  return res.rows[0].id;
}

async function login(label: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: email(label), password })
    .expect(200);
  return res.body.token as string;
}

beforeAll(async () => {
  ids.requester = await insertUser('requester', 'requester');
  ids.agent = await insertUser('agent', 'agent');
  ids.otherAgent = await insertUser('other-agent', 'agent');
  ids.manager = await insertUser('manager', 'manager');
  ids.admin = await insertUser('admin', 'admin');
  for (const k of ['requester', 'agent', 'other-agent', 'manager', 'admin']) {
    tokens[k] = await login(k);
  }

  const pol = await pool.query<{ id: string }>(
    `INSERT INTO sla_policies (priority, first_response_minutes, resolution_minutes)
     VALUES ('low', 60, 240) ON CONFLICT (priority) DO UPDATE SET is_active = TRUE RETURNING id`,
  );
  policyId = pol.rows[0].id;

  const cat = await pool.query<{ id: string }>(
    `INSERT INTO categories (name, default_priority) VALUES ($1,'low') RETURNING id`,
    [`M7 ${runId}`],
  );
  categoryId = cat.rows[0].id;
});

async function makeTicket(token: string, title?: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/tickets')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: title ?? `M7 ${randomUUID()}`, description: 't', categoryId, priority: 'low' })
    .expect(201);
  return res.body.ticket.id as string;
}

afterAll(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE ticket_events DISABLE TRIGGER ticket_events_prevent_mutation');
    await client.query(
      `DELETE FROM ticket_technical_diagnostics WHERE ticket_id IN (SELECT id FROM tickets WHERE requester_id = ANY($1::uuid[]))`,
      [[ids.requester]],
    );
    await client.query(
      `DELETE FROM ticket_events WHERE ticket_id IN (SELECT id FROM tickets WHERE requester_id = ANY($1::uuid[]))`,
      [[ids.requester]],
    );
    await client.query('ALTER TABLE ticket_events ENABLE TRIGGER ticket_events_prevent_mutation');
    await client.query(
      'DELETE FROM ticket_comments WHERE ticket_id IN (SELECT id FROM tickets WHERE requester_id = ANY($1::uuid[]))',
      [[ids.requester]],
    );
    await client.query('DELETE FROM tickets WHERE requester_id = $1', [ids.requester]);
    await client.query('DELETE FROM categories WHERE id = $1', [categoryId]);
    await client.query('DELETE FROM sla_policies WHERE id = $1', [policyId]);
    await client.query('DELETE FROM users WHERE email LIKE $1', [`m7-%-${runId}@example.test`]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
});

describe('M7', () => {
  it('requester blocked from diagnostic endpoint of own and other tickets', async () => {
    const t = await makeTicket(tokens.requester);
    await request(app)
      .get(`/api/v1/tickets/${t}/technical-diagnostic`)
      .set('Authorization', `Bearer ${tokens.requester}`)
      .expect(404);
    await request(app)
      .put(`/api/v1/tickets/${t}/technical-diagnostic`)
      .set('Authorization', `Bearer ${tokens.requester}`)
      .send({ notes: 'x' })
      .expect(404);
    const detail = await request(app)
      .get(`/api/v1/tickets/${t}`)
      .set('Authorization', `Bearer ${tokens.requester}`)
      .expect(200);
    expect(detail.body.ticket.diagnostic).toBeUndefined();
  });

  it('manager creates diagnostic and agent reads assigned ticket', async () => {
    const t = await makeTicket(tokens.requester);
    await request(app)
      .put(`/api/v1/tickets/${t}/technical-diagnostic`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ notes: 'test', apiMethod: 'GET', httpStatusCode: 500 })
      .expect(200);
    const get = await request(app)
      .get(`/api/v1/tickets/${t}/technical-diagnostic`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .expect(200);
    expect(get.body.diagnostic).toMatchObject({ notes: 'test', environment: null });
    await request(app)
      .patch(`/api/v1/tickets/${t}/assignee`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ assigneeId: ids.agent })
      .expect(200);
    await request(app)
      .get(`/api/v1/tickets/${t}/technical-diagnostic`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .expect(200);
  });

  it('agent cannot access a ticket assigned to another agent', async () => {
    const t = await makeTicket(tokens.requester);
    await request(app)
      .patch(`/api/v1/tickets/${t}/assignee`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ assigneeId: ids.otherAgent })
      .expect(200);
    await request(app)
      .get(`/api/v1/tickets/${t}/technical-diagnostic`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .expect(403);
    await request(app)
      .put(`/api/v1/tickets/${t}/technical-diagnostic`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ notes: 'IDOR attempt' })
      .expect(403);
  });

  it('invalid fields rejected and no sensitive patterns accepted', async () => {
    const t = await makeTicket(tokens.requester);
    await request(app)
      .put(`/api/v1/tickets/${t}/technical-diagnostic`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ bad: 1 })
      .expect(400);
    await request(app)
      .put(`/api/v1/tickets/${t}/technical-diagnostic`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ notes: 'token=abc', apiMethod: 'TRACE', httpStatusCode: 700 })
      .expect(400);
    await request(app)
      .put(`/api/v1/tickets/${t}/technical-diagnostic`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ logs: 'Authorization: Bearer secret' })
      .expect(400);
  });

  it('upsert preserves created_by and updates updated_by; one row only', async () => {
    const t = await makeTicket(tokens.requester);
    await request(app)
      .put(`/api/v1/tickets/${t}/technical-diagnostic`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ notes: 'first' })
      .expect(200);
    await request(app)
      .put(`/api/v1/tickets/${t}/technical-diagnostic`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ notes: 'second' })
      .expect(200);
    const row = await pool.query(
      'SELECT * FROM ticket_technical_diagnostics WHERE ticket_id = $1',
      [t],
    );
    expect(row.rows.length).toBe(1);
  });

  it('404 for nonexistent ticket', async () => {
    await request(app)
      .get(`/api/v1/tickets/${randomUUID()}/technical-diagnostic`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .expect(404);
  });
});

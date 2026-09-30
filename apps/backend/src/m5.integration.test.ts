import { randomUUID } from 'node:crypto';

import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { app } from './app.js';
import { resetClock, setClock } from './domain/clock.js';
import { evaluateSlaClock } from './domain/sla.js';
import { pool } from './database/pool.js';

const runId = randomUUID();
const password = 'CorrectHorseBatteryStaple42';
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};
let categoryId = '';
const policyIds: string[] = [];
const testNow = new Date('2026-01-15T12:00:00.000Z');

const email = (role: string) => `m5-${role}-${runId}@example.test`;

async function insertUser(role: 'requester' | 'agent' | 'manager' | 'admin', label = role) {
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id`,
    [`M5 ${label}`, email(label), passwordHash, role],
  );
  return result.rows[0].id;
}

async function login(label: string) {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: email(label), password })
    .expect(200);
  return response.body.token as string;
}

async function createPolicy(priority: string, firstResponseMinutes = 60, resolutionMinutes = 300) {
  const response = await request(app)
    .post('/api/v1/sla-policies')
    .set('Authorization', `Bearer ${tokens.manager}`)
    .send({ priority, firstResponseMinutes, resolutionMinutes })
    .expect(201);
  policyIds.push(response.body.policy.id);
  return response.body.policy;
}

async function createTicket(
  priority: string = 'high',
  token = tokens.requester,
  title = `M5 ticket ${randomUUID()}`,
) {
  const response = await request(app)
    .post('/api/v1/tickets')
    .set('Authorization', `Bearer ${token}`)
    .send({ title, description: 'M5 deterministic ticket', categoryId, priority })
    .expect(201);
  return response.body.ticket;
}

beforeAll(async () => {
  setClock(() => new Date(testNow));
  ids.requester = await insertUser('requester');
  ids.otherRequester = await insertUser('requester', 'other-requester');
  ids.agent = await insertUser('agent');
  ids.otherAgent = await insertUser('agent', 'other-agent');
  ids.manager = await insertUser('manager');
  ids.admin = await insertUser('admin');
  for (const label of [
    'requester',
    'other-requester',
    'agent',
    'other-agent',
    'manager',
    'admin',
  ]) {
    tokens[label] = await login(label);
  }
  const category = await pool.query<{ id: string }>(
    `INSERT INTO categories (name, default_priority) VALUES ($1, 'medium') RETURNING id`,
    [`M5 ${runId}`],
  );
  categoryId = category.rows[0].id;
});

afterAll(async () => {
  resetClock();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE ticket_events DISABLE TRIGGER ticket_events_prevent_mutation');
    await client.query(
      `DELETE FROM ticket_events WHERE ticket_id IN (SELECT id FROM tickets WHERE requester_id = ANY($1::uuid[]))`,
      [[ids.requester, ids.otherRequester]],
    );
    await client.query(
      `DELETE FROM ticket_comments WHERE ticket_id IN (SELECT id FROM tickets WHERE requester_id = ANY($1::uuid[]))`,
      [[ids.requester, ids.otherRequester]],
    );
    await client.query(`DELETE FROM tickets WHERE requester_id = ANY($1::uuid[])`, [
      [ids.requester, ids.otherRequester],
    ]);
    await client.query('DELETE FROM sla_policies WHERE id = ANY($1::uuid[])', [policyIds]);
    await client.query('DELETE FROM categories WHERE id = $1', [categoryId]);
    await client.query('DELETE FROM users WHERE email LIKE $1', [`m5-%-${runId}@example.test`]);
    await client.query('ALTER TABLE ticket_events ENABLE TRIGGER ticket_events_prevent_mutation');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
});

describe('M5 SLA and dashboard', () => {
  beforeEach(() => {
    setClock(() => new Date(testNow));
  });
  it('enforces SLA policy RBAC, validation, duplicate priority and UUID validation', async () => {
    for (const token of [tokens.requester, tokens.agent]) {
      await request(app)
        .post('/api/v1/sla-policies')
        .set('Authorization', `Bearer ${token}`)
        .send({ priority: 'high', firstResponseMinutes: 1, resolutionMinutes: 1 })
        .expect(403);
      await request(app)
        .patch(`/api/v1/sla-policies/${randomUUID()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ isActive: false })
        .expect(403);
    }
    await request(app)
      .post('/api/v1/sla-policies')
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ priority: 'high', firstResponseMinutes: 0, resolutionMinutes: 1 })
      .expect(400);
    await request(app)
      .post('/api/v1/sla-policies')
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ priority: 'nope', firstResponseMinutes: 1, resolutionMinutes: 1 })
      .expect(400);
    await request(app)
      .post('/api/v1/sla-policies')
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ priority: 'high', firstResponseMinutes: 1, resolutionMinutes: 1, extra: true })
      .expect(400);
    for (const invalid of [-1, 1.5, '60', 5_256_001]) {
      await request(app)
        .post('/api/v1/sla-policies')
        .set('Authorization', `Bearer ${tokens.manager}`)
        .send({ priority: 'high', firstResponseMinutes: invalid, resolutionMinutes: 1 })
        .expect(400);
    }
    await request(app)
      .post('/api/v1/sla-policies')
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({
        priority: 'high',
        firstResponseMinutes: 1,
        resolutionMinutes: 1,
        businessHoursOnly: true,
      })
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('BUSINESS_HOURS_NOT_SUPPORTED'));
    const policy = await createPolicy('high');
    await request(app)
      .post('/api/v1/sla-policies')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ priority: 'high', firstResponseMinutes: 1, resolutionMinutes: 1 })
      .expect(409);
    await request(app)
      .patch('/api/v1/sla-policies/not-a-uuid')
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ isActive: false })
      .expect(400);
    await request(app)
      .patch(`/api/v1/sla-policies/${randomUUID()}`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ isActive: false })
      .expect(404);
    await request(app)
      .patch(`/api/v1/sla-policies/${policy.id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ firstResponseMinutes: 30, isActive: true })
      .expect(200);
    for (const token of Object.values(tokens)) {
      await request(app)
        .get('/api/v1/sla-policies')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    }
  });

  it('requires an active matching policy and rejects client-controlled SLA timestamps', async () => {
    await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokens.requester}`)
      .send({ title: 'No policy', description: 'No policy', categoryId, priority: 'low' })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('SLA_POLICY_NOT_CONFIGURED'));
    const highPolicy = await pool.query<{ id: string }>(
      `SELECT id FROM sla_policies WHERE priority = 'high'`,
    );
    await request(app)
      .patch(`/api/v1/sla-policies/${highPolicy.rows[0].id}`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ isActive: false })
      .expect(200);
    await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokens.requester}`)
      .send({ title: 'Inactive policy', description: 'Must refuse', categoryId, priority: 'high' })
      .expect(409);
    await request(app)
      .patch(`/api/v1/sla-policies/${highPolicy.rows[0].id}`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ isActive: true })
      .expect(200);
    await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokens.requester}`)
      .send({
        title: 'Mass assignment',
        description: 'No policy',
        categoryId,
        priority: 'high',
        openedAt: testNow.toISOString(),
        firstResponseAt: testNow.toISOString(),
        resolvedAt: testNow.toISOString(),
        slaFirstResponseDueAt: testNow.toISOString(),
        slaResolutionDueAt: testNow.toISOString(),
        sla_first_response_due_at: testNow.toISOString(),
        sla_resolution_due_at: testNow.toISOString(),
        opened_at: testNow.toISOString(),
        first_response_at: testNow.toISOString(),
        requesterId: ids.otherRequester,
        assigneeId: ids.agent,
        status: 'resolved',
        code: 'SF-CLIENT',
      })
      .expect(400);
  });

  it('keeps business-hours policies non-operational until a calendar exists', async () => {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO sla_policies
         (priority, first_response_minutes, resolution_minutes, business_hours_only, is_active)
       VALUES ('low', 60, 240, TRUE, TRUE)
       RETURNING id`,
    );
    policyIds.push(inserted.rows[0].id);

    await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokens.requester}`)
      .send({
        title: 'Business calendar absent',
        description: 'Must refuse',
        categoryId,
        priority: 'low',
      })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('SLA_POLICY_NOT_CONFIGURED'));

    await request(app)
      .patch(`/api/v1/sla-policies/${inserted.rows[0].id}`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ isActive: true })
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('BUSINESS_HOURS_NOT_SUPPORTED'));

    await request(app)
      .patch(`/api/v1/sla-policies/${inserted.rows[0].id}`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ businessHoursOnly: false })
      .expect(200);
    await createTicket('low');
  });

  it('snapshots server-side deadlines and preserves them when priority changes', async () => {
    const ticket = await createTicket('high');
    expect(ticket.openedAt).toBe(testNow.toISOString());
    expect(ticket.slaFirstResponseDueAt).toBe(
      new Date(testNow.getTime() + 30 * 60000).toISOString(),
    );
    expect(ticket.slaResolutionDueAt).toBe(new Date(testNow.getTime() + 300 * 60000).toISOString());
    await request(app)
      .patch(`/api/v1/tickets/${ticket.id}/priority`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ priority: 'low' })
      .expect(200);
    const detail = await request(app)
      .get(`/api/v1/tickets/${ticket.id}`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .expect(200);
    expect(detail.body.ticket.slaFirstResponseDueAt).toBe(ticket.slaFirstResponseDueAt);
    expect(detail.body.ticket.slaResolutionDueAt).toBe(ticket.slaResolutionDueAt);
  });

  it('starts first response only once for a public team comment and derives met/breached', async () => {
    const ticket = await createTicket();
    await request(app)
      .post(`/api/v1/tickets/${ticket.id}/comments`)
      .set('Authorization', `Bearer ${tokens.requester}`)
      .send({ body: 'Requester reply', visibility: 'public' })
      .expect(201);
    await request(app)
      .post(`/api/v1/tickets/${ticket.id}/comments`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ body: 'Internal note', visibility: 'internal' })
      .expect(201);
    let detail = await request(app)
      .get(`/api/v1/tickets/${ticket.id}`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .expect(200);
    expect(detail.body.ticket.firstResponseAt).toBeNull();
    expect(detail.body.ticket.sla.firstResponse.status).toBe('pending');
    setClock(() => new Date(testNow.getTime() + 10 * 60000));
    await request(app)
      .post(`/api/v1/tickets/${ticket.id}/comments`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ body: 'Public agent reply', visibility: 'public' })
      .expect(201);
    detail = await request(app)
      .get(`/api/v1/tickets/${ticket.id}`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .expect(200);
    const firstResponseAt = detail.body.ticket.firstResponseAt;
    expect(detail.body.ticket.sla.firstResponse.status).toBe('met');
    setClock(() => new Date(testNow.getTime() + 40 * 60000));
    await request(app)
      .post(`/api/v1/tickets/${ticket.id}/comments`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ body: 'Later public reply', visibility: 'public' })
      .expect(201);
    detail = await request(app)
      .get(`/api/v1/tickets/${ticket.id}`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .expect(200);
    expect(detail.body.ticket.firstResponseAt).toBe(firstResponseAt);
  });

  it.each(['agent', 'manager', 'admin'] as const)(
    'accepts the first public response from %s',
    async (role) => {
      const ticket = await createTicket();
      await request(app)
        .post(`/api/v1/tickets/${ticket.id}/comments`)
        .set('Authorization', `Bearer ${tokens[role]}`)
        .send({ body: `${role} public response`, visibility: 'public' })
        .expect(201);
      const detail = await request(app)
        .get(`/api/v1/tickets/${ticket.id}`)
        .set('Authorization', `Bearer ${tokens.manager}`)
        .expect(200);
      expect(detail.body.ticket.firstResponseAt).toBe(testNow.toISOString());
    },
  );

  it('derives at risk at the exact 20% boundary and breach takes precedence', async () => {
    const ticket = await createTicket();
    setClock(() => new Date(testNow.getTime() + 23 * 60000));
    let detail = await request(app)
      .get(`/api/v1/tickets/${ticket.id}`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .expect(200);
    expect(detail.body.ticket.sla.firstResponse.status).toBe('pending');
    setClock(() => new Date(testNow.getTime() + 24 * 60000));
    detail = await request(app)
      .get(`/api/v1/tickets/${ticket.id}`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .expect(200);
    expect(detail.body.ticket.sla.firstResponse.status).toBe('at_risk');
    setClock(() => new Date(testNow.getTime() + 31 * 60000));
    detail = await request(app)
      .get(`/api/v1/tickets/${ticket.id}`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .expect(200);
    expect(detail.body.ticket.sla.firstResponse.status).toBe('breached');
  });

  it('uses exact millisecond boundaries without rounding status decisions', () => {
    const openedAt = new Date('2026-01-15T12:00:00.000Z');
    const dueAt = new Date('2026-01-15T13:40:00.000Z');

    expect(evaluateSlaClock(dueAt, null, new Date('2026-01-15T13:19:59.999Z'), 100)).toEqual({
      status: 'pending',
      remainingMinutes: 21,
    });
    expect(evaluateSlaClock(dueAt, null, new Date('2026-01-15T13:20:00.000Z'), 100)).toEqual({
      status: 'at_risk',
      remainingMinutes: 20,
    });
    expect(evaluateSlaClock(dueAt, null, dueAt, 100)).toEqual({
      status: 'breached',
      remainingMinutes: 0,
    });
    expect(
      evaluateSlaClock(dueAt, new Date('2026-01-15T10:40:00.000-03:00'), openedAt, 100),
    ).toEqual({ status: 'met', remainingMinutes: null });
    expect(evaluateSlaClock(dueAt, null, new Date(dueAt.getTime() + 1), 100)).toEqual({
      status: 'breached',
      remainingMinutes: 1,
    });
  });

  it('derives resolution status and keeps original deadline after reopening', async () => {
    const ticket = await createTicket();
    setClock(() => new Date(testNow.getTime() + 50 * 60000));
    await request(app)
      .patch(`/api/v1/tickets/${ticket.id}/status`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ status: 'in_progress' })
      .expect(200);
    const resolved = await request(app)
      .patch(`/api/v1/tickets/${ticket.id}/status`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ status: 'resolved' })
      .expect(200);
    expect(resolved.body.ticket.sla.resolution.status).toBe('met');
    const dueAt = resolved.body.ticket.slaResolutionDueAt;
    setClock(() => new Date(testNow.getTime() + 301 * 60000));
    const reopened = await request(app)
      .patch(`/api/v1/tickets/${ticket.id}/status`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ status: 'in_progress' })
      .expect(200);
    expect(reopened.body.ticket.resolvedAt).toBeNull();
    expect(reopened.body.ticket.slaResolutionDueAt).toBe(dueAt);
    expect(reopened.body.ticket.sla.resolution.status).toBe('breached');
  });

  it('classifies resolution exactly at the deadline as met and one millisecond after as breached', async () => {
    for (const [offset, expected] of [
      [300 * 60000, 'met'],
      [300 * 60000 + 1, 'breached'],
    ] as const) {
      setClock(() => new Date(testNow));
      const ticket = await createTicket('high');
      await request(app)
        .patch(`/api/v1/tickets/${ticket.id}/status`)
        .set('Authorization', `Bearer ${tokens.agent}`)
        .send({ status: 'in_progress' })
        .expect(200);
      setClock(() => new Date(testNow.getTime() + offset));
      const resolved = await request(app)
        .patch(`/api/v1/tickets/${ticket.id}/status`)
        .set('Authorization', `Bearer ${tokens.agent}`)
        .send({ status: 'resolved' })
        .expect(200);
      expect(resolved.body.ticket.sla.resolution.status).toBe(expected);
    }
  });

  it('preserves existing SLA snapshots when a policy changes and applies it to new tickets', async () => {
    setClock(() => new Date(testNow));
    const existing = await createTicket('high');
    const highPolicy = await pool.query<{ id: string }>(
      `SELECT id FROM sla_policies WHERE priority = 'high'`,
    );
    await request(app)
      .patch(`/api/v1/sla-policies/${highPolicy.rows[0].id}`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ firstResponseMinutes: 45, resolutionMinutes: 360 })
      .expect(200);
    const createdAfterChange = await createTicket('high');

    expect(existing.slaFirstResponseDueAt).toBe(
      new Date(testNow.getTime() + 30 * 60000).toISOString(),
    );
    expect(createdAfterChange.slaFirstResponseDueAt).toBe(
      new Date(testNow.getTime() + 45 * 60000).toISOString(),
    );
    const unchanged = await request(app)
      .get(`/api/v1/tickets/${existing.id}`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .expect(200);
    expect(unchanged.body.ticket.slaResolutionDueAt).toBe(existing.slaResolutionDueAt);
  });

  it('serializes policy deactivation/update against creation and supports shared concurrent reads', async () => {
    const duplicateRequests = [1, 2].map(() =>
      request(app)
        .post('/api/v1/sla-policies')
        .set('Authorization', `Bearer ${tokens.manager}`)
        .send({ priority: 'critical', firstResponseMinutes: 10, resolutionMinutes: 60 }),
    );
    const duplicateResponses = await Promise.all(duplicateRequests);
    expect(duplicateResponses.map(({ status }) => status).sort()).toEqual([201, 409]);
    const policy = duplicateResponses.find(({ status }) => status === 201)!.body.policy;
    policyIds.push(policy.id);
    const blocker = await pool.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query(`UPDATE sla_policies SET is_active = FALSE WHERE id = $1`, [policy.id]);
      const blockedCreation = request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${tokens.requester}`)
        .send({
          title: `M5 deactivate race ${randomUUID()}`,
          description: 'Policy deactivation race',
          categoryId,
          priority: 'critical',
        })
        .then((response) => response);
      await new Promise((resolve) => setTimeout(resolve, 25));
      await blocker.query('COMMIT');
      const deactivatedResponse = await blockedCreation;
      expect(deactivatedResponse.status).toBe(409);
      expect(deactivatedResponse.body.error.code).toBe('SLA_POLICY_NOT_CONFIGURED');

      await blocker.query('BEGIN');
      await blocker.query(
        `UPDATE sla_policies
         SET is_active = TRUE, first_response_minutes = 17, resolution_minutes = 61
         WHERE id = $1`,
        [policy.id],
      );
      const blockedByUpdate = request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${tokens.requester}`)
        .send({
          title: `M5 update race ${randomUUID()}`,
          description: 'Policy update race',
          categoryId,
          priority: 'critical',
        })
        .then((response) => response);
      await new Promise((resolve) => setTimeout(resolve, 25));
      await blocker.query('COMMIT');
      const updatedCreation = await blockedByUpdate;
      expect(updatedCreation.status).toBe(201);
      expect(updatedCreation.body.ticket.slaFirstResponseDueAt).toBe(
        new Date(testNow.getTime() + 17 * 60000).toISOString(),
      );

      const concurrent = await Promise.all([createTicket('critical'), createTicket('critical')]);
      expect(concurrent[0].slaResolutionDueAt).toBe(concurrent[1].slaResolutionDueAt);
      expect(concurrent[0].slaFirstResponseDueAt).toBe(concurrent[1].slaFirstResponseDueAt);
    } finally {
      await blocker.query('ROLLBACK').catch(() => undefined);
      blocker.release();
    }
  });

  it('rolls back ticket and deadline creation when the created event fails', async () => {
    const title = `M5 rollback ${randomUUID()}`;
    await pool.query(`
      CREATE OR REPLACE FUNCTION m5_reject_created_event() RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.type = 'created' THEN RAISE EXCEPTION 'controlled M5 event failure'; END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await pool.query(`
      CREATE TRIGGER m5_reject_created_event
      BEFORE INSERT ON ticket_events
      FOR EACH ROW EXECUTE FUNCTION m5_reject_created_event()
    `);
    try {
      await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${tokens.requester}`)
        .send({ title, description: 'Must roll back atomically', categoryId, priority: 'high' })
        .expect(500);
      const persisted = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM tickets WHERE title = $1`,
        [title],
      );
      expect(Number(persisted.rows[0].count)).toBe(0);
    } finally {
      await pool.query('DROP TRIGGER m5_reject_created_event ON ticket_events');
      await pool.query('DROP FUNCTION m5_reject_created_event()');
    }
  });

  it('enforces dashboard RBAC and returns scoped aggregate metrics', async () => {
    setClock(() => new Date(testNow));
    const own = await createTicket();
    const other = await createTicket('high', tokens['other-requester']);
    await request(app)
      .patch(`/api/v1/tickets/${other.id}/assignee`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ assigneeId: ids.otherAgent })
      .expect(200);
    await request(app)
      .patch(`/api/v1/tickets/${own.id}/assignee`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ assigneeId: ids.agent })
      .expect(200);
    await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${tokens.requester}`)
      .expect(403);
    const manager = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${tokens.manager}`)
      .expect(200);
    expect(manager.body.summary.byPriority.high).toBeGreaterThanOrEqual(2);
    expect(manager.body.summary.firstResponseRate).toEqual(expect.anything());
    const agent = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${tokens.agent}`)
      .expect(200);
    expect(
      agent.body.summary.attentionList.every((ticket: { id: string }) => ticket.id !== other.id),
    ).toBe(true);
  });

  it('computes exact scoped rates/averages, safe zero denominators, and excludes cancelled attention', async () => {
    setClock(() => new Date(testNow));
    ids.metricsAgent = await insertUser('agent', 'metrics-agent');
    ids.emptyAgent = await insertUser('agent', 'empty-agent');
    tokens['metrics-agent'] = await login('metrics-agent');
    tokens['empty-agent'] = await login('empty-agent');

    await pool.query(
      `UPDATE tickets SET assignee_id = $1
       WHERE requester_id = ANY($2::uuid[]) AND assignee_id IS NULL`,
      [ids.otherAgent, [ids.requester, ids.otherRequester]],
    );
    await createPolicy('medium', 100, 200);
    const met = await createTicket('medium');
    const breached = await createTicket('medium');
    const pending = await createTicket('medium');
    const cancelled = await createTicket('medium');
    await pool.query(`UPDATE tickets SET assignee_id = $1 WHERE id = ANY($2::uuid[])`, [
      ids.metricsAgent,
      [met.id, breached.id, pending.id, cancelled.id],
    ]);
    await pool.query(
      `UPDATE tickets
       SET status = 'resolved',
           first_response_at = opened_at + interval '10 minutes',
           resolved_at = opened_at + interval '100 minutes'
       WHERE id = $1`,
      [met.id],
    );
    await pool.query(
      `UPDATE tickets
       SET status = 'resolved',
           first_response_at = opened_at + interval '110 minutes',
           resolved_at = opened_at + interval '210 minutes'
       WHERE id = $1`,
      [breached.id],
    );
    await pool.query(`UPDATE tickets SET status = 'cancelled' WHERE id = $1`, [cancelled.id]);

    const scoped = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${tokens['metrics-agent']}`)
      .expect(200);
    expect(scoped.body.summary).toMatchObject({
      open: 1,
      resolved: 2,
      unassigned: 0,
      firstResponseRate: 0.5,
      resolutionRate: 0.5,
      avgMinutesToFirstResponse: 60,
      avgMinutesToResolution: 155,
    });
    expect(scoped.body.summary.byPriority.medium).toBe(4);
    expect(scoped.body.summary.byCategory[`M5 ${runId}`]).toBe(4);
    expect(scoped.body.summary.firstResponseBreached).toBe(0);
    expect(scoped.body.summary.resolutionBreached).toBe(0);
    expect(scoped.body.summary.attentionList).toEqual([]);

    const empty = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${tokens['empty-agent']}`)
      .expect(200);
    expect(empty.body.summary.firstResponseRate).toBeNull();
    expect(empty.body.summary.resolutionRate).toBeNull();
    expect(empty.body.summary.avgMinutesToFirstResponse).toBeNull();
    expect(empty.body.summary.avgMinutesToResolution).toBeNull();

    setClock(() => new Date(testNow.getTime() + 201 * 60000));
    const afterDeadline = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${tokens['metrics-agent']}`)
      .expect(200);
    expect(afterDeadline.body.summary.firstResponseBreached).toBe(1);
    expect(afterDeadline.body.summary.resolutionBreached).toBe(1);
    expect(
      afterDeadline.body.summary.attentionList.some(
        (ticket: { id: string }) => ticket.id === cancelled.id,
      ),
    ).toBe(false);
  });

  it('treats equivalent timezone offsets as the same absolute SLA instant', async () => {
    setClock(() => new Date('2026-01-15T13:00:00.000Z'));
    const ticket = await createTicket('low');
    await pool.query(
      `UPDATE tickets
       SET opened_at = $2::timestamptz,
           sla_first_response_due_at = $3::timestamptz,
           first_response_at = $4::timestamptz
       WHERE id = $1`,
      [
        ticket.id,
        '2026-01-15T09:00:00-03:00',
        '2026-01-15T10:00:00-03:00',
        '2026-01-15T15:00:00+02:00',
      ],
    );
    const detail = await request(app)
      .get(`/api/v1/tickets/${ticket.id}`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .expect(200);
    expect(detail.body.ticket.openedAt).toBe('2026-01-15T12:00:00.000Z');
    expect(detail.body.ticket.sla.firstResponse.dueAt).toBe('2026-01-15T13:00:00.000Z');
    expect(detail.body.ticket.sla.firstResponse.completedAt).toBe('2026-01-15T13:00:00.000Z');
    expect(detail.body.ticket.sla.firstResponse.status).toBe('met');
  });
});

import { randomUUID } from 'node:crypto';

import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PoolClient } from 'pg';

import { app } from './app.js';
import { pool } from './database/pool.js';

const runId = randomUUID();
const password = 'CorrectHorseBatteryStaple42';
const email = (role: string) => `m4-${role}-${runId}@example.test`;
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};
let categoryId = '';
let inactiveCategoryId = '';
let ticketId = '';
const additionalCategoryIds: string[] = [];
const policyIds: string[] = [];

async function insertUser(
  label: string,
  role: 'requester' | 'agent' | 'manager' | 'admin',
  isActive = true,
): Promise<string> {
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await pool.query<{ id: string }>(
    'INSERT INTO users (name, email, password_hash, role, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [`M4 ${label}`, email(label), passwordHash, role, isActive],
  );
  return result.rows[0].id;
}

async function login(role: string): Promise<string> {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: email(role), password })
    .expect(200);
  return response.body.token as string;
}

beforeAll(async () => {
  ids.requester = await insertUser('requester', 'requester');
  ids.other = await insertUser('requester-other', 'requester');
  ids.agent = await insertUser('agent', 'agent');
  ids.otherAgent = await insertUser('agent-other', 'agent');
  ids.manager = await insertUser('manager', 'manager');
  ids.admin = await insertUser('admin', 'admin');
  ids.inactiveAgent = await insertUser('agent-inactive', 'agent', false);

  for (const role of ['requester', 'requester-other', 'agent', 'agent-other', 'manager', 'admin']) {
    tokens[role] = await login(role);
  }

  const policy = await pool.query<{ id: string }>(
    `INSERT INTO sla_policies (priority, first_response_minutes, resolution_minutes)
     VALUES ('high', 60, 240)
     ON CONFLICT (priority) DO NOTHING
     RETURNING id`,
  );
  if (policy.rows[0]) {
    policyIds.push(policy.rows[0].id);
  }
});

afterAll(async () => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE ticket_events DISABLE TRIGGER ticket_events_prevent_mutation');
    await removeTestData(client);
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

async function removeTestData(client: PoolClient): Promise<void> {
  await client.query(
    `DELETE FROM ticket_events WHERE ticket_id IN (SELECT id FROM tickets WHERE requester_id = ANY($1::uuid[]))`,
    [[ids.requester, ids.other]],
  );
  await client.query(
    `DELETE FROM ticket_comments WHERE ticket_id IN (SELECT id FROM tickets WHERE requester_id = ANY($1::uuid[]))`,
    [[ids.requester, ids.other]],
  );
  await client.query('DELETE FROM tickets WHERE requester_id = ANY($1::uuid[])', [
    [ids.requester, ids.other],
  ]);
  if (policyIds.length > 0) {
    await client.query('DELETE FROM sla_policies WHERE id = ANY($1::uuid[])', [policyIds]);
  }
  if (categoryId || inactiveCategoryId || additionalCategoryIds.length > 0) {
    await client.query('DELETE FROM categories WHERE id = ANY($1::uuid[])', [
      [categoryId, inactiveCategoryId, ...additionalCategoryIds].filter(Boolean),
    ]);
  }
  await client.query('DELETE FROM users WHERE email LIKE $1', [`m4-%-${runId}@example.test`]);
}

async function createTestTicket(
  ownerToken = tokens.requester,
  title = `M4 audit ticket ${randomUUID()}`,
): Promise<{ id: string; code: string }> {
  const response = await request(app)
    .post('/api/v1/tickets')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ title, description: 'Independent M4 audit ticket', categoryId })
    .expect(201);

  return { id: response.body.ticket.id, code: response.body.ticket.code };
}

describe('M4 ticket workflow', () => {
  it('requires authentication for categories and tickets', async () => {
    await request(app).get('/api/v1/categories').expect(401);
    await request(app).post('/api/v1/tickets').send({}).expect(401);
  });

  it('lets a manager create categories and lists only active ones', async () => {
    const active = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ name: `M4 Active ${runId}`, defaultPriority: 'high' })
      .expect(201);
    categoryId = active.body.category.id;

    const inactive = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ name: `M4 Inactive ${runId}`, defaultPriority: 'low' })
      .expect(201);
    inactiveCategoryId = inactive.body.category.id;
    await request(app)
      .patch(`/api/v1/categories/${inactiveCategoryId}`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ isActive: false })
      .expect(200);

    const list = await request(app)
      .get('/api/v1/categories')
      .set('Authorization', `Bearer ${tokens.requester}`)
      .expect(200);
    expect(list.body.categories.some((item: { id: string }) => item.id === categoryId)).toBe(true);
    expect(
      list.body.categories.some((item: { id: string }) => item.id === inactiveCategoryId),
    ).toBe(false);
  });

  it('enforces category RBAC, validation, uniqueness and predictable errors', async () => {
    for (const token of [tokens.requester, tokens.agent]) {
      await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Forbidden category ${runId}` })
        .expect(403);
    }

    await request(app)
      .patch(`/api/v1/categories/${categoryId}`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ description: 'Forbidden' })
      .expect(403);
    await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ name: `M4 Active ${runId}` })
      .expect(409);
    await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ name: '   ' })
      .expect(400);
    await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ name: `Invalid priority ${runId}`, defaultPriority: 'urgent' })
      .expect(400);
    await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ name: `Extra field ${runId}`, unexpected: true })
      .expect(400);
    await request(app)
      .patch('/api/v1/categories/not-a-uuid')
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ isActive: false })
      .expect(400);
    await request(app)
      .patch(`/api/v1/categories/${randomUUID()}`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ isActive: false })
      .expect(404);

    const adminCategory = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ name: `M4 Admin ${runId}`, defaultPriority: 'medium' })
      .expect(201);
    additionalCategoryIds.push(adminCategory.body.category.id);
    await request(app)
      .patch(`/api/v1/categories/${adminCategory.body.category.id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ description: 'Updated by admin' })
      .expect(200);
  });

  it('rejects unsupported fields and inactive categories', async () => {
    await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokens.requester}`)
      .send({
        title: 'Invalid ticket',
        description: 'Requester id must not be accepted',
        categoryId,
        requesterId: ids.other,
      })
      .expect(400);

    await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokens.requester}`)
      .send({
        title: 'Invalid category',
        description: 'Inactive category',
        categoryId: inactiveCategoryId,
      })
      .expect(400);
  });

  it('rejects privileged ticket fields as mass assignment', async () => {
    await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokens.requester}`)
      .send({
        title: 'Malicious ticket',
        description: 'Must be rejected',
        categoryId,
        assigneeId: ids.agent,
        authorId: ids.agent,
        actorId: ids.agent,
        code: 'SF-999999',
        status: 'closed',
        createdAt: new Date().toISOString(),
        slaResolutionDueAt: new Date().toISOString(),
      })
      .expect(400);
  });

  it('creates a ticket with server-owned requester, code, defaults and event', async () => {
    const response = await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokens.requester}`)
      .send({ title: 'M4 ticket', description: 'Ticket created by integration test', categoryId })
      .expect(201);

    ticketId = response.body.ticket.id;
    expect(response.body.ticket.code).toMatch(/^SF-\d{6}$/);
    expect(response.body.ticket.requester.id).toBe(ids.requester);
    expect(response.body.ticket.priority).toBe('high');
    expect(response.body.ticket.status).toBe('open');
    expect(response.body.ticket.events.map((event: { type: string }) => event.type)).toContain(
      'created',
    );
  });

  it('scopes requester lists and returns 404 for another requester', async () => {
    const own = await request(app)
      .get('/api/v1/tickets?page=1&pageSize=20')
      .set('Authorization', `Bearer ${tokens.requester}`)
      .expect(200);
    expect(own.body.items.map((item: { id: string }) => item.id)).toContain(ticketId);

    const other = await request(app)
      .get('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokens['requester-other']}`)
      .expect(200);
    expect(other.body.items.map((item: { id: string }) => item.id)).not.toContain(ticketId);

    await request(app)
      .get(`/api/v1/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${tokens['requester-other']}`)
      .expect(404);
  });

  it('prevents requester IDOR across detail, comments, filters and mutations', async () => {
    const otherTicket = await createTestTicket(tokens['requester-other']);

    await request(app)
      .get(`/api/v1/tickets/${otherTicket.id}`)
      .set('Authorization', `Bearer ${tokens.requester}`)
      .expect(404);
    await request(app)
      .post(`/api/v1/tickets/${otherTicket.id}/comments`)
      .set('Authorization', `Bearer ${tokens.requester}`)
      .send({ body: 'Unauthorized comment' })
      .expect(404);

    for (const [path, body] of [
      [`/api/v1/tickets/${otherTicket.id}/assignee`, { assigneeId: ids.agent }],
      [`/api/v1/tickets/${otherTicket.id}/priority`, { priority: 'low' }],
      [`/api/v1/tickets/${otherTicket.id}/status`, { status: 'in_progress' }],
    ] as const) {
      await request(app)
        .patch(path)
        .set('Authorization', `Bearer ${tokens.requester}`)
        .send(body)
        .expect(403);
    }

    const filtered = await request(app)
      .get(`/api/v1/tickets?assigneeId=${ids.agent}&page=1&pageSize=100`)
      .set('Authorization', `Bearer ${tokens.requester}`)
      .expect(200);
    expect(
      filtered.body.items.every(
        (item: { requester: { id: string } }) => item.requester.id === ids.requester,
      ),
    ).toBe(true);
  });

  it('validates pagination and caps pageSize', async () => {
    await request(app)
      .get('/api/v1/tickets?page=zero')
      .set('Authorization', `Bearer ${tokens.manager}`)
      .expect(400);
    await request(app)
      .get('/api/v1/tickets?pageSize=101')
      .set('Authorization', `Bearer ${tokens.manager}`)
      .expect(400);
  });

  it('rejects invalid pagination and filter values', async () => {
    for (const query of [
      'page=0',
      'page=-1',
      'pageSize=0',
      'pageSize=-1',
      'status=unknown',
      'priority=urgent',
      'categoryId=invalid',
      'assigneeId=invalid',
    ]) {
      await request(app)
        .get(`/api/v1/tickets?${query}`)
        .set('Authorization', `Bearer ${tokens.manager}`)
        .expect(400);
    }
  });

  it('prevents requester administrative actions', async () => {
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/assignee`)
      .set('Authorization', `Bearer ${tokens.requester}`)
      .send({ assigneeId: ids.agent })
      .expect(403);
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/priority`)
      .set('Authorization', `Bearer ${tokens.requester}`)
      .send({ priority: 'critical' })
      .expect(403);
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/status`)
      .set('Authorization', `Bearer ${tokens.requester}`)
      .send({ status: 'in_progress' })
      .expect(403);
  });

  it('validates assignees and allows manager assignment', async () => {
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/assignee`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ assigneeId: ids.requester })
      .expect(400);
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/assignee`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ assigneeId: ids.inactiveAgent })
      .expect(400);

    const response = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/assignee`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ assigneeId: ids.agent })
      .expect(200);
    expect(response.body.ticket.assignee.id).toBe(ids.agent);
    expect(response.body.ticket.events.map((event: { type: string }) => event.type)).toContain(
      'assigned',
    );
  });

  it('rejects unsupported, missing and malformed assignment targets', async () => {
    const targetTicket = await createTestTicket();

    for (const assigneeId of [ids.manager, ids.admin, randomUUID()]) {
      await request(app)
        .patch(`/api/v1/tickets/${targetTicket.id}/assignee`)
        .set('Authorization', `Bearer ${tokens.manager}`)
        .send({ assigneeId })
        .expect(400);
    }
    await request(app)
      .patch(`/api/v1/tickets/${targetTicket.id}/assignee`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ assigneeId: 'not-a-uuid' })
      .expect(400);
    await request(app)
      .patch(`/api/v1/tickets/${randomUUID()}/assignee`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ assigneeId: ids.agent })
      .expect(404);
    await request(app)
      .patch('/api/v1/tickets/not-a-uuid/assignee')
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ assigneeId: ids.agent })
      .expect(400);
  });

  it('serializes concurrent claims without allowing an agent overwrite', async () => {
    const targetTicket = await createTestTicket();
    const attempts = await Promise.all([
      request(app)
        .patch(`/api/v1/tickets/${targetTicket.id}/assignee`)
        .set('Authorization', `Bearer ${tokens.agent}`)
        .send({ assigneeId: ids.agent }),
      request(app)
        .patch(`/api/v1/tickets/${targetTicket.id}/assignee`)
        .set('Authorization', `Bearer ${tokens['agent-other']}`)
        .send({ assigneeId: ids.otherAgent }),
    ]);

    expect(attempts.map(({ status }) => status).sort()).toEqual([200, 409]);
    const detail = await request(app)
      .get(`/api/v1/tickets/${targetTicket.id}`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .expect(200);
    expect([ids.agent, ids.otherAgent]).toContain(detail.body.ticket.assignee.id);
    expect(
      detail.body.ticket.events.filter((event: { type: string }) => event.type === 'assigned'),
    ).toHaveLength(1);
  });

  it('prevents agents assigning someone else and allows explicit claim of unassigned ticket', async () => {
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/assignee`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ assigneeId: null })
      .expect(200);
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/assignee`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ assigneeId: ids.manager })
      .expect(403);
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/assignee`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ assigneeId: ids.agent })
      .expect(200);
  });

  it('allows priority change only for manager/admin', async () => {
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/priority`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ priority: 'critical' })
      .expect(403);
    const response = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/priority`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ priority: 'critical' })
      .expect(200);
    expect(response.body.ticket.priority).toBe('critical');
  });

  it('enforces status transitions and records events', async () => {
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/status`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ status: 'closed' })
      .expect(409);

    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/status`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ status: 'in_progress' })
      .expect(200);
    const resolved = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/status`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ status: 'resolved' })
      .expect(200);
    expect(resolved.body.ticket.events.map((event: { type: string }) => event.type)).toContain(
      'resolved',
    );

    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/status`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ status: 'in_progress' })
      .expect(200);
  });

  it('enforces terminal states and maintains resolved/closed timestamps', async () => {
    const targetTicket = await createTestTicket();

    await request(app)
      .patch(`/api/v1/tickets/${targetTicket.id}/status`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ status: 'cancelled' })
      .expect(403);
    for (const status of ['in_progress', 'waiting_requester', 'in_progress', 'resolved'] as const) {
      await request(app)
        .patch(`/api/v1/tickets/${targetTicket.id}/status`)
        .set('Authorization', `Bearer ${tokens.agent}`)
        .send({ status })
        .expect(200);
    }
    const reopened = await request(app)
      .patch(`/api/v1/tickets/${targetTicket.id}/status`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ status: 'in_progress' })
      .expect(200);
    expect(reopened.body.ticket.resolvedAt).toBeNull();
    expect(
      reopened.body.ticket.events.some((event: { type: string }) => event.type === 'reopened'),
    ).toBe(true);

    await request(app)
      .patch(`/api/v1/tickets/${targetTicket.id}/status`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ status: 'resolved' })
      .expect(200);
    const closed = await request(app)
      .patch(`/api/v1/tickets/${targetTicket.id}/status`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ status: 'closed' })
      .expect(200);
    expect(closed.body.ticket.resolvedAt).toEqual(expect.any(String));
    expect(closed.body.ticket.closedAt).toEqual(expect.any(String));
    expect(new Date(closed.body.ticket.closedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(closed.body.ticket.resolvedAt).getTime(),
    );
    await request(app)
      .patch(`/api/v1/tickets/${targetTicket.id}/status`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ status: 'in_progress' })
      .expect(409);

    const cancelledTicket = await createTestTicket();
    await request(app)
      .patch(`/api/v1/tickets/${cancelledTicket.id}/status`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ status: 'cancelled' })
      .expect(200);
    await request(app)
      .patch(`/api/v1/tickets/${cancelledTicket.id}/status`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ status: 'in_progress' })
      .expect(409);
  });

  it('serializes concurrent status and priority changes with a consistent audit trail', async () => {
    const statusTicket = await createTestTicket();
    const statusAttempts = await Promise.all([
      request(app)
        .patch(`/api/v1/tickets/${statusTicket.id}/status`)
        .set('Authorization', `Bearer ${tokens.agent}`)
        .send({ status: 'in_progress' }),
      request(app)
        .patch(`/api/v1/tickets/${statusTicket.id}/status`)
        .set('Authorization', `Bearer ${tokens['agent-other']}`)
        .send({ status: 'in_progress' }),
    ]);
    expect(statusAttempts.map(({ status }) => status).sort()).toEqual([200, 409]);

    const statusEvents = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ticket_events
       WHERE ticket_id=$1 AND type='status_changed'`,
      [statusTicket.id],
    );
    expect(statusEvents.rows[0].count).toBe('1');

    const priorityTicket = await createTestTicket();
    const priorityAttempts = await Promise.all([
      request(app)
        .patch(`/api/v1/tickets/${priorityTicket.id}/priority`)
        .set('Authorization', `Bearer ${tokens.manager}`)
        .send({ priority: 'critical' }),
      request(app)
        .patch(`/api/v1/tickets/${priorityTicket.id}/priority`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ priority: 'low' }),
    ]);
    expect(priorityAttempts.map(({ status }) => status)).toEqual([200, 200]);

    const priorityDetail = await request(app)
      .get(`/api/v1/tickets/${priorityTicket.id}`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .expect(200);
    expect(['critical', 'low']).toContain(priorityDetail.body.ticket.priority);
    expect(
      priorityDetail.body.ticket.events.filter(
        (event: { type: string }) => event.type === 'priority_changed',
      ),
    ).toHaveLength(2);

    for (const priority of ['medium', 'high'] as const) {
      await request(app)
        .patch(`/api/v1/tickets/${priorityTicket.id}/priority`)
        .set('Authorization', `Bearer ${tokens.manager}`)
        .send({ priority })
        .expect(200);
    }
    await request(app)
      .patch(`/api/v1/tickets/${priorityTicket.id}/priority`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ priority: 'urgent' })
      .expect(400);
  });

  it('supports public and internal comments without leaking internal content', async () => {
    await request(app)
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${tokens.requester}`)
      .send({ body: 'Requester public comment', visibility: 'public' })
      .expect(201);
    await request(app)
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${tokens.requester}`)
      .send({ body: 'Requester internal attempt', visibility: 'internal' })
      .expect(403);
    await request(app)
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ body: 'Secret internal note', visibility: 'internal', authorId: ids.requester })
      .expect(400);
    await request(app)
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ body: 'Secret internal note', visibility: 'internal' })
      .expect(201);

    const requesterView = await request(app)
      .get(`/api/v1/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${tokens.requester}`)
      .expect(200);
    expect(JSON.stringify(requesterView.body)).not.toContain('Secret internal note');
    expect(
      requesterView.body.ticket.comments.every(
        (comment: { visibility: string }) => comment.visibility === 'public',
      ),
    ).toBe(true);

    const teamView = await request(app)
      .get(`/api/v1/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .expect(200);
    expect(JSON.stringify(teamView.body)).toContain('Secret internal note');
  });

  it('sets first response once for concurrent public team comments and never for internal/requester comments', async () => {
    const targetTicket = await createTestTicket();
    await request(app)
      .post(`/api/v1/tickets/${targetTicket.id}/comments`)
      .set('Authorization', `Bearer ${tokens.requester}`)
      .send({ body: 'Requester comment' })
      .expect(201);
    await request(app)
      .post(`/api/v1/tickets/${targetTicket.id}/comments`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ body: 'Internal note', visibility: 'internal' })
      .expect(201);
    await request(app)
      .post(`/api/v1/tickets/${targetTicket.id}/comments`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ body: 'Manager internal note', visibility: 'internal' })
      .expect(201);
    const before = await request(app)
      .get(`/api/v1/tickets/${targetTicket.id}`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .expect(200);
    expect(before.body.ticket.firstResponseAt).toBeNull();

    const responses = await Promise.all([
      request(app)
        .post(`/api/v1/tickets/${targetTicket.id}/comments`)
        .set('Authorization', `Bearer ${tokens.agent}`)
        .send({ body: 'First concurrent public response' }),
      request(app)
        .post(`/api/v1/tickets/${targetTicket.id}/comments`)
        .set('Authorization', `Bearer ${tokens.manager}`)
        .send({ body: 'Second concurrent public response' }),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([201, 201]);

    const after = await request(app)
      .get(`/api/v1/tickets/${targetTicket.id}`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .expect(200);
    expect(after.body.ticket.firstResponseAt).toEqual(expect.any(String));
    expect(JSON.stringify(after.body.ticket.events)).not.toContain('concurrent public response');

    const firstResponseAt = after.body.ticket.firstResponseAt;
    await request(app)
      .post(`/api/v1/tickets/${targetTicket.id}/comments`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ body: 'Later public response' })
      .expect(201);
    const afterLaterResponse = await request(app)
      .get(`/api/v1/tickets/${targetTicket.id}`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .expect(200);
    expect(afterLaterResponse.body.ticket.firstResponseAt).toBe(firstResponseAt);

    await request(app)
      .post(`/api/v1/tickets/${targetTicket.id}/comments`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ body: 'Admin internal note', visibility: 'internal' })
      .expect(201);
    const requesterView = await request(app)
      .get(`/api/v1/tickets/${targetTicket.id}`)
      .set('Authorization', `Bearer ${tokens.requester}`)
      .expect(200);
    expect(JSON.stringify(requesterView.body)).not.toContain('Admin internal note');
  });

  it('rejects empty, whitespace, extra-field and cross-requester comments', async () => {
    const otherTicket = await createTestTicket(tokens['requester-other']);

    for (const body of ['', '   ']) {
      await request(app)
        .post(`/api/v1/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${tokens.requester}`)
        .send({ body })
        .expect(400);
    }
    await request(app)
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ body: 'Valid body', actorId: ids.requester })
      .expect(400);
    await request(app)
      .post(`/api/v1/tickets/${otherTicket.id}/comments`)
      .set('Authorization', `Bearer ${tokens.requester}`)
      .send({ body: 'Cross requester attempt' })
      .expect(404);
  });

  it('creates concurrent tickets with unique PostgreSQL-generated codes', async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        request(app)
          .post('/api/v1/tickets')
          .set('Authorization', `Bearer ${tokens.requester}`)
          .send({
            title: `Concurrent ticket ${index} ${runId}`,
            description: 'Concurrent code generation audit',
            categoryId,
          }),
      ),
    );
    expect(responses.every(({ status }) => status === 201)).toBe(true);
    const codes = responses.map(({ body }) => body.ticket.code as string);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => /^SF-\d{6,}$/.test(code))).toBe(true);
  });

  it('prevents ticket event mutation at database level', async () => {
    const event = await pool.query<{ id: string }>(
      'SELECT id FROM ticket_events WHERE ticket_id = $1 LIMIT 1',
      [ticketId],
    );
    await expect(
      pool.query('DELETE FROM ticket_events WHERE id = $1', [event.rows[0].id]),
    ).rejects.toMatchObject({
      code: 'P0001',
    });
    await expect(
      pool.query('UPDATE ticket_events SET type = type WHERE id = $1', [event.rows[0].id]),
    ).rejects.toMatchObject({ code: 'P0001' });
  });

  it('rolls back a ticket mutation when its event insert fails', async () => {
    const targetTicket = await createTestTicket();
    await pool.query('CREATE TABLE audit_event_failures (ticket_id UUID PRIMARY KEY)');
    await pool.query('INSERT INTO audit_event_failures(ticket_id) VALUES ($1)', [targetTicket.id]);
    await pool.query(`
      CREATE FUNCTION audit_reject_event() RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM audit_event_failures WHERE ticket_id = NEW.ticket_id) THEN
          RAISE EXCEPTION 'forced audit event failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await pool.query(
      'CREATE TRIGGER audit_reject_event BEFORE INSERT ON ticket_events FOR EACH ROW EXECUTE FUNCTION audit_reject_event()',
    );

    try {
      await request(app)
        .patch(`/api/v1/tickets/${targetTicket.id}/priority`)
        .set('Authorization', `Bearer ${tokens.manager}`)
        .send({ priority: 'low' })
        .expect(500);
    } finally {
      await pool.query('DROP TRIGGER audit_reject_event ON ticket_events');
      await pool.query('DROP FUNCTION audit_reject_event()');
      await pool.query('DROP TABLE audit_event_failures');
    }

    const persisted = await pool.query<{ priority: string; priority_events: string }>(
      `SELECT t.priority,
        (SELECT COUNT(*) FROM ticket_events te WHERE te.ticket_id=t.id AND te.type='priority_changed') AS priority_events
       FROM tickets t WHERE t.id=$1`,
      [targetTicket.id],
    );
    expect(persisted.rows[0]).toEqual({ priority: 'high', priority_events: '0' });
  });
});

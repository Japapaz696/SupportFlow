import { randomUUID } from 'node:crypto';

import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { NotificationType } from '@supportflow/shared';
import type { PoolClient } from 'pg';

import { app } from './app.js';
import { pool } from './database/pool.js';
import { resetClock, setClock } from './domain/clock.js';

const runId = randomUUID();
const password = 'CorrectHorseBatteryStaple42';
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};
let categoryId = '';
let inactiveCategoryId = '';
let policyId = '';
const testNow = new Date('2026-02-10T12:00:00.000Z');

const email = (label: string) => `m6-${label}-${runId}@example.test`;

async function insertUser(role: 'requester' | 'agent' | 'manager' | 'admin', label = role) {
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id`,
    [`M6 ${label}`, email(label), passwordHash, role],
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

async function createTicket(token = tokens.requester, title = `M6 ticket ${randomUUID()}`) {
  const response = await request(app)
    .post('/api/v1/tickets')
    .set('Authorization', `Bearer ${token}`)
    .send({ title, description: 'M6 notification ticket', categoryId, priority: 'critical' })
    .expect(201);
  return response.body.ticket as { id: string; code: string; title: string };
}

async function unreadCount(token: string) {
  const response = await request(app)
    .get('/api/v1/notifications/unread-count')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  return response.body.unread as number;
}

async function listNotifications(token: string, page = 1, pageSize = 20) {
  const response = await request(app)
    .get('/api/v1/notifications')
    .query({ page, pageSize })
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  return response.body as {
    items: Array<{ id: string; type: NotificationType; ticketId: string; readAt: string | null }>;
    page: number;
    pageSize: number;
    total: number;
  };
}

async function removeTestData(client: PoolClient): Promise<void> {
  const userIds = [
    ids.requester,
    ids.otherRequester,
    ids.agent,
    ids.otherAgent,
    ids.manager,
    ids.admin,
  ];

  await client.query('DELETE FROM notifications WHERE user_id = ANY($1::uuid[])', [userIds]);
  await client.query(
    `DELETE FROM ticket_events WHERE ticket_id IN (SELECT id FROM tickets WHERE requester_id = ANY($1::uuid[]))`,
    [[ids.requester, ids.otherRequester]],
  );
  await client.query(
    `DELETE FROM ticket_comments WHERE ticket_id IN (SELECT id FROM tickets WHERE requester_id = ANY($1::uuid[]))`,
    [[ids.requester, ids.otherRequester]],
  );
  await client.query('DELETE FROM tickets WHERE requester_id = ANY($1::uuid[])', [
    [ids.requester, ids.otherRequester],
  ]);
  await client.query('DELETE FROM categories WHERE id = ANY($1::uuid[])', [
    [categoryId, inactiveCategoryId].filter(Boolean),
  ]);
  await client.query('DELETE FROM sla_policies WHERE id = $1', [policyId]);
  await client.query('DELETE FROM users WHERE email LIKE $1', [`m6-%-${runId}@example.test`]);
}

beforeAll(async () => {
  setClock(() => new Date(testNow));
  ids.requester = await insertUser('requester');
  ids.otherRequester = await insertUser('requester', 'other-requester');
  ids.agent = await insertUser('agent');
  ids.otherAgent = await insertUser('agent', 'other-agent');
  ids.manager = await insertUser('manager');
  ids.admin = await insertUser('admin');

  tokens.requester = await login('requester');
  tokens.otherRequester = await login('other-requester');
  tokens.agent = await login('agent');
  tokens.otherAgent = await login('other-agent');
  tokens.manager = await login('manager');
  tokens.admin = await login('admin');

  const policy = await pool.query<{ id: string }>(
    `INSERT INTO sla_policies (priority, first_response_minutes, resolution_minutes)
     VALUES ('critical', 30, 120)
     ON CONFLICT (priority) DO UPDATE
       SET first_response_minutes = 30,
           resolution_minutes = 120,
           business_hours_only = FALSE,
           is_active = TRUE
     RETURNING id`,
  );
  policyId = policy.rows[0].id;

  const activeCategory = await pool.query<{ id: string }>(
    `INSERT INTO categories (name, default_priority) VALUES ($1, 'critical') RETURNING id`,
    [`M6 ${runId}`],
  );
  categoryId = activeCategory.rows[0].id;

  const inactiveCategory = await pool.query<{ id: string }>(
    `INSERT INTO categories (name, default_priority, is_active)
     VALUES ($1, 'critical', FALSE) RETURNING id`,
    [`M6 inactive ${runId}`],
  );
  inactiveCategoryId = inactiveCategory.rows[0].id;
});

afterAll(async () => {
  resetClock();
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

describe('M6 notifications and category UX API', () => {
  beforeEach(() => {
    setClock(() => new Date(testNow));
  });

  it('requires authentication for notification endpoints', async () => {
    await request(app).get('/api/v1/notifications').expect(401);
    await request(app).get('/api/v1/notifications/unread-count').expect(401);
    await request(app).patch('/api/v1/notifications/read-all').expect(401);
    await request(app).patch(`/api/v1/notifications/${randomUUID()}/read`).expect(401);
  });

  it('creates assignment and reassignment notifications for the new assignee', async () => {
    const ticket = await createTicket();

    await request(app)
      .patch(`/api/v1/tickets/${ticket.id}/assignee`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ assigneeId: ids.agent })
      .expect(200);

    expect(await unreadCount(tokens.agent)).toBe(1);
    let notifications = await listNotifications(tokens.agent);
    expect(notifications.items[0]).toMatchObject({
      type: 'ticket_assigned',
      ticketId: ticket.id,
      readAt: null,
    });

    await request(app)
      .patch(`/api/v1/tickets/${ticket.id}/assignee`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ assigneeId: ids.otherAgent })
      .expect(200);

    expect(await unreadCount(tokens.otherAgent)).toBe(1);
    notifications = await listNotifications(tokens.otherAgent);
    expect(notifications.items[0]).toMatchObject({
      type: 'ticket_reassigned',
      ticketId: ticket.id,
      readAt: null,
    });
  });

  it('creates status and priority notifications for related users except the actor', async () => {
    const ticket = await createTicket();

    await request(app)
      .patch(`/api/v1/tickets/${ticket.id}/assignee`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ assigneeId: ids.agent })
      .expect(200);

    await request(app)
      .patch(`/api/v1/tickets/${ticket.id}/status`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ status: 'in_progress' })
      .expect(200);
    await request(app)
      .patch(`/api/v1/tickets/${ticket.id}/priority`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ priority: 'high' })
      .expect(200);
    await request(app)
      .patch(`/api/v1/tickets/${ticket.id}/status`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ status: 'resolved' })
      .expect(200);
    await request(app)
      .patch(`/api/v1/tickets/${ticket.id}/status`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ status: 'in_progress' })
      .expect(200);
    await request(app)
      .patch(`/api/v1/tickets/${ticket.id}/status`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ status: 'resolved' })
      .expect(200);
    await request(app)
      .patch(`/api/v1/tickets/${ticket.id}/status`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ status: 'closed' })
      .expect(200);

    const requesterNotifications = await listNotifications(tokens.requester);
    expect(requesterNotifications.items.map((item) => item.type)).toEqual(
      expect.arrayContaining([
        'ticket_status_changed',
        'ticket_priority_changed',
        'ticket_resolved',
        'ticket_reopened',
        'ticket_closed',
      ]),
    );

    const managerNotifications = await listNotifications(tokens.manager);
    expect(managerNotifications.items.every((item) => item.ticketId !== ticket.id)).toBe(true);
  });

  it('notifies public comments and never notifies the requester for internal comments', async () => {
    const ticket = await createTicket();

    await request(app)
      .patch(`/api/v1/tickets/${ticket.id}/assignee`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ assigneeId: ids.agent })
      .expect(200);

    await request(app)
      .post(`/api/v1/tickets/${ticket.id}/comments`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ body: 'Comentário público M6', visibility: 'public' })
      .expect(201);

    let requesterNotifications = await listNotifications(tokens.requester);
    expect(requesterNotifications.items[0]).toMatchObject({
      type: 'ticket_comment_public',
      ticketId: ticket.id,
    });
    const requesterTotalAfterPublicComment = requesterNotifications.total;

    await request(app)
      .post(`/api/v1/tickets/${ticket.id}/comments`)
      .set('Authorization', `Bearer ${tokens.agent}`)
      .send({ body: 'Comentário interno M6', visibility: 'internal' })
      .expect(201);

    requesterNotifications = await listNotifications(tokens.requester);
    expect(requesterNotifications.total).toBe(requesterTotalAfterPublicComment);
    expect(requesterNotifications.items.map((item) => item.type)).not.toContain(
      'ticket_comment_internal',
    );
  });

  it('supports unread count, read-one, read-all, pagination and IDOR protection', async () => {
    const firstTicket = await createTicket();
    const secondTicket = await createTicket(tokens.otherRequester);

    await request(app)
      .post(`/api/v1/tickets/${firstTicket.id}/comments`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ body: 'Primeira notificação paginada', visibility: 'public' })
      .expect(201);
    await request(app)
      .post(`/api/v1/tickets/${firstTicket.id}/comments`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ body: 'Segunda notificação paginada', visibility: 'public' })
      .expect(201);
    await request(app)
      .post(`/api/v1/tickets/${secondTicket.id}/comments`)
      .set('Authorization', `Bearer ${tokens.manager}`)
      .send({ body: 'Notificação de outro requester', visibility: 'public' })
      .expect(201);

    expect(await unreadCount(tokens.requester)).toBeGreaterThanOrEqual(2);
    const firstPage = await listNotifications(tokens.requester, 1, 1);
    expect(firstPage.page).toBe(1);
    expect(firstPage.pageSize).toBe(1);
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.total).toBeGreaterThanOrEqual(2);

    const notificationId = firstPage.items[0].id;
    await request(app)
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${tokens.otherRequester}`)
      .expect(404);

    await request(app)
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${tokens.requester}`)
      .expect(200)
      .expect(({ body }) => expect(body.notification.readAt).toEqual(expect.any(String)));

    await request(app)
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${tokens.requester}`)
      .expect(200)
      .expect(({ body }) => expect(body.updated).toBeGreaterThanOrEqual(1));
    expect(await unreadCount(tokens.requester)).toBe(0);

    const otherRequesterNotifications = await listNotifications(tokens.otherRequester);
    expect(
      otherRequesterNotifications.items.every((item) => item.ticketId !== firstTicket.id),
    ).toBe(true);
  });

  it('restricts inactive category listing to managers and admins', async () => {
    await request(app)
      .get('/api/v1/categories')
      .query({ includeInactive: 'true' })
      .set('Authorization', `Bearer ${tokens.requester}`)
      .expect(403);
    await request(app)
      .get('/api/v1/categories')
      .query({ includeInactive: 'true' })
      .set('Authorization', `Bearer ${tokens.agent}`)
      .expect(403);
    await request(app)
      .get('/api/v1/categories')
      .query({ includeInactive: 'maybe' })
      .set('Authorization', `Bearer ${tokens.manager}`)
      .expect(400);

    for (const token of [tokens.manager, tokens.admin]) {
      await request(app)
        .get('/api/v1/categories')
        .query({ includeInactive: 'true' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.categories).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: inactiveCategoryId, isActive: false }),
            ]),
          );
        });
    }
  });
});

import type { PoolClient } from 'pg';
import type {
  CommentVisibility,
  TicketEventType,
  TicketPriority,
  TicketStatus,
} from '@supportflow/shared';

import { pool } from '../database/pool.js';
import type { TicketCommentRow, TicketEventRow, TicketRow } from '../domain/tickets.js';

type QueryExecutor = Pick<typeof pool, 'query'> | PoolClient;

const ticketSelect = `
  t.id,
  t.code,
  t.title,
  t.description,
  t.status,
  t.priority,
  t.category_id,
  c.name AS category_name,
  t.requester_id,
  requester.name AS requester_name,
  t.assignee_id,
  assignee.name AS assignee_name,
  t.opened_at,
  t.first_response_at,
  t.resolved_at,
  t.closed_at,
  t.sla_first_response_due_at,
  t.sla_resolution_due_at,
  t.created_at,
  t.updated_at
`;

const ticketJoins = `
  JOIN categories c ON c.id = t.category_id
  JOIN users requester ON requester.id = t.requester_id
  LEFT JOIN users assignee ON assignee.id = t.assignee_id
`;

export type TicketListFilters = {
  requesterId?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  categoryId?: string;
  assigneeId?: string;
  limit: number;
  offset: number;
};

export async function listTickets(
  filters: TicketListFilters,
  executor: QueryExecutor = pool,
): Promise<{ tickets: TicketRow[]; total: number }> {
  const where: string[] = [];
  const values: Array<string | number> = [];

  if (filters.requesterId) {
    values.push(filters.requesterId);
    where.push(`t.requester_id = $${values.length}`);
  }

  if (filters.status) {
    values.push(filters.status);
    where.push(`t.status = $${values.length}`);
  }

  if (filters.priority) {
    values.push(filters.priority);
    where.push(`t.priority = $${values.length}`);
  }

  if (filters.categoryId) {
    values.push(filters.categoryId);
    where.push(`t.category_id = $${values.length}`);
  }

  if (filters.assigneeId) {
    values.push(filters.assigneeId);
    where.push(`t.assignee_id = $${values.length}`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const dataValues = [...values, filters.limit, filters.offset];
  const ticketsResult = await executor.query<TicketRow>(
    `
      SELECT ${ticketSelect}
      FROM tickets t
      ${ticketJoins}
      ${whereClause}
      ORDER BY t.updated_at DESC, t.id DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `,
    dataValues,
  );
  const countResult = await executor.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM tickets t ${whereClause}`,
    values,
  );

  return { tickets: ticketsResult.rows, total: Number(countResult.rows[0]?.total ?? 0) };
}

export async function findTicketById(
  id: string,
  executor: QueryExecutor = pool,
): Promise<TicketRow | null> {
  const result = await executor.query<TicketRow>(
    `SELECT ${ticketSelect} FROM tickets t ${ticketJoins} WHERE t.id = $1`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function findTicketByIdForUpdate(
  id: string,
  client: PoolClient,
): Promise<TicketRow | null> {
  const result = await client.query<TicketRow>(
    `SELECT ${ticketSelect} FROM tickets t ${ticketJoins} WHERE t.id = $1 FOR UPDATE OF t`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function createTicket(
  input: {
    title: string;
    description: string;
    categoryId: string;
    requesterId: string;
    priority: TicketPriority;
    openedAt: Date;
    slaFirstResponseDueAt: Date;
    slaResolutionDueAt: Date;
  },
  client: PoolClient,
): Promise<TicketRow> {
  const result = await client.query<TicketRow>(
    `
      INSERT INTO tickets (title, description, category_id, requester_id, priority, opened_at, sla_first_response_due_at, sla_resolution_due_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING ${ticketSelect.replaceAll('t.', '').replace('c.name AS category_name,', `(SELECT name FROM categories WHERE id = category_id) AS category_name,`).replace('requester.name AS requester_name,', `(SELECT name FROM users WHERE id = requester_id) AS requester_name,`).replace('assignee.name AS assignee_name,', `(SELECT name FROM users WHERE id = assignee_id) AS assignee_name,`)}
    `,
    [
      input.title,
      input.description,
      input.categoryId,
      input.requesterId,
      input.priority,
      input.openedAt,
      input.slaFirstResponseDueAt,
      input.slaResolutionDueAt,
    ],
  );

  return result.rows[0];
}

export async function updateTicketFields(
  id: string,
  fields: Partial<{
    status: TicketStatus;
    priority: TicketPriority;
    assigneeId: string | null;
    firstResponseAt: Date;
    resolvedAt: Date | null;
    closedAt: Date | null;
  }>,
  client: PoolClient,
): Promise<TicketRow> {
  const assignments: string[] = [];
  const values: Array<string | Date | null> = [];

  if (fields.status !== undefined) {
    values.push(fields.status);
    assignments.push(`status = $${values.length}`);
  }

  if (fields.priority !== undefined) {
    values.push(fields.priority);
    assignments.push(`priority = $${values.length}`);
  }

  if ('assigneeId' in fields) {
    values.push(fields.assigneeId ?? null);
    assignments.push(`assignee_id = $${values.length}`);
  }

  if (fields.firstResponseAt !== undefined) {
    values.push(fields.firstResponseAt);
    assignments.push(`first_response_at = COALESCE(first_response_at, $${values.length})`);
  }

  if ('resolvedAt' in fields) {
    values.push(fields.resolvedAt ?? null);
    assignments.push(`resolved_at = $${values.length}`);
  }

  if ('closedAt' in fields) {
    values.push(fields.closedAt ?? null);
    assignments.push(`closed_at = $${values.length}`);
  }

  values.push(id);
  const result = await client.query<TicketRow>(
    `
      UPDATE tickets
      SET ${assignments.join(', ')}
      WHERE id = $${values.length}
      RETURNING ${ticketSelect.replaceAll('t.', '').replace('c.name AS category_name,', `(SELECT name FROM categories WHERE id = category_id) AS category_name,`).replace('requester.name AS requester_name,', `(SELECT name FROM users WHERE id = requester_id) AS requester_name,`).replace('assignee.name AS assignee_name,', `(SELECT name FROM users WHERE id = assignee_id) AS assignee_name,`)}
    `,
    values,
  );

  return result.rows[0];
}

export async function createTicketComment(
  input: { ticketId: string; authorId: string; body: string; visibility: CommentVisibility },
  client: PoolClient,
): Promise<TicketCommentRow> {
  const result = await client.query<TicketCommentRow>(
    `
      INSERT INTO ticket_comments (ticket_id, author_id, body, visibility)
      VALUES ($1, $2, $3, $4)
      RETURNING id, author_id, (SELECT name FROM users WHERE id = author_id) AS author_name, body, visibility, created_at
    `,
    [input.ticketId, input.authorId, input.body, input.visibility],
  );

  return result.rows[0];
}

export async function listTicketComments(
  ticketId: string,
  includeInternal: boolean,
  executor: QueryExecutor = pool,
): Promise<TicketCommentRow[]> {
  const result = await executor.query<TicketCommentRow>(
    `
      SELECT tc.id, tc.author_id, u.name AS author_name, tc.body, tc.visibility, tc.created_at
      FROM ticket_comments tc
      JOIN users u ON u.id = tc.author_id
      WHERE tc.ticket_id = $1 AND ($2::BOOLEAN OR tc.visibility = 'public')
      ORDER BY tc.created_at ASC, tc.id ASC
    `,
    [ticketId, includeInternal],
  );

  return result.rows;
}

export async function createTicketEvent(
  input: {
    ticketId: string;
    actorId: string | null;
    type: TicketEventType;
    fromValue?: unknown;
    toValue?: unknown;
  },
  client: PoolClient,
): Promise<TicketEventRow> {
  const result = await client.query<TicketEventRow>(
    `
      INSERT INTO ticket_events (ticket_id, actor_id, type, from_value, to_value)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, type, actor_id, (SELECT name FROM users WHERE id = actor_id) AS actor_name, from_value, to_value, created_at
    `,
    [
      input.ticketId,
      input.actorId,
      input.type,
      input.fromValue === undefined ? null : JSON.stringify(input.fromValue),
      input.toValue === undefined ? null : JSON.stringify(input.toValue),
    ],
  );

  return result.rows[0];
}

export async function listTicketEvents(
  ticketId: string,
  includeInternal: boolean,
  executor: QueryExecutor = pool,
): Promise<TicketEventRow[]> {
  const result = await executor.query<TicketEventRow>(
    `
      SELECT te.id, te.type, te.actor_id, u.name AS actor_name, te.from_value, te.to_value, te.created_at
      FROM ticket_events te
      LEFT JOIN users u ON u.id = te.actor_id
      WHERE te.ticket_id = $1
        AND ($2::BOOLEAN OR NOT (te.type = 'commented' AND te.to_value->>'visibility' = 'internal'))
      ORDER BY te.created_at ASC, te.id ASC
    `,
    [ticketId, includeInternal],
  );

  return result.rows;
}

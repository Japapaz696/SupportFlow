import type { PoolClient } from 'pg';
import { pool } from '../database/pool.js';
import type { TicketPriority } from '@supportflow/shared';
import type { TicketRow } from '../domain/tickets.js';

type QueryExecutor = Pick<typeof pool, 'query'> | PoolClient;

export type DashboardCounts = {
  open: number;
  in_progress: number;
  waiting_requester: number;
  resolved: number;
  closed: number;
  unassigned: number;
  first_response_breached: number;
  resolution_breached: number;
  first_response_at_risk: number;
  resolution_at_risk: number;
  first_response_met: number;
  first_response_completed: number;
  resolution_met: number;
  resolution_completed: number;
  avg_first_response_minutes: number | null;
  avg_resolution_minutes: number | null;
};

export async function getDashboardCounts(
  actor: { role: string; id: string },
  currentTime: Date,
  executor: QueryExecutor = pool,
): Promise<DashboardCounts> {
  const scope = actor.role === 'agent' ? 'AND (t.assignee_id = $2 OR t.assignee_id IS NULL)' : '';
  const params = actor.role === 'agent' ? [currentTime, actor.id] : [currentTime];
  const result = await executor
    .query<DashboardCounts>(
      `SELECT
      COUNT(*) FILTER (WHERE t.status = 'open')::int AS open,
      COUNT(*) FILTER (WHERE t.status = 'in_progress')::int AS in_progress,
      COUNT(*) FILTER (WHERE t.status = 'waiting_requester')::int AS waiting_requester,
      COUNT(*) FILTER (WHERE t.status = 'resolved')::int AS resolved,
      COUNT(*) FILTER (WHERE t.status = 'closed')::int AS closed,
      COUNT(*) FILTER (WHERE t.assignee_id IS NULL)::int AS unassigned,
      COUNT(*) FILTER (WHERE t.status <> 'cancelled' AND t.first_response_at IS NULL AND t.sla_first_response_due_at <= $1)::int AS first_response_breached,
      COUNT(*) FILTER (WHERE t.status <> 'cancelled' AND t.resolved_at IS NULL AND t.sla_resolution_due_at <= $1)::int AS resolution_breached,
      COUNT(*) FILTER (WHERE t.status <> 'cancelled' AND t.first_response_at IS NULL AND t.sla_first_response_due_at > $1 AND t.sla_first_response_due_at - $1 <= (t.sla_first_response_due_at - t.opened_at) * 0.2)::int AS first_response_at_risk,
      COUNT(*) FILTER (WHERE t.status <> 'cancelled' AND t.resolved_at IS NULL AND t.sla_resolution_due_at > $1 AND t.sla_resolution_due_at - $1 <= (t.sla_resolution_due_at - t.opened_at) * 0.2)::int AS resolution_at_risk,
      COUNT(*) FILTER (WHERE t.first_response_at IS NOT NULL AND t.first_response_at <= t.sla_first_response_due_at)::int AS first_response_met,
      COUNT(*) FILTER (WHERE t.first_response_at IS NOT NULL)::int AS first_response_completed,
      COUNT(*) FILTER (WHERE t.resolved_at IS NOT NULL AND t.resolved_at <= t.sla_resolution_due_at)::int AS resolution_met,
      COUNT(*) FILTER (WHERE t.resolved_at IS NOT NULL)::int AS resolution_completed,
      AVG(EXTRACT(EPOCH FROM (t.first_response_at - t.opened_at)) / 60) FILTER (WHERE t.first_response_at IS NOT NULL) AS avg_first_response_minutes,
      AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.opened_at)) / 60) FILTER (WHERE t.resolved_at IS NOT NULL) AS avg_resolution_minutes
     FROM tickets t WHERE TRUE ${scope}`,
      params,
    )
    .then((res) => res.rows[0]);
  return result;
}

export async function getDashboardBreakdown(
  actor: { role: string; id: string },
  executor: QueryExecutor = pool,
): Promise<{
  priorities: Array<{ priority: TicketPriority; count: number }>;
  categories: Array<{ category: string; count: number }>;
}> {
  const scope = actor.role === 'agent' ? 'AND (t.assignee_id = $1 OR t.assignee_id IS NULL)' : '';
  const params = actor.role === 'agent' ? [actor.id] : [];
  const priorities = await executor.query<{ priority: TicketPriority; count: string }>(
    `SELECT t.priority, COUNT(*)::int AS count FROM tickets t WHERE TRUE ${scope} GROUP BY t.priority`,
    params,
  );
  const categories = await executor.query<{ category: string; count: string }>(
    `SELECT c.name AS category, COUNT(*)::int AS count FROM tickets t JOIN categories c ON c.id=t.category_id WHERE TRUE ${scope} GROUP BY c.name`,
    params,
  );
  return {
    priorities: priorities.rows.map((row) => ({
      priority: row.priority,
      count: Number(row.count),
    })),
    categories: categories.rows.map((row) => ({
      category: row.category,
      count: Number(row.count),
    })),
  };
}

export async function getAttentionTickets(
  actor: { role: string; id: string },
  currentTime: Date,
  executor: QueryExecutor = pool,
): Promise<TicketRow[]> {
  const scope = actor.role === 'agent' ? 'AND (t.assignee_id = $2 OR t.assignee_id IS NULL)' : '';
  const result = await executor.query<TicketRow>(
    `SELECT t.id, t.code, t.title, t.description, t.status, t.priority, t.category_id,
      c.name AS category_name, t.requester_id, u.name AS requester_name, t.assignee_id,
      a.name AS assignee_name, t.opened_at, t.first_response_at, t.resolved_at, t.closed_at,
      t.sla_first_response_due_at, t.sla_resolution_due_at, t.created_at, t.updated_at
     FROM tickets t JOIN categories c ON c.id=t.category_id JOIN users u ON u.id=t.requester_id
     LEFT JOIN users a ON a.id=t.assignee_id
     WHERE t.status IN ('open', 'in_progress', 'waiting_requester') AND (
       t.assignee_id IS NULL
       OR (t.first_response_at IS NULL AND t.sla_first_response_due_at <= $1)
       OR (t.resolved_at IS NULL AND t.sla_resolution_due_at <= $1)
       OR (t.first_response_at IS NULL AND t.sla_first_response_due_at > $1 AND t.sla_first_response_due_at - $1 <= (t.sla_first_response_due_at - t.opened_at) * 0.2)
       OR (t.resolved_at IS NULL AND t.sla_resolution_due_at > $1 AND t.sla_resolution_due_at - $1 <= (t.sla_resolution_due_at - t.opened_at) * 0.2)
       OR t.priority = 'critical'
     ) ${scope}
     ORDER BY t.updated_at DESC, t.id DESC LIMIT 20`,
    actor.role === 'agent' ? [currentTime, actor.id] : [currentTime],
  );
  return result.rows;
}

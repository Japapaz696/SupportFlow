import type { PoolClient } from 'pg';
import { pool } from '../database/pool.js';
import type { SlaPolicy, TicketPriority } from '@supportflow/shared';

type QueryExecutor = Pick<typeof pool, 'query'> | PoolClient;

type PolicyRow = {
  id: string;
  priority: TicketPriority;
  first_response_minutes: number;
  resolution_minutes: number;
  business_hours_only: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const fields = `
  id,
  priority,
  first_response_minutes,
  resolution_minutes,
  business_hours_only,
  is_active,
  created_at,
  updated_at
`;

function toPolicy(row: PolicyRow): SlaPolicy {
  return {
    id: row.id,
    priority: row.priority,
    firstResponseMinutes: row.first_response_minutes,
    resolutionMinutes: row.resolution_minutes,
    businessHoursOnly: row.business_hours_only,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPolicies(executor: QueryExecutor = pool): Promise<SlaPolicy[]> {
  const res = await executor.query<PolicyRow>(
    `SELECT ${fields} FROM sla_policies ORDER BY priority ASC`,
  );
  return res.rows.map(toPolicy);
}

export async function findActivePolicyByPriority(
  priority: TicketPriority,
  executor: QueryExecutor = pool,
): Promise<SlaPolicy | null> {
  const res = await executor.query<PolicyRow>(
    `SELECT ${fields} FROM sla_policies
     WHERE priority = $1 AND is_active = TRUE AND business_hours_only = FALSE`,
    [priority],
  );
  return res.rows[0] ? toPolicy(res.rows[0]) : null;
}

export async function findPolicyByPriorityForShare(
  priority: TicketPriority,
  client: PoolClient,
): Promise<SlaPolicy | null> {
  const res = await client.query<PolicyRow>(
    `SELECT ${fields} FROM sla_policies
     WHERE priority = $1
     FOR SHARE`,
    [priority],
  );
  return res.rows[0] ? toPolicy(res.rows[0]) : null;
}

export async function findPolicyById(
  id: string,
  executor: QueryExecutor = pool,
): Promise<SlaPolicy | null> {
  const res = await executor.query<PolicyRow>(`SELECT ${fields} FROM sla_policies WHERE id = $1`, [
    id,
  ]);
  return res.rows[0] ? toPolicy(res.rows[0]) : null;
}

export async function createPolicy(
  input: {
    priority: TicketPriority;
    firstResponseMinutes: number;
    resolutionMinutes: number;
    businessHoursOnly?: boolean;
    isActive?: boolean;
  },
  executor: QueryExecutor = pool,
): Promise<SlaPolicy> {
  const res = await executor.query<PolicyRow>(
    `INSERT INTO sla_policies (priority, first_response_minutes, resolution_minutes, business_hours_only, is_active)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${fields}`,
    [
      input.priority,
      input.firstResponseMinutes,
      input.resolutionMinutes,
      input.businessHoursOnly ?? false,
      input.isActive ?? true,
    ],
  );
  return toPolicy(res.rows[0]);
}

export async function updatePolicy(
  id: string,
  input: Partial<{
    firstResponseMinutes: number;
    resolutionMinutes: number;
    businessHoursOnly: boolean;
    isActive: boolean;
  }>,
  executor: QueryExecutor = pool,
): Promise<SlaPolicy | null> {
  const fieldsArr: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (input.firstResponseMinutes !== undefined) {
    fieldsArr.push(`first_response_minutes = $${idx++}`);
    values.push(input.firstResponseMinutes);
  }
  if (input.resolutionMinutes !== undefined) {
    fieldsArr.push(`resolution_minutes = $${idx++}`);
    values.push(input.resolutionMinutes);
  }
  if (input.businessHoursOnly !== undefined) {
    fieldsArr.push(`business_hours_only = $${idx++}`);
    values.push(input.businessHoursOnly);
  }
  if (input.isActive !== undefined) {
    fieldsArr.push(`is_active = $${idx++}`);
    values.push(input.isActive);
  }
  if (fieldsArr.length === 0) return findPolicyById(id, executor);
  values.push(id);
  const res = await executor.query<PolicyRow>(
    `UPDATE sla_policies SET ${fieldsArr.join(', ')} WHERE id = $${idx} RETURNING ${fields}`,
    values,
  );
  return res.rows[0] ? toPolicy(res.rows[0]) : null;
}

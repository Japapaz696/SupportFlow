import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from './app.js';
import { pool } from './database/pool.js';

/**
 * Fluxo E2E de backend com as quatro personas do produto.
 *
 * Dados 100% ficticios (dominio example.test). O banco de teste e o schema
 * isolado `supportflow_test`, configurado em config/env.ts.
 */

const runId = randomUUID();
const password = 'CorrectHorseBatteryStaple42';
const email = (label: string) => `e2e-${label}-${runId}@example.test`;
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};
let categoryId = '';
let ticketId = '';
let internalCommentId = '';

/**
 * Politicas SLA sao recurso compartilhado entre os arquivos de teste (a
 * prioridade tem unicidade e cada suite precisa de uma politica ativa).
 * Para nao contaminar as demais suites, guardamos o estado original de cada
 * linha tocada e o restauramos no `afterAll`: linha que existia volta com os
 * valores originais; linha criada aqui e removida.
 */
type PolicySnapshot = {
  id: string;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  businessHoursOnly: boolean;
  isActive: boolean;
};

const policySnapshots = new Map<string, PolicySnapshot>();
const createdPolicyIds: string[] = [];

const requiredPolicies = [
  { priority: 'high', firstResponseMinutes: 60, resolutionMinutes: 240 },
  { priority: 'critical', firstResponseMinutes: 30, resolutionMinutes: 120 },
] as const;

async function insertUser(
  label: string,
  role: 'requester' | 'agent' | 'manager' | 'admin',
): Promise<string> {
  const hash = await bcrypt.hash(password, 12);
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id`,
    [`E2E ${label}`, email(label), hash, role],
  );
  return result.rows[0].id;
}

async function login(label: string): Promise<string> {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: email(label), password })
    .expect(200);
  return response.body.token as string;
}

function auth(label: string): string {
  return `Bearer ${tokens[label]}`;
}

beforeAll(async () => {
  ids.requester = await insertUser('requester', 'requester');
  ids.agent = await insertUser('agent', 'agent');
  ids.otherAgent = await insertUser('other-agent', 'agent');
  ids.manager = await insertUser('manager', 'manager');
  ids.admin = await insertUser('admin', 'admin');
  for (const label of ['requester', 'agent', 'other-agent', 'manager', 'admin']) {
    tokens[label] = await login(label);
  }

  const category = await pool.query<{ id: string }>(
    `INSERT INTO categories (name, default_priority) VALUES ($1,'high') RETURNING id`,
    [`E2E ${runId}`],
  );
  categoryId = category.rows[0].id;

  // Politicas SLA ativas para as prioridades usadas no fluxo, preservando o
  // estado original para restauracao no afterAll.
  for (const { priority, firstResponseMinutes, resolutionMinutes } of requiredPolicies) {
    const existing = await pool.query<PolicySnapshot>(
      `SELECT id,
              first_response_minutes AS "firstResponseMinutes",
              resolution_minutes AS "resolutionMinutes",
              business_hours_only AS "businessHoursOnly",
              is_active AS "isActive"
         FROM sla_policies
        WHERE priority = $1`,
      [priority],
    );

    if (existing.rows[0]) {
      policySnapshots.set(priority, existing.rows[0]);
      await pool.query(
        `UPDATE sla_policies
            SET first_response_minutes = $2, resolution_minutes = $3, is_active = TRUE
          WHERE id = $1`,
        [existing.rows[0].id, firstResponseMinutes, resolutionMinutes],
      );
    } else {
      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO sla_policies (priority, first_response_minutes, resolution_minutes)
         VALUES ($1,$2,$3)
         RETURNING id`,
        [priority, firstResponseMinutes, resolutionMinutes],
      );
      createdPolicyIds.push(inserted.rows[0].id);
    }
  }
});

afterAll(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE ticket_events DISABLE TRIGGER ticket_events_prevent_mutation');
    await client.query(
      `DELETE FROM ticket_technical_diagnostics WHERE ticket_id IN (SELECT id FROM tickets WHERE requester_id = $1)`,
      [ids.requester],
    );
    await client.query(
      `DELETE FROM ticket_events WHERE ticket_id IN (SELECT id FROM tickets WHERE requester_id = $1)`,
      [ids.requester],
    );
    await client.query('ALTER TABLE ticket_events ENABLE TRIGGER ticket_events_prevent_mutation');
    await client.query(
      `DELETE FROM notifications WHERE ticket_id IN (SELECT id FROM tickets WHERE requester_id = $1)`,
      [ids.requester],
    );
    await client.query(
      `DELETE FROM ticket_comments WHERE ticket_id IN (SELECT id FROM tickets WHERE requester_id = $1)`,
      [ids.requester],
    );
    await client.query('DELETE FROM tickets WHERE requester_id = $1', [ids.requester]);
    await client.query('DELETE FROM categories WHERE id = $1', [categoryId]);

    // Restaura as politicas SLA exatamente como estavam antes desta suite.
    for (const snapshot of policySnapshots.values()) {
      await client.query(
        `UPDATE sla_policies
            SET first_response_minutes = $2,
                resolution_minutes = $3,
                business_hours_only = $4,
                is_active = $5
          WHERE id = $1`,
        [
          snapshot.id,
          snapshot.firstResponseMinutes,
          snapshot.resolutionMinutes,
          snapshot.businessHoursOnly,
          snapshot.isActive,
        ],
      );
    }
    if (createdPolicyIds.length > 0) {
      await client.query('DELETE FROM sla_policies WHERE id = ANY($1::uuid[])', [createdPolicyIds]);
    }

    await client.query('DELETE FROM users WHERE email LIKE $1', [`e2e-%-${runId}@example.test`]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

describe('E2E: solicitante abre chamado', () => {
  it('cria o chamado e recebe o codigo gerado', async () => {
    const response = await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', auth('requester'))
      .send({
        title: `Impressora da recepcao ${runId.slice(0, 6)}`,
        description: 'A impressora nao responde ao comando de impressao.',
        categoryId,
        priority: 'high',
      })
      .expect(201);

    ticketId = response.body.ticket.id as string;
    expect(ticketId).toBeTruthy();
    expect(response.body.ticket.code).toBeTruthy();
    expect(response.body.ticket.requester.id).toBe(ids.requester);
    expect(response.body.ticket.assignee).toBeNull();
  });

  it('recusa titulo vazio (validacao do backend mantida)', async () => {
    await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', auth('requester'))
      .send({ title: '   ', description: 'descricao valida', categoryId })
      .expect(400);
  });

  it('recusa categoria inexistente', async () => {
    await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', auth('requester'))
      .send({
        title: 'Chamado com categoria invalida',
        description: 'descricao valida para o teste',
        categoryId: randomUUID(),
      })
      .expect(400);
  });
});

describe('E2E: agente assume e responde', () => {
  it('agente assume o chamado para si', async () => {
    const response = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/assignee`)
      .set('Authorization', auth('agent'))
      .send({ assigneeId: ids.agent })
      .expect(200);

    expect(response.body.ticket.assignee.id).toBe(ids.agent);
  });

  it('agente nao pode atribuir chamado para outra pessoa (403)', async () => {
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/assignee`)
      .set('Authorization', auth('agent'))
      .send({ assigneeId: ids.manager })
      .expect(403);
  });

  it('agente muda o status para em atendimento', async () => {
    const response = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/status`)
      .set('Authorization', auth('agent'))
      .send({ status: 'in_progress' })
      .expect(200);

    expect(response.body.ticket.status).toBe('in_progress');
  });

  it('solicitante nao pode mudar status (403)', async () => {
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/status`)
      .set('Authorization', auth('requester'))
      .send({ status: 'resolved' })
      .expect(403);
  });
});

describe('E2E: comentarios internos ficam ocultos para o solicitante', () => {
  it('agente cria comentario publico e interno', async () => {
    const publicComment = await request(app)
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .set('Authorization', auth('agent'))
      .send({ body: 'Retiramos a impressora para manutencao.', visibility: 'public' })
      .expect(201);
    expect(publicComment.body.comment.visibility).toBe('public');

    const internal = await request(app)
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .set('Authorization', auth('agent'))
      .send({ body: 'Pedido interno: comprar fusor novo.', visibility: 'internal' })
      .expect(201);
    internalCommentId = internal.body.comment.id as string;
    expect(internal.body.comment.visibility).toBe('internal');
  });

  it('solicitante nao enxerga o comentario interno', async () => {
    const response = await request(app)
      .get(`/api/v1/tickets/${ticketId}`)
      .set('Authorization', auth('requester'))
      .expect(200);

    const idsVisiveis = (response.body.ticket.comments as Array<{ id: string }>).map((c) => c.id);
    expect(idsVisiveis).not.toContain(internalCommentId);
    expect(idsVisiveis.length).toBeGreaterThan(0);
  });

  it('agente enxerga o comentario interno', async () => {
    const response = await request(app)
      .get(`/api/v1/tickets/${ticketId}`)
      .set('Authorization', auth('agent'))
      .expect(200);

    const idsVisiveis = (response.body.ticket.comments as Array<{ id: string }>).map((c) => c.id);
    expect(idsVisiveis).toContain(internalCommentId);
  });

  it('solicitante nao pode criar comentario interno', async () => {
    await request(app)
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .set('Authorization', auth('requester'))
      .send({ body: 'Tentando comentário interno', visibility: 'internal' })
      .expect(403);
  });
});

describe('E2E: gestor gerencia prioridade e responsavel', () => {
  it('gestor altera a prioridade', async () => {
    const response = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/priority`)
      .set('Authorization', auth('manager'))
      .send({ priority: 'critical' })
      .expect(200);

    expect(response.body.ticket.priority).toBe('critical');
  });

  it('agente nao pode alterar a prioridade (403)', async () => {
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/priority`)
      .set('Authorization', auth('agent'))
      .send({ priority: 'low' })
      .expect(403);
  });

  it('gestor reatribui o chamado para outro agente', async () => {
    const response = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/assignee`)
      .set('Authorization', auth('manager'))
      .send({ assigneeId: ids.otherAgent })
      .expect(200);

    expect(response.body.ticket.assignee.id).toBe(ids.otherAgent);
  });

  it('gestor nao pode atribuir para um nao-agente (regra de negocio)', async () => {
    // A API exige que o responsavel seja um agente ativo.
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/assignee`)
      .set('Authorization', auth('manager'))
      .send({ assigneeId: ids.admin })
      .expect(400);
  });

  it('gestor lista os agentes que podem receber chamados', async () => {
    const response = await request(app)
      .get('/api/v1/users/assignable')
      .set('Authorization', auth('manager'))
      .expect(200);

    const returned = response.body.users as Array<{ id: string; role: string }>;
    expect(returned.map((u) => u.id)).toContain(ids.agent);
    expect(returned.map((u) => u.id)).toContain(ids.otherAgent);
    // Somente agentes podem receber chamados.
    expect(returned.every((u) => u.role === 'agent')).toBe(true);
    // Solicitante, gestor e admin nunca aparecem.
    expect(returned.map((u) => u.id)).not.toContain(ids.requester);
    expect(returned.map((u) => u.id)).not.toContain(ids.manager);
    expect(returned.map((u) => u.id)).not.toContain(ids.admin);
  });

  it('solicitante nao acessa a lista de atribuicao (403)', async () => {
    await request(app)
      .get('/api/v1/users/assignable')
      .set('Authorization', auth('requester'))
      .expect(403);
  });
});

describe('E2E: notificacoes', () => {
  it('solicitante recebe notificacao sobre o proprio chamado', async () => {
    const response = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', auth('requester'))
      .expect(200);

    const items = response.body.items as Array<{ ticketId: string | null }>;
    expect(items.some((item) => item.ticketId === ticketId)).toBe(true);
  });

  it('contador de nao lidas responde', async () => {
    const response = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', auth('requester'))
      .expect(200);

    expect(typeof response.body.unread).toBe('number');
  });
});

describe('E2E: dashboard e SLA refletem as alteracoes', () => {
  it('dashboard do time mostra o chamado com prioridade atualizada', async () => {
    const response = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', auth('manager'))
      .expect(200);

    const summary = response.body.summary;
    expect(summary.byPriority.critical).toBeGreaterThanOrEqual(1);
    expect(summary.open + summary.inProgress).toBeGreaterThanOrEqual(1);
    expect(summary.attentionList.length).toBeGreaterThanOrEqual(0);
  });

  it('solicitante so enxerga o proprio escopo', async () => {
    const list = await request(app)
      .get('/api/v1/tickets')
      .set('Authorization', auth('requester'))
      .expect(200);

    const items = list.body.items as Array<{ id: string }>;
    expect(items.every((item) => item.id === ticketId)).toBe(true);
  });
});

describe('E2E: busca e filtros de chamados', () => {
  it('busca pelo titulo encontra o chamado', async () => {
    const response = await request(app)
      .get(`/api/v1/tickets?search=${encodeURIComponent('Impressora da recepcao')}`)
      .set('Authorization', auth('manager'))
      .expect(200);

    const items = response.body.items as Array<{ id: string }>;
    expect(items.map((item) => item.id)).toContain(ticketId);
  });

  it('busca por termo inexistente retorna lista vazia', async () => {
    const response = await request(app)
      .get(`/api/v1/tickets?search=${encodeURIComponent('termo-que-nao-existe-xyz')}`)
      .set('Authorization', auth('manager'))
      .expect(200);

    expect(response.body.items).toEqual([]);
    expect(response.body.total).toBe(0);
  });

  it('filtro por prioridade restringe o resultado', async () => {
    const response = await request(app)
      .get('/api/v1/tickets?priority=critical')
      .set('Authorization', auth('manager'))
      .expect(200);

    const items = response.body.items as Array<{ id: string; priority: string }>;
    expect(items.every((item) => item.priority === 'critical')).toBe(true);
  });

  it('filtro invalido responde 400', async () => {
    await request(app)
      .get('/api/v1/tickets?status=inexistente')
      .set('Authorization', auth('manager'))
      .expect(400);
  });
});

describe('E2E: acesso nao autorizado', () => {
  it('sem token responde 401', async () => {
    await request(app).get('/api/v1/tickets').expect(401);
  });

  it('token invalido responde 401', async () => {
    await request(app)
      .get('/api/v1/tickets')
      .set('Authorization', 'Bearer token.invalido.invalido')
      .expect(401);
  });

  it('solicitante nao acessa administracao de usuarios (403)', async () => {
    await request(app).get('/api/v1/users').set('Authorization', auth('requester')).expect(403);
  });

  it('solicitante nao cria politicas de SLA (403)', async () => {
    await request(app)
      .post('/api/v1/sla-policies')
      .set('Authorization', auth('requester'))
      .send({ priority: 'low', firstResponseMinutes: 30, resolutionMinutes: 60 })
      .expect(403);
  });
});

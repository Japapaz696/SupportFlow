import type { RequestHandler } from 'express';

import { pool } from '../database/pool.js';
import { getHealth } from '../services/health.service.js';

/**
 * Liveness: o processo responde.
 *
 * Nao consulta o banco de proposito. Um health check que depende do banco
 * derruba o servico inteiro quando o banco fica lento, e a resposta continua
 * 200 mesmo com o banco fora do ar -- foi o que aconteceu com a implantacao
 * anterior, que respondia "ok" enquanto nenhum login funcionava.
 */
export const healthController: RequestHandler = (_request, response) => {
  response.json(getHealth());
};

/**
 * Readiness: o servico consegue atender de verdade.
 *
 * Consulta o banco com um limite de tempo curto. Devolve 503 quando o banco
 * esta inacessivel, para que o orquestrador (ou quem monitora) perceba.
 */
export const readinessController: RequestHandler = async (_request, response) => {
  try {
    await pool.query('SELECT 1');
    response.json({ status: 'ok', database: 'ok' });
  } catch (error) {
    response.status(503).json({
      status: 'unavailable',
      database: 'unreachable',
      detail: error instanceof Error ? error.message : 'unknown error',
    });
  }
};

import { describe, expect, it } from 'vitest';

import {
  commentVisibilities,
  httpMethods,
  notificationTypes,
  slaClockStatuses,
  ticketEventTypes,
  ticketPriorities,
  ticketStatuses,
  userRoles,
} from './index.js';

/**
 * O pacote compartilhado define as listas de valores aceitos pelo backend e
 * pelo frontend. Se o frontend e o backend usarem listas diferentes, um
 * status aceito por um lado e recusado pelo outro. Estes testes fixam o
 * contrato.
 */

describe('contrato de papeis', () => {
  it('cobre os quatro papeis do sistema', () => {
    expect([...userRoles].sort()).toEqual(['admin', 'agent', 'manager', 'requester']);
  });
});

describe('contrato de chamados', () => {
  it('cobre os seis estados de um chamado', () => {
    expect([...ticketStatuses].sort()).toEqual([
      'cancelled',
      'closed',
      'in_progress',
      'open',
      'resolved',
      'waiting_requester',
    ]);
  });

  it('cobre as quatro prioridades', () => {
    expect([...ticketPriorities].sort()).toEqual(['critical', 'high', 'low', 'medium']);
  });

  it('cobre as duas visibilidades de comentario', () => {
    expect([...commentVisibilities].sort()).toEqual(['internal', 'public']);
  });

  it('cobre os tipos de evento de chamado', () => {
    expect(ticketEventTypes.length).toBeGreaterThan(0);
    expect(new Set(ticketEventTypes).size).toBe(ticketEventTypes.length);
  });

  it('cobre os estados de relogio do SLA', () => {
    expect([...slaClockStatuses].sort()).toEqual(['at_risk', 'breached', 'met', 'pending']);
  });
});

describe('contrato de notificacoes', () => {
  it('cobre os tipos de notificacao', () => {
    expect(notificationTypes.length).toBeGreaterThan(0);
    expect(new Set(notificationTypes).size).toBe(notificationTypes.length);
  });
});

describe('contrato de metodos HTTP', () => {
  it('cobre os metodos usados pela API', () => {
    expect([...httpMethods].sort()).toEqual([
      'DELETE',
      'GET',
      'HEAD',
      'OPTIONS',
      'PATCH',
      'POST',
      'PUT',
    ]);
  });
});

describe('consistencia entre listas', () => {
  it('nao repete valores em nenhuma lista', () => {
    for (const lista of [
      userRoles,
      ticketStatuses,
      ticketPriorities,
      commentVisibilities,
      ticketEventTypes,
      notificationTypes,
      httpMethods,
      slaClockStatuses,
    ]) {
      expect(new Set(lista).size).toBe(lista.length);
    }
  });

  it('nao usa valor vazio em nenhuma lista', () => {
    for (const lista of [userRoles, ticketStatuses, ticketPriorities, commentVisibilities]) {
      for (const valor of lista) {
        expect(valor).not.toBe('');
        expect(valor).toBe(valor.trim().toLowerCase());
      }
    }
  });
});

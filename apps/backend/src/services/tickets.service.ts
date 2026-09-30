import type {
  AuthUser,
  Paginated,
  TicketComment,
  TicketDetail,
  TicketListItem,
  TicketPriority,
  TicketStatus,
  CommentVisibility,
  NotificationType,
} from '@supportflow/shared';
import type { PoolClient } from 'pg';

import { withTransaction } from '../database/transaction.js';
import { now } from '../domain/clock.js';
import { buildTicketSla, computeDueAt } from '../domain/sla.js';
import {
  isManagerRole,
  isTeamRole,
  toTicketComment,
  toTicketDetail,
  toTicketListItem,
  type TicketRow,
} from '../domain/tickets.js';
import { HttpError } from '../errors/http-error.js';
import { findCategoryByIdForShare } from '../repositories/categories.repository.js';
import { createNotification } from '../repositories/notifications.repository.js';
import { findPolicyByPriorityForShare } from '../repositories/sla-policies.repository.js';
import {
  createTicketComment,
  createTicketEvent,
  createTicket as createTicketRecord,
  findTicketById,
  findTicketByIdForUpdate,
  listTicketComments,
  listTicketEvents,
  listTickets as listTicketRecords,
  updateTicketFields,
} from '../repositories/tickets.repository.js';
import { findUserByIdForShare } from '../repositories/users.repository.js';
import type {
  AssignPayload,
  CommentPayload,
  CreateTicketPayload,
  TicketFilters,
} from '../validation/tickets.validation.js';

const statusTransitions: Record<TicketStatus, TicketStatus[]> = {
  open: ['in_progress', 'cancelled'],
  in_progress: ['waiting_requester', 'resolved', 'cancelled'],
  waiting_requester: ['in_progress', 'cancelled'],
  resolved: ['in_progress', 'closed', 'cancelled'],
  closed: [],
  cancelled: [],
};

export async function createTicket(
  payload: CreateTicketPayload,
  actor: AuthUser,
): Promise<TicketDetail> {
  return withTransaction(async (client) => {
    const category = await findCategoryByIdForShare(payload.categoryId, client);

    if (!category || !category.is_active) {
      throw new HttpError(400, 'CATEGORY_NOT_AVAILABLE', 'Category is not available');
    }

    const priority = payload.priority ?? category.default_priority;
    const policy = await findPolicyByPriorityForShare(priority, client);
    if (!policy || !policy.isActive || policy.businessHoursOnly) {
      throw new HttpError(
        409,
        'SLA_POLICY_NOT_CONFIGURED',
        'No active SLA policy is configured for this priority',
      );
    }

    const openedAt = now();
    const ticket = await createTicketRecord(
      {
        title: payload.title,
        description: payload.description,
        categoryId: payload.categoryId,
        requesterId: actor.id,
        priority,
        openedAt,
        slaFirstResponseDueAt: computeDueAt(openedAt, policy.firstResponseMinutes),
        slaResolutionDueAt: computeDueAt(openedAt, policy.resolutionMinutes),
      },
      client,
    );

    await createTicketEvent(
      {
        ticketId: ticket.id,
        actorId: actor.id,
        type: 'created',
        toValue: {
          code: ticket.code,
          status: ticket.status,
          priority: ticket.priority,
          categoryId: ticket.category_id,
          slaFirstResponseDueAt: ticket.sla_first_response_due_at?.toISOString() ?? null,
          slaResolutionDueAt: ticket.sla_resolution_due_at?.toISOString() ?? null,
        },
      },
      client,
    );

    return loadTicketDetail(ticket.id, actor, client);
  });
}

export async function listTickets(
  filters: TicketFilters,
  actor: AuthUser,
): Promise<Paginated<TicketListItem>> {
  const result = await listTicketRecords({
    requesterId: actor.role === 'requester' ? actor.id : undefined,
    status: filters.status,
    priority: filters.priority,
    categoryId: filters.categoryId,
    assigneeId: filters.assigneeId,
    limit: filters.pageSize,
    offset: (filters.page - 1) * filters.pageSize,
  });

  return {
    items: result.tickets.map(toTicketListItem),
    page: filters.page,
    pageSize: filters.pageSize,
    total: result.total,
  };
}

export async function getTicket(id: string, actor: AuthUser): Promise<TicketDetail> {
  return loadTicketDetail(id, actor);
}

export async function assignTicket(
  id: string,
  payload: AssignPayload,
  actor: AuthUser,
): Promise<TicketDetail> {
  return withTransaction(async (client) => {
    const ticket = await requireMutableTicket(id, actor, client);
    const targetId = payload.assigneeId ?? null;

    if (actor.role === 'agent' && targetId !== actor.id) {
      throw new HttpError(403, 'FORBIDDEN', 'Agents can only claim tickets for themselves');
    }

    if (actor.role === 'agent' && ticket.assignee_id && ticket.assignee_id !== actor.id) {
      throw new HttpError(409, 'TICKET_ALREADY_ASSIGNED', 'Ticket is already assigned');
    }

    if (!isTeamRole(actor.role)) {
      throw new HttpError(403, 'FORBIDDEN', 'You do not have permission to assign tickets');
    }

    if (targetId) {
      const target = await findUserByIdForShare(targetId, client);

      if (!target || !target.is_active || target.role !== 'agent') {
        throw new HttpError(400, 'INVALID_ASSIGNEE', 'Assignee must be an active agent');
      }
    }

    if (ticket.assignee_id === targetId) {
      return loadTicketDetail(id, actor, client);
    }

    await updateTicketFields(id, { assigneeId: targetId }, client);
    await createTicketEvent(
      {
        ticketId: id,
        actorId: actor.id,
        type: 'assigned',
        fromValue: { assigneeId: ticket.assignee_id },
        toValue: { assigneeId: targetId },
      },
      client,
    );

    if (targetId) {
      await notify(
        {
          userId: targetId,
          actorId: actor.id,
          type: ticket.assignee_id ? 'ticket_reassigned' : 'ticket_assigned',
          ticket,
          title: ticket.assignee_id ? 'Chamado reatribuído' : 'Chamado atribuído',
          message: `${ticket.code}: ${ticket.title}`,
        },
        client,
      );
    }

    return loadTicketDetail(id, actor, client);
  });
}

export async function changeTicketStatus(
  id: string,
  status: TicketStatus,
  actor: AuthUser,
): Promise<TicketDetail> {
  return withTransaction(async (client) => {
    const ticket = await requireTeamTicket(id, actor, client);

    if (!statusTransitions[ticket.status].includes(status)) {
      throw new HttpError(
        409,
        'INVALID_STATUS_TRANSITION',
        'Ticket status transition is not allowed',
      );
    }

    if (status === 'cancelled' && !isManagerRole(actor.role)) {
      throw new HttpError(403, 'FORBIDDEN', 'Only managers and admins can cancel tickets');
    }

    const changedAt = now();
    const eventType =
      status === 'resolved'
        ? 'resolved'
        : status === 'closed'
          ? 'closed'
          : ticket.status === 'resolved' && status === 'in_progress'
            ? 'reopened'
            : 'status_changed';

    await updateTicketFields(
      id,
      {
        status,
        resolvedAt:
          status === 'resolved' ? changedAt : status === 'in_progress' ? null : ticket.resolved_at,
        closedAt: status === 'closed' ? changedAt : ticket.closed_at,
      },
      client,
    );
    await createTicketEvent(
      {
        ticketId: id,
        actorId: actor.id,
        type: eventType,
        fromValue: { status: ticket.status },
        toValue: { status },
      },
      client,
    );

    const notificationType =
      eventType === 'resolved'
        ? 'ticket_resolved'
        : eventType === 'reopened'
          ? 'ticket_reopened'
          : eventType === 'closed'
            ? 'ticket_closed'
            : 'ticket_status_changed';
    for (const recipientId of ticketRecipients(ticket, actor.id)) {
      await notify(
        {
          userId: recipientId,
          actorId: actor.id,
          type: notificationType,
          ticket,
          title: `Status atualizado: ${status}`,
          message: `${ticket.code}: ${ticket.title}`,
        },
        client,
      );
    }

    return loadTicketDetail(id, actor, client);
  });
}

export async function changeTicketPriority(
  id: string,
  priority: TicketPriority,
  actor: AuthUser,
): Promise<TicketDetail> {
  return withTransaction(async (client) => {
    const ticket = await requireMutableTicket(id, actor, client);

    if (!isManagerRole(actor.role)) {
      throw new HttpError(403, 'FORBIDDEN', 'Only managers and admins can change priority');
    }

    if (ticket.priority !== priority) {
      await updateTicketFields(id, { priority }, client);
      await createTicketEvent(
        {
          ticketId: id,
          actorId: actor.id,
          type: 'priority_changed',
          fromValue: { priority: ticket.priority },
          toValue: { priority },
        },
        client,
      );

      for (const recipientId of ticketRecipients(ticket, actor.id)) {
        await notify(
          {
            userId: recipientId,
            actorId: actor.id,
            type: 'ticket_priority_changed',
            ticket,
            title: `Prioridade alterada: ${priority}`,
            message: `${ticket.code}: ${ticket.title}`,
          },
          client,
        );
      }
    }

    return loadTicketDetail(id, actor, client);
  });
}

export async function addTicketComment(
  id: string,
  payload: CommentPayload,
  actor: AuthUser,
): Promise<TicketComment> {
  return withTransaction(async (client) => {
    const ticket = await requireVisibleTicketForUpdate(id, actor, client);

    if (ticket.status === 'closed' || ticket.status === 'cancelled') {
      throw new HttpError(409, 'TICKET_NOT_COMMENTABLE', 'Ticket no longer accepts comments');
    }

    if (actor.role === 'requester' && payload.visibility === 'internal') {
      throw new HttpError(403, 'FORBIDDEN', 'Requesters cannot create internal comments');
    }

    const comment = await createTicketComment(
      {
        ticketId: id,
        authorId: actor.id,
        body: payload.body,
        visibility: payload.visibility,
      },
      client,
    );

    if (isTeamRole(actor.role) && payload.visibility === 'public' && !ticket.first_response_at) {
      await updateTicketFields(id, { firstResponseAt: now() }, client);
    }

    await createTicketEvent(
      {
        ticketId: id,
        actorId: actor.id,
        type: 'commented',
        toValue: { commentId: comment.id, visibility: comment.visibility },
      },
      client,
    );

    const recipients = determineNotificationRecipients(ticket, comment.visibility, actor.id);

    if (comment.visibility === 'public') {
      for (const recipientId of recipients) {
        await notify(
          {
            userId: recipientId,
            actorId: actor.id,
            type: 'ticket_comment_public',
            ticket,
            title: `Novo comentário em ${ticket.code}`,
            message: comment.body.length > 100 ? comment.body.slice(0, 100) + '...' : comment.body,
          },
          client,
        );
      }
    }

    return toTicketComment(comment);
  });
}

function ticketRecipients(ticket: TicketRow, actorId: string): string[] {
  return [ticket.requester_id, ticket.assignee_id].filter((userId): userId is string =>
    Boolean(userId && userId !== actorId),
  );
}

function determineNotificationRecipients(
  ticket: TicketRow,
  visibility: CommentVisibility,
  actorId: string,
): string[] {
  if (visibility === 'internal') {
    return ticket.assignee_id && ticket.assignee_id !== actorId ? [ticket.assignee_id] : [];
  }

  return ticketRecipients(ticket, actorId);
}

async function notify(
  input: {
    userId: string;
    actorId: string;
    type: NotificationType;
    ticket: TicketRow;
    title: string;
    message: string;
  },
  client: PoolClient,
): Promise<void> {
  if (input.userId === input.actorId) {
    return;
  }

  await createNotification(
    {
      userId: input.userId,
      type: input.type,
      ticketId: input.ticket.id,
      title: input.title,
      message: input.message,
    },
    client,
  );
}

async function loadTicketDetail(
  id: string,
  actor: AuthUser,
  executor?: PoolClient,
): Promise<TicketDetail> {
  const ticket = await findTicketById(id, executor);

  if (!ticket || (actor.role === 'requester' && ticket.requester_id !== actor.id)) {
    throw new HttpError(404, 'TICKET_NOT_FOUND', 'Ticket not found');
  }

  const includeInternal = actor.role !== 'requester';
  const comments = await listTicketComments(id, includeInternal, executor);
  const events = await listTicketEvents(id, includeInternal, executor);
  const firstResponseMinutes = ticket.sla_first_response_due_at
    ? (ticket.sla_first_response_due_at.getTime() - ticket.opened_at.getTime()) / 60000
    : null;
  const resolutionMinutes = ticket.sla_resolution_due_at
    ? (ticket.sla_resolution_due_at.getTime() - ticket.opened_at.getTime()) / 60000
    : null;
  const sla = buildTicketSla(
    ticket.sla_first_response_due_at,
    ticket.sla_resolution_due_at,
    ticket.first_response_at,
    ticket.resolved_at,
    firstResponseMinutes,
    resolutionMinutes,
    now(),
  );
  return toTicketDetail(ticket, comments, events, sla);
}

async function requireVisibleTicketForUpdate(
  id: string,
  actor: AuthUser,
  client: PoolClient,
): Promise<TicketRow> {
  const ticket = await findTicketByIdForUpdate(id, client);

  if (!ticket || (actor.role === 'requester' && ticket.requester_id !== actor.id)) {
    throw new HttpError(404, 'TICKET_NOT_FOUND', 'Ticket not found');
  }

  return ticket;
}

async function requireTeamTicket(
  id: string,
  actor: AuthUser,
  client: PoolClient,
): Promise<TicketRow> {
  if (!isTeamRole(actor.role)) {
    throw new HttpError(403, 'FORBIDDEN', 'You do not have permission to update tickets');
  }

  return requireMutableTicket(id, actor, client);
}

async function requireMutableTicket(
  id: string,
  actor: AuthUser,
  client: PoolClient,
): Promise<TicketRow> {
  const ticket = await findTicketByIdForUpdate(id, client);

  if (!ticket) {
    throw new HttpError(404, 'TICKET_NOT_FOUND', 'Ticket not found');
  }

  if (ticket.status === 'closed' || ticket.status === 'cancelled') {
    throw new HttpError(409, 'TICKET_NOT_MUTABLE', 'Ticket can no longer be changed');
  }

  return ticket;
}

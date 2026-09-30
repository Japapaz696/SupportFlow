import {
  commentVisibilities,
  ticketEventTypes,
  ticketPriorities,
  ticketStatuses,
  type CommentVisibility,
  type TicketComment,
  type TicketDetail,
  type TicketEvent,
  type TicketEventType,
  type TicketListItem,
  type TicketPriority,
  type TicketSla,
  type TicketStatus,
} from '@supportflow/shared';

export type TicketRow = {
  id: string;
  code: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category_id: string;
  category_name: string;
  requester_id: string;
  requester_name: string;
  assignee_id: string | null;
  assignee_name: string | null;
  opened_at: Date;
  first_response_at: Date | null;
  resolved_at: Date | null;
  closed_at: Date | null;
  sla_first_response_due_at: Date | null;
  sla_resolution_due_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type TicketCommentRow = {
  id: string;
  author_id: string;
  author_name: string;
  body: string;
  visibility: CommentVisibility;
  created_at: Date;
};

export type TicketEventRow = {
  id: string;
  type: TicketEventType;
  actor_id: string | null;
  actor_name: string | null;
  from_value: unknown;
  to_value: unknown;
  created_at: Date;
};

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === 'string' && ticketStatuses.includes(value as TicketStatus);
}

export function isTicketPriority(value: unknown): value is TicketPriority {
  return typeof value === 'string' && ticketPriorities.includes(value as TicketPriority);
}

export function isCommentVisibility(value: unknown): value is CommentVisibility {
  return typeof value === 'string' && commentVisibilities.includes(value as CommentVisibility);
}

export function isTicketEventType(value: unknown): value is TicketEventType {
  return typeof value === 'string' && ticketEventTypes.includes(value as TicketEventType);
}

export function isTeamRole(role: string): boolean {
  return role === 'agent' || role === 'manager' || role === 'admin';
}

export function isManagerRole(role: string): boolean {
  return role === 'manager' || role === 'admin';
}

export function toTicketListItem(row: TicketRow): TicketListItem {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    status: row.status,
    priority: row.priority,
    category: { id: row.category_id, name: row.category_name },
    requester: { id: row.requester_id, name: row.requester_name },
    assignee:
      row.assignee_id && row.assignee_name
        ? { id: row.assignee_id, name: row.assignee_name }
        : null,
    openedAt: row.opened_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    version: 1,
  };
}

export function toTicketComment(row: TicketCommentRow): TicketComment {
  return {
    id: row.id,
    author: { id: row.author_id, name: row.author_name },
    body: row.body,
    visibility: row.visibility,
    createdAt: row.created_at.toISOString(),
  };
}

export function toTicketEvent(row: TicketEventRow): TicketEvent {
  return {
    id: row.id,
    type: row.type,
    actor: row.actor_id && row.actor_name ? { id: row.actor_id, name: row.actor_name } : null,
    fromValue: row.from_value,
    toValue: row.to_value,
    createdAt: row.created_at.toISOString(),
  };
}

export function toTicketDetail(
  ticket: TicketRow,
  comments: TicketCommentRow[],
  events: TicketEventRow[],
  sla: TicketSla,
): TicketDetail {
  return {
    ...toTicketListItem(ticket),
    description: ticket.description,
    firstResponseAt: ticket.first_response_at?.toISOString() ?? null,
    resolvedAt: ticket.resolved_at?.toISOString() ?? null,
    closedAt: ticket.closed_at?.toISOString() ?? null,
    slaFirstResponseDueAt: ticket.sla_first_response_due_at?.toISOString() ?? null,
    slaResolutionDueAt: ticket.sla_resolution_due_at?.toISOString() ?? null,
    comments: comments.map(toTicketComment),
    events: events.map(toTicketEvent),
    sla,
  };
}

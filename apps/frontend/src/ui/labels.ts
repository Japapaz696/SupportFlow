import type {
  CommentVisibility,
  NotificationType,
  SlaClockStatus,
  TicketEventType,
  TicketPriority,
  TicketStatus,
  UserRole,
} from '@supportflow/shared';

const statusLabels: Record<TicketStatus, string> = {
  open: 'Aberto',
  in_progress: 'Em atendimento',
  waiting_requester: 'Aguardando solicitante',
  resolved: 'Resolvido',
  closed: 'Fechado',
  cancelled: 'Cancelado',
};

const priorityLabels: Record<TicketPriority, string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

const visibilityLabels: Record<CommentVisibility, string> = {
  public: 'Público',
  internal: 'Interno',
};

const roleLabels: Record<UserRole, string> = {
  requester: 'Solicitante',
  agent: 'Agente',
  manager: 'Gerente',
  admin: 'Administrador',
};

const eventLabels: Record<TicketEventType, string> = {
  created: 'Criado',
  assigned: 'Atribuído',
  status_changed: 'Status alterado',
  priority_changed: 'Prioridade alterada',
  commented: 'Comentado',
  resolved: 'Resolvido',
  closed: 'Fechado',
  reopened: 'Reaberto',
  sla_breached: 'SLA vencido',
};

const notificationLabels: Record<NotificationType, string> = {
  ticket_assigned: 'Chamado atribuído',
  ticket_reassigned: 'Chamado reatribuído',
  ticket_status_changed: 'Status do chamado alterado',
  ticket_priority_changed: 'Prioridade do chamado alterada',
  ticket_comment_public: 'Comentário público',
  ticket_comment_internal: 'Comentário interno',
  ticket_resolved: 'Chamado resolvido',
  ticket_reopened: 'Chamado reaberto',
  ticket_closed: 'Chamado fechado',
  ticket_sla_breached: 'SLA vencido',
};

const slaClockLabels: Record<SlaClockStatus, string> = {
  pending: 'Pendente',
  at_risk: 'Em risco',
  met: 'Cumprido',
  breached: 'Vencido',
};

export function formatTicketStatus(status: TicketStatus): string {
  return statusLabels[status] ?? status;
}

export function formatTicketPriority(priority: TicketPriority): string {
  return priorityLabels[priority] ?? priority;
}

export function formatCommentVisibility(visibility: CommentVisibility): string {
  return visibilityLabels[visibility] ?? visibility;
}

export function formatUserRole(role: UserRole): string {
  return roleLabels[role] ?? role;
}

export function formatTicketEvent(type: TicketEventType): string {
  return eventLabels[type] ?? type;
}

export function formatNotificationType(type: NotificationType): string {
  return notificationLabels[type] ?? type;
}

export function formatSlaClockStatus(status: SlaClockStatus): string {
  return slaClockLabels[status] ?? status;
}

export function statusBadgeClass(status: TicketStatus): string {
  if (status === 'closed' || status === 'cancelled') return 'badge badge--neutral';
  if (status === 'resolved') return 'badge badge--success';
  if (status === 'in_progress') return 'badge badge--info';
  if (status === 'waiting_requester') return 'badge badge--warning';
  return 'badge badge--open';
}

export function priorityBadgeClass(priority: TicketPriority): string {
  if (priority === 'critical') return 'badge badge--danger';
  if (priority === 'high') return 'badge badge--warning';
  if (priority === 'medium') return 'badge badge--info';
  return 'badge badge--neutral';
}

export function slaClockBadgeClass(status: SlaClockStatus): string {
  if (status === 'breached') return 'badge badge--danger';
  if (status === 'at_risk') return 'badge badge--warning';
  if (status === 'met') return 'badge badge--success';
  return 'badge badge--neutral';
}

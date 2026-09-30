export const ticketStatuses = [
  'open',
  'in_progress',
  'waiting_requester',
  'resolved',
  'closed',
  'cancelled',
] as const;

export const ticketPriorities = ['critical', 'high', 'medium', 'low'] as const;
export const commentVisibilities = ['public', 'internal'] as const;
export const ticketEventTypes = [
  'created',
  'assigned',
  'status_changed',
  'priority_changed',
  'commented',
  'resolved',
  'closed',
  'reopened',
  'sla_breached',
] as const;

export type TicketStatus = (typeof ticketStatuses)[number];
export type TicketPriority = (typeof ticketPriorities)[number];
export type CommentVisibility = (typeof commentVisibilities)[number];
export type TicketEventType = (typeof ticketEventTypes)[number];

export const notificationTypes = [
  'ticket_assigned',
  'ticket_reassigned',
  'ticket_status_changed',
  'ticket_priority_changed',
  'ticket_comment_public',
  'ticket_comment_internal',
  'ticket_resolved',
  'ticket_reopened',
  'ticket_closed',
  'ticket_sla_breached',
] as const;

export type NotificationType = (typeof notificationTypes)[number];

export type Notification = {
  id: string;
  type: NotificationType;
  ticketId: string | null;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};

export type Category = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  defaultPriority: TicketPriority;
};

export type TicketParty = {
  id: string;
  name: string;
};

export type TicketListItem = {
  id: string;
  code: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: Pick<Category, 'id' | 'name'>;
  requester: TicketParty;
  assignee: TicketParty | null;
  openedAt: string;
  updatedAt: string;
  version: number;
};

export type TicketComment = {
  id: string;
  author: TicketParty;
  body: string;
  visibility: CommentVisibility;
  createdAt: string;
};

export type TicketEvent = {
  id: string;
  type: TicketEventType;
  actor: TicketParty | null;
  fromValue: unknown;
  toValue: unknown;
  createdAt: string;
};

export type TicketDetail = TicketListItem & {
  description: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  slaFirstResponseDueAt: string | null;
  slaResolutionDueAt: string | null;
  comments: TicketComment[];
  events: TicketEvent[];
  sla: TicketSla;
};

export const slaClockStatuses = ['pending', 'at_risk', 'met', 'breached'] as const;
export type SlaClockStatus = (typeof slaClockStatuses)[number];

export type SlaClock = {
  dueAt: string | null;
  completedAt: string | null;
  status: SlaClockStatus;
  remainingMinutes: number | null;
};

export type TicketSla = {
  firstResponse: SlaClock;
  resolution: SlaClock;
};

export const slaPolicyPriorities = ticketPriorities;

export type SlaPolicy = {
  id: string;
  priority: TicketPriority;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  businessHoursOnly: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SlaPolicyCreate = {
  priority: TicketPriority;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  businessHoursOnly?: boolean;
  isActive?: boolean;
};

export type SlaPolicyUpdate = Partial<Omit<SlaPolicyCreate, 'priority'>> & { isActive?: boolean };

export type DashboardSummary = {
  open: number;
  inProgress: number;
  waitingRequester: number;
  resolved: number;
  closed: number;
  unassigned: number;
  byPriority: Record<TicketPriority, number>;
  byCategory: Record<string, number>;
  firstResponseBreached: number;
  resolutionBreached: number;
  firstResponseAtRisk: number;
  resolutionAtRisk: number;
  firstResponseRate: number | null;
  resolutionRate: number | null;
  avgMinutesToFirstResponse: number | null;
  avgMinutesToResolution: number | null;
  attentionList: TicketListItem[];
};

export const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const;
export type HttpMethod = (typeof httpMethods)[number];

export type TicketTechnicalDiagnostic = {
  ticketId: string;
  environment: string | null;
  affectedSystem: string | null;
  apiEndpoint: string | null;
  apiMethod: HttpMethod | null;
  httpStatusCode: number | null;
  errorSummary: string | null;
  logs: string | null;
  sqlEvidence: string | null;
  serviceStatus: string | null;
  notes: string | null;
  createdBy: TicketParty;
  updatedBy: TicketParty;
  createdAt: string;
  updatedAt: string;
};

export type TicketTechnicalDiagnosticUpsert = {
  environment?: string | null;
  affectedSystem?: string | null;
  apiEndpoint?: string | null;
  apiMethod?: HttpMethod | null;
  httpStatusCode?: number | null;
  errorSummary?: string | null;
  logs?: string | null;
  sqlEvidence?: string | null;
  serviceStatus?: string | null;
  notes?: string | null;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

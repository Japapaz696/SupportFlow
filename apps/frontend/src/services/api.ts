import type {
  AuthUser,
  Category,
  CommentVisibility,
  DashboardSummary,
  Notification,
  Paginated,
  TicketComment,
  TicketDetail,
  TicketListItem,
  SlaPolicy,
  SlaPolicyCreate,
  SlaPolicyUpdate,
  TicketPriority,
  TicketStatus,
  TicketTechnicalDiagnostic,
  TicketTechnicalDiagnosticUpsert,
} from '@supportflow/shared';

const apiBaseUrl = '/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ErrorResponse = {
  error?: {
    message?: string;
  };
};

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, { ...options, headers });

  if (!response.ok) {
    let message = 'Não foi possível concluir a solicitação.';

    try {
      const body = (await response.json()) as ErrorResponse;
      message = body.error?.message ?? message;
    } catch {
      // Keep the generic message for non-JSON errors.
    }

    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function loginRequest(
  email: string,
  password: string,
): Promise<{ token: string; user: AuthUser }> {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function meRequest(token: string): Promise<AuthUser> {
  const response = await request<{ user: AuthUser }>('/auth/me', {}, token);
  return response.user;
}

export function logoutRequest(token: string): Promise<void> {
  return request<void>('/auth/logout', { method: 'POST' }, token);
}

export async function listCategories(token: string, includeInactive = false): Promise<Category[]> {
  const query = includeInactive ? '?includeInactive=true' : '';
  const response = await request<{ categories: Category[] }>(`/categories${query}`, {}, token);
  return response.categories;
}

export async function createCategory(
  token: string,
  payload: { name: string; description: string | null; defaultPriority: TicketPriority },
): Promise<Category> {
  const response = await request<{ category: Category }>(
    '/categories',
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  );
  return response.category;
}

export async function updateCategory(
  token: string,
  id: string,
  payload: Partial<{
    name: string;
    description: string | null;
    defaultPriority: TicketPriority;
    isActive: boolean;
  }>,
): Promise<Category> {
  const response = await request<{ category: Category }>(
    `/categories/${id}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    token,
  );
  return response.category;
}

export async function listNotifications(
  token: string,
  pagination: { page: number; pageSize: number },
): Promise<Paginated<Notification>> {
  const params = new URLSearchParams({
    page: String(pagination.page),
    pageSize: String(pagination.pageSize),
  });
  return request<Paginated<Notification>>(`/notifications?${params.toString()}`, {}, token);
}

export async function getUnreadNotificationCount(token: string): Promise<number> {
  const response = await request<{ unread: number }>('/notifications/unread-count', {}, token);
  return response.unread;
}

export async function readNotification(token: string, id: string): Promise<Notification> {
  const response = await request<{ notification: Notification }>(
    `/notifications/${id}/read`,
    { method: 'PATCH' },
    token,
  );
  return response.notification;
}

export async function readAllNotifications(token: string): Promise<number> {
  const response = await request<{ updated: number }>(
    '/notifications/read-all',
    { method: 'PATCH' },
    token,
  );
  return response.updated;
}

export async function getDashboardSummary(token: string): Promise<DashboardSummary> {
  const response = await request<{ summary: DashboardSummary }>('/dashboard/summary', {}, token);
  return response.summary;
}

export async function listSlaPolicies(token: string): Promise<SlaPolicy[]> {
  const response = await request<{ policies: SlaPolicy[] }>('/sla-policies', {}, token);
  return response.policies;
}

export async function createSlaPolicy(token: string, payload: SlaPolicyCreate): Promise<SlaPolicy> {
  const response = await request<{ policy: SlaPolicy }>(
    '/sla-policies',
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  );
  return response.policy;
}

export async function updateSlaPolicy(
  token: string,
  id: string,
  payload: SlaPolicyUpdate,
): Promise<SlaPolicy> {
  const response = await request<{ policy: SlaPolicy }>(
    `/sla-policies/${id}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    token,
  );
  return response.policy;
}

export function listTickets(
  token: string,
  filters: { page: number; pageSize: number; status?: string; priority?: string },
): Promise<Paginated<TicketListItem>> {
  const params = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  });

  if (filters.status) params.set('status', filters.status);
  if (filters.priority) params.set('priority', filters.priority);
  return request<Paginated<TicketListItem>>(`/tickets?${params.toString()}`, {}, token);
}

export async function getTicket(token: string, id: string): Promise<TicketDetail> {
  const response = await request<{ ticket: TicketDetail }>(`/tickets/${id}`, {}, token);
  return response.ticket;
}

export async function getTicketTechnicalDiagnostic(
  token: string,
  id: string,
): Promise<TicketTechnicalDiagnostic | null> {
  const response = await request<{ diagnostic: TicketTechnicalDiagnostic | null }>(
    `/tickets/${id}/technical-diagnostic`,
    {},
    token,
  );
  return response.diagnostic;
}

export async function saveTicketTechnicalDiagnostic(
  token: string,
  id: string,
  payload: TicketTechnicalDiagnosticUpsert,
): Promise<TicketTechnicalDiagnostic> {
  const response = await request<{ diagnostic: TicketTechnicalDiagnostic }>(
    `/tickets/${id}/technical-diagnostic`,
    { method: 'PUT', body: JSON.stringify(payload) },
    token,
  );
  return response.diagnostic;
}

export async function createTicket(
  token: string,
  payload: { title: string; description: string; categoryId: string; priority?: TicketPriority },
): Promise<TicketDetail> {
  const response = await request<{ ticket: TicketDetail }>(
    '/tickets',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
  return response.ticket;
}

export async function addComment(
  token: string,
  id: string,
  payload: { body: string; visibility: CommentVisibility },
): Promise<TicketComment> {
  const response = await request<{ comment: TicketComment }>(
    `/tickets/${id}/comments`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
  return response.comment;
}

export async function assignTicket(
  token: string,
  id: string,
  assigneeId: string | null,
): Promise<TicketDetail> {
  const response = await request<{ ticket: TicketDetail }>(
    `/tickets/${id}/assignee`,
    {
      method: 'PATCH',
      body: JSON.stringify({ assigneeId }),
    },
    token,
  );
  return response.ticket;
}

export async function changeTicketStatus(
  token: string,
  id: string,
  status: TicketStatus,
): Promise<TicketDetail> {
  const response = await request<{ ticket: TicketDetail }>(
    `/tickets/${id}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
    token,
  );
  return response.ticket;
}

export async function changeTicketPriority(
  token: string,
  id: string,
  priority: TicketPriority,
): Promise<TicketDetail> {
  const response = await request<{ ticket: TicketDetail }>(
    `/tickets/${id}/priority`,
    {
      method: 'PATCH',
      body: JSON.stringify({ priority }),
    },
    token,
  );
  return response.ticket;
}

export type {
  Category,
  DashboardSummary,
  SlaPolicy,
  TicketDetail,
  TicketListItem,
} from '@supportflow/shared';

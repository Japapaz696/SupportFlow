import type { AuthUser, DashboardSummary, TicketPriority } from '@supportflow/shared';

import { now } from '../domain/clock.js';
import { toTicketListItem } from '../domain/tickets.js';
import { HttpError } from '../errors/http-error.js';
import {
  getAttentionTickets,
  getDashboardBreakdown,
  getDashboardCounts,
} from '../repositories/dashboard.repository.js';

const priorities: TicketPriority[] = ['critical', 'high', 'medium', 'low'];

export async function getDashboardSummary(actor: AuthUser): Promise<DashboardSummary> {
  if (actor.role === 'requester') {
    throw new HttpError(403, 'FORBIDDEN', 'Operational dashboard is not available for requesters');
  }

  const currentTime = now();
  const [counts, breakdown, attention] = await Promise.all([
    getDashboardCounts(actor, currentTime),
    getDashboardBreakdown(actor),
    getAttentionTickets(actor, currentTime),
  ]);

  const byPriority = priorities.reduce(
    (acc, priority) => ({ ...acc, [priority]: 0 }),
    {} as Record<TicketPriority, number>,
  );
  for (const row of breakdown.priorities) {
    byPriority[row.priority] = row.count;
  }

  const byCategory: Record<string, number> = {};
  for (const row of breakdown.categories) {
    byCategory[row.category] = row.count;
  }

  return {
    open: counts.open,
    inProgress: counts.in_progress,
    waitingRequester: counts.waiting_requester,
    resolved: counts.resolved,
    closed: counts.closed,
    unassigned: counts.unassigned,
    byPriority,
    byCategory,
    firstResponseBreached: counts.first_response_breached,
    resolutionBreached: counts.resolution_breached,
    firstResponseAtRisk: counts.first_response_at_risk,
    resolutionAtRisk: counts.resolution_at_risk,
    firstResponseRate:
      counts.first_response_completed > 0
        ? counts.first_response_met / counts.first_response_completed
        : null,
    resolutionRate:
      counts.resolution_completed > 0 ? counts.resolution_met / counts.resolution_completed : null,
    avgMinutesToFirstResponse:
      counts.avg_first_response_minutes === null ? null : Number(counts.avg_first_response_minutes),
    avgMinutesToResolution:
      counts.avg_resolution_minutes === null ? null : Number(counts.avg_resolution_minutes),
    attentionList: attention.map(toTicketListItem),
  };
}

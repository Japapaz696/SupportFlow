import type { SlaClockStatus, TicketSla } from '@supportflow/shared';

export function computeDueAt(openedAt: Date, minutes: number): Date {
  return new Date(openedAt.getTime() + minutes * 60000);
}

export function evaluateSlaClock(
  dueAt: Date | null,
  completedAt: Date | null,
  now: Date,
  totalMinutes: number,
): { status: SlaClockStatus; remainingMinutes: number | null } {
  if (!dueAt) {
    return { status: 'pending', remainingMinutes: null };
  }

  if (completedAt) {
    return {
      status: completedAt <= dueAt ? 'met' : 'breached',
      remainingMinutes: null,
    };
  }

  const remainingMs = dueAt.getTime() - now.getTime();
  if (remainingMs <= 0) {
    return { status: 'breached', remainingMinutes: Math.ceil(Math.abs(remainingMs) / 60000) };
  }

  const remainingMinutes = Math.ceil(remainingMs / 60000);
  if (totalMinutes > 0 && remainingMs <= totalMinutes * 60000 * 0.2) {
    return { status: 'at_risk', remainingMinutes };
  }

  return { status: 'pending', remainingMinutes };
}

export function buildTicketSla(
  firstResponseDueAt: Date | null,
  resolutionDueAt: Date | null,
  firstResponseAt: Date | null,
  resolvedAt: Date | null,
  firstResponseMinutes: number | null,
  resolutionMinutes: number | null,
  now: Date,
): TicketSla {
  const firstResponse = evaluateSlaClock(
    firstResponseDueAt,
    firstResponseAt,
    now,
    firstResponseMinutes ?? 0,
  );
  const resolution = evaluateSlaClock(resolutionDueAt, resolvedAt, now, resolutionMinutes ?? 0);

  return {
    firstResponse: {
      dueAt: firstResponseDueAt?.toISOString() ?? null,
      completedAt: firstResponseAt?.toISOString() ?? null,
      ...firstResponse,
    },
    resolution: {
      dueAt: resolutionDueAt?.toISOString() ?? null,
      completedAt: resolvedAt?.toISOString() ?? null,
      ...resolution,
    },
  };
}

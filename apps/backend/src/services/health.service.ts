import type { HealthResponse } from '@supportflow/shared';

export function getHealth(): HealthResponse {
  return { status: 'ok' };
}

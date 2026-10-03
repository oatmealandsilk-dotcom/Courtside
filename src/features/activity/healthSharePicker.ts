import { router } from 'expo-router';

import type { DetectedActivity, HealthShareKey } from '@/data/types';

/*
 * "Choose" beside "Share health data" opens its own small sheet
 * (app/health-share) over the post being written. The post stays
 * underneath, so each tick is handed straight back to it here, and its
 * preview changes as you tick, the way "Who you played" hands back players.
 */
export interface HealthShareRequest {
  activity: DetectedActivity;
  /** The numbers this session has, in order. */
  available: HealthShareKey[];
  /** Those ticked now. */
  ticked: HealthShareKey[];
  onChange: (ticked: HealthShareKey[]) => void;
}

let pending: HealthShareRequest | null = null;

export function openHealthShare(request: HealthShareRequest) {
  pending = request;
  router.push('/health-share');
}

/** Read by the sheet as it opens (not taken: a re-render must still find it). */
export function peekHealthShare(): HealthShareRequest | null {
  return pending;
}

export function clearHealthShare(request: HealthShareRequest) {
  if (pending === request) pending = null;
}

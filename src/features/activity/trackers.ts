import { useEffect, useState } from 'react';

import { remote } from '@/data/remote';
import type { TrackerId } from '@/data/types';
import { useApp } from '@/store/AppContext';
import { isDemo } from './flags';

export { isTracker, TRACKERS } from './flags';

/**
 * Which of Fitbit, Oura and Polar the server is set up for (their keys are in
 * its secrets; see docs/trackers-setup.md). One the server is not set up for,
 * or a server without the trackers function at all, shows as "Coming soon".
 * The demo has all three on, so the whole flow can be seen without a tracker.
 *
 * No .web twin: the call is the same in a browser.
 */
export type TrackerStatus = Record<TrackerId, boolean>;
const NONE: TrackerStatus = { fitbit: false, oura: false, polar: false };
const ALL: TrackerStatus = { fitbit: true, oura: true, polar: true };
/** Keys are pasted rarely; asking again after ten minutes is plenty. */
const RECHECK_MS = 10 * 60 * 1000;

let known: { at: number; status: TrackerStatus } | null = null;
let asking: Promise<TrackerStatus> | null = null;

export function trackerStatus(me: string | null): Promise<TrackerStatus> {
  if (isDemo(me)) return Promise.resolve(ALL);
  if (!me) return Promise.resolve(NONE);
  if (known && Date.now() - known.at < RECHECK_MS) return Promise.resolve(known.status);
  asking ??= remote.trackers<Partial<Record<TrackerId, { on?: boolean }>>>('status')
    .then((r) => ({ fitbit: r?.fitbit?.on === true, oura: r?.oura?.on === true, polar: r?.polar?.on === true }))
    .catch(() => NONE)
    .then((status) => { known = { at: Date.now(), status }; asking = null; return status; });
  return asking;
}

/** The hook screens use. All "Coming soon" until the server answers. */
export function useTrackerStatus(): TrackerStatus {
  const { currentUserId } = useApp();
  const [status, setStatus] = useState<TrackerStatus>(() => (isDemo(currentUserId) ? ALL : known?.status ?? NONE));
  useEffect(() => {
    let current = true;
    void trackerStatus(currentUserId).then((s) => { if (current) setStatus(s); });
    return () => { current = false; };
  }, [currentUserId]);
  return status;
}

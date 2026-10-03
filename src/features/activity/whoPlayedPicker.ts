import { router } from 'expo-router';

import type { ID, PracticeSession, SessionPlayer } from '@/data/types';

/**
 * "Who you played" from the composer opens its own sheet (app/who-played)
 * over the post being written. The post is still underneath, so the sheet
 * hands the players straight back to it here rather than through the
 * address, the way "Add location" and "Add session stats" do.
 */
export interface WhoPlayedRequest {
  kind: PracticeSession['kind'];
  players: SessionPlayer[];
  text: string;
  /** People to offer before any typing: the others from a hit. */
  suggested: ID[];
  onDone: (players: SessionPlayer[], text: string) => void;
}

let pending: WhoPlayedRequest | null = null;

export function openWhoPlayed(request: WhoPlayedRequest) {
  pending = request;
  router.push('/who-played');
}

/** Read by the sheet as it opens (not taken: a re-render must still find it). */
export function peekWhoPlayed(): WhoPlayedRequest | null {
  return pending;
}

export function clearWhoPlayed(request: WhoPlayedRequest) {
  if (pending === request) pending = null;
}

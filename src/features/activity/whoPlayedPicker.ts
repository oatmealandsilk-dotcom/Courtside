import { router } from 'expo-router';

import type { ID, PracticeSession, SessionPlayer, SessionTagStatus } from '@/data/types';

/**
 * "Who was there" from the composer opens its own sheet (app/who-played)
 * over the post being written. The post is still underneath, so the sheet
 * hands the players straight back to it here rather than through the
 * address, the way "Add location" and "Add session stats" do. On a session
 * already logged, it also says where each tag stands (`status`) and who
 * can't be asked again (`declined`, `closed`), as the log sheet's edit does.
 */
export interface WhoPlayedRequest {
  kind: PracticeSession['kind'];
  players: SessionPlayer[];
  text: string;
  /** People to offer before any typing: the others from a hit. */
  suggested: ID[];
  /** Where each person's tag stands, on a session already logged. */
  status?: Record<ID, SessionTagStatus>;
  /** People who said no to this session, or took their name off it. */
  declined?: { id: ID; status: SessionTagStatus }[];
  /** Everyone who can't be asked again on this session. */
  closed?: ID[];
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

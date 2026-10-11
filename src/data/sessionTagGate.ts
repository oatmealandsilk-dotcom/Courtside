import type { Post, SessionDetail } from './types';
import { canScore, validSets, withTiebreaks } from '@/features/activity/score';

/*
 * Names on a post's session stats (session.with, migration 62) are shown
 * only once this server is known to work them out itself. Before migration
 * 62, the database keeps whatever a phone wrote there, so anyone could put
 * "vs @anyone" on their own post. Until a look at the session_tags table has
 * worked, every post read from the server has its list dropped, and nobody's
 * Tagged tab is searched by it (remote.ts). Plain functions with no app
 * imports, so they can be checked on their own.
 */

let live = false;

/** Whether names on posts' session stats can be trusted on this server (migration 62 has run). */
export const sessionTagNamesLive = (): boolean => live;

/** Set from the readiness check (the first load, or a later look). Only a clear answer changes it. */
export function setSessionTagNamesLive(ready: boolean | null): void {
  if (ready !== null) live = ready;
}

/** A post's session stats as this app may show them: without a "with" list until the server is known to write it. */
export function trustedSession(session: Post['session'] | null | undefined): Post['session'] | undefined {
  if (!session) return undefined;
  // A tennis session's score (migration 91; any tennis session since Oct 6) is drawn only in the shape the server writes; anything else is left off.
  // Its tiebreak points come beside it as "tiebreaks" (migration 158) and are put back on its sets, only where they fit.
  if ('sets' in session || 'tiebreaks' in session) {
    const { sets: raw, tiebreaks: points, ...others } = session as SessionDetail & { tiebreaks?: unknown };
    const sets = canScore(session.kind) ? withTiebreaks(validSets(raw), points) : undefined;
    session = sets ? { ...others, sets } : others;
  }
  if (live || !('with' in session)) return session;
  const { with: _unchecked, ...rest } = session;
  return rest;
}

/**
 * A post's session stats as they are sent: the names, the heart-rate zones
 * and a match's score are the server's to write (migrations 62, 65 and 91,
 * the score from your own log; its tiebreak points too, migration 158),
 * never this phone's. The copy shown here straight away may carry them;
 * the sent one does not.
 */
export function sessionToSend(session: Post['session'] | null | undefined): Post['session'] | null {
  if (!session) return null;
  const { with: _shown, zones: _zones, sets: _sets, tiebreaks: _points, ...rest } = session as SessionDetail & { tiebreaks?: unknown };
  return rest;
}

/**
 * What a look at session_tags says about migration 62: true when the table
 * answered, false when the server says it is not there, null when there was
 * no answer (no signal), which says nothing either way.
 */
export function readinessOf(error: { code?: string; message: string } | null): boolean | null {
  if (!error) return true;
  if (error.code === '42P01' || error.code === 'PGRST205' || /session_tags/.test(error.message)) return false;
  return null;
}

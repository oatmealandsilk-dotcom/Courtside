import { router } from 'expo-router';

import type { ID, MatchSet } from '@/data/types';
import { rematchNote } from '@/features/activity/score';

/**
 * "Rematch?" (Oct 4, owner): the hit form opened as an invite to the one
 * player you played, for them only (invite only, migration 76), singles,
 * its note already saying the last score ("Rematch? Last time 6–4 3–6
 * 10–7"). Nothing is posted until you press Post, and everything can still
 * be changed. It is the ordinary hit invite, so its rules still hold: the
 * form only offers people you may message, and the server never invites
 * someone blocked either way or a teen who doesn't follow you (invite_to_hit).
 */
export function startRematch(userId: ID, sets?: MatchSet[]) {
  router.push({ pathname: '/hit-request/new', params: { ask: userId, audience: 'invite_only', format: 'singles', note: rematchNote(sets), rematch: '1' } });
}

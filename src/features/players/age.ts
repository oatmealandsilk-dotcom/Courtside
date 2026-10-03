import type { ID, User } from '@/data/types';
import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * Not known to be an adult: a teen, or (with the database) an account with
 * no birthday given yet, the way the server's own rules read it
 * (open_conversation, migration 54). The demo has no ages on most of its
 * fixtures, so there only someone marked as a teen counts.
 *
 * Only for your own account (and the demo's fixtures, and a database from
 * before migration 64): since 64 nobody's age but your own reaches the app.
 * For anyone else, see AgeSource below.
 */
export const notKnownAdult = (u: Pick<User, 'ageGroup'>) => (isSupabaseConfigured ? u.ageGroup !== 'adult' : u.ageGroup === 'teen');

/**
 * Where the app learns how the teen rules apply to someone else:
 *   'fixtures': one of the demo's made-up people, by their own age;
 *   'ages':     a database from before migration 64, where every profile
 *               carries its age (also the careful stand-in until the first
 *               load says which database this is: with no ages on the
 *               profiles, nobody counts as an adult);
 *   'server':   since 64, only the server's answers (open_to_you,
 *               shown_at_court), and the server sends only the hits you may see.
 */
export type AgeSource = 'fixtures' | 'ages' | 'server';

/**
 * What the server says you may do with someone (migration 64, open_to_you),
 * without ever saying their age.
 */
export interface Openness {
  /**
   * You may start a one-to-one chat with them, put them in a group, or tag
   * them in a session: they are known to be an adult, or they follow you.
   * Null when the server would not say (you are blocked with them, they are
   * gone, or you asked about too many people today): then the app does not
   * lock anything, and the server's own check decides when you act.
   */
  chat: boolean | null;
}

/** The server's answers so far, by person. */
export type OpennessMap = Record<ID, Openness>;

/**
 * Whether someone may get a new chat, a group add or a session tag from you
 * under the teen rule, leaving aside whether they follow you (which opens it
 * whatever the rest says). Since migration 64 by the server's answer (`ask`
 * is told to fetch it when it matters; not answered yet counts as locked for
 * the moment until it comes); before 64 by their age; a demo fixture by its
 * own age.
 */
export function knownOpen(them: Pick<User, 'id' | 'ageGroup'> | undefined, id: ID, source: AgeSource, told: OpennessMap, ask?: (id: ID) => void): boolean {
  if (source === 'fixtures') return them?.ageGroup !== 'teen';
  if (source === 'ages') return them?.ageGroup === 'adult';
  ask?.(id);
  const answer = told[id];
  return !!answer && answer.chat !== false;
}

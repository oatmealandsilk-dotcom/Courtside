import type { ThemeName } from '@/theme/ThemeProvider';

/**
 * Every theme for early members (Oct 29, owner: "only making clean black and
 * white theme avaliable for now", then "getting ppl before the live lanch o
 * have alll gheme snf new ppl strat with only courtside clean night").
 *
 *   - A player whose account was made before EARLY_THEMES_CUTOFF keeps every
 *     theme on the Theme page, as today: the early-member perk.
 *   - A player whose account was made on or after it sees only Clean and
 *     Night there.
 *
 * null (today): no cutoff, so everyone counts as early and nothing changes
 * for anyone.
 *
 * Launch day: put the moment of launch here as an ISO time with its offset
 * (for example '2026-11-03T09:00:00-08:00') and ship an over-the-air update
 * (production channel only, never "store"). It can go in before launch too:
 * every account made before that moment still counts as early. Never set it
 * earlier than the update reaches phones, or players who joined in between
 * and picked a court would be put back on Clean (see EarlyThemesGate).
 *
 * The account's age is its profile's created_at (User.joinedAt), the same
 * time Settings and the welcome note go by.
 */
export const EARLY_THEMES_CUTOFF: string | null = null;

/**
 * A small quiet "Early member" line on the Theme page, for early players
 * only, and only once there is a cutoff (so it means something). Off: the
 * page is exactly as it was.
 */
export const EARLY_MEMBER_NOTE: boolean = true;

/** What a player who joined after the cutoff can pick. Clean is the court a new player starts on. */
export const NEW_PLAYER_THEMES: readonly ThemeName[] = ['clean', 'night'];

/** The court a new player is put back on when one of the others is somehow saved on their phone. */
export const NEW_PLAYER_FALLBACK: ThemeName = 'clean';

/**
 * Whether this account gets every theme. True with no cutoff; with one, true
 * only for an account made before it. An account whose join time can't be
 * read counts as new for the list (it is never moved off a court for that:
 * see joinedAfterCutoff).
 */
export function hasEveryTheme(joinedAt: string | undefined | null): boolean {
  if (!EARLY_THEMES_CUTOFF) return true;
  const cutoff = Date.parse(EARLY_THEMES_CUTOFF);
  if (Number.isNaN(cutoff)) return true;
  const joined = joinedAt ? Date.parse(joinedAt) : NaN;
  return !Number.isNaN(joined) && joined < cutoff;
}

/** True only when there is a cutoff and this account is known to have been made on or after it. */
export function joinedAfterCutoff(joinedAt: string | undefined | null): boolean {
  if (!EARLY_THEMES_CUTOFF || !joinedAt) return false;
  const cutoff = Date.parse(EARLY_THEMES_CUTOFF);
  const joined = Date.parse(joinedAt);
  return !Number.isNaN(cutoff) && !Number.isNaN(joined) && joined >= cutoff;
}

/** Whether this account may pick this court. */
export const themeAllowed = (name: ThemeName, joinedAt: string | undefined | null): boolean =>
  hasEveryTheme(joinedAt) || NEW_PLAYER_THEMES.includes(name);

/** Whether the quiet "Early member" line shows for this account. */
export const showEarlyMemberNote = (joinedAt: string | undefined | null): boolean =>
  EARLY_MEMBER_NOTE && !!EARLY_THEMES_CUTOFF && hasEveryTheme(joinedAt);

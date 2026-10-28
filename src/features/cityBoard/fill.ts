import { useMemo } from 'react';

import type { CityPage, ID, User } from '@/data/types';
import { useApp } from '@/store/AppContext';
import { FILL_TO, playWords, type PlayLine } from './board';

/** A face after the ringed ones in Up to hit: a regular here, with when they usually play. */
export interface FillFace extends PlayLine { user: User }

/** No fill (city boards off, or nothing yet): always the same empty list, so a memoised row does not draw again. */
const NONE: FillFace[] = [];

/**
 * Owner, Oct 28: "if no one is active in up to hit today. can we put like,
 * most active players in the city. that way it stays full. or if only one
 * person is up. we put the one person up with the ring. and then fill the
 * rest with more circles without the ring".
 *
 * The city's most active players this month, after the ones up today, to
 * FILL_TO faces in all, as the server picked them for you (city_page().fill:
 * by the town on their profile, never where they are; adults who may be
 * named, a private account only once you follow it, a teen viewer only
 * friends who follow each other with them; never anyone blocked or muted,
 * never you). The words under each are the server's: "Usually evenings",
 * "Played Saturday", and a number only for someone also on Top players
 * (else "Active this month"). Anyone this phone has blocked or muted since
 * is left off here too. Empty while the page has not come.
 */
export function useCityFill(page: CityPage | null | undefined, upIds: ID[]): FillFace[] {
  const { users, currentUserId, blockedIds, mutedIds } = useApp();
  const upKey = upIds.join(',');
  return useMemo(() => {
    if (!page?.fill.length) return NONE;
    const room = Math.max(0, FILL_TO - upIds.length);
    if (!room) return NONE;
    const byId = new Map(users.map((u) => [u.id, u]));
    const up = new Set(upIds);
    const now = new Date();
    return page.fill
      .flatMap((f) => {
        const user = byId.get(f.userId);
        if (!user || user.id === currentUserId || up.has(user.id) || blockedIds.includes(user.id) || mutedIds.includes(user.id)) return [];
        return [{ user, ...playWords(f, now) }];
      })
      .slice(0, room);
  }, [page, upKey, users, currentUserId, blockedIds, mutedIds]); // eslint-disable-line react-hooks/exhaustive-deps
}

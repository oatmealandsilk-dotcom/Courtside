import { useMemo } from 'react';

import type { User } from '@/data/types';
import { notKnownAdult } from '@/features/players/age';
import { useApp } from '@/store/AppContext';
import { CITY_BOARD_MOCK, DEMO_PLAYER_HITS, DEMO_PLAY_LOG, FILL_TO, playLine } from './mock';

/** A face after the ringed ones in Up to hit: a regular here, with when they usually play. */
export interface FillFace { user: User; lines: [string, string]; hits: number }

/**
 * DESIGN MOCK (design/city-board), round 3. Owner, Oct 28: "if no one is
 * active in up to hit today. can we put like, most active players in the
 * city. that way it stays full. or if only one person is up. we put the one
 * person up with the ring. and then fill the rest with more circles without
 * the ring".
 *
 * The city's most active players this month (sessions logged), after the
 * ones up today, to FILL_TO faces in all. Who (Apple 13+, the same as the
 * city's Top players):
 *   - by the city on their profile, never where they are;
 *   - an adult viewer: adults, a private account only once you follow it,
 *     and a teen only if you are friends who follow each other;
 *   - a teen viewer: only friends who follow each other with them;
 *   - never anyone you blocked, never you, never someone already up.
 * `extra`: a page's own made-up players (Austin's), already vetted as adults.
 * Off the mock (the live app), always empty.
 */
export function useCityFill({ cityName, upIds, extra = [] }: { cityName: string | null; upIds: string[]; extra?: { user: User; hits: number }[] }): FillFace[] {
  const { users, currentUser, currentUserId, followingIds, blockedIds, lastSeen } = useApp();
  return useMemo(() => {
    if (CITY_BOARD_MOCK !== 'board' || !cityName || !currentUser) return [];
    const room = Math.max(0, FILL_TO - upIds.length);
    if (!room) return [];
    const viewerTeen = notKnownAdult(currentUser);
    const up = new Set(upIds);
    const mayShow = (u: User) => {
      if (blockedIds.includes(u.id)) return false;
      const friends = !!lastSeen[u.id]?.mutual;
      if (viewerTeen || notKnownAdult(u)) return friends;
      return !u.isPrivate || followingIds.includes(u.id);
    };
    const inCity = users
      .filter((u) => u.id !== currentUserId && !up.has(u.id) && u.location.split(',')[0].trim() === cityName && (DEMO_PLAYER_HITS[u.id] ?? 0) > 0 && mayShow(u))
      .map((u) => ({ user: u, hits: DEMO_PLAYER_HITS[u.id] }));
    const more = viewerTeen ? [] : extra.filter((x) => !up.has(x.user.id) && !blockedIds.includes(x.user.id));
    return [...inCity, ...more]
      .sort((a, b) => b.hits - a.hits)
      .slice(0, room)
      .map(({ user, hits }) => ({ user, hits, lines: playLine(DEMO_PLAY_LOG[user.id], hits) }));
  }, [cityName, upIds.join(','), extra, users, currentUser, currentUserId, followingIds, blockedIds, lastSeen]); // eslint-disable-line react-hooks/exhaustive-deps
}

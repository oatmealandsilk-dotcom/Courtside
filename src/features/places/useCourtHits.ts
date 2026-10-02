import { useMemo } from 'react';

import type { HitRequest } from '@/data/types';
import { canSeeHitAt, hitsAtCourt, openHits } from '@/features/hits/visible';
import { useApp } from '@/store/AppContext';

/**
 * The open hits at one court, soonest first, for its page and the map's card:
 * the same filters as Find Players (called off, past, blocked, muted, the
 * teen rule), then only those at this court.
 */
export function useCourtHits(place: { id?: string; lat: number; lng: number } | null): HitRequest[] {
  const { hitRequests, users, followingIds, currentUserId, blockedIds, mutedIds } = useApp();
  return useMemo(() => {
    if (!place) return [];
    const usersById = new Map(users.map((u) => [u.id, u]));
    const seen = openHits(hitRequests, { blockedIds, mutedIds }).filter((h) => canSeeHitAt(h, { usersById, followingIds, currentUserId }));
    return hitsAtCourt(seen, place);
  }, [hitRequests, users, followingIds, currentUserId, blockedIds, mutedIds, place?.id, place?.lat, place?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
}

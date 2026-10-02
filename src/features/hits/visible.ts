import type { HitRequest, User } from '@/data/types';
import { sameCourt } from '@/features/places/court';
import { isMapCourtId } from '@/features/places/courtName';

/**
 * Open hits this close to you (25 km, the reach of hit matches) count as
 * near: the still map's count and flags and the Open hits list share it, so
 * they agree.
 */
export const NEAR_HIT_MILES = 15.5;

/**
 * Hits still ahead (or started within the hour), not called off, and not
 * from anyone you blocked or muted, soonest first. The one list every hit
 * surface starts from: Find Players, the map, a court's page and its card.
 */
export function openHits(hits: HitRequest[], { blockedIds, mutedIds, now = Date.now() }: { blockedIds: string[]; mutedIds: string[]; now?: number }): HitRequest[] {
  const hidden = new Set([...blockedIds, ...mutedIds]);
  return hits
    .filter((h) => !h.cancelled && Date.parse(h.startsAt) > now - 3_600_000 && !hidden.has(h.authorId))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/**
 * Whether a hit may show for you anywhere: its author has to be loaded (a
 * card with no face says nothing), and a hit by someone not known to be an
 * adult shows only to them and to the people who follow them. A hit pins a
 * minor to a court at a time, and adults could not join it anyway (join_hit
 * says "teen_closed"). Owner decision 1 asks whether to loosen this for the
 * Open hits list. Since migration 64 the database applies this rule itself
 * (a stranger is never sent a minor's hit, live updates included), so
 * `seeing` (useApp().seeing) passes every hit it sent; before 64 it reads
 * the author's age.
 */
export function canSeeHitAt(hit: HitRequest, { usersById, followingIds, currentUserId, seeing }: { usersById: Map<string, User>; followingIds: string[] | Set<string>; currentUserId: string | null; seeing: (u: User) => boolean }): boolean {
  const author = usersById.get(hit.authorId);
  if (!author) return false;
  if (author.id === currentUserId) return true;
  const following = followingIds instanceof Set ? followingIds : new Set(followingIds);
  return following.has(author.id) || seeing(author);
}

/** Where a hit is, as a court: null for a place that was only typed (no spot to put on a map). */
export function hitSpot(hit: HitRequest): { id?: string; name: string; lat: number; lng: number } | null {
  const { lat, lng } = hit.place;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { id: isMapCourtId(hit.place.id) ? hit.place.id : undefined, name: hit.place.name, lat, lng };
}

/** The hits at one court: the same map id, or within 0.15 mi of it (the map's own rule). */
export function hitsAtCourt(hits: HitRequest[], place: { id?: string; lat: number; lng: number }): HitRequest[] {
  return hits.filter((h) => { const spot = hitSpot(h); return !!spot && sameCourt(spot, place); });
}

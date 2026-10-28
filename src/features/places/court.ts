import type { Post } from '@/data/types';
import { milesBetween } from '@/features/players/geo';

/**
 * A court as its page knows it: a name and a spot, and the map's id for it
 * when there is one. A place shared without an id (a hit's place, a court
 * sent into a chat) is still a court page, found by where it is.
 */
export interface CourtPlace { id?: string; name: string; lat: number; lng: number }

/**
 * The same court: the same map id, or tagged within 0.15 mi of it (the map's
 * own rule). A tag stores its court's own spot, so the distance only matters
 * when one park was filed under a neighbouring court's id.
 */
export const sameCourt = (tag: { id?: string; lat: number; lng: number }, place: { id?: string; lat: number; lng: number }) =>
  (!!tag.id && tag.id === place.id) || milesBetween(tag, place) < 0.15;

/** A clip, the way a tile decides it: a clip post, or anything carrying a video. */
export const isClip = (post: Post) => post.kind === 'clip' || !!post.videoUrl;

/**
 * The clip a court's page leads with (Oct 28, owner: "we should have most
 * viral video on the top instead of the plain map"): of the posts the page
 * already lists for you (so no one's post shows here that the Clips row would
 * not show), the most-watched clip with a video to play; a tie, the newest.
 * None (no clips, or photos only): null, and the page keeps its map.
 */
export function topClip(posts: Post[]): Post | null {
  let best: Post | null = null;
  for (const p of posts) {
    if (!isClip(p) || !p.videoUrl) continue;
    const views = p.views ?? 0;
    const bestViews = best?.views ?? 0;
    if (!best || views > bestViews || (views === bestViews && Date.parse(p.createdAt) > Date.parse(best.createdAt))) best = p;
  }
  return best;
}

/**
 * A court page's address back into a place: the name and spot it travels
 * with, or, for a bare link, the spot of a post already here tagged there.
 * "near" stands for a place with a spot and no court id.
 */
export function parseCourtParams(params: { id?: string; name?: string; lat?: string; lng?: string }, posts: Post[]): CourtPlace | null {
  const id = params.id && params.id !== 'near' ? params.id : undefined;
  const tagged = id ? posts.find((p) => p.court?.id === id)?.court : undefined;
  const lat = params.lat ? Number(params.lat) : NaN;
  const lng = params.lng ? Number(params.lng) : NaN;
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    return { id, name: params.name?.trim() || tagged?.name || 'Court', lat, lng };
  }
  if (tagged) return { id, name: params.name?.trim() || tagged.name, lat: tagged.lat, lng: tagged.lng };
  return null;
}

/** "12 clips", "1 post", "40+ posts" while older ones are still to come. */
export function countLabel(posts: Post[], more: boolean): string {
  const n = posts.length;
  if (!n) return 'No posts yet';
  const word = posts.every(isClip) ? 'clip' : 'post';
  if (more) return `${n}+ ${word}s`;
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * share.courtsidebase.com answers a link-preview robot (iMessage, WhatsApp,
 * Instagram DMs…) with the post's picture and caption, and sends a person on
 * to the app (cloudflare/share-worker.js). Until it is running, links point
 * at the app directly and preview as the generic CourtSide card.
 */
const PREVIEWS_LIVE = false;
const BASE = PREVIEWS_LIVE ? 'https://share.courtsidebase.com' : 'https://app.courtsidebase.com';

/**
 * The link to share outside the app for a post, a profile, a Community
 * thread or a "Looking for a hit". The preview robot only knows the first
 * three; any other path it passes straight on to the app.
 */
export function shareLink(kind: 'post' | 'profile' | 'question' | 'hit-request' | 'group', id: string): string {
  return `${BASE}/${kind === 'profile' ? 'user' : kind === 'group' ? 'g' : kind}/${id}`;
}

/** A court as a map link anyone can open, in or out of the app. */
export function placeLink(place: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
}

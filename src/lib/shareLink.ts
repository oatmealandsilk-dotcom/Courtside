/**
 * share.courtsidebase.com answers a link-preview robot (iMessage, WhatsApp,
 * Instagram DMs…) with the post's picture and caption, and sends a person on
 * to the app (cloudflare/share-worker.js). Until it is running, links point
 * at the app directly and preview as the generic CourtSide card.
 */
const PREVIEWS_LIVE = false;
const BASE = PREVIEWS_LIVE ? 'https://share.courtsidebase.com' : 'https://app.courtsidebase.com';

/** The link to share outside the app for a post, a profile or a Community thread. */
export function shareLink(kind: 'post' | 'profile' | 'question', id: string): string {
  return `${BASE}/${kind === 'profile' ? 'user' : kind}/${id}`;
}

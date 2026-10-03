/**
 * share.courtsidebase.com answers a link-preview robot (iMessage, WhatsApp,
 * Instagram DMs…) with the post's picture and caption, and sends a person on
 * to the app (cloudflare/share-worker.js). Until it is running, links point
 * at the app directly and preview as the generic CourtSide card. Nothing
 * below depends on it: either way the link opens the same page.
 */
const PREVIEWS_LIVE = false;
const BASE = PREVIEWS_LIVE ? 'https://share.courtsidebase.com' : 'https://app.courtsidebase.com';

/** The handle on a link, when there is one to carry (see rememberReferrer). */
const withRef = (url: string, ref?: string | null) => {
  const clean = ref?.trim().toLowerCase();
  if (!clean || !/^[a-z0-9_]{2,24}$/.test(clean)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}ref=${clean}`;
};

/**
 * The link to share outside the app for a post, a profile, a Community
 * thread or a "Looking for a hit". It opens for anyone: signed in, the page
 * itself; with no account, a public look at it and a way in (see
 * SharedPage), which lands them back on it once they have joined. `ref` is
 * the sharer's handle: whoever joins through the link is counted as theirs.
 */
export function shareLink(kind: 'post' | 'profile' | 'question' | 'hit-request', id: string, ref?: string | null): string {
  return withRef(`${BASE}/${kind === 'profile' ? 'user' : kind}/${encodeURIComponent(id)}`, ref);
}

/**
 * A court, shared outside the app: its page when the map knows it (anyone can
 * open it, signed in or not), else a map link anyone can open.
 */
export function courtLink(place: { id?: string; name: string; lat: number; lng: number }, ref?: string | null): string {
  if (!place.id || !/^(node|way|relation)\d{1,15}$/.test(place.id)) return placeLink(place);
  const q = `name=${encodeURIComponent(place.name)}&lat=${place.lat.toFixed(5)}&lng=${place.lng.toFixed(5)}`;
  return withRef(`https://app.courtsidebase.com/court/${place.id}?${q}`, ref);
}

/** A court as a map link anyone can open, in or out of the app. */
export function placeLink(place: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
}

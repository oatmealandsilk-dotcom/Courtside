import { useEffect } from 'react';
import { Image as ExpoImage } from 'expo-image';

/**
 * Every reel's cover picture, there before you reach it (Oct 25, owner: "I'm scrolling on
 * Instagram as fast as I can and I don't ever hit a video that's not loaded" / "Can we make ours
 * like that").
 *
 * A clip page shows its cover (the still picture chosen when it was posted) from the moment it is
 * on screen until its video can play, under its caption and buttons, the way Instagram does: so
 * the cover must already be on the phone when the page arrives. The covers of the next ten pages
 * are fetched ahead, nearest first, into the picture cache the page draws from (expo-image's own
 * cache on a phone, the browser's in a browser). A cover is a small picture (about 250 KB), so ten
 * of them cost about as much as two seconds of one clip, and each is fetched once per visit: as the
 * Feed moves on one page, one new cover is asked for, which that page would have fetched anyway
 * once built. On a slow link only the next three, so they never crowd out the clip on screen.
 *
 * Only while this Feed is on show and the app is in front. For everyone: pictures only, no video,
 * no new native code.
 */
export const POSTERS_AHEAD = 10;
/** On a slow link (lib/netSpeed): just the nearest few. */
export const POSTERS_AHEAD_SLOW = 3;

/** Covers already asked for this session, so a page coming round again (or a second feed) never asks twice. */
const asked = new Set<string>();
const remember = (url: string) => {
  asked.add(url);
  if (asked.size > 500) { const oldest = asked.values().next().value; if (oldest !== undefined) asked.delete(oldest); }
};

/** Fetches `urls` (nearest first) into the picture cache while `on`; each address once per session. */
export function usePostersAhead(urls: readonly string[], on: boolean) {
  const key = on ? urls.filter((url) => /^https?:\/\//i.test(url)).join('\n') : '';
  useEffect(() => {
    const fresh = key ? key.split('\n').filter((url) => !asked.has(url)) : [];
    if (!fresh.length) return;
    fresh.forEach(remember);
    // On a phone, kept on disk rather than held decoded in memory: ten full-screen pictures would
    // be a lot of memory, and a page built a swipe or two ahead reads its cover from disk long
    // before it is on screen. A browser keeps them in its own cache either way.
    ExpoImage.prefetch(fresh, 'disk').catch(() => undefined);
  }, [key]);
}

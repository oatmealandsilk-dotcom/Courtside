import { useEffect, useState } from 'react';

/**
 * Whether the website's first clip has started playing this visit (Nov 27 speed pass). Until it has, nothing
 * else competes with it for the connection: the covers ahead (postersAhead) and the next clips' videos
 * (ClipPlayback.web) wait. Also said once the loader has been gone 1.5 s, so a first page with no clip, or
 * a clip that never plays, never holds them back for long. On a phone it is true from the start (unchanged there).
 * The moment is marked for speed checks as performance mark 'cs-first-video-playing'.
 */
let played = false;
const listeners = new Set<() => void>();

export function markFirstClipPlaying(why: 'playing' | 'timeout' = 'playing') {
  if (played) return;
  played = true;
  try { if (why === 'playing') performance.mark('cs-first-video-playing'); } catch { /* only a mark */ }
  listeners.forEach((fn) => fn());
  listeners.clear();
}

/** Called as the website's loader goes: the hold ends 1.5 s later at the latest. */
export function holdFirstClipAtMost(ms = 1500) {
  if (!played) setTimeout(() => markFirstClipPlaying('timeout'), ms);
}

export function firstClipPlayed(): boolean {
  return played;
}

export function useFirstClipPlayed(): boolean {
  const [now, setNow] = useState(played);
  useEffect(() => {
    if (played) { setNow(true); return undefined; }
    const fn = () => setNow(true);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return now;
}

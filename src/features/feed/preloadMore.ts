import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/store/AppContext';
import { primeClip, type PrimeLimits } from './clipPrimer';

/**
 * Two more reels loaded ahead, just their very beginning (Oct 25, owner: "Ok so we need to pre
 * load more maybe two more reels in advance. We can do only the very beginning too").
 *
 * The Feed already builds the next two pages with their players (each fetches its first three
 * seconds), and a third once the link has room for it (the lookahead, app/(tabs)/index.tsx). On
 * top of that, the next two clips past those get their first second or so fetched into the video
 * player's own cache on the phone (`useCaching`, lib/videoSource): one short-lived player at a
 * time, with a buffer that small, freed the moment that second is in. When the page is built for
 * real a swipe or two later, its player reads that second from the phone instead of the network,
 * so it shows its first frame and can start at once (see clipPrimer).
 *
 * Only on a quick link, with the Feed on show and playing, the app in front, and only once
 * everything nearer is in (the same gate as the lookahead's third page, one page further). Moving
 * on cancels it. Each clip's beginning costs at most about 1 MB, so the two about 2 MB.
 *
 * None of it can be tried on an iPhone before it ships (no simulator here), and the phone limits
 * how many video players can be live at once, so admins (@oatmealandsilk, @mrdinosaur62) get it
 * first. Turned on for everyone by setting this to true and shipping an over-the-air update: no
 * database change, no new native code. In the web demo, ?admin=1 makes the demo's player an
 * admin. The same pattern as COMMENTS_V2_RELEASED.
 */
export const PRELOAD_MORE_FOR_EVERYONE = false;

/** Whether this person's Feed loads the two extra beginnings. */
export function usePreloadMore(): boolean {
  const { currentUser } = useApp();
  return PRELOAD_MORE_FOR_EVERYONE || !!currentUser?.isAdmin;
}

/** How many clips past the pages the Feed builds get their very beginning. */
export const PRIME_CLIPS = 2;
/** How many pages past the built ones are looked at for them (a written post or a tip in between is skipped). */
export const PRIME_LOOK = 4;

/** What one clip's beginning may take: how much of it, the most it may cost, and how long it may try. */
export const PRIME_LIMITS: PrimeLimits = {
  // The very beginning: the first frame and an instant start, no more.
  seconds: 1.2,
  // Never less than this for a heavy clip: under it the first frame may not be in yet.
  minSeconds: 0.6,
  // About 1 MB a clip, so the two together stay within about 2 MB.
  bytes: 1_000_000,
  // A link this slow is better left to the clips nearer: given up, and not tried again.
  giveUpMs: 8000,
};

/** One clip to start fetching: its address, and where it starts playing (a trimmed clip's kept start). */
export type PrimeTarget = { uri: string; from: number };

/** Clips whose beginning has been fetched (or tried) this session: each is fetched once at most. */
const tried = new Set<string>();
const remember = (uri: string) => {
  tried.add(uri);
  if (tried.size > 300) { const oldest = tried.values().next().value; if (oldest !== undefined) tried.delete(oldest); }
};

/**
 * The one extra player alive on the phone, whichever feed started it: a second feed starting one
 * (a group tab taking over from For you) stops the first, so there is never more than one.
 */
let live: { cancel: () => void } | null = null;

/**
 * Fetches the very beginning of each of `targets`, nearest first, one at a time, while `on`.
 * One that is no longer wanted (the Feed moved on and built it, or it fell out of reach), or `on`
 * going false (paused, hidden, the app left the front, the link got slow), stops it at once.
 */
export function useClipPrimer(targets: readonly PrimeTarget[], on: boolean) {
  const current = useRef<{ uri: string; cancel: () => void } | null>(null);
  const [turn, setTurn] = useState(0);
  const key = targets.map((t) => `${t.from}@${t.uri}`).join('\n');
  useEffect(() => {
    const now = current.current;
    if (now && (!on || !targets.some((t) => t.uri === now.uri))) { current.current = null; now.cancel(); }
    if (!on || current.current) return;
    const next = targets.find((t) => !tried.has(t.uri));
    if (!next) return;
    live?.cancel();
    let stop = () => undefined as void;
    const job: { uri: string; cancel: () => void } = { uri: next.uri, cancel: () => { if (live === job) live = null; stop(); } };
    current.current = job;
    live = job;
    stop = primeClip(next.uri, next.from, PRIME_LIMITS, () => {
      if (live === job) live = null;
      if (current.current !== job) return;
      current.current = null;
      remember(next.uri);
      setTurn((n) => n + 1);
    });
  }, [on, key, turn]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { const now = current.current; current.current = null; now?.cancel(); }, []);
}

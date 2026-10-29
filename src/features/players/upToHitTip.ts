import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { User } from '@/data/types';

/*
 * Up to hit's tip (Oct 28, owner: "tapping the map has a regular open but tapping the check-in has like the map
 * thing that zoomed in on their live location and then we would also give them a tip at some point to click the
 * button so they know that there's a cool animation"). One bubble under the Find Players card's Up to hit pill:
 * "Tap Up to hit · friends see you on the map till 10pm." (tips.ts 'up-to-hit'), with one small pulse of the pill.
 *
 *  - When: the 2nd or 3rd time someone opens Find Players (a visit: the card coming into view on the Community
 *    tab, or the app coming back to it, at least VISIT_GAP_MS after the last one), never on the first.
 *  - Who: never tapped Up to hit (a tap anywhere learns it, useCheckIn), not up now, never on the map before,
 *    not on "No one". A teen sees it too: the pill works for them (the question first, as always).
 *  - Never during the tutorial, never over another tip, at most one tip a visit (useTip).
 *  - Once: it closes itself after TIP_SHOW_MS, or on "Got it", or on the pill's own tap.
 *
 * Admins first, with the zoom it points at (CHECKIN_ZOOM_FOR_EVERYONE): for everyone by setting
 * UTH_TIP_FOR_EVERYONE to true too (an over-the-air update, nothing else).
 */
export const UTH_TIP_FOR_EVERYONE = true;

/** Whether the tip may show for this person: the zoom is theirs, and the tip is out for them. */
// Oct 28 (owner: push Up to hit to everyone): the tip stands on its own, with or without the zoom.
export const upToHitTipOn = (me: User | null | undefined): boolean => !!me && (UTH_TIP_FOR_EVERYONE || !!me.isAdmin);

/** Which visits to Find Players the tip may come on (blocked on the 2nd by another tip, it tries once more). */
export const TIP_VISITS: readonly [number, number] = [2, 3];
/** Two looks at the card closer together than this are the same visit (a swipe to Discussions and back). */
const VISIT_GAP_MS = 10 * 60_000;
/** How long the tip stays up before it closes itself (for good). */
export const TIP_SHOW_MS = 8000;

const KEY = 'courtside.uth-tip.visits.v1';
let visits = 0;
let lastAt = 0;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

void AsyncStorage.getItem(KEY)
  .then((raw) => {
    if (!raw) return;
    const saved = JSON.parse(raw) as { n?: number; at?: number };
    visits = Math.max(visits, Number(saved.n) || 0);
    lastAt = Math.max(lastAt, Number(saved.at) || 0);
  })
  .catch(() => undefined)
  .finally(() => { loaded = true; emit(); });

/** A visit to Find Players: counted once a gap has passed since the last one (counting stops past the tip's last chance). */
function noteVisit() {
  if (!loaded || visits > TIP_VISITS[1]) return;
  const now = Date.now();
  if (lastAt && now - lastAt < VISIT_GAP_MS) return;
  visits += 1;
  lastAt = now;
  void AsyncStorage.setItem(KEY, JSON.stringify({ n: visits, at: lastAt })).catch(() => undefined);
  emit();
}

/**
 * The Community tab's Find Players card counts its visits while `seen` (in view: its tab, its section, no search over
 * it), the app coming back to it counting as one too. Returns which visit this is (0 before the count is read).
 */
export function useFindPlayersVisit(seen: boolean): number {
  const n = useSyncExternalStore(subscribe, () => (loaded ? visits : 0), () => 0);
  const read = useSyncExternalStore(subscribe, () => loaded, () => false);
  const seenRef = useRef(seen);
  seenRef.current = seen;
  useEffect(() => { if (seen && read) noteVisit(); }, [seen, read]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active' && seenRef.current) noteVisit(); });
    return () => sub.remove();
  }, []);
  return n;
}

/** Whether this visit is one the tip may come on. */
export const tipVisit = (n: number): boolean => n >= TIP_VISITS[0] && n <= TIP_VISITS[1];

import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { makeMutable } from 'react-native-reanimated';

import type { Post } from '@/data/types';
import { useResponsive } from '@/lib/useResponsive';
import { useApp } from '@/store/AppContext';
import { statsLine } from '@/features/activity/format';
import { dropFeedShot, takeFeedShot } from './feedSnapshot';
import type { FeedItem } from './rankFeed';

/**
 * The Feed's windows (Oct 25, owner: "if I hold from the feed screen, I will be able to see the
 * activity tab fee tab and the groups that I'm in and I can swipe between those … Maybe you can
 * try and build it", then "Build it").
 *
 * Hold any word of the Feed's top row (or the bar's Feed tab while on the Feed) and the feed on
 * show shrinks into a card, the way the iPhone's app switcher does, with a card for each of the
 * others beside it: Activities, For you, then each group, in the row's order. Swipe sideways
 * between them, tap one to open it, swipe down (or tap outside, Back, or the Feed tab) to go back
 * to the one you were on. The card you came from is the real feed, held still; the others are a
 * still of where each one stands (features/feed/FeedWindowsView).
 *
 * None of it can be tried on an iPhone before it ships (no simulator here), so admins
 * (@oatmealandsilk, @mrdinosaur62) get it first. Turned on for everyone by setting this to true
 * and shipping an over-the-air update: no database change, no new native code. In the web demo,
 * ?admin=1 makes the demo's player an admin. The same pattern as PRELOAD_MORE_FOR_EVERYONE.
 */
export const FEED_WINDOWS_FOR_EVERYONE = true;

/**
 * Whether a clip's page may be photographed for its card. Off: the phone's video layer is expected
 * to come out black in a still (untested here), so a clip's card shows its poster instead. To be
 * tried on an admin's phone before it is ever turned on.
 */
export const SNAP_CLIP_PAGES = false;

/** Whether this person's Feed has the windows: phone layouts only (a phone's browser too), signed in. */
export function useFeedWindowsOn(): boolean {
  const { currentUser, currentUserId } = useApp();
  const { isPhone } = useResponsive();
  return (FEED_WINDOWS_FOR_EVERYONE || !!currentUser?.isAdmin) && isPhone && !!currentUserId;
}

/** How long a finger rests on a word (or the Feed tab) before the windows open. */
export const HOLD_MS = 400;
/** The air between two cards. */
export const CARD_GAP = 14;
/**
 * Room kept above the cards for their names (and the line under each name): above, not under, so a
 * finger come up from the bar never covers them (Oct 25, owner: "On changing windows, you should be
 * able to see the names on top of the tabs"). The name (20) and its line (4 + 16), then 10 of air.
 */
export const LABEL_SPACE = 50;
/** The name and its line, without the air under them. */
export const LABEL_HEIGHT = 40;
/** The biggest a card gets: on a 390-point phone about 273 points wide, with 44 of each neighbour showing. */
export const CARD_MAX = 0.7;

/**
 * A sideways swipe between the cards (Oct 26, owner: "make the side to side swipe a bit more
 * sensitive just a bit"): it moves on once dragged this much of a card (was half), or once a flick's
 * speed would carry it there in this many seconds (was 0.18), never more than one card past where
 * the finger let go (a hard flick no longer skips a card).
 */
export const SWIPE_MOVE_AT = 0.38;
export const SWIPE_FLING_S = 0.24;

/**
 * Where a sideways swipe settles: `f` the middle card as the finger lets go (a float), `start` where it
 * stood when the finger came down, `cardsPerSecond` the finger's speed in cards (right is positive).
 * At most one card past the card it started from (or past the finger, if it was dragged further): a
 * quick second flick while the cards are still settling on the first one's card still moves one more.
 */
export function swipeTarget(f: number, start: number, cardsPerSecond: number, n: number): number {
  'worklet';
  const from = Math.round(start);
  const p = f - cardsPerSecond * SWIPE_FLING_S - from;
  let to = from + (p >= 0 ? Math.floor(p + 1 - SWIPE_MOVE_AT) : -Math.floor(-p + 1 - SWIPE_MOVE_AT));
  to = Math.max(Math.min(from - 1, Math.ceil(f) - 1), Math.min(Math.max(from + 1, Math.floor(f) + 1), to));
  return Math.max(0, Math.min(n - 1, to));
}

/**
 * The finger still down after the hold, sliding between the cards (FeedHold): one card per step,
 * each step at most this many points (was 76: a step is now about 43 points of slide, was 49).
 */
export const SCRUB_PITCH_MIN = 44;
export const SCRUB_PITCH_MAX = 66;

/** The motion, all springs (mass 1), each landing written plainly afterwards. */
export const SPRING_OPEN = { mass: 1, stiffness: 260, damping: 28 };
/**
 * Lands once what is left of the grow is under half a point (energyThreshold, relative): Reanimated's
 * default waits ~0.3 s longer for the invisible tail, and the feed is not usable until it lands.
 */
export const SPRING_BACK = { mass: 1, stiffness: 320, damping: 33, energyThreshold: 1e-5 };
export const SPRING_SNAP = { mass: 1, stiffness: 280, damping: 30 };
export const SPRING_DRAG = { mass: 1, stiffness: 400, damping: 36 };
/** A finger still down after the hold, sliding between the cards: one card per step, quick and calm. */
export const SPRING_SCRUB = { mass: 1, stiffness: 420, damping: 40 };

/** 'activities', 'for-you', or a group's id: one card each, in the top row's order. */
export type FeedKey = string;
export const FOR_YOU: FeedKey = 'for-you';
export const ACTIVITIES_KEY: FeedKey = 'activities';

/**
 * Where the cards stand, on the animation thread. One Feed tab, so one set:
 * `p` 0 full screen … 1 cards; `f` the card in the middle (a float while swiping);
 * `live` the card that is the real feed; `drag` a finger pulling the row down;
 * `still` 1 with Reduce Motion (the real feed never moves; the cards fade in over it).
 */
export const winP = makeMutable(0);
export const winF = makeMutable(0);
export const winLive = makeMutable(0);
export const winDrag = makeMutable(0);
export const winStill = makeMutable(0);
/** 1 from the moment they open until they have closed: at 0 the real feed is drawn exactly as it is. */
export const winOn = makeMutable(0);
/**
 * Runs every frame while the windows are up (and only then), read by the real feed's card. Reanimated
 * 4.5 hands a look that has been still for 1–2 s back to React and drops it unsynced after 2 s
 * (components/ui/restMotion). Kept moving, the shrunk card is never handed back, so a close whose
 * full-screen rest is dropped (the app sent away, JS busy) can never bring the feed back shrunk.
 */
export const winTick = makeMutable(0);
/**
 * 1 while the finger that held the row (or the Feed tab) is still down after the windows opened:
 * sliding it moves between the cards, lifting it opens the one picked (FeedHold). `winSel` is the
 * card it points at.
 */
export const winScrub = makeMutable(0);
export const winSel = makeMutable(0);
/**
 * 1 while a held finger is down (FeedHold, UI thread). The windows open a hop later on the JS side;
 * a finger lifted in that hop must not leave them waiting for a slide that never comes.
 */
export const winFinger = makeMutable(0);
/**
 * The card picked, from the pick until the windows have closed (-1 otherwise): its own feed is drawn
 * in it as it grows back (FeedWindowsView's WindowsLayer), so what lands is the feed itself, never a
 * picture of it swapped out at the end (Oct 26, owner: "Make the windows landing a bit smoother it's a
 * tad bit glitchy"). A kept feed is at its own card anyway; this brings For you out from under the card
 * you came from to its own. Read only while they are up, and cleared after the close.
 */
export const winPick = makeMutable(-1);
/**
 * As the windows close, the one card whose feed waits out of sight until React has hidden its layer
 * (-1 otherwise): the card you came from, once a pick made another feed the one on show (it stayed up
 * at its card as it slid away), or the card picked, if they closed before it became the one on show.
 * Written before the close itself, so on the animation thread it is in place when the close is.
 */
export const winAway = makeMutable(-1);
export interface WindowsGeo { W: number; H: number; S: number; dy: number; step: number; rDevice: number; rCard: number; n: number }
export const winGeo = makeMutable<WindowsGeo>({ W: 1, H: 1, S: 1, dy: 0, step: 1, rDevice: 0, rCard: 0, n: 1 });

/** Where one card sits at `p` with `f` in the middle: the same sums for the real feed and every picture. */
export function cardAt(i: number, p: number, f: number, g: WindowsGeo) {
  'worklet';
  const s = 1 + (g.S - 1) * p;
  const x = (i - f) * (g.W + CARD_GAP + (g.step - g.W - CARD_GAP) * p);
  const y = g.dy * p;
  const r = p > 0.001 ? (g.rDevice + (g.rCard - g.rDevice) * p) / s : 0;
  return { s, x, y, r };
}

// ---------------------------------------------------------------------------
// The store: open or not, which feed it opened on, which one was picked. Read through
// small components (the row, the ground, the overlay, the clips), so the Feed itself
// and its pages never redraw for it.
// ---------------------------------------------------------------------------

export type WindowsPhase = 'closed' | 'open' | 'closing';
interface WindowsState {
  phase: WindowsPhase;
  /** The feed on show when they opened. */
  origin: FeedKey;
  /** The card tapped, on its way to full screen (the row's word moves to it at once). */
  target: FeedKey | null;
  /** The clip on show stays on its frame (ClipVideo's covered path). */
  held: boolean;
  /** The real feed is cut to its rounded card (only while open: masking a video every frame costs). */
  clipped: boolean;
  /** A feed was picked from the row by a tap this visit: the hint may show. */
  rowSwitched: boolean;
}
let state: WindowsState = { phase: 'closed', origin: FOR_YOU, target: null, held: false, clipped: false, rowSwitched: false };
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export const windowsState = () => state;
export function setWindowsState(patch: Partial<WindowsState>) {
  const next = { ...state, ...patch };
  if ((Object.keys(patch) as (keyof WindowsState)[]).every((k) => next[k] === state[k])) return;
  state = next;
  listeners.forEach((fn) => fn());
}

export function useWindowsPhase(): WindowsPhase {
  return useSyncExternalStore(subscribe, () => state.phase, () => state.phase);
}
/** The card picked, while it grows back (null otherwise). */
export function useWindowsTarget(): FeedKey | null {
  return useSyncExternalStore(subscribe, () => state.target, () => state.target);
}
/** Whether the clip on show is held on its frame by the windows. */
export function useWindowsHeld(): boolean {
  return useSyncExternalStore(subscribe, () => state.held, () => state.held);
}
export function useWindowsClipped(): boolean {
  return useSyncExternalStore(subscribe, () => state.clipped, () => state.clipped);
}
export function useWindowsRowSwitched(): boolean {
  return useSyncExternalStore(subscribe, () => state.rowSwitched, () => state.rowSwitched);
}
/**
 * This feed is the card picked, growing back to the whole screen: its layer shows at its own card
 * meanwhile, under the card's picture, which gives way to it as it grows (not with Reduce Motion).
 */
export function useWindowsRising(key: FeedKey): boolean {
  const get = () => state.phase === 'closing' && state.target === key && state.clipped;
  return useSyncExternalStore(subscribe, get, get);
}
/**
 * This feed is the one the windows opened on, and another card was picked: its layer stays up at its
 * own card as that slides off, until the windows have closed (not with Reduce Motion).
 */
export function useWindowsLeaving(key: FeedKey): boolean {
  const get = () => state.phase === 'closing' && state.clipped && state.target !== null && state.target !== key && state.origin === key;
  return useSyncExternalStore(subscribe, get, get);
}
/** A tap on the row picked another feed. */
export function noteRowSwitch() { if (!state.rowSwitched) setWindowsState({ rowSwitched: true }); }

// ---------------------------------------------------------------------------
// The bus: the row, the bar and AppShell ask; the Feed's windows (FeedWindows) answer.
// ---------------------------------------------------------------------------

/** How a hold-and-slide ended: open the card pointed at, go back (a flick down), or leave the cards up. */
export type ScrubEnd = 'choose' | 'close' | 'stay';
interface WindowsController {
  open: (from: 'row' | 'bar' | 'reader', finger: boolean) => void;
  close: () => boolean;
  pressIn: () => void;
  scrubEnd: (how: ScrubEnd, sel: number) => void;
}
let controller: WindowsController | null = null;
export function setWindowsController(c: WindowsController | null) { controller = c; }

/**
 * A hold on the row or the Feed tab: open, if the Feed can (ignored otherwise). `finger`: the finger
 * that held is still down, so sliding it moves between the cards (FeedHold); a screen reader's action has none.
 */
export function requestFeedWindows(from: 'row' | 'bar' | 'reader', finger = false) { controller?.open(from, finger); }
/** A hold on the bar's Feed tab with the finger still down (FeedHold). */
export const holdFeedTab = () => requestFeedWindows('bar', true);
/** The held finger lifted (FeedHold). */
export function endFeedScrub(how: ScrubEnd, sel: number) { controller?.scrubEnd(how, sel); }
/** Back, or the Feed tab: true if the windows were up (they now go back to the feed you were on). */
export function closeFeedWindows(): boolean { return controller?.close() ?? false; }
/**
 * A finger just landed on the row or the Feed tab: once it has stayed a moment (a tap is gone by
 * then), the still and the posters are got ready. A still holds the phone's drawing for a moment,
 * so a plain tap (switching feeds, back to the top) never pays for one.
 */
const PREPARE_AFTER_MS = 180;
let preparing: ReturnType<typeof setTimeout> | null = null;
export function noteFeedPressIn() {
  noteFeedPressOut();
  preparing = setTimeout(() => { preparing = null; controller?.pressIn(); }, PREPARE_AFTER_MS);
}
/** The finger lifted (or the press was taken by a swipe): nothing gets ready. */
export function noteFeedPressOut() {
  if (preparing) clearTimeout(preparing);
  preparing = null;
}

// ---------------------------------------------------------------------------
// Where each feed stands: the page it is on, reported by its Home.
// ---------------------------------------------------------------------------

export interface Spot {
  /** The page's key in its feed ('' when the feed has nothing). */
  page: string;
  clip: boolean;
  landscape: boolean;
  poster?: string;
  text?: string;
  author?: string;
  /** The post on show, for a written card drawn as its page (header, words, buttons). */
  postId?: string;
  /** The page is its picture, edge to edge (a clip, an Instant), where the phone's clock is white. */
  full?: boolean;
}
const spots = new Map<FeedKey, Spot>();

/** One page as its card shows it when there is no still of it. */
export function spotOfPost(post: Post, page: string, author: string | undefined): Spot {
  const clip = post.kind === 'clip' || !!post.videoUrl;
  const poster = post.thumbnailUrl ?? post.imageUrl ?? post.imageUrls?.[0];
  // A session posted with no photo: its one line of numbers when it has no words.
  const text = post.body?.trim() || (post.session ? statsLine(post.session) : '') || undefined;
  return { page, clip, landscape: post.orientation === 'landscape', poster, text, author, postId: post.id, full: post.kind === 'clip' };
}

export function spotOf(item: FeedItem | undefined, page: string | undefined, nameOf: (id: string) => string | undefined): Spot {
  if (!item || !page) return { page: '', clip: false, landscape: false };
  if (item.type === 'post') return spotOfPost(item.post, page, nameOf(item.post.authorId));
  if (item.type === 'hit') {
    const s = item.story;
    return { page, clip: !!s.videoUrl, landscape: false, poster: s.thumbnailUrl ?? s.imageUrl, author: nameOf(s.authorId), full: true };
  }
  if (item.type === 'question') return { page, clip: false, landscape: false, text: item.question.title || item.question.body, author: nameOf(item.question.authorId) };
  return { page, clip: false, landscape: false };
}

/** A feed's Home tells where it stands; null when it is taken down (its still goes with it). */
export function noteFeedSpot(key: FeedKey, spot: Spot | null) {
  if (spot) { spots.set(key, spot); return; }
  spots.delete(key);
  const shot = shots.get(key);
  if (shot) { shots.delete(key); dropFeedShot(shot.uri); }
}
export const feedSpot = (key: FeedKey): Spot | undefined => spots.get(key);

/**
 * A feed on show has drawn its page (its Home, two frames after it was last un-paused or moved):
 * the windows take their cover off a picked feed only then, so nothing half-built is ever seen.
 */
const readyAt = new Map<FeedKey, number>();
export function noteFeedReady(key: FeedKey) { readyAt.set(key, Date.now()); }
export const feedReadyAt = (key: FeedKey) => readyAt.get(key) ?? 0;

/**
 * A picked feed's layer is up at its own card and drawn (its FeedLayer, two frames after it showed):
 * the card's picture may start giving way to it. For you is always up (the feeds' ground layer).
 */
const shownAt = new Map<FeedKey, number>();
export function noteFeedShown(key: FeedKey) { shownAt.set(key, Date.now()); }
export const feedShownAt = (key: FeedKey) => (key === FOR_YOU ? Number.MAX_SAFE_INTEGER : shownAt.get(key) ?? 0);

/**
 * When a feed's page on show is whole: its picture in and its own placeholder gone (the Feed's
 * COVER_OUT, 180 ms, once a page that had one gets its picture); 0 while it is not, or the feed is
 * not in yet. Reported by its Home: a picked card's picture gives way only to a whole page, never
 * to the page's own placeholder (a feed built at the pick fetches its picture).
 */
const wholeAt = new Map<FeedKey, number>();
const PLACEHOLDER_OUT_MS = 180;
export function noteFeedWhole(key: FeedKey, whole: boolean, placeholderLeaving: boolean) {
  if (!whole) wholeAt.set(key, 0);
  else if (!wholeAt.get(key)) wholeAt.set(key, Date.now() + (placeholderLeaving ? PLACEHOLDER_OUT_MS : 0));
}
/** Whether this feed's page on show is whole now. */
export const feedWhole = (key: FeedKey) => { const at = wholeAt.get(key) ?? 0; return at > 0 && Date.now() >= at; };

// ---------------------------------------------------------------------------
// Stills: one per built feed at most, taken a moment into a press (noteFeedPressIn), of the feed on show.
// ---------------------------------------------------------------------------

const nodes = new Map<FeedKey, unknown>();
const shots = new Map<FeedKey, { uri: string; page: string; at: number }>();
let shooting = false;

/** The view around one feed's pages (not the top row): what its still is taken of. */
export function registerShotNode(key: FeedKey, node: unknown) {
  if (node) nodes.set(key, node);
  else nodes.delete(key);
}

/** Takes a still of this feed's page, unless it is a clip, or the same page was taken under 5 s ago. */
export function snapFeed(key: FeedKey) {
  if (Platform.OS === 'web' || shooting) return;
  const spot = spots.get(key);
  const node = nodes.get(key);
  if (!spot || !spot.page || !node || (spot.clip && !SNAP_CLIP_PAGES)) return;
  const had = shots.get(key);
  if (had && had.page === spot.page && Date.now() - had.at < 5000) return;
  shooting = true;
  const page = spot.page;
  void takeFeedShot(node).then((uri) => {
    shooting = false;
    if (!uri) return;
    // Taken down meanwhile: not kept.
    if (!nodes.has(key) || !spots.has(key)) { dropFeedShot(uri); return; }
    const old = shots.get(key);
    shots.set(key, { uri, page, at: Date.now() });
    if (old) dropFeedShot(old.uri);
  }, () => { shooting = false; });
}

/** The still of this feed, if there is one. */
export const feedShot = (key: FeedKey) => shots.get(key) ?? null;

/** A screen reader's way in, on the row's words and the Feed tab (no hold needed). */
export const SHOW_ALL_FEEDS = [{ name: 'showAllFeeds', label: 'Show all feeds' }];

/** No text selection and no long-press menu on the words (and the Feed tab) a hold opens from, in a browser. */
export const NO_CALLOUT = (Platform.OS === 'web' ? { userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } : {}) as object;
/** Marks a view a hold opens from, so a browser's long-press menu is kept off it (FeedWindows). */
export const HOLD_MARK = (Platform.OS === 'web' ? { dataSet: { feedHold: '1' } } : {}) as object;

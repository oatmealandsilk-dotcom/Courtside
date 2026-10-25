import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { makeMutable } from 'react-native-reanimated';

import type { Post } from '@/data/types';
import { useResponsive } from '@/lib/useResponsive';
import { useApp } from '@/store/AppContext';
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
export const FEED_WINDOWS_FOR_EVERYONE = false;

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
export const CARD_GAP = 18;
/** Room kept under the cards for their names. */
export const LABEL_SPACE = 34;

/** The motion, all springs (mass 1), each landing written plainly afterwards. */
export const SPRING_OPEN = { mass: 1, stiffness: 260, damping: 28 };
export const SPRING_BACK = { mass: 1, stiffness: 320, damping: 33 };
export const SPRING_SNAP = { mass: 1, stiffness: 280, damping: 30 };
export const SPRING_DRAG = { mass: 1, stiffness: 400, damping: 36 };

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
/** A tap on the row picked another feed. */
export function noteRowSwitch() { if (!state.rowSwitched) setWindowsState({ rowSwitched: true }); }

// ---------------------------------------------------------------------------
// The bus: the row, the bar and AppShell ask; the Feed's windows (FeedWindows) answer.
// ---------------------------------------------------------------------------

interface WindowsController { open: (from: 'row' | 'bar' | 'reader') => void; close: () => boolean; pressIn: () => void }
let controller: WindowsController | null = null;
export function setWindowsController(c: WindowsController | null) { controller = c; }

/** A hold on the row or the Feed tab: open, if the Feed can (ignored otherwise). */
export function requestFeedWindows(from: 'row' | 'bar' | 'reader') { controller?.open(from); }
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
}
const spots = new Map<FeedKey, Spot>();

/** One page as its card shows it when there is no still of it. */
export function spotOfPost(post: Post, page: string, author: string | undefined): Spot {
  const clip = post.kind === 'clip' || !!post.videoUrl;
  const poster = post.thumbnailUrl ?? post.imageUrl ?? post.imageUrls?.[0];
  return { page, clip, landscape: post.orientation === 'landscape', poster, text: post.body?.trim() || undefined, author };
}

export function spotOf(item: FeedItem | undefined, page: string | undefined, nameOf: (id: string) => string | undefined): Spot {
  if (!item || !page) return { page: '', clip: false, landscape: false };
  if (item.type === 'post') return spotOfPost(item.post, page, nameOf(item.post.authorId));
  if (item.type === 'hit') {
    const s = item.story;
    return { page, clip: !!s.videoUrl, landscape: false, poster: s.thumbnailUrl ?? s.imageUrl, author: nameOf(s.authorId) };
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

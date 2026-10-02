import { useSyncExternalStore } from 'react';
import { Easing, ReduceMotion, makeMutable } from 'react-native-reanimated';

/**
 * The comments stage: a tap on a clip's words (or its speech bubble) on a
 * phone opens the comments with the clip still playing above them, shrunk
 * into the room the sheet leaves. Instagram has opened comments this way from
 * a caption tap since Dec 2025; TikTok "zooms out" its video the same way.
 *
 * One number drives everything: `stageTop`, where the sheet's top edge is,
 * in window points. The sheet's height, the clip's size and place, the words
 * and buttons fading, the small rail and the tab bar all come from it, frame
 * by frame (`stageFrame`), so nothing can fall out of step and nothing on the
 * JavaScript side redraws while it moves. A browser has no animation thread:
 * there the sheet says where it is going (`place`) and each moving part plays
 * the same frames as a web animation (see useStageMotion.web).
 *
 * The rest is a small shared note of which page is on the stage, for Home
 * (keep that clip playing), the comments screen (open as a stage) and the
 * shell (fade the tab bar).
 */

/** Android draws feed videos in a mode that can shrink smoothly; off, Android keeps the plain sheet. */
export const STAGE_ON_ANDROID = true;
/** The owner's call: the clip keeps playing (with sound) while the sheet is pulled all the way up or the keyboard is out. True pauses it there. */
export const PAUSE_AT_FULL = false;
/** A pull down on the list, once it is at its top, moves the sheet (phones, the app only). */
export const LIST_PULL = true;
/** Below this a computer window has no room for the clip and a docked panel side by side, so comments are a centred box. */
export const SIDE_MIN_WINDOW = 1100;

/** The stage's own curve: a fast start that glides to rest, Apple's sheet curve. */
export const STAGE_EASING = Easing.bezier(0.32, 0.72, 0, 1);
export const STAGE_CURVE_CSS = 'cubic-bezier(.32,.72,0,1)';
/** The sheet rising to half on a phone: a spring, started by the sheet the moment it has drawn. */
export const OPEN_SPRING = { damping: 24, stiffness: 240, mass: 0.9, reduceMotion: ReduceMotion.Never } as const;
/** Closed by a button, a tap or a key: long enough that the clip lands softly back to full size. */
export const CLOSE_MS = 320;
export const OPEN_MS_WEB = 380;
export const SNAP_MS_WEB = 240;

/** What shrinks onto the stage: the whole page, or the band a wide picture sits in. */
export type StageSubject = 'portrait' | 'landscape' | 'wide-photo';

export interface StageRect { x: number; y: number; width: number; height: number }

/** Everything the per-frame maths needs, worked out once at the tap. */
export interface StageGeo {
  /** Which Home put it there (a scoped feed can sit over the main one) and which page. */
  owner: string;
  key: string;
  W: number; H: number;
  /** The stage's top, the gap above the sheet, and the sheet's half and full stops. */
  sT: number; g: number; yh: number; yf: number;
  /** The page on screen at the tap. */
  px: number; py: number; pw: number; ph: number;
  /** The picture's own box inside the page, and the room left of and right of it on the stage. */
  cW: number; cH: number; L: number; R: number;
  /** A tall picture sits in the screen's middle; a wide one in the middle of its box, clear of the rail. */
  screenCentre: boolean;
}

/** The sheet is closed and nothing is staged: far below the screen, so every fraction below reads 0. */
export const STAGE_IDLE = 1e6;
export const stageTop = makeMutable(STAGE_IDLE);
export const stageGeo = makeMutable<StageGeo | null>(null);
/** Reduce Motion: the page dips out and back in place of travelling. */
export const stageDip = makeMutable(1);

const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Where the stage, the half stop and the full stop sit for this phone and
 * this picture, or null when the screen is too short for a stage worth
 * having (the plain sheet opens instead). The stage is sized first and the
 * sheet gets the rest: a sheet-first size left a 130pt-wide video, too small
 * to read a swing.
 */
export function stageGeometry(W: number, H: number, T: number, P: StageRect, subject: StageSubject, owner: string, key: string): StageGeo | null {
  if (!(W > 0 && H > 0 && P.width > 0 && P.height > 0)) return null;
  const sT = T + 6;
  const g = 10;
  const yf = T + 20;
  const hSmax = clampN(Math.round(0.36 * H), 220, 320);
  const cW = P.width;
  const cH = subject === 'portrait' ? P.height : subject === 'landscape' ? (P.width * 9) / 16 : (P.width * 3) / 4;
  const L = 16;
  const R = subject === 'portrait' ? 16 : 72;
  const sFit = Math.min((W - L - R) / cW, hSmax / cH);
  // Only as tall as the picture needs, so a wide clip leaves a taller sheet.
  let hS = Math.min(hSmax, Math.round(cH * sFit) + 24);
  if (H - (sT + hS + g) < 360) hS = H - sT - g - 360;
  if (hS < 180) return null;
  const yh = sT + hS + g;
  return {
    owner, key, W, H, sT, g, yh, yf,
    px: P.x, py: P.y, pw: P.width, ph: P.height,
    cW, cH, L, R, screenCentre: subject === 'portrait',
  };
}

export interface StageFrame {
  tx: number; ty: number; s: number;
  /** The picture's opacity: whole down to half, fading out as the sheet goes on up to full. */
  video: number;
  /** The words, buttons, shades and mark over the clip: gone in the first 30% of the open. */
  chrome: number;
  /** The small rail beside the stage: in over the last 40% of the open. */
  rail: number; railDy: number;
  /** The tab bar: gone in the first 20% of the open, back in the last 20% of the close. */
  nav: number;
  /** The stage's vertical middle, where the small rail centres. */
  cy: number;
  /** How far the sheet's top has risen from the bottom edge: the tab bar is cut off there, so it never draws over the sheet. */
  rise: number;
  p: number;
}

const IDLE_FRAME: StageFrame = { tx: 0, ty: 0, s: 1, video: 1, chrome: 1, rail: 0, railDy: 8, nav: 1, cy: 0, rise: 0, p: 0 };

/**
 * Everything on the stage for the sheet's top at `y`. At y = H (closed) it is
 * exactly the picture as it was, so opening and closing never jump. Above
 * half (dragged up, or the keyboard) the picture keeps shrinking into what is
 * left and fades out on the way to full. A spring's overshoot is just another y.
 */
export function stageFrame(y: number, G: StageGeo | null): StageFrame {
  'worklet';
  if (!G) return IDLE_FRAME;
  const { W, H, sT, g, yh, yf, px, py, pw, ph, cW, cH, L, R } = G;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const p = clamp((H - y) / Math.max(1, H - yh), 0, 1);
  // At p = 0 the frame is the page itself; at p = 1, the stage.
  const top = py + (sT - py) * p;
  const bottom = Math.min(y, py + ph) - g * p;
  const boxL = px + (L - px) * p;
  const boxR = px + pw + (W - R - (px + pw)) * p;
  const s = clamp(Math.min(Math.max(1, bottom - top) / cH, (boxR - boxL) / cW), 0.05, 1);
  const pcx = px + pw / 2;
  const pcy = py + ph / 2;
  const cx = G.screenCentre ? pcx + (W / 2 - pcx) * p : (boxL + boxR) / 2;
  const cy = (top + bottom) / 2;
  const video = y >= yh ? 1 : clamp((y - yf) / (0.55 * Math.max(1, yh - yf)), 0, 1);
  const railIn = clamp((p - 0.6) / 0.4, 0, 1);
  return {
    tx: cx - pcx,
    ty: cy - pcy,
    s,
    video,
    chrome: 1 - clamp(p / 0.3, 0, 1),
    rail: railIn * video,
    railDy: 8 * (1 - railIn),
    nav: 1 - clamp(p / 0.2, 0, 1),
    cy,
    rise: H - clamp(y, 0, H),
    p,
  };
}

// ── Which page is on the stage ─────────────────────────────────────────────

export interface CommentStage {
  /** This stage and no other: a comments page holds on to it, so it can tell when it is over. */
  id: number;
  owner: string;
  /** "p:<post id>" or "h:<hit id>". */
  key: string;
  /** 'stage' on a phone; 'side' beside the docked panel on a wide computer window (no shrinking there). */
  mode: 'stage' | 'side';
  /** A page is pushed over the comments (a profile, a #tag): the clip holds still until it is back. */
  covered: boolean;
  /** The page went away under the sheet (an Instant ran out, its author was blocked). */
  lost: boolean;
  /** The comments screen has drawn. */
  mounted: boolean;
  /** The sheet is at its full stop (only matters if PAUSE_AT_FULL). */
  full: boolean;
  /** On its way out: the page is growing back. Comments arriving now open as the plain sheet. */
  ending: boolean;
  geo: StageGeo | null;
  /** What to give the screen reader's focus back to once the stage is gone: the words that opened it. */
  focusBack: unknown;
  /** Whether the Home that put it there is the page on show. */
  ownerOnTop: () => boolean;
}

let current: CommentStage | null = null;
let lastId = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const update = (patch: Partial<CommentStage>) => {
  if (!current) return;
  if (Object.entries(patch).every(([k, v]) => current![k as keyof CommentStage] === v)) return;
  current = { ...current, ...patch };
  emit();
};

/** A page goes on the stage. Called in the same tap as the push, so Home never has a frame that is neither on top nor holding its clip. */
export function begin({ owner, key, mode, geo = null, focusBack = null, ownerOnTop }: { owner: string; key: string; mode: 'stage' | 'side'; geo?: StageGeo | null; focusBack?: unknown; ownerOnTop: () => boolean }) {
  lastId += 1;
  current = { id: lastId, owner, key, mode, covered: false, lost: false, mounted: false, full: false, ending: false, geo, focusBack, ownerOnTop };
  stageGeo.value = geo;
  emit();
}
export const setCovered = (covered: boolean) => update({ covered });
export const markLost = () => update({ lost: true });
export const setFull = (full: boolean) => update({ full });
export const markEnding = () => update({ ending: true });
/** The comments page has drawn (only the one that took this stage on). */
export function markMounted(id: number) {
  if (current?.id === id) update({ mounted: true });
}
/**
 * The comments page that took this stage on has gone. Its own close ends with
 * Home back on top, which clears the stage itself; but taken down with pages
 * over it (a tab tapped from a profile opened over the comments) Home may not
 * be on show to do that. Then the stage is cleared here, once it is plain Home
 * is not coming back to the front this moment.
 */
export function markGone(id: number) {
  if (current?.id !== id) return;
  setTimeout(() => { if (current?.id === id && !current.ownerOnTop()) clear(); }, 300);
}
/** The stage is over: Home is back on top (or the Home that put it there has gone). */
export function clear() {
  if (!current) return;
  current = null;
  stageGeo.value = null;
  stageTop.value = STAGE_IDLE;
  lastPlaced = STAGE_IDLE;
  liveY = STAGE_IDLE;
  glideNow = null;
  if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(clock);
  emit();
}
export const getStage = () => current;
export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function useCommentStage(): CommentStage | null {
  return useSyncExternalStore(subscribe, getStage, getStage);
}
/**
 * One part of the note, redrawing only when that part changes: Home must
 * redraw once on the way in and once on the way out, not again mid-open when
 * the comments say they have drawn. `select` returns a plain value (a string,
 * a flag), never a new object.
 */
export function useStageSelect<T extends string | number | boolean | null>(select: (stage: CommentStage | null) => T): T {
  const read = () => select(current);
  return useSyncExternalStore(subscribe, read, read);
}
/** The key a feed page goes by: "p:<id>", "h:<id>". */
export const stageKeyOf = (kind: 'post' | 'hit', id: string) => `${kind === 'hit' ? 'h' : 'p'}:${id}`;

// ── The browser's channel ──────────────────────────────────────────────────

/*
 * A browser has no animation thread to read `stageTop` from. The sheet says
 * where it is going (`place`) and everything on the stage follows it:
 *
 *  - A rise from closed or a fall to closed (the open and every close) is a
 *    glide: the sheet slides as a card of fixed height and the clip, the
 *    words over it, the small rail and the tab bar play the same frames, all
 *    as browser animations of position and fade only, from one shared start
 *    time. Those run off the page's main thread, so the comments drawing in,
 *    or the feed redrawing under them, cannot make the open stutter. Every
 *    part's frames are the same moments sampled from the one curve, so the
 *    clip's bottom and the sheet's top stay exactly the gap apart.
 *  - Anything else (a finger dragging, half to full and back) changes the
 *    sheet's height. That is the page's own work, so it runs on a clock here:
 *    each screen frame the clock works out where the sheet's top is and hands
 *    that one number to everyone (`onFrame`), who set their styles from it in
 *    the same frame. A finger's move (0 ms) is passed on at once.
 */

/** Where the sheet is going: from, to, over how long. A `dip` is Reduce Motion: the page fades out and back where it would travel. `glide` is filled in by `place`: run it as a glide, from this start time. */
export interface StagePlace { fromY: number; toY: number; ms: number; dip?: boolean; glide?: { start: number } }
type PlaceListener = (move: StagePlace) => void;
/** Each frame: where the sheet's top is, and how faded the page is (a Reduce Motion dip; 1 otherwise). */
type FrameListener = (y: number, fade: number) => void;
const placeListeners = new Set<PlaceListener>();
const frameListeners = new Set<FrameListener>();
let lastPlaced = STAGE_IDLE;
let liveY = STAGE_IDLE;
let clock = 0;
let glideNow: { fromY: number; toY: number; ms: number; start: number } | null = null;

/** The stage's curve as a plain function of time (0..1 → 0..1), for the browser. */
const ease = (() => {
  const [x1, y1, x2, y2] = [0.32, 0.72, 0, 1];
  const a = (p1: number, p2: number) => 1 - 3 * p2 + 3 * p1;
  const b = (p1: number, p2: number) => 3 * p2 - 6 * p1;
  const c = (p1: number) => 3 * p1;
  const at = (t: number, p1: number, p2: number) => ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t;
  const slope = (t: number, p1: number, p2: number) => 3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1);
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Newton's method for the curve's t at this x, then halving if it stalls.
    let t = x;
    for (let i = 0; i < 6; i++) {
      const d = slope(t, x1, x2);
      if (Math.abs(d) < 1e-6) break;
      t -= (at(t, x1, x2) - x) / d;
    }
    if (!(t >= 0 && t <= 1) || Math.abs(at(t, x1, x2) - x) > 1e-4) {
      let lo = 0; let hi = 1; t = x;
      for (let i = 0; i < 30; i++) { const v = at(t, x1, x2); if (Math.abs(v - x) < 1e-5) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    }
    return at(t, y1, y2);
  };
})();

/**
 * The time a glide starts at, on the clock browser animations run on. The
 * wall clock, not the page's last frame time: right after a long piece of
 * work (the comments drawing) that frame time is from before the work, and a
 * glide started then would skip its first tenth of a second.
 */
const timelineNow = (): number => performance.now();

/**
 * A glide's frames: where the sheet's top is at 24 even moments through it.
 * Every part builds its own frames from these and plays them straight
 * (linear between them), so all of them are at the same point of the curve
 * at the same moment. Fine enough that the straight runs between them are
 * under a point off the curve.
 */
export function glideSamples(move: StagePlace): { offset: number; y: number }[] {
  const n = 24;
  return Array.from({ length: n + 1 }, (_, i) => ({ offset: i / n, y: move.fromY + (move.toY - move.fromY) * ease(i / n) }));
}

const frame = (y: number, fade: number) => {
  liveY = y;
  frameListeners.forEach((fn) => fn(y, fade));
};

/** Sends the sheet (and everything on the stage) from `fromY` to `toY`. Returns the move as told to everyone, `glide` filled in if it is one. */
export function place(move: StagePlace): StagePlace {
  liveY = currentY();
  glideNow = null;
  lastPlaced = move.toY;
  const H = current?.geo?.H;
  if (typeof requestAnimationFrame === 'undefined') { placeListeners.forEach((fn) => fn(move)); frame(move.toY, 1); return move; }
  cancelAnimationFrame(clock);
  const canGlide = typeof document !== 'undefined' && typeof document.body?.animate === 'function';
  if (canGlide && H !== undefined && move.ms > 0 && !move.dip && (move.toY >= H - 0.5 || move.fromY >= H - 0.5)) {
    const sent = { ...move, glide: { start: timelineNow() } };
    glideNow = { fromY: move.fromY, toY: move.toY, ms: move.ms, start: sent.glide.start };
    placeListeners.forEach((fn) => fn(sent));
    return sent;
  }
  placeListeners.forEach((fn) => fn(move));
  const { fromY, toY, ms, dip } = move;
  if (dip) {
    // Out over 100 ms where it is, the move made unseen, back in over 120.
    let start = -1;
    const tick = (now: number) => {
      if (start < 0) start = now;
      const t = now - start;
      frame(t < 100 ? fromY : toY, t < 100 ? 1 - t / 100 : Math.min(1, (t - 100) / 120));
      if (t < 220) clock = requestAnimationFrame(tick);
    };
    clock = requestAnimationFrame(tick);
    return move;
  }
  if (ms <= 0) { frame(toY, 1); return move; }
  let start = -1;
  const tick = (now: number) => {
    if (start < 0) start = now;
    const k = Math.min(1, (now - start) / ms);
    frame(fromY + (toY - fromY) * ease(k), 1);
    if (k < 1) clock = requestAnimationFrame(tick);
  };
  clock = requestAnimationFrame(tick);
  return move;
}
/** Told each time the sheet is sent somewhere, before it moves. */
export function onPlace(fn: PlaceListener) {
  placeListeners.add(fn);
  return () => { placeListeners.delete(fn); };
}
/** Told every frame while the sheet moves on the clock (not during a glide): where its top is. */
export function onFrame(fn: FrameListener) {
  frameListeners.add(fn);
  return () => { frameListeners.delete(fn); };
}
/** Where the browser's sheet was last sent. */
export const placedY = () => lastPlaced;
/** Where the browser's sheet's top is right now (mid-glide too). */
export function currentY(): number {
  const g = glideNow;
  if (!g) return liveY;
  const k = Math.min(1, Math.max(0, (timelineNow() - g.start) / g.ms));
  return g.fromY + (g.toY - g.fromY) * ease(k);
}
/** The glide under way, if any (a part drawn mid-glide joins it from its start time). */
export const glideUnderWay = (): StagePlace | null => {
  const g = glideNow;
  if (!g || timelineNow() - g.start >= g.ms) return null;
  return { fromY: g.fromY, toY: g.toY, ms: g.ms, glide: { start: g.start } };
};

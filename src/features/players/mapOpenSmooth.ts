import { Platform } from 'react-native';

import type { User } from '@/data/types';
import { SIM_DRIVER, simLog } from '@/lib/simDriver';

/**
 * The full map sliding in smoothly (Nov 2, owner: "Let's also make opening the map better. Right now when you click on
 * the map. It slides but freezes a bit. Let's make the opening of the map super smooth.").
 *
 * What froze it: the full map's web view (MapCanvas) is made by the iPhone the moment its page is put on screen for the
 * slide (react-native-webview makes it as it joins the window), on the very thread that runs the slide's start: the web
 * view itself, the map's code handed to it (about a megabyte, engineCopy) and its page. Then, all through the slide,
 * that web view was starting the map engine, making its drawing surface, fetching the style and the streets and drawing
 * them for the first time, its words coming back to the app as it went, on the same phone that was drawing the slide.
 * Now, on a plain open (the Find Players card's tap, nothing named to go to), the full map slides in with everything
 * on it as before (the top bar, the filters, the players pill, Back to me) over the map's own ground colour, and its
 * web view is made the moment the slide has landed: the same map, the same pins, the same wave, just started after the
 * slide instead of under it (so its streets come in a moment after it lands, not during it). Opened on a court, a hit,
 * a player, a spot or a place, and the Up to hit zoom (which opens with no slide), it is as it was.
 *
 * The iPhone only (Android has no store build yet; the website's map is drawn in the page itself, NearbyMap.web, and
 * is unchanged). Admins (@oatmealandsilk, @mrdinosaur62) first: turned on for everyone by setting this to true and
 * shipping an over-the-air update. No database change, no new native code.
 */
export const MAP_OPEN_SMOOTH_FOR_EVERYONE = false;

/** The simulator's proof only (simDriver's "mapsmooth on=1|0|auto"): the same build with it on or off, to compare. */
let simSays: boolean | null = null;
export function setMapOpenSmoothSim(on: boolean | null) {
  if (!SIM_DRIVER) return;
  simSays = on;
  simLog(`[map-open] smooth ${on === null ? 'auto' : on ? 'on' : 'off'}`);
}

/** Whether this person's full map, opened plainly, is made once its slide has landed. Read once, as the map opens. */
export function mapOpenSmoothOn(me: User | null | undefined): boolean {
  if (Platform.OS !== 'ios') return false;
  return simSays ?? (MAP_OPEN_SMOOTH_FOR_EVERYONE || !!me?.isAdmin);
}

/*
 * The simulator's timing row for one opening of the full map (EXPO_PUBLIC_SIM_DRIVER builds only: nothing at all runs
 * anywhere else). From the tap on the card ("openmap", or a real tap), every time is milliseconds after it:
 *   render (the map page first drawn by React), mounted (its first drawing committed), pageWaits (its web view held for
 *   the slide), slideStart / slideEnd (the iPhone's own slide: the page about to appear, and appeared), webview (its web
 *   view made), boot, engine, up, ready, painted (what the map's page said as it started, MapCanvas).
 * Then the UI thread's frames (SimDriverHost: how many, the first after the tap, the longest gap, every gap of 25 ms or
 * more as at+gap), the same for the JS thread, and how many frames the UI thread missed between slideStart and slideEnd
 * (at 60 a second, the Simulator's rate). The slide itself is drawn by iOS, off both threads: a recording shows it.
 * One line, "[map-open] row ...", into sim-log.txt.
 */

/** Whose frames the UI thread counts (SimDriverHost registers it). */
export interface MapOpenUiWatch {
  start: (t0: number) => void;
  stop: () => { n: number; first: number; max: number; gaps: number[][] };
}
let uiWatch: MapOpenUiWatch | null = null;
export function setMapOpenUiWatch(w: MapOpenUiWatch | null) { uiWatch = w; }

interface Row { t0: number; marks: Record<string, number>; js: { n: number; first: number; max: number; gaps: number[][] }; timer: ReturnType<typeof setTimeout> | null; filed: boolean }
let row: Row | null = null;
/** How long a row watches after the tap: the slide, the page's start and its first drawing. */
const ROW_MS = 4500;
/** A frame gap this long or more is listed (one frame missed or worse at 60 a second). */
const GAP_MS = 25;
const FRAME_MS = 1000 / 60;

/** The card was tapped (or "openmap"): a new row begins. */
export function mapOpenTap() {
  if (!SIM_DRIVER) return;
  if (row && !row.filed) fileRow();
  const t0 = Date.now();
  const r: Row = { t0, marks: { tap: 0 }, js: { n: 0, first: -1, max: 0, gaps: [] }, timer: null, filed: false };
  r.timer = setTimeout(() => { if (row === r) fileRow(); }, ROW_MS);
  row = r;
  uiWatch?.start(t0);
  // The JS thread's frames, as the UI thread's: a gap is the JS thread held (rendering, effects, messages).
  let last = 0;
  const step = () => {
    if (row !== r || r.filed) return;
    const now = Date.now();
    if (last) {
      const g = now - last;
      if (g >= GAP_MS && r.js.gaps.length < 40) r.js.gaps.push([last - t0, g]);
      if (g > r.js.max) r.js.max = g;
    } else r.js.first = now - t0;
    r.js.n += 1;
    last = now;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  simLog('[map-open] tap');
}

/** A moment of this opening, the first time it comes. */
export function mapOpenMark(what: string) {
  if (!SIM_DRIVER || !row || row.filed || row.marks[what] !== undefined) return;
  row.marks[what] = Date.now() - row.t0;
}

/** Frames missed between `from` and `to` (ms after the tap), from the gaps listed. */
function missed(gaps: number[][], from: number | undefined, to: number | undefined): number {
  if (from === undefined || to === undefined) return -1;
  let n = 0;
  for (const [at, g] of gaps) if (at + g > from && at < to) n += Math.max(0, Math.round(g / FRAME_MS) - 1);
  return n;
}

function fileRow() {
  const r = row;
  if (!r || r.filed) return;
  r.filed = true;
  if (r.timer) clearTimeout(r.timer);
  const ui = uiWatch?.stop() ?? null;
  const marks = Object.entries(r.marks).sort((a, b) => a[1] - b[1]).map(([k, v]) => `${k} ${v}`).join(' ');
  const list = (g: number[][]) => (g.length ? ` gaps ${g.map(([at, len]) => `${at}+${len}`).join(',')}` : '');
  const s0 = r.marks.slideStart;
  const s1 = r.marks.slideEnd;
  const uiPart = ui ? ` | ui ${ui.n}f first ${ui.first}ms max ${ui.max}ms${list(ui.gaps)} | slide missed ui ${missed(ui.gaps, s0, s1)}` : ' | ui -';
  const jsPart = ` | js ${r.js.n}f first ${r.js.first}ms max ${r.js.max}ms${list(r.js.gaps)} | slide missed js ${missed(r.js.gaps, s0, s1)}`;
  simLog(`[map-open] row ${marks}${uiPart}${jsPart}`);
}

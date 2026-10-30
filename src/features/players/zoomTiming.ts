import { Platform } from 'react-native';

import { reportError } from '@/lib/crashReporting';
import { SIM_DRIVER, simLog } from '@/lib/simDriver';
import { V7, v7Ui, type V7PageMsg } from '@/features/players/zoomV7';

/*
 * The check-in zoom's timing log on the iPhone (v7, zoomV7), for admins: each tap of Up to hit with the zoom on files one
 * row of numbers from the owner's own phone, through the crash table we already have (app_errors, fatal: false; no new
 * table, no migration). Its message starts "[checkin-zoom] [zoom-timing]", so "check crashes" keeps these apart from real
 * crashes, and its app_version carries the over-the-air update's label, so each row says which code ran.
 *
 * A row reads, e.g.:
 *   [zoom-timing] grown | tap 0 finding 2 aimed 9 early 11 go 11 first 77 cover 330 read 340 found 460 landed 1240 push 1240
 *   drawn 1890 handed 2090 | web 72f max 18ms first 16ms | ui 70f max 17ms | in 0 out 0
 * Every time is milliseconds from the tap: finding (you said yes, the phone is finding you), aimed (the card measured, the
 * layer aimed at it), early (where the phone already was: the move may start from there), read (the new reading), found
 * (the server said yes), go (the move set going), first (the web view's first frame of the move), cover (the card covers
 * the screen), landed (the camera on you), push (the full map opened under the layer, off the move), drawn (the full map
 * has drawn), handed (the layer gone, the full map on show). `none` and why when nothing opened: notReady (the layer had
 * not drawn, even after waiting), noLayer, measure (the card could not be measured), notSeen (the card out of view),
 * offCard (you were not on the card), server (the check-in itself did not go through first). `web`: the layer's page's
 * frames of the move (how many, the longest gap, the first after the move's start, every gap of 30 ms or more as
 * at+gap); `ui`: the UI thread's; `in`/`out`: the full map's pins that came in as the card covered the screen, and the
 * card's that stepped aside there. Words after them: retarget Nm (a newer reading N metres off moved the landing),
 * waited Nms (the layer was drawing), serverNo (the server said no mid-move: it stopped), slowStart (tap to first frame
 * over 250 ms: no reading under 2 minutes old), reaim, forced (the full map took over without having drawn, or the app
 * was put away), memory, lost, ...
 *
 * DEFECT marks a row the phone should never show: go to first frame over 100 ms, a gap of 34 ms or more (two frames
 * missed) in the web view's or the UI thread's frames anywhere in the move, landing to hand-over over 1.2 s, or a
 * hand-over that was forced.
 *
 * The iPhone only: the website's demo has no crash table, and its path is its own. In the simulator's proof build the same
 * row goes to its log too (simDriver).
 */

type Mark = 'tap' | 'finding' | 'aimed' | 'early' | 'read' | 'found' | 'go' | 'first' | 'cover' | 'push' | 'landed' | 'drawn' | 'handed';
export type ZoomReason = 'notReady' | 'noLayer' | 'measure' | 'notSeen' | 'offCard' | 'server';
const ORDER: Mark[] = ['tap', 'finding', 'aimed', 'early', 'read', 'found', 'go', 'first', 'cover', 'landed', 'push', 'drawn', 'handed'];
/** The limits a row is held to (see above). */
const FIRST_MAX_MS = 100;
const GAP_MAX_MS = 34;
const HAND_MAX_MS = 1200;
const SLOW_START_MS = 250;

interface Tap {
  t0: number;
  marks: Partial<Record<Mark, number>>;
  path: 'grown' | 'none' | null;
  reason: ZoomReason | null;
  /** When the move started (Date.now() of its t0), for the web view's first frame. */
  moveAt: number;
  page: V7PageMsg | null;
  ui: { n: number; gap: number; at: number; first: number; gaps: number[][] } | null;
  forced: boolean;
  notes: string[];
  filed: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}
const ON = Platform.OS === 'ios';
let tap: Tap | null = null;
/** However a tap went, its row is filed by this long after it at the latest (a map that never took over). */
const FILE_BY_MS = 20000;

/**
 * The simulator's proof only (simDriver): the JS thread's own frames for 6 s from the tap, every hold of 40 ms or more as
 * [ms after the tap, how long], into sim-log.txt (what kept the JS thread busy shows up as a hold).
 */
function watchJs(t0: number) {
  if (!SIM_DRIVER) return;
  const holds: number[][] = [];
  let last = Date.now();
  const step = () => {
    const now = Date.now();
    if (now - last >= 40) holds.push([last - t0, now - last]);
    last = now;
    if (now - t0 < 6000) requestAnimationFrame(step);
    else simLog(`[js-holds] ${JSON.stringify(holds)}`);
  };
  requestAnimationFrame(step);
}

/** A tap of Up to hit turning it on, with the zoom on for this person (admins): a new row begins. */
export function zoomTap() {
  if (!ON) return;
  watchJs(Date.now());
  if (tap && !tap.filed) zoomFile();
  const t: Tap = { t0: Date.now(), marks: { tap: 0 }, path: null, reason: null, moveAt: 0, page: null, ui: null, forced: false, notes: [], filed: false, timer: null };
  t.timer = setTimeout(() => { if (tap === t) zoomFile(); }, FILE_BY_MS);
  tap = t;
}

/** A moment of this tap, the first time it comes. */
export function zoomMark(m: Mark, at = Date.now()) {
  if (!tap || tap.filed || tap.marks[m] !== undefined) return;
  tap.marks[m] = at - tap.t0;
}

/** Whether it zoomed, or why not (the first word given counts). Nothing opened: the row is filed now. */
export function zoomPath(path: 'grown' | 'none', reason?: ZoomReason) {
  if (!tap || tap.filed || tap.path) return;
  tap.path = path;
  tap.reason = reason ?? null;
  if (path === 'none') zoomFile();
}

/** The move was set going, its first frame due at `moveAt` (Date.now()). */
export function zoomGo(moveAt: number) {
  zoomMark('go');
  if (tap && !tap.filed) tap.moveAt = moveAt;
}

/** The layer's page has landed: its frames' numbers, and the UI thread's. */
export function zoomPage(msg: V7PageMsg) {
  zoomMark('landed');
  if (!tap || tap.filed) return;
  tap.page = msg;
  if (tap.moveAt && typeof msg.first === 'number' && msg.first >= 0) zoomMark('first', tap.moveAt + msg.first);
  const u = v7Ui.value;
  tap.ui = { n: u.n, gap: u.gap, at: u.at, first: u.first, gaps: u.gaps };
  if (msg.frames) simLog(`[zoom-frames] ${JSON.stringify(msg.frames)}`);
}

/** Something worth knowing about this tap (a word for the row). */
export function zoomNote(word: string) {
  if (!tap || tap.filed || tap.notes.includes(word)) return;
  tap.notes.push(word);
}

/** The full map has taken over (`forced`: without having drawn, or because the app was put away): the row goes. */
export function zoomHanded(forced: boolean) {
  zoomMark('handed');
  if (!tap || tap.filed) return;
  tap.forced = forced;
  zoomFile();
}

/** The row, filed now, once. A tap that never got as far as finding you (Not now on "Who can see you") files nothing. */
export function zoomFile() {
  const t = tap;
  if (!t || t.filed) return;
  t.filed = true;
  if (t.timer) clearTimeout(t.timer);
  if (!t.path && t.marks.finding === undefined) return;
  const path = t.path ?? 'none';
  const why = path === 'none' ? ` ${t.reason ?? 'server'}` : '';
  const times = ORDER.filter((m) => t.marks[m] !== undefined).map((m) => `${m} ${t.marks[m]}`).join(' ');
  const p = t.page;
  const web = p ? ` | web ${p.n ?? 0}f max ${p.gap ?? 0}ms first ${p.first ?? -1}ms got ${p.recv ?? '-'}ms hook ${p.hook0 ?? '-'}ms${(p.gaps ?? []).length ? ` gaps ${(p.gaps ?? []).map(([at, g]) => `${at}+${g}`).join(',')}` : ''}` : '';
  const ui = t.ui ? ` | ui ${t.ui.n}f max ${t.ui.gap}ms at ${t.ui.at}ms first ${t.ui.first}ms${t.ui.gaps.length ? ` gaps ${t.ui.gaps.map(([at, g]) => `${at}+${g}`).join(',')}` : ''}` : '';
  const pins = p && (p.pinsIn !== undefined || p.pinsOut !== undefined) ? ` | in ${p.pinsIn ?? 0} out ${p.pinsOut ?? 0}` : '';
  const { go, first, landed, handed } = t.marks;
  const notes = [...t.notes, ...(t.forced ? ['forced'] : []), ...(first !== undefined && first > SLOW_START_MS ? ['slowStart'] : [])];
  const late = go !== undefined && first !== undefined && first - go > FIRST_MAX_MS;
  // Anywhere in the move, the end too: two frames missed is a hold the eye sees.
  const gappy = !!p?.gaps?.some(([at, g]) => g >= GAP_MAX_MS && at <= V7.D) || !!t.ui?.gaps.some(([at, g]) => g >= GAP_MAX_MS && at <= V7.D);
  const slow = landed !== undefined && handed !== undefined && handed - landed > HAND_MAX_MS;
  const defect = path === 'grown' && (late || gappy || slow || t.forced) ? ' DEFECT' : '';
  const row = `[zoom-timing]${defect} ${path}${why} | ${times}${web}${ui}${pins}${notes.length ? ` | ${notes.join(' ')}` : ''}`;
  simLog(row);
  void reportError(new Error(row), { where: 'checkin-zoom' });
}

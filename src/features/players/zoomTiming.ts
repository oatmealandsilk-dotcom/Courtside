import { Platform } from 'react-native';

import { reportError } from '@/lib/crashReporting';
import type { SwoopStats } from '@/components/map/swoop';
import { growPushGap } from '@/features/players/mapGrow';

/*
 * The check-in zoom's timing log on the phone (v6, mapGrow), for admins: we cannot run an iPhone here, so each tap of Up to
 * hit with the zoom on files one row of numbers from the owner's own phone, through the crash table we already have
 * (app_errors, fatal: false; no new table, no migration). Its message starts "[checkin-zoom] [zoom-timing]", so "check
 * crashes" keeps these apart from real crashes, and its app_version carries the over-the-air update's label
 * (setCrashRelease), so each row says which code ran. Each row's numbers differ, so the table's limits (25 a session,
 * the same message once a minute) never drop one.
 *
 * A row reads, e.g.:
 *   [zoom-timing] grown early | allowed 12 preopen 14 up 560 painted 1220 found 1740 push 1743 arm 1745 hand 2090
 *   unveiled 2120 swoop 2090 settle 3400 | hand late 6ms | swoop 78f max 34ms | push max 17ms
 * Every time is milliseconds from the tap. `grown` or `none` (with why: forYou the For you card, notSeen the card out of
 * view, keepNone Only me, measure the card could not be measured, notReady the hidden map had not drawn in time,
 * cancelled let go (a page opened over it, or 5 s), server the check-in itself did not go through); `early` the hidden map
 * opened while you were found, `found` only once you were. `hand late`: how long after it was due the full map's own
 * page took over (its clock: the frame it did it on), the one gap the web never has. A row with DEFECT in it is one the
 * phone should never show: `notReady` (found before the hidden map had drawn, so no zoom), or a hand-over 50 ms or more late.
 *
 * The phone only: the website's demo has no crash table, and the web path is unchanged.
 */

type Mark = 'finding' | 'allowed' | 'preopen' | 'up' | 'painted' | 'found' | 'push' | 'arm' | 'hand' | 'unveiled' | 'swoop' | 'settle';
export type ZoomReason = 'forYou' | 'notSeen' | 'rm' | 'keepNone' | 'measure' | 'notReady' | 'cancelled' | 'server';
const ORDER: Mark[] = ['finding', 'allowed', 'preopen', 'up', 'painted', 'found', 'push', 'arm', 'hand', 'unveiled', 'swoop', 'settle'];
/** A hand-over this late (ms, on the page's own clock) is a defect: the camera may jump by more than a frame. */
const LATE_DEFECT_MS = 50;

interface Tap {
  t0: number;
  marks: Partial<Record<Mark, number>>;
  path: 'grown' | 'none' | null;
  reason: ZoomReason | null;
  preopen: 'early' | 'found' | null;
  swoop: SwoopStats | null;
  /** How late the full map's page took over (ms past due, its own clock). */
  late: number | null;
  filed: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}
const ON = Platform.OS !== 'web';
let tap: Tap | null = null;
/** However a tap went, its row is filed by this long after it at the latest (a map that never said it landed). */
const FILE_BY_MS = 20000;

/** A tap of Up to hit, turning it on, with the zoom on for this person (admins): a new row begins. */
export function zoomTap() {
  if (!ON) return;
  if (tap && !tap.filed) zoomFile();
  const t: Tap = { t0: Date.now(), marks: {}, path: null, reason: null, preopen: null, swoop: null, late: null, filed: false, timer: null };
  t.timer = setTimeout(() => { if (tap === t) zoomFile(); }, FILE_BY_MS);
  tap = t;
}

/** A moment of this tap, the first time it comes. */
export function zoomMark(m: Mark) {
  if (!tap || tap.filed || tap.marks[m] !== undefined) return;
  tap.marks[m] = Date.now() - tap.t0;
}

/** Whether it grew, or why not (the first word given counts). */
export function zoomPath(path: 'grown' | 'none', reason?: ZoomReason) {
  if (!tap || tap.filed || tap.path) return;
  tap.path = path;
  tap.reason = reason ?? null;
}

/** When the hidden full map was opened: while you were found ('early'), or only once you were ('found'). */
export function zoomPreopen(when: 'early' | 'found') {
  if (!tap || tap.filed || tap.preopen) return;
  tap.preopen = when;
}

/** The full map's page has taken over, `late` ms after it was due (its own clock). */
export function zoomHand(late: number) {
  zoomMark('hand');
  if (!tap || tap.filed || tap.late !== null) return;
  tap.late = Math.round(late);
}

/** The dive has come to rest: its frames, and the row goes. */
export function zoomSettled(stats?: SwoopStats) {
  if (!tap || tap.filed) return;
  if (stats) {
    tap.swoop = stats;
    if (stats.t0) tap.marks.swoop ??= stats.t0 - tap.t0;
  }
  zoomMark('settle');
  zoomFile();
}

/** The tap is over without a grow (or the row is due): filed now, once. A tap that never got as far as finding you files nothing. */
export function zoomFile() {
  const t = tap;
  if (!t || t.filed) return;
  t.filed = true;
  if (t.timer) clearTimeout(t.timer);
  // "Not now" on "Who can see you on the map?": nothing was tried.
  if (!t.path && t.marks.finding === undefined) return;
  const path = t.path ?? 'none';
  const why = path === 'none' ? ` ${t.reason ?? 'server'}` : '';
  const times = ORDER.filter((m) => t.marks[m] !== undefined).map((m) => `${m} ${t.marks[m]}`).join(' ');
  const swoop = t.swoop ? ` | swoop ${t.swoop.n}f max ${t.swoop.gap}ms` : '';
  const gap = path === 'grown' ? Math.round(growPushGap()) : 0;
  const push = gap > 0 ? ` | push max ${gap}ms` : '';
  const late = t.late !== null ? ` | hand late ${t.late}ms` : '';
  const defect = t.reason === 'notReady' || (t.late !== null && t.late >= LATE_DEFECT_MS) ? ' DEFECT' : '';
  void reportError(new Error(`[zoom-timing]${defect} ${path}${why} ${t.preopen ?? '-'} | ${times || 'no marks'}${late}${swoop}${push}`), { where: 'checkin-zoom' });
}

import type { DetectedActivity, ID, Notification } from '@/data/types';
import { activityTitle } from '@/features/activity/format';
import { sourceWord } from '@/features/activity/recent';

/*
 * Several workouts found at once (owner, Oct 5: "go for … grouped noti").
 * A watch or a WHOOP strap catching up (the phone's first look back over a
 * week, a strap that was off the phone for days, WHOOP connected for the
 * first time) can hand over a dozen workouts in one go. Each still gets its
 * own row on the server (so each can be logged, hidden or withdrawn on its
 * own), but more than three filed in one go read as ONE row in
 * Notifications, "4 workouts found. Tap to log.", which opens them as a list
 * (app/workouts-found), newest first, each with its own Log it. Three or
 * fewer keep a row each, as before.
 *
 * "One go" is how the rows were filed: one after another, each within ten
 * minutes of the one before (a look hands its workouts to the server one at
 * a time, a few a second; WHOOP's catch-up arrives one workout at a time,
 * sometimes minutes apart). The phone's own alerts and the server's use the
 * same ten minutes, so an alert's "4 workouts found" is one row here. Apple
 * Health and WHOOP filed in the same go are one group, never counted twice:
 * the server keeps one row for a session both of them saw (the later copy is
 * a duplicate, with no row of its own), and a row is counted once by its
 * workout here too.
 *
 * The phone's own lock-screen alert (modules/workout-watch, from build 15)
 * and the server's push for WHOOP (migration 2026100600018) fold the same
 * way, past three, into one "4 workouts found" alert.
 */

/** More than this many found in one go fold into one row and one alert; this many or fewer each keep their own. */
export const FOLD_OVER = 3;
/** Rows filed this close to the one before belong to the same go (the same ten minutes as the phone's alerts and the server's). */
const SAME_GO_MS = 10 * 60_000;

/** One go of more than three: its rows (any copies of a row too), and its workouts' ids, newest first. */
export type FoundBurst = {
  /** Stays the same as newer rows join (named after the go's first row). */
  key: string;
  /** Every Notifications row it stands for. */
  rowIds: ID[];
  /** Each workout once, newest played first. */
  activityIds: ID[];
  /** The server's words for each, in the same order ("Run · 32 min · from your Apple Watch"). */
  previews: (string | undefined)[];
  /** When the newest one was filed. */
  createdAt: string;
  unread: boolean;
};

/**
 * The "Tennis detected" and "Activity detected" rows in `rows`, folded into
 * the goes of more than three. Rows of other kinds, and goes of three or
 * fewer, are not in the answer. `held`, the sessions the app holds: a go's
 * workouts newest first by when they were played (a look hands the newest
 * over first, so the order they were filed in is the other way round), a
 * session since found to be the same as another (WHOOP and the Watch) as
 * that one, and one taken back (deleted on WHOOP) left out, so the count
 * is what the list shows.
 */
export function foundBursts(rows: Notification[], held: DetectedActivity[] = []): FoundBurst[] {
  const found = rows
    .filter((n) => n.kind === 'activity')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const goes: Notification[][] = [];
  for (const n of found) {
    const go = goes[goes.length - 1];
    const last = go?.[go.length - 1];
    if (go && last && Date.parse(last.createdAt) - Date.parse(n.createdAt) <= SAME_GO_MS) go.push(n);
    else goes.push([n]);
  }
  const out: FoundBurst[] = [];
  for (const go of goes) {
    const each: { id: ID; preview: string | undefined; at: number }[] = [];
    for (const n of go) {
      let a = held.find((x) => x.id === n.targetId);
      // The same session from two sources: counted once, as the one that carries it.
      if (a?.status === 'duplicate' && a.duplicateOf) a = held.find((x) => x.id === a!.duplicateOf) ?? a;
      if (a?.status === 'withdrawn') continue;
      const id = a?.id ?? n.targetId;
      if (each.some((e) => e.id === id)) continue;
      each.push({ id, preview: n.preview, at: a ? Date.parse(a.startedAt) : NaN });
    }
    if (each.length <= FOLD_OVER) continue;
    // Newest played first; one the app does not hold keeps its place after them.
    const known = each.filter((e) => Number.isFinite(e.at)).sort((x, y) => y.at - x.at);
    const ordered = [...known, ...each.filter((e) => !Number.isFinite(e.at))];
    out.push({
      key: `found:${go[go.length - 1].id}`,
      rowIds: go.map((n) => n.id),
      activityIds: ordered.map((e) => e.id),
      previews: ordered.map((e) => e.preview),
      createdAt: go[0].createdAt,
      unread: go.some((n) => !n.read),
    });
  }
  return out;
}

/** How many rows Notifications shows as new (the bell's number): a go of more than three counts once. */
export function unseenCount(rows: Notification[], held: DetectedActivity[] = []): number {
  const folded = new Set<ID>();
  let goes = 0;
  for (const b of foundBursts(rows, held)) {
    if (b.unread) goes += 1;
    for (const id of b.rowIds) folded.add(id);
  }
  return rows.filter((n) => !n.read && !folded.has(n.id)).length + goes;
}

/** "4 workouts found", or "4 tennis sessions found" when every one was tennis. */
export function foundTitle(count: number, allTennis: boolean): string {
  return `${count} ${allTennis ? 'tennis sessions' : 'workouts'} found`;
}

/** What a row's words say it was ("Run · 32 min · …" is a run; "32 min · …" or "Tue · …", tennis, migration 107). */
function nameFromPreview(preview: string | undefined): string {
  const first = (preview ?? '').split(' · ')[0]?.trim() ?? '';
  if (!first || /^\d/.test(first) || /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/.test(first)) return 'Tennis';
  return first;
}

/** Where a row's words say it came from ("· from your Apple Watch" → "your Apple Watch"). */
function sourceFromPreview(preview: string | undefined): string | null {
  const m = / · from (.+)$/.exec(preview ?? '');
  return m ? m[1].trim() : null;
}

/** "your Apple Watch" (as the server's rows say it), from the session itself. */
function sourcePhrase(a: Pick<DetectedActivity, 'source' | 'device'>): string {
  const word = sourceWord(a);
  return word === 'Apple Health' ? 'Apple Health' : `your ${word}`;
}

/**
 * What a go of workouts says under its count: what they were, newest first,
 * and where they came from, "Run, Tennis, Walk and 2 more · from your Apple
 * Watch and WHOOP". The sessions themselves say, when the app holds them;
 * otherwise each row's own words.
 */
export function foundLine(ids: ID[], previews: (string | undefined)[], held: DetectedActivity[]): string {
  const names: string[] = [];
  const sources: string[] = [];
  ids.forEach((id, i) => {
    const a = held.find((x) => x.id === id);
    names.push(a ? activityTitle(a) : nameFromPreview(previews[i]));
    const from = a ? sourcePhrase(a) : sourceFromPreview(previews[i]);
    if (from && !sources.includes(from)) sources.push(from);
  });
  const shown = names.slice(0, 3).join(', ');
  const what = names.length > 3 ? `${shown} and ${names.length - 3} more` : shown;
  // "your Apple Watch and WHOOP": "your" said once.
  const where = sources.map((s, i) => (i > 0 ? s.replace(/^your /, '') : s)).join(' and ');
  return where ? `${what} · from ${where}` : what;
}

/** Whether every one of these was tennis (held sessions say; otherwise each row's words). */
export function allTennis(ids: ID[], previews: (string | undefined)[], held: DetectedActivity[]): boolean {
  return ids.every((id, i) => {
    const a = held.find((x) => x.id === id);
    return a ? !a.sport || a.sport === 'tennis' : nameFromPreview(previews[i]) === 'Tennis';
  });
}

/** The list of a go's workouts: app/workouts-found with their ids, newest first. */
export const foundHref = (ids: ID[]) => `/workouts-found?ids=${ids.map(encodeURIComponent).join(',')}`;

/*
 * A tap on the phone's own "4 workouts found" alert (modules/workout-watch):
 * its workouts are handed to the server a few at a time (useWorkoutWatch),
 * which takes a few seconds for a big catch-up, so their list opens at once and
 * waits for them (app/workouts-found?handing=…) instead of the tap seeming
 * to do nothing.
 */
const handing = new Map<string, Promise<ID[]>>();
let handNo = 0;

/** Keeps `work` (the ids it hands over, newest first) under a key for the list to wait on. */
export function handOver(work: Promise<ID[]>): string {
  handNo += 1;
  const key = `${Date.now().toString(36)}-${handNo}`;
  handing.set(key, work);
  return key;
}

/** What that hand-over came to: the ids to list, newest first; empty when none could be (or the key is not this run's). Never rejects. */
export function handedOver(key: string): Promise<ID[]> {
  return (handing.get(key) ?? Promise.resolve([])).catch((): ID[] => []);
}

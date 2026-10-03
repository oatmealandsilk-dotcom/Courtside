import type { ID, Message, User } from '@/data/types';

/*
 * A chat's messages as the rows its list draws, worked out in one pass:
 * where a time line goes, which bubbles join into a run, where a sender's
 * name and face go in a group, which messages from someone you blocked fold
 * into one line, and under which message each person's "seen" face sits.
 * Kept apart from the screen so the list only draws; nothing here searches
 * the chat once per message.
 */

/** Two messages from the same person this close together read as one run: close together, their corners joined. */
export const GROUP_GAP_MS = 2 * 60_000;

/** Quiet for this long between two messages and the next one gets a time line (an hour, as iMessage and Instagram do). */
export const STAMP_GAP_MS = 60 * 60_000;

/**
 * How a message sits under the one before it: `run` joined to it (the same
 * person, moments later), `turn` where someone else's turn starts (a little
 * more room), `plain` under a time line or a sender's name, which make their
 * own room.
 */
export type Gap = 'run' | 'turn' | 'plain';

export interface ThreadRow {
  key: string;
  message: Message;
  /** A time line goes above it. */
  stamp: boolean;
  gap: Gap;
  /** The same person's next message joins it (its lower corner on the sender's side is small). */
  joinBelow: boolean;
  /** In a group, someone else's first message of a run: their name goes above it. */
  name: boolean;
  /** In a group, someone else's last message of a run: their face goes beside it. */
  face: boolean;
  /** From someone you blocked, folded: the ids of the run it stands for (one quiet line). */
  folded?: ID[];
  /** In a group, who has read up to here (their faces go under it). */
  seenBy?: ID[];
}

const runsOn = (a?: Message, b?: Message) =>
  !!a && !!b && a.kind !== 'system' && b.kind !== 'system' && a.senderId === b.senderId
  && Date.parse(b.createdAt) - Date.parse(a.createdAt) <= GROUP_GAP_MS;

/**
 * The rows, oldest first. `readers`: in a group, the people whose read
 * position is shown as faces (others in it who let read receipts show and
 * are not blocked); none in a one-to-one chat, which says "Seen" instead.
 */
export function buildRows(thread: Message[], opts: { me: ID | null; group: boolean; blockedIds: ID[]; shownIds: ID[]; readers: User[] }): ThreadRow[] {
  const { me, group, blockedIds, shownIds, readers } = opts;
  const blocked = new Set(blockedIds);
  const shown = new Set(shownIds);
  // Where each reader's face goes: the newest message they have read, unless it is their own (it speaks for itself).
  const seenAt = new Map<ID, ID[]>();
  for (const u of readers) {
    for (let i = thread.length - 1; i >= 0; i -= 1) {
      const m = thread[i];
      if (m.kind === 'system') continue;
      if (m.senderId === u.id) break;
      if (m.readAtBy?.[u.id]) {
        const list = seenAt.get(m.id) ?? [];
        list.push(u.id);
        seenAt.set(m.id, list);
        break;
      }
    }
  }
  const rows: ThreadRow[] = [];
  for (let i = 0; i < thread.length; i += 1) {
    const message = thread[i];
    const prev = thread[i - 1];
    const next = thread[i + 1];
    const stamp = !prev || Date.parse(message.createdAt) - Date.parse(prev.createdAt) > STAMP_GAP_MS;
    if (message.kind === 'system') {
      rows.push({ key: message.id, message, stamp, gap: 'plain', joinBelow: false, name: false, face: false });
      continue;
    }
    const mine = message.senderId === me;
    const inRun = runsOn(prev, message) && !stamp;
    const lastOfRun = !runsOn(message, next) || (!!next && Date.parse(next.createdAt) - Date.parse(message.createdAt) > STAMP_GAP_MS);
    const theirsInGroup = group && !mine;
    // Someone you blocked: one quiet line for the whole run, until you choose to see it.
    if (theirsInGroup && blocked.has(message.senderId) && !shown.has(message.id)) {
      if (inRun && prev && !shown.has(prev.id) && blocked.has(prev.senderId)) continue;
      const run = [message.id];
      for (let j = i + 1; j < thread.length && runsOn(thread[j - 1], thread[j]); j += 1) run.push(thread[j].id);
      rows.push({ key: `fold:${message.id}`, message, stamp, gap: 'plain', joinBelow: false, name: false, face: false, folded: run });
      continue;
    }
    const name = theirsInGroup && !inRun;
    const gap: Gap = inRun ? 'run' : prev && !stamp && !name && prev.kind !== 'system' ? 'turn' : 'plain';
    rows.push({
      key: message.id, message, stamp, gap, joinBelow: !lastOfRun, name, face: theirsInGroup && lastOfRun,
      seenBy: seenAt.get(message.id),
    });
  }
  return rows;
}

const sameIds = (a?: ID[], b?: ID[]) => (a?.join(',') ?? '') === (b?.join(',') ?? '');

/**
 * The rows, with each one that has not changed since last time handed back
 * as the very same object, so the list leaves its row alone (a row is drawn
 * again only when its own values change). `cache` is last time's rows by
 * key, and is brought up to date.
 */
export function keepRows(cache: Map<string, ThreadRow>, rows: ThreadRow[]): ThreadRow[] {
  const out = rows.map((row) => {
    const was = cache.get(row.key);
    return was && was.message === row.message && was.stamp === row.stamp && was.gap === row.gap && was.joinBelow === row.joinBelow
      && was.name === row.name && was.face === row.face && sameIds(was.folded, row.folded) && sameIds(was.seenBy, row.seenBy)
      ? was : row;
  });
  cache.clear();
  for (const row of out) cache.set(row.key, row);
  return out;
}

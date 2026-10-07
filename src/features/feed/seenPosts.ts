import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

/**
 * What this phone has shown you in the feeds, kept on the phone (Oct 7,
 * owner: "people don't keep seeing the same videos"): each post, thread and
 * Instant by its feed key ("p:<id>", "q:<id>", "h:<id>"), with when you first
 * and last saw it. The server keeps the same for posts (feed_signals,
 * migration 20) and tells the feed through feed_post_scores (migrations 143
 * and 150); this list is what makes "seen" work at once, offline, and before
 * the server has answered, and for threads and Instants, which the server
 * does not report back. rankFeed puts everything seen below everything not
 * seen yet.
 *
 * One list per account (two people on one phone each have their own), the
 * newest 2000 kept. Written a second after the last change, and as the app
 * goes to the background.
 */
const KEEP = 2000;
const SAVE_AFTER_MS = 1000;
const storeKey = (userId: string) => `courtside-feed-seen:${userId}`;

/** key → [first seen, last seen], in ms. */
let entries = new Map<string, [number, number]>();
let owner: string | null = null;
let loadedFor: string | null = null;
let loading: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;

/** Reads this account's list from the phone. Asked again for the same account, it is the same answer. Never throws. */
export function loadSeen(userId: string | null | undefined): Promise<void> {
  if (!userId) return Promise.resolve();
  if (owner !== userId) {
    // Another account: what was held belongs to the last one (already saved, or saved now).
    if (owner && dirty) void save();
    owner = userId;
    entries = new Map();
    loadedFor = null;
    loading = null;
    dirty = false;
  }
  if (loadedFor === userId) return Promise.resolve();
  if (loading) return loading;
  const run = AsyncStorage.getItem(storeKey(userId))
    .then((raw) => {
      if (owner !== userId || !raw) return;
      const list: unknown = JSON.parse(raw);
      if (!Array.isArray(list)) return;
      for (const row of list) {
        if (!Array.isArray(row) || typeof row[0] !== 'string') continue;
        const first = Number(row[1]) * 1000;
        const last = Number(row[2]) * 1000;
        if (!Number.isFinite(first) || !Number.isFinite(last)) continue;
        // Anything already noted this run (before the list was read) keeps its own times.
        const had = entries.get(row[0]);
        entries.set(row[0], had ? [Math.min(had[0], first), Math.max(had[1], last)] : [first, last]);
      }
    })
    .catch(() => { /* A phone that refuses storage: seen is this run's only. */ })
    .finally(() => {
      if (owner !== userId) return;
      loadedFor = userId;
      loading = null;
      if (dirty) scheduleSave();
    });
  loading = run;
  return run;
}

/** Whether this account's list has been read (or could not be), so the feed can be dealt from it. */
export const seenLoaded = (userId: string | null | undefined) => !userId || loadedFor === userId;

/** A page was on screen just now. */
export function markSeen(userId: string | null | undefined, key: string, at = Date.now()) {
  if (!userId || !/^[pqh]:/.test(key)) return;
  if (owner !== userId) void loadSeen(userId);
  const had = entries.get(key);
  entries.set(key, had ? [had[0], at] : [at, at]);
  dirty = true;
  scheduleSave();
}

/** When you last saw each page on this phone, by feed key (ms): for rankFeed. */
export function seenOnPhone(userId: string | null | undefined): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  if (!userId || owner !== userId) return out;
  for (const [key, [, last]] of entries) out.set(key, last);
  return out;
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; void save(); }, SAVE_AFTER_MS);
}

async function save() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  const who = owner;
  // Never before the saved list has been read: writing first would replace it with this run's few.
  if (!who || loadedFor !== who || !dirty) return;
  dirty = false;
  const rows = [...entries]
    .sort((a, b) => b[1][1] - a[1][1])
    .slice(0, KEEP);
  if (rows.length < entries.size) entries = new Map(rows);
  // Seconds, not milliseconds: the list stays small.
  const list = rows.map(([key, [first, last]]) => [key, Math.round(first / 1000), Math.round(last / 1000)]);
  try { await AsyncStorage.setItem(storeKey(who), JSON.stringify(list)); } catch { dirty = true; }
}

// Leaving the app (or a browser tab going out of sight): what is noted is written now.
AppState.addEventListener('change', (next) => { if (next !== 'active') void save(); });

import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Recent searches, kept on this device for each account separately (two
 * people sharing a phone each see their own), the way Instagram keeps them:
 * a word you searched, or the person, thread or court you opened from a
 * search.
 */
export interface Recent {
  kind: 'term' | 'user' | 'thread' | 'court';
  /** The word itself for a term (lower case), otherwise the id. */
  key: string;
  /** What the row says: the word, the name, the title. */
  text: string;
  /** Where a court is, so the row can say how far and the map can open on it. */
  lat?: number;
  lng?: number;
  at: number;
}

/** The old list, one for the whole device; moved into the first account that opens Search. */
const SHARED_KEY = 'courtside-recent-searches';
const KEEP = 20;
const keyFor = (accountId: string) => `${SHARED_KEY}:${accountId}`;

const valid = (r: unknown): r is Recent => {
  const x = r as Recent;
  return !!x && typeof x === 'object' && ['term', 'user', 'thread', 'court'].includes(x.kind) && typeof x.key === 'string' && typeof x.text === 'string';
};

export async function readRecents(accountId: string): Promise<Recent[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(accountId));
    if (raw !== null) {
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list.filter(valid).slice(0, KEEP) : [];
    }
    // First look for this account: bring the old shared words across as terms.
    const old = await AsyncStorage.getItem(SHARED_KEY);
    const words: unknown = old ? JSON.parse(old) : [];
    const now = Date.now();
    const moved: Recent[] = Array.isArray(words)
      ? words.filter((w): w is string => typeof w === 'string' && w.trim().length > 0).slice(0, KEEP)
        .map((w, i) => ({ kind: 'term', key: w.trim().toLowerCase(), text: w.trim(), at: now - i }))
      : [];
    await AsyncStorage.setItem(keyFor(accountId), JSON.stringify(moved));
    if (old !== null) await AsyncStorage.removeItem(SHARED_KEY);
    return moved;
  } catch {
    return [];
  }
}

export async function writeRecents(accountId: string, list: Recent[]): Promise<void> {
  try { await AsyncStorage.setItem(keyFor(accountId), JSON.stringify(list.slice(0, KEEP))); } catch { /* kept for this visit only */ }
}

/** The list with `entry` on top, any older copy of it gone, and at most twenty kept. */
export function withRecent(list: Recent[], entry: Omit<Recent, 'at'>): Recent[] {
  const key = entry.kind === 'term' ? entry.key.toLowerCase() : entry.key;
  return [{ ...entry, key, at: Date.now() }, ...list.filter((r) => !(r.kind === entry.kind && r.key === key))].slice(0, KEEP);
}

export function withoutRecent(list: Recent[], entry: Pick<Recent, 'kind' | 'key'>): Recent[] {
  return list.filter((r) => !(r.kind === entry.kind && r.key === entry.key));
}

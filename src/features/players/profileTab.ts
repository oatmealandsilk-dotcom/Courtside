import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

/**
 * Which tab your Tennis profile opens on (Oct 5, option A: Activity, Health,
 * Game): the one you used last, kept on this phone for each account
 * separately, so two people sharing a phone each get their own. The first
 * time, Activity.
 */
export type ProfileTab = 'activity' | 'health' | 'game';

export const PROFILE_TABS: { value: ProfileTab; label: string }[] = [
  { value: 'activity', label: 'Activity' },
  { value: 'health', label: 'Health' },
  { value: 'game', label: 'Game' },
];

const key = (userId: string) => `courtside-tennis-tab:${userId}`;
const isTab = (v: unknown): v is ProfileTab => v === 'activity' || v === 'health' || v === 'game';

/** Read once per account per time the app is open; after that the page opens on it straight away. */
const known = new Map<string, ProfileTab>();

async function readTab(userId: string): Promise<ProfileTab> {
  try {
    const saved = await AsyncStorage.getItem(key(userId));
    return isTab(saved) ? saved : 'activity';
  } catch {
    return 'activity';
  }
}

/**
 * The open tab, a way to change it (remembered), and whether the remembered
 * one has been read yet: until it has, the page draws no tab at all rather
 * than flashing Activity and then jumping to Game.
 */
export function useProfileTab(userId: string): { tab: ProfileTab; choose: (next: ProfileTab) => void; ready: boolean } {
  const [tab, setTab] = useState<ProfileTab | null>(() => known.get(userId) ?? null);
  useEffect(() => {
    if (known.has(userId)) { setTab(known.get(userId)!); return; }
    let live = true;
    void readTab(userId).then((t) => {
      if (!live) return;
      if (!known.has(userId)) known.set(userId, t);
      setTab(known.get(userId)!);
    });
    return () => { live = false; };
  }, [userId]);
  const choose = useCallback((next: ProfileTab) => {
    known.set(userId, next);
    setTab(next);
    AsyncStorage.setItem(key(userId), next).catch(() => { /* kept for this visit only */ });
  }, [userId]);
  return { tab: tab ?? 'activity', choose, ready: tab !== null };
}

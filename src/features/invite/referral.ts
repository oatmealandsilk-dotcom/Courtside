import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Everyone's invite link: the web app's join page, carrying their handle. */
export const inviteLink = (handle: string) => `https://app.courtsidebase.com/join?ref=${encodeURIComponent(handle)}`;

const KEY = 'courtside-ref';

/*
 * The handle an invite link carried, kept until the person has an account
 * to claim it with — the join page runs before sign-up, the claim after.
 */
export async function rememberReferrer(handle: string) {
  const clean = handle.trim().toLowerCase();
  if (!/^[a-z0-9_]{2,24}$/.test(clean)) return;
  if (Platform.OS === 'web') { try { localStorage.setItem(KEY, clean); } catch { /* private mode */ } return; }
  await AsyncStorage.setItem(KEY, clean).catch(() => undefined);
}

export async function takeReferrer(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try { const v = localStorage.getItem(KEY); if (v) localStorage.removeItem(KEY); return v; } catch { return null; }
  }
  const v = await AsyncStorage.getItem(KEY).catch(() => null);
  if (v) await AsyncStorage.removeItem(KEY).catch(() => undefined);
  return v;
}

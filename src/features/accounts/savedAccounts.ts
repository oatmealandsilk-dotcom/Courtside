import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Accounts that have signed in on this device, so switching between them is
 * a tap instead of a password — the way Instagram remembers its logins.
 *
 * Each entry keeps the account's refresh token: the credential Supabase hands
 * out for getting a fresh session without the password. On the phone it goes
 * in the keychain (SecureStore); in the browser, localStorage is what exists.
 * Signing out "everywhere" revokes these tokens, so that also forgets them.
 */
export interface SavedAccount {
  id: string;
  handle: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  refreshToken: string;
  savedAt: string;
}

const KEY = 'courtside.accounts';

async function readAll(): Promise<SavedAccount[]> {
  try {
    const raw = Platform.OS === 'web' ? localStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    const list = raw ? (JSON.parse(raw) as SavedAccount[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function writeAll(list: SavedAccount[]) {
  const raw = JSON.stringify(list);
  try {
    if (Platform.OS === 'web') localStorage.setItem(KEY, raw);
    else await SecureStore.setItemAsync(KEY, raw);
  } catch {
    // Nothing to do: the next sign-in simply asks for the password again.
  }
}

export const listSavedAccounts = readAll;

/** Adds or updates one account; fields left out keep what was saved before. */
export async function rememberAccount(next: Partial<SavedAccount> & { id: string }): Promise<SavedAccount[]> {
  const list = await readAll();
  const existing = list.find((a) => a.id === next.id);
  const merged: SavedAccount = {
    id: next.id,
    handle: next.handle ?? existing?.handle ?? '',
    name: next.name ?? existing?.name ?? '',
    email: next.email ?? existing?.email,
    avatarUrl: next.avatarUrl ?? existing?.avatarUrl,
    refreshToken: next.refreshToken ?? existing?.refreshToken ?? '',
    savedAt: new Date().toISOString(),
  };
  if (!merged.refreshToken) return list;
  const others = list.filter((a) => a.id !== next.id);
  const updated = [merged, ...others].slice(0, 5);
  await writeAll(updated);
  return updated;
}

export async function forgetAccount(id: string): Promise<SavedAccount[]> {
  const updated = (await readAll()).filter((a) => a.id !== id);
  await writeAll(updated);
  return updated;
}

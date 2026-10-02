import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { isMapCourtId } from '@/features/places/courtName';

/** A court an invite can carry, so the friend who joins lands on its page. */
export interface InviteCourt { id: string; name: string; lat: number; lng: number }

/**
 * Everyone's invite link: the web app's join page, carrying their handle,
 * and a court when one is given ("my court"): whoever joins through it
 * lands on that court's page.
 */
export const inviteLink = (handle: string, court?: InviteCourt | null) => {
  const base = `https://app.courtsidebase.com/join?ref=${encodeURIComponent(handle)}`;
  if (!court || !isMapCourtId(court.id)) return base;
  return `${base}&court=${encodeURIComponent(court.id)}&name=${encodeURIComponent(court.name)}&lat=${court.lat.toFixed(5)}&lng=${court.lng.toFixed(5)}`;
};

const KEY = 'courtside-ref';
const COURT_KEY = 'courtside-ref-court';

const put = async (key: string, value: string) => {
  if (Platform.OS === 'web') { try { localStorage.setItem(key, value); } catch { /* private mode */ } return; }
  await AsyncStorage.setItem(key, value).catch(() => undefined);
};
const take = async (key: string): Promise<string | null> => {
  if (Platform.OS === 'web') {
    try { const v = localStorage.getItem(key); if (v) localStorage.removeItem(key); return v; } catch { return null; }
  }
  const v = await AsyncStorage.getItem(key).catch(() => null);
  if (v) await AsyncStorage.removeItem(key).catch(() => undefined);
  return v;
};

/*
 * The handle an invite link carried (and its court, if any), kept until the
 * person has an account to claim it with — the join page runs before
 * sign-up, the claim after.
 */
export async function rememberReferrer(handle: string, court?: InviteCourt | null) {
  const clean = handle.trim().toLowerCase();
  if (!/^[a-z0-9_]{2,24}$/.test(clean)) return;
  await put(KEY, clean);
  if (court && isMapCourtId(court.id) && Number.isFinite(court.lat) && Number.isFinite(court.lng)) {
    await put(COURT_KEY, JSON.stringify({ id: court.id, name: court.name.slice(0, 120), lat: court.lat, lng: court.lng }));
  }
}

export async function takeReferrer(): Promise<string | null> {
  return take(KEY);
}

/** The court an invite carried, once, for the first page after joining. */
export async function takeInviteCourt(): Promise<InviteCourt | null> {
  const raw = await take(COURT_KEY);
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as InviteCourt;
    return isMapCourtId(c.id) && typeof c.name === 'string' && Number.isFinite(c.lat) && Number.isFinite(c.lng) ? c : null;
  } catch { return null; }
}

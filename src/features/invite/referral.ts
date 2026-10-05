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

/**
 * The handle in whatever someone typed or pasted as "who invited me": a
 * plain handle, "@Handle", "mr dinosaur62", their invite link
 * (…/join?ref=handle, courtsidebase.com/?ref=handle) or a profile link.
 * A friend's waitlist link (courtsidebase.com/?r=1a2b3c4d) comes back as
 * "r=1a2b3c4d": not a handle, but the server finds the friend from it.
 * The server reads it the same way (invite_handle_from, migration 116).
 */
export function handleFromText(text: string): string {
  let t = text.trim().toLowerCase();
  const ref = /ref=(?:@|%40)*([a-z0-9_]+)/.exec(t);
  const code = /(?:^|[?&])r=([0-9a-f]{8})(?:[^0-9a-f]|$)/.exec(t);
  if (ref) t = ref[1];
  else if (code) return `r=${code[1]}`;
  else if (/^(https?:\/\/|www\.)/.test(t) || /^[a-z0-9-]+(\.[a-z0-9-]+)+\//.test(t)) {
    t = t.replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/^.*\//, '');
  }
  return t.replace(/\s/g, '').replace(/^@+/, '');
}

/** Whether handleFromText read a friend's waitlist link (r=<code>) rather than a handle. */
export const isWaitlistCode = (read: string) => /^r=[0-9a-f]{8}$/.test(read);

/*
 * The handle an invite link carried (and its court, if any), kept until the
 * person has an account to claim it with — the join page runs before
 * sign-up, the claim after.
 */
export async function rememberReferrer(handle: string, court?: InviteCourt | null) {
  // "?ref=@Om" typed by hand used to be dropped without a word.
  const clean = handleFromText(handle);
  if (!/^[a-z0-9_]{2,24}$/.test(clean)) return;
  await put(KEY, clean);
  if (court && isMapCourtId(court.id) && Number.isFinite(court.lat) && Number.isFinite(court.lng)) {
    await put(COURT_KEY, JSON.stringify({ id: court.id, name: court.name.slice(0, 120), lat: court.lat, lng: court.lng }));
  }
}

/**
 * The invite link's handle, without using it up: it stays until the claim
 * has really been answered (forgetReferrer), so a dropped connection is
 * tried again next time instead of losing the credit.
 */
export async function peekReferrer(): Promise<string | null> {
  if (Platform.OS === 'web') { try { return localStorage.getItem(KEY); } catch { return null; } }
  return AsyncStorage.getItem(KEY).catch(() => null);
}

export async function forgetReferrer(): Promise<void> {
  await take(KEY);
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

/*
 * The shared thing someone opened before they had an account: the page it
 * lives on, and for an open hit whether they already tapped "I'm in". Kept
 * through sign-up and the setup questions, then the app opens on it (and
 * joins the hit) the first time it reaches its start page (see AppShell).
 * Kept a week at most: a link opened long ago does not hijack a later visit.
 */
export interface ShareTarget { href: string; joinHit?: string; at: number }

const TARGET_KEY = 'courtside-share-target';
const WEEK = 7 * 86_400_000;
let pendingTarget: ShareTarget | null | undefined;

const fresh = (raw: string | null): ShareTarget | null => {
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as ShareTarget;
    // Only a page inside the app, never somewhere else.
    if (typeof t.href !== 'string' || !/^\/[a-z]/.test(t.href) || t.href.startsWith('//')) return null;
    if (typeof t.at !== 'number' || Date.now() - t.at > WEEK) return null;
    return { href: t.href, joinHit: typeof t.joinHit === 'string' ? t.joinHit : undefined, at: t.at };
  } catch { return null; }
};

// The phone's storage only answers later, so it is read once as the app starts.
if (Platform.OS !== 'web') {
  AsyncStorage.getItem(TARGET_KEY).then((raw) => { if (pendingTarget === undefined) pendingTarget = fresh(raw); }).catch(() => { pendingTarget = null; });
}

export async function rememberShareTarget(href: string, joinHit?: string) {
  const target: ShareTarget = { href, joinHit, at: Date.now() };
  pendingTarget = target;
  await put(TARGET_KEY, JSON.stringify(target));
}

/** Whether a shared thing is waiting, without using it up. */
export function peekShareTarget(): ShareTarget | null {
  if (pendingTarget === undefined && Platform.OS === 'web') {
    try { pendingTarget = fresh(localStorage.getItem(TARGET_KEY)); } catch { pendingTarget = null; }
  }
  return pendingTarget ?? null;
}

/** The shared thing to open now, once. */
export async function takeShareTarget(): Promise<ShareTarget | null> {
  const had = peekShareTarget();
  pendingTarget = null;
  const stored = fresh(await take(TARGET_KEY));
  return stored ?? had;
}

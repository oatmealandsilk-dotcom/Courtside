import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { isLocalMedia, remote } from '@/data/remote';
import type { ChatPhoto } from '@/data/types';
import { isSupabaseConfigured } from '@/lib/supabase';

/*
 * Photos in chats, between the store and the bubbles. Chat photos sit on a
 * private shelf (migration 61): a message only knows where each one is kept,
 * and showing one takes a link the server hands out to people in that chat,
 * good for an hour. This keeps those links, asks for them in one go for all
 * the photos on screen, and keeps the sender's own copy of each photo so
 * their bubble never waits on a download. Kept outside React, like the toast
 * bus, so the store and any bubble can reach it.
 */

/** The most photos one message carries (the database says the same). */
export const MAX_CHAT_PHOTOS = 10;

/** A picture the demo draws itself (src/features/messages/DemoPhoto.tsx): there are no uploads in the demo. */
export const isDemoPhoto = (path: string) => path.startsWith('demo:');

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/* ------------------------------------------------------- the sender's copy */

/** Shelf address → the same photo still on this phone, for photos sent from here this session. */
const localCopy = new Map<string, string>();
/** After a photo has gone up, its bubble keeps showing the file on this phone: no wait, no download. */
export function keepLocalCopy(path: string, uri: string) { localCopy.set(path, uri); emit(); }

/* ------------------------------------------------------------------ links */

/** Links work for an hour; one is renewed five minutes before it would stop. */
const LINK_MS = 55 * 60_000;
/** A photo the server would not open (gone, or no longer yours to see) is asked about again after this long. */
const RETRY_MS = 30_000;
const links = new Map<string, { url: string; until: number }>();
const refused = new Map<string, number>();
/** Photos whose last ask got no answer at all (no signal): left a few seconds before asking again. */
const noAnswer = new Map<string, number>();
const NO_ANSWER_MS = 5_000;
/** Photos waiting to be asked about, and photos being asked about right now. */
const queued = new Set<string>();
const inFlight = new Set<string>();
let asking: ReturnType<typeof setTimeout> | null = null;

/** Every photo that wants a link this moment goes in one request, not one each. */
function ask(path: string) {
  if (queued.has(path) || inFlight.has(path)) return;
  queued.add(path);
  if (!asking) asking = setTimeout(() => { void flush(); }, 0);
}
async function flush() {
  asking = null;
  const paths = [...queued];
  queued.clear();
  if (!paths.length) return;
  paths.forEach((path) => inFlight.add(path));
  const got = await remote.signChatPhotos(paths).catch(() => null);
  const now = Date.now();
  for (const path of paths) {
    inFlight.delete(path);
    if (!got) noAnswer.set(path, now);
    else if (got[path]) { links.set(path, { url: got[path], until: now + LINK_MS }); refused.delete(path); noAnswer.delete(path); }
    else refused.set(path, now);
  }
  emit();
}

/** Whether a photo is shown from this phone (or drawn by the demo), with no link needed. */
const isHere = (path: string) => isLocalMedia(path) || isDemoPhoto(path) || /^https?:/.test(path) || !isSupabaseConfigured || localCopy.has(path);

/**
 * What to show for a photo right now: the file itself when it is on this
 * phone (or drawn by the demo), else its link. A link past its hour is still
 * handed out while a fresh one is asked for: the picture is kept on the
 * phone under its shelf address, so it keeps showing rather than blinking.
 * Null while the first link is being asked for; 'unavailable' when the
 * server would not give one.
 */
function sourceNow(path: string): string | null {
  if (!path) return 'unavailable';
  if (isHere(path)) return localCopy.get(path) ?? path;
  const link = links.get(path);
  if (link) return link.url;
  const no = refused.get(path);
  if (no && Date.now() - no < RETRY_MS) return 'unavailable';
  return null;
}

/** Whether a photo needs a (new) link asked for. */
function wantsLink(path: string): boolean {
  if (!path || isHere(path)) return false;
  const no = refused.get(path);
  if (no && Date.now() - no < RETRY_MS) return false;
  const silent = noAnswer.get(path);
  if (silent && Date.now() - silent < NO_ANSWER_MS) return false;
  const link = links.get(path);
  return !link || link.until <= Date.now();
}

/**
 * The address to show a chat photo from, asked for when needed. Null while
 * it comes; 'unavailable' when the photo cannot be opened (it was unsent, or
 * you are no longer in that chat).
 */
export function useChatPhotoSource(path: string): string | null {
  const source = useSyncExternalStore(subscribe, () => sourceNow(path), () => sourceNow(path));
  // Checked on every draw (it is only a look-up): a link that ran out is renewed the next time the photo is drawn.
  useEffect(() => { if (wantsLink(path)) ask(path); });
  return source;
}

/** The cache key a photo is kept under on this phone: its shelf address, which never changes, rather than the hour-long link, which does. */
export const photoCacheKey = (photo: ChatPhoto) => (isLocalMedia(photo.path) ? undefined : photo.path);

/* ------------------------------------------------------- sending progress */

/** Message id → how much of its photos has gone up (0 to 1), while it goes. */
const progress = new Map<string, number>();
export function setSendProgress(messageId: string, fraction: number) {
  progress.set(messageId, Math.max(0, Math.min(1, fraction)));
  emit();
}
export function clearSendProgress(messageId: string) {
  if (progress.delete(messageId)) emit();
}
/** How far a photo message from this phone has got (0 to 1), or null when nothing is going up. */
export function useSendProgress(messageId: string): number | null {
  return useSyncExternalStore(subscribe, () => progress.get(messageId) ?? null, () => progress.get(messageId) ?? null);
}

/* ------------------------------------------------------------ server ready */

/*
 * Whether this database takes photos in chats yet (migration 61). The demo
 * always does. Asked once when a chat opens, and again at most every ten
 * minutes while the answer is no, so photos switch on soon after the update
 * runs, without a new release.
 *
 * The last answer is kept on the phone, so from the next start the photo
 * button is in its place from the very first frame: a button that popped in
 * a moment after the chat opened pushed the court button and the message
 * box aside, the same jolt the court button used to give.
 */
const READY_KEY = 'courtside-chat-photos-ready';
let ready: boolean | null = isSupabaseConfigured ? null : true;
/** Whether the server itself has said yes since this start (a kept yes is checked once more). */
let confirmed = !isSupabaseConfigured;
let lastAsked = 0;
let pending: Promise<void> | null = null;
// Its own listeners: the many progress ticks above never redraw the whole chat.
const readyListeners = new Set<() => void>();
const readyChanged = () => readyListeners.forEach((fn) => fn());
if (isSupabaseConfigured) {
  // Read at start, long before a chat opens; the server's own answer, when it comes, wins.
  AsyncStorage.getItem(READY_KEY)
    .then((kept) => { if (ready === null && (kept === 'yes' || kept === 'no')) { ready = kept === 'yes'; readyChanged(); } })
    .catch(() => {});
}
function askReady() {
  if (confirmed || pending || Date.now() - lastAsked < 10 * 60_000) return;
  lastAsked = Date.now();
  pending = remote.chatPhotosReady()
    .then((answer) => {
      if (answer === null) { lastAsked = 0; return; }
      ready = answer;
      confirmed = answer;
      AsyncStorage.setItem(READY_KEY, answer ? 'yes' : 'no').catch(() => {});
    })
    .catch(() => { lastAsked = 0; })
    .finally(() => { pending = null; readyChanged(); });
}
const subscribeReady = (fn: () => void) => { readyListeners.add(fn); return () => { readyListeners.delete(fn); }; };

/**
 * Whether the photo button should show: 'on' once the server can keep chat
 * photos, 'off' while it cannot, and 'unknown' only before this phone has
 * ever heard (the chat keeps the button's room empty then, so nothing moves
 * if the answer is yes).
 */
export function useChatPhotosReady(): 'on' | 'off' | 'unknown' {
  useEffect(() => { askReady(); }, []);
  const now = () => (ready === null ? 'unknown' : ready ? 'on' : 'off');
  return useSyncExternalStore(subscribeReady, now, now);
}

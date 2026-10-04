import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useSyncExternalStore } from 'react';

/*
 * Just-in-time tips (Oct 4, owner): a small bubble the first time someone
 * reaches a thing they would not find on their own. Each tip shows once;
 * doing the thing first counts as knowing it, and that tip never shows. At
 * most one tip per visit to the app, never stacked.
 */
export type TipKey = 'activities' | 'double-tap' | 'see-stats' | 'share-session' | 'hold-to-record' | 'who-liked' | 'chat-times';

export const TIP_WORDS: Record<TipKey, string> = {
  activities: 'Your friends’ matches and practices show up here.',
  'double-tap': 'Double-tap a clip to like it.',
  'see-stats': 'Tap for the full stats.',
  'share-session': 'Share it like Strava: your stats as a story.',
  'hold-to-record': 'Hold the mic to record a voice note.',
  'who-liked': 'Tap the number to see who liked it.',
  'chat-times': 'Swipe left to see when each message was sent.',
};

const KEY = 'courtside.tips.done.v1';
let done = new Set<TipKey>();
let loaded = false;
let showing: TipKey | null = null;
let shownThisVisit = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

void AsyncStorage.getItem(KEY)
  .then((raw) => { if (raw) done = new Set(JSON.parse(raw) as TipKey[]); })
  .catch(() => undefined)
  .finally(() => { loaded = true; emit(); });

const save = () => { void AsyncStorage.setItem(KEY, JSON.stringify([...done])).catch(() => undefined); };

/** They did the thing (or closed its tip): that tip is done for good. */
export function learned(key: TipKey) {
  if (done.has(key)) return;
  done.add(key);
  if (showing === key) showing = null;
  save();
  emit();
}

/** Settings → Reset tips. */
export function resetTips() {
  done = new Set();
  shownThisVisit = false;
  showing = null;
  save();
  emit();
}

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

/**
 * Whether this tip is on screen now. `ready` is the caller's own moment (the
 * thing is in view, after a short wait); the first tip to ask in a visit gets
 * it, and no other tip shows until the app is next opened.
 */
export function useTip(key: TipKey, ready: boolean): { shown: boolean; close: () => void } {
  const snapshot = useSyncExternalStore(subscribe, () => `${loaded}:${showing}:${done.has(key)}`);
  const [settled, setSettled] = useState(false);
  // A beat after the moment arrives, so the tip never jumps in mid-gesture.
  useEffect(() => {
    if (!ready) { setSettled(false); return undefined; }
    const t = setTimeout(() => setSettled(true), 900);
    return () => clearTimeout(t);
  }, [ready]);
  useEffect(() => {
    if (!settled || !loaded || done.has(key) || showing || shownThisVisit) return;
    showing = key;
    shownThisVisit = true;
    emit();
  }, [settled, key, snapshot]);
  useEffect(() => () => { if (showing === key) { showing = null; emit(); } }, [key]);
  return { shown: showing === key && !done.has(key), close: () => learned(key) };
}

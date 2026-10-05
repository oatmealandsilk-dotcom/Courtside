import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useSyncExternalStore } from 'react';

/*
 * Just-in-time tips (Oct 4, owner): a small bubble the first time someone
 * reaches a thing they would not find on their own. Each tip shows once;
 * doing the thing first counts as knowing it, and that tip never shows. At
 * most one tip per visit to the app, never stacked.
 */
export type TipKey = 'map-who-sees' | 'activities' | 'double-tap' | 'see-stats' | 'share-session' | 'hold-to-record' | 'who-liked' | 'chat-times' | 'hold-to-edit';

export const TIP_WORDS: Record<TipKey, string> = {
  'map-who-sees': 'Tap here to choose who sees you: players nearby, only friends, or just you.',
  activities: 'Your friends’ matches and practices show up here.',
  'double-tap': 'Double-tap a clip to like it.',
  'see-stats': 'Tap for the full stats.',
  'share-session': 'Share it like Strava: your stats as a story.',
  'hold-to-record': 'Hold the mic to record a voice note.',
  'who-liked': 'Tap the number to see who liked it.',
  'chat-times': 'Swipe left to see when each message was sent.',
  // The first tap on your own ring in Community's Open to hit row (Oct 5, owner).
  'hold-to-edit': 'Hold to edit your time and distance.',
};

/**
 * The tips there were before Oct 5. Saved before then (v1), every one of them
 * done is exactly when Settings said Tips: Off, so a tip added since stays
 * away for them too.
 */
const BEFORE_OCT5: TipKey[] = ['map-who-sees', 'activities', 'double-tap', 'see-stats', 'share-session', 'hold-to-record', 'who-liked', 'chat-times'];
/** Kept beside the done tips (v2): Settings → Tips is Off, so a tip added later never shows either. */
const OFF_MARK = '*off';

const KEY = 'courtside.tips.done.v2';
const KEY_V1 = 'courtside.tips.done.v1';
let done = new Set<TipKey>();
let off = false;
let loaded = false;
let showing: TipKey | null = null;
let shownThisVisit = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

void AsyncStorage.getItem(KEY)
  .then(async (raw) => {
    if (raw) {
      const saved = JSON.parse(raw) as string[];
      done = new Set(saved.filter((k): k is TipKey => k in TIP_WORDS));
      off = saved.includes(OFF_MARK);
      return;
    }
    const before = await AsyncStorage.getItem(KEY_V1);
    if (!before) return;
    done = new Set((JSON.parse(before) as string[]).filter((k): k is TipKey => k in TIP_WORDS));
    off = BEFORE_OCT5.every((k) => done.has(k));
    save();
  })
  .catch(() => undefined)
  .finally(() => { loaded = true; emit(); });

const save = () => { void AsyncStorage.setItem(KEY, JSON.stringify([...done, ...(off ? [OFF_MARK] : [])])).catch(() => undefined); };

/** They did the thing (or closed its tip): that tip is done for good. */
export function learned(key: TipKey) {
  if (done.has(key)) return;
  done.add(key);
  if (showing === key) showing = null;
  save();
  emit();
}

const ALL_TIPS = Object.keys(TIP_WORDS) as TipKey[];

/** Settings → Tips, when they are on: every tip counts as known, so none shows (Oct 5, owner). */
export function turnOffTips() {
  ALL_TIPS.forEach((k) => done.add(k));
  off = true;
  showing = null;
  save();
  emit();
}

/** Whether any tip can still show: Settings says On or Off from this. */
export function useTipsOn(): boolean {
  return useSyncExternalStore(subscribe, () => !off && ALL_TIPS.some((k) => !done.has(k)));
}

/** Settings → Reset tips. */
export function resetTips() {
  done = new Set();
  off = false;
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
  const snapshot = useSyncExternalStore(subscribe, () => `${loaded}:${showing}:${done.has(key) || off}`);
  const [settled, setSettled] = useState(false);
  // A beat after the moment arrives, so the tip never jumps in mid-gesture.
  useEffect(() => {
    if (!ready) { setSettled(false); return undefined; }
    const t = setTimeout(() => setSettled(true), 900);
    return () => clearTimeout(t);
  }, [ready]);
  useEffect(() => {
    if (!settled || !loaded || off || done.has(key) || showing || shownThisVisit) return;
    showing = key;
    shownThisVisit = true;
    emit();
  }, [settled, key, snapshot]);
  useEffect(() => () => { if (showing === key) { showing = null; emit(); } }, [key]);
  return { shown: showing === key && !done.has(key) && !off, close: () => learned(key) };
}

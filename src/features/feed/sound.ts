import { useCallback, useSyncExternalStore } from 'react';

/**
 * Sound on or off, for every clip at once, the way TikTok and Reels do it:
 * mute one clip at the club and the next one stays quiet too, until you
 * turn the sound back on. It lasts for the session, not forever.
 */
let muted = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const read = () => muted;

export function setSoundMuted(next: boolean | ((current: boolean) => boolean)) {
  const value = typeof next === 'function' ? next(muted) : next;
  if (value === muted) return;
  muted = value;
  listeners.forEach((listener) => listener());
}

/** [muted, setMuted], shared by every video player in the app. */
export function useSoundMuted(): [boolean, (next: boolean | ((current: boolean) => boolean)) => void] {
  const value = useSyncExternalStore(subscribe, read, read);
  const set = useCallback((next: boolean | ((current: boolean) => boolean)) => setSoundMuted(next), []);
  return [value, set];
}

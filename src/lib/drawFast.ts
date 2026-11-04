import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { useTapFast } from '@/features/navigation/pressV2';

/**
 * Gradients drawn by iOS itself instead of by hand (Nov 4, owner: "There's still way too much latency delay").
 *
 * A page's colour wash (Wash: two soft glows and a fade, an SVG) was painted pixel by pixel on the phone's main
 * thread every time a page opened, about 1,200 by 1,000 pixels, before the page could start to slide in. React
 * Native's own gradients (a style's backgroundImage) are layers iOS's compositor draws, off the main thread, and
 * never repainted by hand, so the slide starts sooner. Same shapes, same colours: checked side by side in the
 * Simulator in every court, light and dark (speed-numbers.txt), to within 2 shades in 255, which the eye cannot see.
 *
 * iOS only (the website and Android keep the SVG, which is already cheap there), behind taps answering sooner
 * (TAP_FAST, admins first). The simulator's proof can force it either way ("drawfast on=0|1"), so one build is
 * photographed both ways.
 */
let forced: boolean | null = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const read = () => forced;

/** The simulator's proof only: on, off, or back to TAP_FAST (null). */
export function forceDrawFast(on: boolean | null) {
  if (forced === on) return;
  forced = on;
  listeners.forEach((fn) => fn());
}

/** Whether this draw's gradients are iOS's own layers rather than painted by hand. */
export function useDrawFast(): boolean {
  const tapFast = useTapFast();
  const f = useSyncExternalStore(subscribe, read, read);
  if (Platform.OS !== 'ios') return false;
  return f ?? tapFast;
}

/** '#rrggbb' (or '#rgb') as 'rgba(r, g, b, a)'; null for anything else (that gradient keeps its hand-drawn form). */
export function rgbaOf(color: string, alpha: number): string | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${+alpha.toFixed(4)})`;
}

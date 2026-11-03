import { Platform } from 'react-native';

import { adminNow } from '@/features/navigation/pressV2';
import { SIM_DRIVER, simLog } from '@/lib/simDriver';

/**
 * Opening the full map, smoother (Nov 3, owner: "See if we can improve opening map even more").
 *
 * What the simulator showed (Release build, real taps, Nov 3): the slide itself is smooth, but all the time the full map is
 * up, the Community page under it keeps its endless animations going (the breathing halos round the Open to hit faces,
 * OpenRing). On the iPhone every frame of those is a full redraw of the app's view tree on the main thread (Reanimated
 * hands each frame to React Native's tree; react-native-reanimated 4.5 with its IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS flag
 * off, which only a new native build could change), about a quarter of the main thread on Community at rest, and it
 * carries on unseen under the map. That work competes with the map's own start (its web view's first drawing, the
 * streets, the pins' wave).
 *
 * With this on: once the full map's slide has landed (nothing of Community can be seen then), those animations under it
 * stop; they start again the moment the map begins to leave (Back, or the edge swipe starting), before any of Community
 * shows again. Nothing on screen changes: what stops is hidden, and the map itself is untouched. The website (its
 * animations are the browser's own) and Android are unchanged.
 *
 * Admins (@oatmealandsilk, @mrdinosaur62) first: turned on for everyone by setting this to true and shipping an
 * over-the-air update. No database change, no new native code.
 */
export const MAP_OPEN_V2_FOR_EVERYONE = false;

/** The simulator's proof only ("mapv2 on=1|0|auto"): the same build both ways, to compare. */
let simSays: boolean | null = null;
export function setMapOpenV2Sim(on: boolean | null) {
  if (!SIM_DRIVER) return;
  simSays = on;
  simLog(`[map-open] v2 ${on === null ? 'auto' : on ? 'on' : 'off'}`);
}

export function mapOpenV2On(): boolean {
  if (Platform.OS !== 'ios') return false;
  return simSays ?? (MAP_OPEN_V2_FOR_EVERYONE || adminNow());
}

/**
 * Whether the full map covers the pages under it now: its slide has landed and it has not begun to leave. Only ever true
 * with MAP_OPEN_V2 on. Listeners are told each time it changes (no React redraw: OpenRing stops or starts its own beat).
 */
let covering = false;
const listeners = new Set<() => void>();
export const mapCovering = () => covering;
export function onMapCovering(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function setMapCovering(on: boolean) {
  const next = on && mapOpenV2On();
  if (next === covering) return;
  covering = next;
  if (SIM_DRIVER) simLog(`[map-open] covering ${next ? 'on' : 'off'}`);
  listeners.forEach((fn) => fn());
}

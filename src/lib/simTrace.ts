import { useLayoutEffect } from 'react';

import { SIM_DRIVER, simLog } from '@/lib/simDriver';

/*
 * The simulator's proof only (Nov 3 stutter work; nothing at all in a store build, an over-the-air
 * update or the website, where SIM_DRIVER is false): what redraws, and when the app's own thread
 * is stuck, filed in sim-log.txt next to the [tap-timing] lines so a hold in a screen recording
 * can be lined up with what drew in it.
 *   [render] NAME           a screen's body ran (a redraw began)
 *   [commit] NAME +N        that redraw reached the screen, N ms after it began
 *   [js-gap] N              the app's own thread drew no frame for N ms (>= 30), logged as it ends
 */
export function useSimTrace(name: string) {
  const began = SIM_DRIVER ? Date.now() : 0;
  if (SIM_DRIVER) simLog(`[render] ${name}`);
  useLayoutEffect(() => {
    if (SIM_DRIVER) simLog(`[commit] ${name} +${Date.now() - began}`);
  });
}

let watching = false;
/** Starts the [js-gap] watch (SIM_DRIVER only). */
export function startJsGapWatch() {
  if (!SIM_DRIVER || watching || typeof requestAnimationFrame === 'undefined') return;
  watching = true;
  let last = Date.now();
  const frame = () => {
    const now = Date.now();
    if (now - last >= 30) simLog(`[js-gap] ${now - last} from ${last}`);
    last = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

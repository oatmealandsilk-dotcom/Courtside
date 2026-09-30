import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

/** How often the phone asks Expo for newer app code while it is open. */
const CHECK_EVERY_MS = 10 * 60_000;
/** Away at least this long, and a waiting update is put on as the app comes back. */
const AWAY_MS = 30_000;

/**
 * Instant updates. The build asks for newer code each time it opens (see
 * app.config.js); this also asks while the app is open, and downloads what it
 * finds quietly. The new code goes on when the person comes back to the app
 * after a while, the moment a relaunch would have looked the same, never
 * while they are in the middle of something.
 */
export function useInstantUpdates() {
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    let lastCheck = 0;
    let waiting = false;
    let leftAt = 0;
    const check = async () => {
      if (waiting || Date.now() - lastCheck < CHECK_EVERY_MS) return;
      lastCheck = Date.now();
      try {
        const found = await Updates.checkForUpdateAsync();
        if (found.isAvailable) waiting = (await Updates.fetchUpdateAsync()).isNew;
      } catch { /* offline, or Expo busy: the next check tries again */ }
    };
    void check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') { leftAt = Date.now(); return; }
      if (state !== 'active') return;
      if (waiting && leftAt && Date.now() - leftAt >= AWAY_MS) { void Updates.reloadAsync().catch(() => undefined); return; }
      void check();
    });
    return () => sub.remove();
  }, []);
}

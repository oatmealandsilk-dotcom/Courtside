import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Updates from 'expo-updates';

import { crashScreen, noteRestartCancelled, noteRestartForUpdate, setCrashRelease } from '@/lib/crashReporting';
import { anyUploading, quietUploading, sinceLastPost } from '@/lib/uploads';

/** How often the phone asks Expo for newer app code while it is open. */
const CHECK_EVERY_MS = 10 * 60_000;
/** Away at least this long, and a waiting update is put on as the app comes back. */
const AWAY_MS = 30_000;
/** After posting, this long with no restart: the post's landing and its "Posted" are seen. */
const QUIET_AFTER_POST_MS = 2 * 60_000;
/**
 * At launch, how long the loading screen waits to hear whether newer app
 * code exists, and, once it is coming down, how long it may take before the
 * app opens on what it already has.
 */
const LAUNCH_CHECK_MS = 2500;
const LAUNCH_DOWNLOAD_MS = 8000;
/**
 * The reload looks like the launch picture (cream, the mark and the name),
 * never the plain white screen the update library shows by default.
 */
const RELOAD_LOOK = {
  reloadScreenOptions: {
    backgroundColor: '#F8F7F2',
    image: require('../../assets/splash.png') as number,
    imageResizeMode: 'contain' as const,
    imageFullScreen: true,
    fade: true,
    spinner: { enabled: false },
  },
};
const launchLive = !__DEV__ && Platform.OS !== 'web' && Updates.isEnabled;
/** Only the first loading screen of a run waits; later ones (a sign-in, a switch of account) never do. */
let launchDecided = !launchLive;
/** When this run of the app started: the caps count from here, so the wait never adds up past them. */
const launchedAt = Date.now();

/**
 * Pages where someone is in the middle of writing or making something a
 * restart would throw away. Sign-in and setup are on it too: a restart while
 * the Google sheet was open threw away a new player's sign-in, and they had
 * to start again from the welcome page (Oct 1).
 */
const BUSY_PAGES = ['/sign-in', '/birthday', '/agree', '/onboarding', '/first-move', '/compose', '/ask', '/hit', '/edit-post', '/edit-profile', '/log-session', '/pick-session', '/court-report', '/court-now', '/hit-request/new', '/comments', '/ask-coach', '/coach-apply', '/pick-location'];

/**
 * Whether a restart now would throw something away: a post or Instant still
 * going up (it lives only in this run of the app, so a restart loses it
 * without a word), one posted a moment ago, or a page with something being
 * written on it (the Create box, a message, a comment).
 */
function busy(): boolean {
  const page = crashScreen();
  return anyUploading() || quietUploading() || sinceLastPost() < QUIET_AFTER_POST_MS || BUSY_PAGES.includes(page) || page.startsWith('/messages/');
}

/**
 * Updates on opening. The phone asks Expo for newer code each time the app
 * opens (app.config.js). It used to open straight away on the code it had and
 * keep the new code for later, and later often never came: people who leave
 * the app for a minute and come back, or who are always mid-message, ran an
 * old version for hours (Oct 2: William's phone was four updates behind).
 * Now the loading screen waits while that check is out (2.5 s at most) and,
 * if new code is coming down, for the download (8 s at most), then opens
 * the new version straight away. No update, no wait beyond the check.
 */
export function useLaunchUpdate(): { holding: boolean; downloading: boolean } {
  const state = launchLive ? Updates.useUpdates() : null;
  const [over, setOver] = useState(launchDecided);
  const downloading = !!state && state.isDownloading;
  const pending = !!state && state.isUpdatePending;
  const asking = !!state && (state.isStartupProcedureRunning || state.isChecking || downloading);
  useEffect(() => {
    if (over) return undefined;
    const cap = downloading ? LAUNCH_DOWNLOAD_MS : LAUNCH_CHECK_MS;
    const timer = setTimeout(() => { launchDecided = true; setOver(true); }, Math.max(0, cap - (Date.now() - launchedAt)));
    return () => clearTimeout(timer);
  }, [over, downloading]);
  useEffect(() => {
    if (over || !pending) return;
    launchDecided = true;
    void noteRestartForUpdate()
      .then(() => Updates.reloadAsync(RELOAD_LOOK))
      .catch(() => { noteRestartCancelled(); setOver(true); });
  }, [over, pending]);
  // Nothing new and nothing out asking: the wait ends now, not at the cap.
  useEffect(() => {
    if (!over && state && !asking && !pending) { launchDecided = true; setOver(true); }
  }, [over, state, asking, pending]);
  return { holding: !over, downloading: !over && downloading };
}

/**
 * Instant updates. The build asks for newer code each time it opens (see
 * app.config.js); this also asks while the app is open, and downloads what it
 * finds quietly. The new code goes on when the person comes back to the app
 * after a while, the moment a relaunch would have looked the same, never
 * while they are in the middle of something: not over a post going up (people
 * often leave the app while a clip uploads, and a restart then lost the post
 * and looked exactly like a crash), not in the Create box or a message. Then
 * it simply waits: for the next time they come back, or the next launch,
 * which puts a downloaded update on by itself.
 */
export function useInstantUpdates() {
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    // Crash reports say which update they came from.
    setCrashRelease(Updates.isEmbeddedLaunch || !Updates.updateId ? 'built-in' : `update ${Updates.updateId.slice(0, 8)}`);
    let lastCheck = 0;
    let waiting = false;
    let leftAt = 0;
    let restarting = false;
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
      if (waiting && leftAt && Date.now() - leftAt >= AWAY_MS) {
        if (busy() || restarting) return;
        restarting = true;
        // Noted first, so the next open knows this was an update, not a crash.
        void noteRestartForUpdate().then(() => Updates.reloadAsync(RELOAD_LOOK)).catch(() => { restarting = false; noteRestartCancelled(); });
        return;
      }
      void check();
    });
    return () => sub.remove();
  }, []);
}

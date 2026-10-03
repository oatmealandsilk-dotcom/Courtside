import { useEffect } from 'react';
import { AppState } from 'react-native';
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
 * Pages where someone is in the middle of writing or making something a
 * restart would throw away. Sign-in and setup are on it too: a restart while
 * the Google sheet was open threw away a new player's sign-in, and they had
 * to start again from the welcome page (Oct 1).
 */
const BUSY_PAGES = ['/sign-in', '/birthday', '/agree', '/onboarding', '/first-move', '/compose', '/ask', '/hit', '/edit-post', '/edit-profile', '/log-session', '/pick-session', '/court-report', '/court-now', '/hit-request/new', '/comments', '/session-stats', '/who-played', '/health-share', '/ask-coach', '/coach-apply', '/pick-location'];

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
  // OFF (Oct 2, ~3pm): switching to the new version on the loading screen crashed
  // the app about a second after opening on iPhone (William's phone). Until it has
  // been tried on a real iPhone, a new version goes on the next time the app is
  // fully closed and opened again, or after a while away (useInstantUpdates).
  return { holding: false, downloading: false };
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
        void noteRestartForUpdate().then(() => Updates.reloadAsync()).catch(() => { restarting = false; noteRestartCancelled(); });
        return;
      }
      void check();
    });
    return () => sub.remove();
  }, []);
}

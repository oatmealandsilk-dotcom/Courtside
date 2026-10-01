import { useEffect } from 'react';
import { isDesktopBrowser } from '@/lib/browserDevice';

/**
 * A browser tab you have switched away from keeps playing: the clip carries
 * on, out of sight, and all you hear is tennis coming from somewhere on your
 * computer. Browsers do not stop it on their own.
 *
 * So everything playing is paused when the tab goes to the back, and exactly
 * those are started again when it comes to the front — not whatever happens
 * to be on screen by then, and nothing the viewer had paused themselves.
 *
 * In a phone's browser, leaving the screen in any way stops it too: the app
 * switcher, Control Centre or the notifications pulled down, the address bar
 * or a share sheet in front of the page, the page left behind. A phone tells
 * the page some of these only as "no longer in front" (blur) rather than
 * "hidden", so it listens for both. A computer keeps the gentler rule: a
 * window that is merely behind another one plays on.
 */

/** The page is away (see above): nothing may start playing until it is back. */
let away = typeof document !== 'undefined' && document.hidden;
/** Clips waiting for the page to come back: the ones it paused on the way out, and any asked to start meanwhile. */
const held = new Set<HTMLVideoElement>();

/** The page is away: a player asked to start now holds instead (holdUntilBack). */
export function pageAway() { return away; }

/**
 * A clip that should play but the page is away: it waits, and starts the
 * moment the page is back (the feed moved to your new post while you were
 * gone, say, or a clip finished loading just after you left).
 */
export function holdUntilBack(video: HTMLVideoElement) {
  video.pause();
  held.add(video);
}

/**
 * A clip the app has stopped (it is no longer the one on screen, or a page
 * now covers it) is not started again when the page comes back, whatever it
 * was doing when the page left.
 */
export function forgetHeld(video: HTMLVideoElement) {
  held.delete(video);
}

export function usePauseWhenHidden() {
  useEffect(() => {
    const phone = !isDesktopBrowser();
    away = document.hidden;
    const hold = () => {
      away = true;
      for (const video of document.querySelectorAll('video')) {
        if (!video.paused) { held.add(video); video.pause(); }
      }
    };
    const release = () => {
      if (document.hidden) return;
      away = false;
      for (const video of held) {
        // A page torn down while the tab was away has nothing to start again.
        if (video.isConnected) void video.play().catch(() => {});
      }
      held.clear();
    };
    const changed = () => { if (document.hidden) hold(); else release(); };
    // Only the window's own focus counts, never a box inside the page.
    const blurred = (e: Event) => { if (e.target === window) hold(); };
    const focused = (e: Event) => { if (e.target === window) release(); };
    document.addEventListener('visibilitychange', changed);
    if (phone) {
      window.addEventListener('blur', blurred);
      window.addEventListener('focus', focused);
      window.addEventListener('pagehide', hold);
      window.addEventListener('pageshow', release);
    }
    return () => {
      document.removeEventListener('visibilitychange', changed);
      window.removeEventListener('blur', blurred);
      window.removeEventListener('focus', focused);
      window.removeEventListener('pagehide', hold);
      window.removeEventListener('pageshow', release);
      held.clear();
      away = false;
    };
  }, []);
}

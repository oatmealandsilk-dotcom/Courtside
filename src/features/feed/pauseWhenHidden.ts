/**
 * Nothing to do here on a phone: each player stops itself the moment the app
 * leaves the front — home, lock, the app switcher, Control Centre, a call —
 * and carries on when it is back (see ClipVideo and VideoSurface). The
 * browser twin of this file is where the work is.
 */
export function usePauseWhenHidden() {}

/** Only the browser has a page that can be away; the browser players ask this. */
export function pageAway() { return false; }
export function holdUntilBack(_video: HTMLVideoElement) {}
export function forgetHeld(_video: HTMLVideoElement) {}

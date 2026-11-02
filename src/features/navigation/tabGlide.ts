/**
 * The phone's tab row's own way to set off for a tab (TabsPager registers it while it is up; a
 * browser has no row, and nothing is registered there).
 */
let glideNow: ((path: string) => boolean) | null = null;

/** TabsPager hands its way in, and takes it back when it goes. */
export function setTabGlide(fn: ((path: string) => boolean) | null) {
  glideNow = fn;
}

/** Whether `fn` is the one registered now (so an older row going never clears a newer one's). */
export const isTabGlide = (fn: (path: string) => boolean) => glideNow === fn;

/**
 * A tab tapped on the bar, with taps answering sooner (pressV2's TAP_FAST: admins first): the row
 * sets off for it in the tap itself, on the animation thread, and the router catches up behind it.
 * Before (and for everyone else), the glide waited for the app to redraw for the new address first,
 * every tab tap (Nov 2, owner: "There's also a delay on clicking buttons for them to respond.
 * Clicking should respond much faster"). The address arriving then finds the row already on its way
 * and leaves it be. Ask for the tab's section (askForCommunityMap) before this, so it is in place as
 * the tab slides in. Returns false when there is nothing to do (no row: a browser; already there).
 */
export function startTabGlide(path: string): boolean {
  return glideNow?.(path) ?? false;
}

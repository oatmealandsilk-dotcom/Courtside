import type React from 'react';
import type { GestureResponderEvent, View } from 'react-native';

/**
 * How the app moves from one court's colours to another's (Oct 21, owner:
 * "Can you fix the animation when changing theme, I don't like how it is
 * faded and does not transition smoothly"; Oct 23, his screen recording:
 * "Fix this animation"). The grey veil that used to wash over the screen is
 * gone either way.
 *
 * - 'crossfade' (B): a still of the old look fades away over the live new
 *   one, 250 ms. Nothing grey, nothing see-through.
 * - 'reveal' (A): the new court spreads out in a circle from the card you
 *   tapped until it covers the screen, the way Telegram changes its theme.
 *   Browser only for now: a phone always fades (B) until A has been built
 *   and tried on an iPhone (ThemeSwitcher.tsx says why).
 *
 * Change the one word below to pick.
 */
export type ThemeSwitchStyle = 'reveal' | 'crossfade';
// Typed as the whole choice so either word type-checks.
export const THEME_SWITCH = 'crossfade' as ThemeSwitchStyle;

/** How long the circle takes to cover the screen (A). */
export const REVEAL_MS = 420;
/** How long the old look takes to fade away (B). */
export const CROSSFADE_MS = 250;

/**
 * Phone only. The longest the tap waits for the still of the old look to be
 * on screen. Past it the change happens at once, with no animation: a slow
 * photograph never reads as a stuck tap. The card's check moves on the tap
 * itself, so the wait is never a dead screen.
 *
 * Was 150 ms, below what the same photo-then-picture steps took on his
 * iPhone before (a third to half a second, Oct 16), so most changes would
 * have skipped the fade and snapped. 350 ms, with a lighter photo (below), is
 * a guess until real times come in: each phone files its own once a session
 * (app_errors, "Theme switch timing"); set this from those.
 */
export const CAPTURE_CAP_MS = 350;
/**
 * Phone only. The still is taken at no more than 2 pixels a point (an iPhone
 * draws 3): under half the pixels to draw, encode and load, and it is on
 * screen only while the app recolours beneath it and then fades.
 */
export const PHOTO_DENSITY = 2;
/** Phone only. JPEG quality of the still. */
export const PHOTO_QUALITY = 0.8;
/** Phone only. The longest the still waits for the app to redraw beneath it before it moves anyway. */
export const LAND_CAP_MS = 900;
/** Phone only. Past the end of the move, the still is taken away even if the animation never says it finished. */
export const END_GRACE_MS = 120;

/** Where on the screen a theme change starts from, in window points. */
export type TapPoint = { x: number; y: number };

/** The point a tap landed on, when the tap says (a keyboard press does not). */
export function tapPoint(event?: GestureResponderEvent | null): TapPoint | undefined {
  const x = event?.nativeEvent?.pageX;
  const y = event?.nativeEvent?.pageY;
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y) && (x > 0 || y > 0) ? { x, y } : undefined;
}

/** The radius that covers a `width` × `height` screen from `point`: the distance to its farthest corner. */
export function coverRadius(point: TapPoint, width: number, height: number): number {
  return Math.hypot(Math.max(point.x, width - point.x), Math.max(point.y, height - point.y));
}

/** The middle of the screen: where a change with no tap behind it starts. */
export function middleOf(width: number, height: number): TapPoint {
  return { x: width / 2, y: height / 2 };
}

/** What the app gives the switcher. */
export type ThemeSwitcherProps = {
  /** The app's own box: what is photographed (a phone). */
  app: React.RefObject<View | null>;
  /**
   * The court `name` is now what is on screen, or is starting to fade in:
   * called when its picture starts to fade, or at once when it switched
   * without one. The status bar's icons follow this, not the court asked for,
   * so they never turn light over a photo of a light court (or dark over a
   * dark one).
   */
  onSettled: (name: string) => void;
};

/**
 * What the app-wide switcher does, on a phone and in a browser alike
 * (ThemeSwitcher.tsx, ThemeSwitcher.web.tsx).
 */
export type ThemeSwitcherHandle = {
  /**
   * Change over to the court `name`: `apply` recolours the app, and the
   * switcher calls it when the screen is ready for it (at once if it can't
   * animate). A second call before the first is done takes over from it.
   */
  start: (name: string, apply: () => void, from?: TapPoint) => void;
  /** The app has redrawn in the court `name` (called after every recolour). */
  landed: (name: string) => void;
};

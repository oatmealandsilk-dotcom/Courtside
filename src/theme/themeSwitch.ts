import type { GestureResponderEvent } from 'react-native';

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
 *
 * Change the one word below to pick; both work on a phone and in a browser.
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
 * photograph never reads as a stuck tap.
 */
export const CAPTURE_CAP_MS = 150;
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

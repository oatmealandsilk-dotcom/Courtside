import { colors, pageIsDark, withAlpha } from '@/theme';

/**
 * The switch's measurements and colours, shared by the phone's switch
 * (Toggle.tsx) and the browser's (Toggle.web.tsx), so the two never drift.
 * Sized like a phone's own switch.
 */
export const TOGGLE = {
  W: 50,
  H: 30,
  KNOB: 26,
  PAD: 2,
  /** How much wider the knob grows while a finger is on it, the way a phone's switch does. */
  STRETCH: 5,
} as const;

/** How far the knob travels from off to on. */
export const TRAVEL = TOGGLE.W - TOGGLE.KNOB - TOGGLE.PAD * 2;

/** The knob: white on every court, the way a phone's switch knob is, so off and on both read at a glance. */
export const KNOB_COLOR = '#FFFFFF';
export const KNOB_SHADOW = '0px 2px 4px rgba(0, 0, 0, 0.22), 0px 0px 1px rgba(0, 0, 0, 0.18)';

/**
 * Off: a quiet groove, the page's own text colour thinned right down (the
 * phone's own trick), so it sits a shade darker on a light card and a shade
 * lighter on a dark one, on any surface, in every theme.
 */
export const trackOff = () => withAlpha(colors.text, pageIsDark() ? 0.22 : 0.15);
/**
 * On: the court's own colour, or `tint` for a switch whose effect has a
 * colour of its own (Open to hit's green ring, whose switch is green too).
 */
export const trackOn = (tint?: string) => tint ?? colors.brand;

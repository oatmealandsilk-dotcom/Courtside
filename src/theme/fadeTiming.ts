/**
 * How long a theme change's fade runs: the Theme page's old look fading off
 * the new one (ThemeFade). 0 makes the change instant, with the same lag fix.
 */
export const FADE_MS = 250;

/**
 * How long the whole screen takes to cross-fade when the app changes look by itself (Match phone
 * following the phone or browser into dark mode and out: screenFade). About what an iPhone's own
 * switch takes (Oct 25, owner: "It should fade to dark mode not immediately change, what does
 * Instagram or Strava do"), on an ease-in-out, so it starts and ends softly.
 */
export const SCREEN_FADE_MS = 300;
/** That ease-in-out, as cubic-bezier control points (CSS's own ease-in-out). */
export const SCREEN_FADE_CURVE = [0.42, 0, 0.58, 1] as const;

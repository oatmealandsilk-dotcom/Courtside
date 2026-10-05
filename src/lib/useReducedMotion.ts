/**
 * Whether to tone animations down for the phone's Reduce Motion setting.
 *
 * Always no (Oct 5, owner: "all animation should look like the one on my
 * phone"). A friend with Reduce Motion on saw sheets and See stats just pop
 * up, because the app swapped its slides for fades and the animation library
 * skipped the rest. Every phone now gets the same motion; the root layout
 * also tells Reanimated never to cut its animations short
 * (ReducedMotionConfig). To honour the setting again, bring back the
 * AccessibilityInfo / prefers-reduced-motion check here.
 */
export function useReducedMotion(): boolean {
  return false;
}

/** The same answer for code outside a component (a one-off check before an animation). */
export const reduceMotionEnabled = (): Promise<boolean> => Promise.resolve(false);

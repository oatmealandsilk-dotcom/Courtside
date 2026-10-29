import type { TextStyle } from 'react-native';
import type React from 'react';
import Reanimated, { Easing, Keyframe } from 'react-native-reanimated';

/** What a layer's `entering` takes. */
type Enter = React.ComponentProps<typeof Reanimated.View>['entering'];

/*
 * How the sign-up's live card (PlayerCard's 'setup' variant, ONBOARDING_V2) lets a word change: the new one
 * comes in over SOFT_MS, the old one goes, ease-out, nothing bouncy. On a phone these are entering animations
 * on the animation thread, so each layer is drawn in its starting place from its very first frame. A browser
 * has its own twin, softLayer.web.ts (plain CSS: Reanimated 4.5's custom entering animations pin an element
 * absolute a second later there, see RailCount.web); a change here wants the same change there.
 */

export const SOFT_MS = 220;
const EASE = Easing.out(Easing.cubic);

/** How a new word comes in: rising 3pt as it fades in, only fading in (letters typed after the old ones), or growing a touch (the avatar's initials). */
export type InWay = 'rise' | 'fade' | 'grow';
/** How an old one goes: a quick fade (under a new word rising in), a fade over the whole change (letters taken away). */
export type OutWay = 'quick' | 'fade';

const IN: Record<InWay, Enter> = {
  rise: new Keyframe({
    0: { opacity: 0, transform: [{ translateY: 3 }] },
    100: { opacity: 1, transform: [{ translateY: 0 }], easing: EASE },
  }).duration(SOFT_MS),
  fade: new Keyframe({ 0: { opacity: 0 }, 100: { opacity: 1, easing: EASE } }).duration(SOFT_MS),
  grow: new Keyframe({
    0: { opacity: 0, transform: [{ scale: 0.92 }] },
    100: { opacity: 1, transform: [{ scale: 1 }], easing: EASE },
  }).duration(SOFT_MS),
};
const OUT: Record<OutWay, Enter> = {
  quick: new Keyframe({ 0: { opacity: 1 }, 100: { opacity: 0, easing: EASE } }).duration(Math.round(SOFT_MS * 0.5)),
  fade: new Keyframe({ 0: { opacity: 1 }, 100: { opacity: 0, easing: EASE } }).duration(SOFT_MS),
};

/** A layer coming in: its entering animation (a phone) or its CSS one (a browser, `style`). Nothing when `way` is null. */
export function layerIn(way: InWay | null): { entering?: Enter; style?: TextStyle } {
  return way ? { entering: IN[way] } : {};
}

/** A layer going: drawn at rest invisible (opacity 0), its animation taking it there from fully shown. */
export function layerOut(way: OutWay): { entering?: Enter; style?: TextStyle } {
  return { entering: OUT[way] };
}

/** What a layer is drawn with: on a phone the animated text and view (for `entering`). */
export const LayerText = Reanimated.Text;
export const LayerView = Reanimated.View;

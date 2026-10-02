import { createContext, useState } from 'react';
import { runOnJS, useAnimatedReaction, useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { stageDip, stageFrame, stageGeo, stageTop } from './commentStage';

/**
 * The parts that follow the comments stage, each read from the sheet's top
 * every frame on the animation thread (see stageFrame):
 *   page     — the page on the stage shrinks to sit above the sheet;
 *   black    — the black behind it, there from the tap, before anything moves;
 *   chrome   — words, buttons or a tile over it fade;
 *   rail     — the small rail beside the stage fades in, centred on it;
 *   nav      — the tab bar fades, and is cut off at the sheet's top so it
 *              never draws over the sheet (navInner keeps the bar in place
 *              inside that cut).
 * A part names the Home (`owner`) and page (`stageKey`) it belongs to, and
 * follows the stage only when the stage is theirs: another feed open over or
 * under this one, or another page, keeps its plain style throughout.
 */
export type StageRole = 'page' | 'black' | 'chrome' | 'rail' | 'nav' | 'navInner';

export function useStageMotion(role: StageRole, { owner, stageKey, enabled = true, railHeight }: {
  /** Which Home it belongs to; the stage moves it only if that Home put it there. */
  owner?: string;
  /** Which page ("p:<id>"); the stage moves it only if that page is on it. */
  stageKey?: string;
  /** Off: the plain style, whatever the stage is doing (the tab bar on any page but the comments). */
  enabled?: boolean;
  /** The small rail's own height, so it can centre itself on the stage. */
  railHeight?: SharedValue<number>;
} = {}) {
  const style = useAnimatedStyle(() => {
    const G = stageGeo.value;
    const mine = enabled && G !== null && (owner === undefined || G.owner === owner) && (stageKey === undefined || G.key === stageKey);
    const f = stageFrame(stageTop.value, mine ? G : null);
    if (role === 'page') {
      return { opacity: mine ? f.video * stageDip.value : 1, transform: [{ translateX: f.tx }, { translateY: f.ty }, { scale: f.s }] };
    }
    if (role === 'black') return { opacity: mine ? 1 : 0 };
    if (role === 'rail') {
      return { opacity: f.rail, transform: [{ translateY: f.cy - (railHeight ? railHeight.value : 0) / 2 + f.railDy }] };
    }
    if (role === 'nav') return { opacity: f.nav, transform: [{ translateY: -f.rise }] };
    if (role === 'navInner') return { transform: [{ translateY: f.rise }] };
    return { opacity: f.chrome };
  }, [role, owner, stageKey, enabled]);
  return { ref: undefined as ((node: unknown) => void) | undefined, style };
}

/**
 * How faded a page's words, buttons, mark and sound disc are (1: not at all),
 * worked out once for the page (useStagePageChrome) and handed down to all of
 * them, so only the page on the stage fades and the rest cost nothing.
 * A browser fades them its own way (useStageMotion.web) and hands down null.
 */
export const StageChromeContext = createContext<SharedValue<number> | null>(null);

export function useStagePageChrome(owner: string, stageKey: string): SharedValue<number> | null {
  return useDerivedValue(() => {
    const G = stageGeo.value;
    return G !== null && G.owner === owner && G.key === stageKey ? stageFrame(stageTop.value, G).chrome : 1;
  }, [owner, stageKey]);
}

/**
 * Whether the small rail is showing enough to be touched: it is faded out at
 * full, where it would sit over the top of the sheet, and must not catch a
 * tap meant for the stage there. Changes only as it crosses half-seen.
 */
export function useRailLive(): boolean {
  const [live, setLive] = useState(false);
  useAnimatedReaction(() => stageGeo.value !== null && stageFrame(stageTop.value, stageGeo.value).rail > 0.5, (on, was) => {
    if (on !== was) runOnJS(setLive)(on);
  });
  return live;
}

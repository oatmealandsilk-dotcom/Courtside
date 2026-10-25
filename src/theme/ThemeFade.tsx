import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { Easing, ReduceMotion, makeMutable, runOnJS, useAnimatedStyle, withTiming, type SharedValue } from 'react-native-reanimated';
import type { ThemeName } from './ThemeProvider';
import { FADE_MS } from './fadeTiming';
import { fadeEnded, fadeStarted, onEndFades } from './catchUp';

/*
 * The Theme page's change of court, as a fade (Oct 23, owner: "Idc which
 * theme change we choose. It should just be super smooth. No lag").
 *
 * On the tap the page is redrawn in the new court at once, and in that same
 * redraw a copy of each of its few coloured layers (the page, its wash, the
 * cards, the words) goes on top in the old court's colours, fully there, so
 * the first frame looks exactly as before. The copies then fade to nothing on
 * the animation thread and are taken away: the old look dissolves into the
 * new, the page's own two looks blended with no tinted veil laid over
 * them, and nothing waited for (no photograph).
 *
 * Copies only ever move their own opacity, from 1 to 0, and are gone once
 * there: they never come to rest, so Reanimated can never leave one showing
 * a stale value (see src/components/ui/restMotion.ts). Nothing under them is
 * glass. A quick second tap adds a new copy beneath the ones still fading,
 * so the look moves on from wherever it has got to.
 */

export { FADE_MS };
const FADE_EASING = Easing.out(Easing.quad);
/** More taps than this inside one fade drop the oldest copy (a small step, never a flash). */
const MAX_LAYERS = 4;

export interface FadeLayer {
  key: number;
  /** The court this copy is drawn in: the one being left. */
  theme: ThemeName;
  /** Its opacity, 1 to 0. */
  op: SharedValue<number>;
}

let seq = 0;

/**
 * A page's fading copies, newest first, as a small store: the places that
 * draw copies (FadeSpot) listen to it, so a copy leaving redraws only those
 * places, never the page around them (the last frame of the fade stays light).
 */
export interface FadeStore {
  get: () => readonly FadeLayer[];
  subscribe: (listener: () => void) => () => void;
}

const NO_LAYERS: readonly FadeLayer[] = [];
const noStore: FadeStore = { get: () => NO_LAYERS, subscribe: () => () => undefined };

/** The copies in a fade store (none without one). */
export function useFadeLayers(store: FadeStore | null | undefined): readonly FadeLayer[] {
  const s = store ?? noStore;
  return useSyncExternalStore(s.subscribe, s.get, s.get);
}

/** Draws `render(layers)` for a fade store's copies, and only this redraws as they come and go. */
export function FadeSpot({ store, render }: { store: FadeStore; render: (layers: readonly FadeLayer[]) => React.ReactNode }) {
  const layers = useFadeLayers(store);
  return <>{layers.length ? render(layers) : null}</>;
}

/*
 * The Theme page's fade, for what floats over it (the tab bar, NavBar): the
 * same copies, so the bar's old look fades with the page's instead of
 * switching on the tap (Oct 23 review: the bar went dark in one frame under a
 * still-light page). The page sets it as it opens and takes it away as it closes.
 */
let pageStore: FadeStore | null = null;
const onShowListeners = new Set<() => void>();
const tellOnShow = () => onShowListeners.forEach((listener) => listener());
/** The Theme page's `begin`, while it is open: the phone turning dark or light (Automatic dark mode) fades on it as a pick does. */
let pageBegin: ((leaving: ThemeName) => void) | null = null;
/** Starts the open Theme page's fade from `leaving`, in the caller's go; false when no Theme page is open. */
export function beginPageFade(leaving: ThemeName): boolean {
  if (!pageBegin) return false;
  pageBegin(leaving);
  return true;
}
/** The fade of the Theme page open now (no copies when none is). */
export const activeFade: FadeStore = {
  get: () => pageStore?.get() ?? NO_LAYERS,
  subscribe: (listener) => { onShowListeners.add(listener); return () => { onShowListeners.delete(listener); }; },
};

/** A page's fade: its store, and `begin(leaving)` to start a copy as a court is picked. */
export function useThemeFade() {
  const [store] = useState(() => {
    let layers: readonly FadeLayer[] = NO_LAYERS;
    const listeners = new Set<() => void>();
    const own: FadeStore & { set: (next: readonly FadeLayer[]) => void } = {
      get: () => layers,
      set: (next: readonly FadeLayer[]) => {
        layers = next;
        listeners.forEach((listener) => listener());
        if (pageStore === own) tellOnShow();
      },
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    };
    return own;
  });
  // What floats over the page fades with it (activeFade).
  useEffect(() => {
    pageStore = store;
    tellOnShow();
    return () => {
      if (pageStore !== store) return;
      pageStore = null;
      tellOnShow();
    };
  }, [store]);
  // Bumped by each new copy (with the pick, in its redraw), so the copies start fading once drawn.
  const [started, setStarted] = useState(0);
  const begun = useRef(new Set<number>());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const running = useRef(false);

  const put = useCallback((next: readonly FadeLayer[]) => {
    store.set(next);
    if (next.length && !running.current) { running.current = true; fadeStarted(); }
    if (!next.length && running.current) { running.current = false; fadeEnded(); }
  }, [store]);

  const forget = (key: number) => {
    const timer = timers.current.get(key);
    if (timer) clearTimeout(timer);
    timers.current.delete(key);
    begun.current.delete(key);
  };

  const drop = useCallback((key: number) => {
    forget(key);
    const layers = store.get();
    if (!layers.some((layer) => layer.key === key)) return;
    put(layers.filter((layer) => layer.key !== key));
  }, [store, put]);

  const dropAll = useCallback(() => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
    begun.current.clear();
    if (store.get().length) put(NO_LAYERS);
  }, [store, put]);

  const begin = useCallback((leaving: ThemeName) => {
    if (FADE_MS <= 0) return;
    const layer: FadeLayer = { key: ++seq, theme: leaving, op: makeMutable(1) };
    let next = [layer, ...store.get()];
    if (next.length > MAX_LAYERS) {
      for (const old of next.slice(MAX_LAYERS)) forget(old.key);
      next = next.slice(0, MAX_LAYERS);
    }
    put(next);
    setStarted((n) => n + 1);
  }, [store, put]);
  useEffect(() => {
    pageBegin = begin;
    return () => { if (pageBegin === begin) pageBegin = null; };
  }, [begin]);

  // Each new copy starts fading once it is drawn. Passive effects run children first, so every copy's
  // animated style is in place before its opacity moves; the fade's first frame is the old look exactly.
  useEffect(() => {
    for (const layer of store.get()) {
      if (begun.current.has(layer.key)) continue;
      begun.current.add(layer.key);
      const { key } = layer;
      layer.op.value = withTiming(0, { duration: FADE_MS, easing: FADE_EASING, reduceMotion: ReduceMotion.Never }, (finished) => {
        'worklet';
        if (finished) runOnJS(drop)(key);
      });
      // Whatever the animation reports, the copy goes.
      timers.current.set(key, setTimeout(() => drop(key), FADE_MS + 300));
    }
  }, [started, store, drop]);

  // The app leaving the screen, or the page closing: every copy goes, and the tabs are told. Only on
  // 'background': on an iPhone 'inactive' is Control Centre or Notification Centre pulled over the
  // app, which is still on screen with its fade running on; dropping the copies then was a snap.
  useEffect(() => {
    const stop = onEndFades(dropAll);
    const app = AppState.addEventListener('change', (state) => { if (state === 'background') dropAll(); });
    return () => {
      stop();
      app.remove();
      timers.current.forEach((timer) => clearTimeout(timer));
      timers.current.clear();
      if (running.current) { running.current = false; fadeEnded(); }
    };
  }, [dropAll]);

  return { store: store as FadeStore, begin };
}

/** A copy's own fade: opacity only. */
function useFadeStyle(op: SharedValue<number>) {
  return useAnimatedStyle(() => ({ opacity: op.value }));
}

/** A flat fill in the old court's colour, over the whole of its parent (a page's ground, a card's face). */
export const FadeFill = React.memo(function FadeFill({ op, color, radius, testID }: { op: SharedValue<number>; color: string; radius?: number; testID?: string }) {
  const fade = useFadeStyle(op);
  return <Animated.View pointerEvents="none" testID={testID} style={[StyleSheet.absoluteFill, { backgroundColor: color, borderRadius: radius }, fade]} />;
});

/** Anything drawn in the old court, laid over its live twin (`style` places it), fading. */
export const FadeCopy = React.memo(function FadeCopy({ op, style, testID, children }: { op: SharedValue<number>; style?: StyleProp<ViewStyle>; testID?: string; children?: React.ReactNode }) {
  const fade = useFadeStyle(op);
  return <Animated.View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" aria-hidden testID={testID} style={[style, fade]}>{children}</Animated.View>;
});

/**
 * Words in the old court's colours over the same words in the new: the same
 * styles (from the same sheet, remapped to the old court), the same lines and
 * text size limit, so each glyph lands on its live twin.
 */
export const FadeText = React.memo(function FadeText({ op, style, extra, text, numberOfLines, maxFontSizeMultiplier, fit, testID }: {
  op: SharedValue<number>;
  style: StyleProp<TextStyle>;
  extra?: StyleProp<TextStyle>;
  text: string;
  numberOfLines?: number;
  maxFontSizeMultiplier?: number;
  /** The live text shrinks to fit one line (oneLine): so does the copy, by the same rule. */
  fit?: boolean;
  testID?: string;
}) {
  return (
    <FadeCopy op={op} style={StyleSheet.absoluteFill} testID={testID}>
      <Text style={[style, extra]} numberOfLines={numberOfLines} maxFontSizeMultiplier={maxFontSizeMultiplier} adjustsFontSizeToFit={fit} minimumFontScale={fit ? 0.7 : undefined}>{text}</Text>
    </FadeCopy>
  );
});

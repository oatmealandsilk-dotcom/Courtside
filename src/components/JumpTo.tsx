import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, type ScrollView, type View } from 'react-native';
import Reanimated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { colors, radius } from '@/theme';

/** How long the page waits for things to stop moving (it opening, the thread loading) before it scrolls. */
const SETTLE_MS = 380;
/** Room left above the thing once it is scrolled to: it sits just under the header, not under its edge. */
const ABOVE = 16;

/** What a page opened at one thing hands down to that thing (see useJumpTo). */
export interface JumpTarget {
  /** The thing's own outer box, measured against the page to scroll to it. */
  ref: (node: View | null) => void;
  /** Its box moved (the thread loading around it): wait a moment more before scrolling. */
  onLayout: () => void;
  /** Changes once, as it is scrolled to: its highlight runs then. 0 until. */
  lit: number;
}

export interface JumpCtx extends JumpTarget {
  at: string;
}

const JumpContext = createContext<JumpCtx | null>(null);

/**
 * Opening a page at one thing on it (`?at=<id>`), the way a reported comment
 * opens at itself in its post's comments: Reports' cards open a reported
 * reply in its thread, a coach's reply under its question and a tip on the
 * board. Once the page has drawn and stopped moving, it scrolls so the thing
 * sits just under the header, and the thing lights up for a moment (the way
 * a chat's message does when a reply's quote is tapped).
 *
 * The page hands `scrollRef` to its Screen; `ready` holds the scroll until
 * what loads (a thread's replies) has come in. The thing itself takes
 * `target(id)` (or, deep in a list drawn by another component, reads it with
 * useJumpTarget inside <JumpProvider value={ctx}>) and draws a
 * <JumpFlash lit={…} /> inside.
 */
export function useJumpTo(at: string | undefined, ready = true) {
  const scrollRef = useRef<ScrollView | null>(null);
  const node = useRef<View | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(false);
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const [lit, setLit] = useState(0);

  const go = useCallback(() => {
    if (done.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const target = node.current;
      const scroller = scrollRef.current as (ScrollView & { getInnerViewRef?: () => unknown }) | null;
      const inner = scroller?.getInnerViewRef?.();
      if (!target || !scroller || !inner || !readyRef.current || done.current) return;
      target.measureLayout(
        inner as never,
        (_x, y) => {
          if (done.current) return;
          done.current = true;
          scroller.scrollTo({ y: Math.max(0, y - ABOVE), animated: true });
          setLit(Date.now());
        },
        () => undefined,
      );
    }, SETTLE_MS);
  }, []);
  // A new address (another `at`) is a new jump.
  useEffect(() => { done.current = false; setLit(0); }, [at]);
  useEffect(() => { if (ready && at) go(); }, [ready, at, go]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const ref = useCallback((n: View | null) => { node.current = n; if (n) go(); }, [go]);
  const target = useCallback((id: string): JumpTarget | null => (at && id === at ? { ref, onLayout: go, lit } : null), [at, ref, go, lit]);
  const ctx = useMemo<JumpCtx | null>(() => (at ? { at, ref, onLayout: go, lit } : null), [at, ref, go, lit]);
  return { scrollRef, target, ctx };
}

/** Hands a page's jump (useJumpTo's `ctx`) down to a list drawn by another component. */
export function JumpProvider({ value, children }: { value: JumpCtx | null; children: React.ReactNode }) {
  return <JumpContext.Provider value={value}>{children}</JumpContext.Provider>;
}

/** Inside a page opened with useJumpTo: whether `id` is the thing it opened at, and if so how to mark it. */
export function useJumpTarget(id: string): JumpTarget | null {
  const ctx = useContext(JumpContext);
  return ctx && ctx.at === id ? ctx : null;
}

/** The same, for a component that draws many rows: read once, then compare each row's id with `at`. */
export function useJump(): JumpCtx | null {
  return useContext(JumpContext);
}

/**
 * The moment of light on the thing a page opened at: a soft wash of the
 * court's brand colour that comes up and fades away, drawn behind it (put it
 * first inside the thing's box). The same timing as a chat's.
 */
export function JumpFlash({ lit, inset = 0, square = false }: {
  lit: number;
  /** How far it reaches past the box on the left and right. */
  inset?: number;
  /** Square corners, for a row inside a rounded list (the list's own corners round it). */
  square?: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const o = useSharedValue(0);
  useEffect(() => {
    if (!lit) return;
    o.value = withSequence(withTiming(1, { duration: 180 }), withDelay(900, withTiming(0, { duration: 700 })));
  }, [lit, o]);
  const look = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Reanimated.View pointerEvents="none" style={[styles.flash, { left: -inset, right: -inset }, square && styles.square, look]} />;
}

const styleDefinitions = StyleSheet.create({
  flash: { position: 'absolute', top: 0, bottom: 0, borderRadius: radius.md, backgroundColor: `${colors.brand}24` },
  square: { borderRadius: 0 },
});

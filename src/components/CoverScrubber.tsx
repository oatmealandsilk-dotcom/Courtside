import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, View } from 'react-native';

import { framesAt, type Frame } from '@/features/compose/frames';
import { colors, radius } from '@/theme';

const STRIP_HEIGHT = 56;
const WINDOW_W = 40;
const WINDOW_H = 64;
/** How many frames the strip shows; one step (a screen reader's, an arrow key's) is one of them. */
export const COVER_CELLS = 8;

function clock(seconds: number): string {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

/**
 * Choosing a cover by dragging, the way Instagram does it: a strip of frames
 * from the part of the clip that is kept, and a window that follows your
 * finger (or the mouse) showing the frame under it. While you drag, `onScrub`
 * gets the moment under the window so the big picture can jump there;
 * letting go calls `onSettle` with it. Works the same on iPhone and in the
 * browser. While frames load it is an empty bar.
 */
export function CoverScrubber({ uri, from, to, at, onScrub, onSettle, onStep, hideWindow = false }: {
  uri: string;
  /** The kept part of the clip, in seconds. */
  from: number;
  to: number;
  /** Where the window is now. */
  at: number;
  onScrub: (seconds: number) => void;
  onSettle: (seconds: number) => void;
  /** One frame on or back, for a screen reader's swipe up and down. */
  onStep?: (direction: 1 | -1) => void;
  /** The cover is an uploaded photo: no window until the strip is touched. */
  hideWindow?: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [width, setWidth] = useState(0);
  const span = Math.max(0, to - from);

  useEffect(() => {
    if (!uri || span <= 0) return;
    let cancelled = false;
    const times = Array.from({ length: COVER_CELLS }, (_, i) => from + (span * (i + 0.5)) / COVER_CELLS);
    framesAt(uri, times).then((got) => { if (!cancelled) setFrames(got); });
    return () => { cancelled = true; };
  }, [uri, from, span]);

  // Where the strip starts on screen, so a finger's position turns into a time.
  // Measured when it is laid out and again at every touch (the page may have moved).
  const stripRef = useRef<View>(null);
  const left = useRef(0);
  const measure = (then?: () => void) => stripRef.current?.measureInWindow((x) => { left.current = x; then?.(); });
  const latest = useRef({ from, span, width, onScrub, onSettle });
  latest.current = { from, span, width, onScrub, onSettle };
  const last = useRef(at);
  const timeAt = (pageX: number) => {
    const l = latest.current;
    const f = Math.max(0, Math.min(1, (pageX - left.current) / Math.max(1, l.width)));
    return l.from + f * l.span;
  };
  const drag = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // A sideways drag here is a scrub, never anything else.
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      const pageX = e.nativeEvent.pageX;
      const now = () => { last.current = timeAt(pageX); latest.current.onScrub(last.current); };
      now();
      measure(now);
    },
    onPanResponderMove: (e) => { last.current = timeAt(e.nativeEvent.pageX); latest.current.onScrub(last.current); },
    onPanResponderRelease: () => latest.current.onSettle(last.current),
    onPanResponderTerminate: () => latest.current.onSettle(last.current),
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const clamped = Math.max(from, Math.min(to, at));
  const px = span ? ((clamped - from) / span) * width : 0;
  const windowLeft = Math.max(0, Math.min(Math.max(0, width - WINDOW_W), px - WINDOW_W / 2));
  // The window shows the strip's frame nearest to it, so it reads as one
  // frame picked out of the row rather than a hollow box over two.
  const nearest = frames.length
    ? frames.reduce((best, f) => (Math.abs(f.time - clamped) < Math.abs(best.time - clamped) ? f : best))
    : null;
  return (
    <View
      ref={stripRef}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Cover frame"
      accessibilityValue={{ text: clock(clamped) }}
      aria-valuetext={clock(clamped)}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') onStep?.(1);
        else if (e.nativeEvent.actionName === 'decrement') onStep?.(-1);
      }}
      onLayout={(e) => { setWidth(e.nativeEvent.layout.width); measure(); }}
      style={styles.strip}
      {...drag.panHandlers}
    >
      <View pointerEvents="none" style={styles.frames}>
        {frames.map((f) => <Image key={f.time} accessibilityIgnoresInvertColors source={{ uri: f.uri }} style={styles.frame} resizeMode="cover" />)}
      </View>
      {width && span > 0 && !hideWindow ? (
        <View pointerEvents="none" style={[styles.window, { left: windowLeft }]}>
          {nearest ? <Image accessibilityIgnoresInvertColors source={{ uri: nearest.uri }} style={styles.windowFrame} resizeMode="cover" /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  strip: { height: WINDOW_H, justifyContent: 'center', cursor: 'ew-resize' as never },
  frames: { height: STRIP_HEIGHT, flexDirection: 'row', borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  frame: { flex: 1, height: '100%' },
  // White on the picture itself, whatever the theme, like the editor's own handles.
  window: { position: 'absolute', top: 0, width: WINDOW_W, height: WINDOW_H, borderRadius: 9, borderWidth: 2.5, borderColor: 'white', overflow: 'hidden', backgroundColor: colors.surfaceAlt, boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.35)' },
  windowFrame: { width: '100%', height: '100%' },
});

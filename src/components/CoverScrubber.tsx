import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, Text, View } from 'react-native';

import { framesAt, type Frame } from '@/features/compose/frames';
import { colors, radius } from '@/theme';

const STRIP_HEIGHT = 52;
const CURSOR = 30;

/**
 * Choosing a cover by dragging, the way TikTok does it: a strip of frames
 * from the part of the clip that is kept, and a bar that follows your finger
 * (or the mouse). While you drag, `onScrub` gets the moment under the bar so
 * the big preview can jump there; letting go calls `onSettle` with it.
 * Works the same on iPhone and in the browser.
 */
export function CoverScrubber({ uri, from, to, at, onScrub, onSettle }: {
  uri: string;
  /** The kept part of the clip, in seconds. */
  from: number;
  to: number;
  /** Where the bar is now. */
  at: number;
  onScrub: (seconds: number) => void;
  onSettle: (seconds: number) => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [width, setWidth] = useState(0);
  const span = Math.max(0, to - from);

  useEffect(() => {
    if (!uri || span <= 0) return;
    let cancelled = false;
    const times = Array.from({ length: 8 }, (_, i) => from + (span * (i + 0.5)) / 8);
    framesAt(uri, times).then((got) => { if (!cancelled) setFrames(got); });
    return () => { cancelled = true; };
  }, [uri, from, span]);

  // Where the strip starts on screen, so a finger's position turns into a time.
  // Measured when it is laid out and again at every touch (the page may have scrolled).
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
    // A sideways drag here is a scrub, never the page scrolling.
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

  const px = span ? ((Math.max(from, Math.min(to, at)) - from) / span) * width : 0;
  const cursorLeft = Math.max(0, Math.min(Math.max(0, width - CURSOR), px - CURSOR / 2));
  return (
    <View
      ref={stripRef}
      accessibilityRole="adjustable"
      accessibilityLabel="Cover frame. Drag along the strip to choose it."
      onLayout={(e) => { setWidth(e.nativeEvent.layout.width); measure(); }}
      style={styles.strip}
      {...drag.panHandlers}
    >
      <View pointerEvents="none" style={styles.frames}>
        {frames.map((f) => <Image key={f.time} accessibilityIgnoresInvertColors source={{ uri: f.uri }} style={styles.frame} resizeMode="cover" />)}
        {!frames.length ? <Text style={styles.reading}>Reading frames…</Text> : null}
      </View>
      {width ? <View pointerEvents="none" style={[styles.cursor, { left: cursorLeft }]} /> : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  strip: { height: STRIP_HEIGHT + 8, justifyContent: 'center', cursor: 'ew-resize' as never },
  frames: { height: STRIP_HEIGHT, flexDirection: 'row', borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  frame: { flex: 1, height: '100%' },
  reading: { fontSize: 12, color: colors.textMuted },
  cursor: { position: 'absolute', top: 0, width: CURSOR, height: STRIP_HEIGHT + 8, borderRadius: 7, borderWidth: 3, borderColor: 'white', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
});

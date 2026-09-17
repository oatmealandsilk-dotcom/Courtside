import React, { useEffect, useRef, useState, memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { ClipVideo } from './ClipVideo';
import { CourtSpinner } from './CourtSpinner';
import { cropLayer } from '@/lib/crop';
import type { MediaCrop } from '@/data/types';
import { colors } from '@/theme';
import { onSpaceBar } from '@/features/feed/keyboard';

/**
 * A clip in the feed on a phone: plays itself when it is the page on screen,
 * one tap pauses, two likes, a small disc top-right toggles the sound, and a
 * hairline along the bottom shows how far through it is.
 */
function ClipPlaybackInner({ uri, poster, active, preload = false, onDoubleTap, fit = 'cover', trimStart, trimEnd, silent = false, bare = false, discInk, discPinned = false, letterbox = false, onReady, crop }: {
  uri: string; poster?: string; active: boolean; preload?: boolean; onDoubleTap?: () => void; fit?: 'cover' | 'contain';
  trimStart?: number; trimEnd?: number;
  /** Posted without sound: plays muted and offers no way to unmute. */
  silent?: boolean;
  /** Nothing over the picture at all: no sound disc, no length line. */
  bare?: boolean;
  /** Colour of the sound icon; with it the disc wears the page colour, like the wordmark pill. */
  discInk?: string;
  /** Keep the sound disc showing instead of fading it — the very first reel, so it is found. */
  discPinned?: boolean;
  /** A landscape clip: the picture sits in a wide box mid-screen with black around; the disc and line keep to the screen's edges. */
  letterbox?: boolean;
  /** True once the first frame is in and it can play; the feed uses this to know a page is warm. */
  onReady?: (ready: boolean) => void;
  /** A zoom and shift inside the frame, chosen in the editor. */
  crop?: MediaCrop;
}) {
  const insets = useSafeAreaInsets();
  const [paused, setPaused] = useState(false);
  const [ready, setReadyState] = useState(false);
  const setReady = (ok: boolean) => { setReadyState(ok); onReady?.(ok); };
  // Sound on, the way a feed on a phone should be; a tap on the disc mutes it.
  const [muted, setMuted] = useState(silent);
  const lastTap = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { if (!active) setPaused(false); }, [active]);
  // Space bar on a computer: play / pause the clip on screen.
  useEffect(() => { if (!active) return; return onSpaceBar(() => setPaused((p) => !p)); }, [active]);
  useEffect(() => () => { if (pending.current) clearTimeout(pending.current); }, []);

  // The progress line glides between the player's reports rather than
  // stepping — each report starts a short straight run to the next one.
  const progress = useSharedValue(0);
  const onProgress = (fraction: number, _seconds: number, length: number) => {
    const step = Math.min(1, fraction + 0.2 / Math.max(0.2, length));
    progress.value = fraction < progress.value - 0.05 ? fraction : withTiming(step, { duration: 200, easing: Easing.linear });
  };
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  // The sound disc is not furniture: it eases in for a moment when the clip
  // starts, fades out quickly, and comes back the same way whenever the sound
  // is toggled. (Hearing the phone's own volume buttons or silent switch needs
  // a native module the Expo Go build cannot carry — it is on the list for
  // the App Store build.)
  const disc = useSharedValue(0);
  const discTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showDisc = () => {
    disc.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) });
    if (discTimer.current) clearTimeout(discTimer.current);
    discTimer.current = setTimeout(() => { disc.value = withTiming(0, { duration: 140 }); }, 1800);
  };
  useEffect(() => {
    if (discPinned) { disc.value = withTiming(1, { duration: 160 }); return; }
    if (active && !silent && !bare) showDisc();
    return () => { if (discTimer.current) clearTimeout(discTimer.current); };
  }, [active, silent, bare, discPinned]); // eslint-disable-line react-hooks/exhaustive-deps
  const discStyle = useAnimatedStyle(() => ({ opacity: disc.value, transform: [{ scale: 0.86 + 0.14 * disc.value }] }));

  const tap = () => {
    // One tap plays or pauses, two likes. The pause waits out the double-tap
    // window, or every like would also stop the video.
    const now = Date.now();
    if (onDoubleTap && now - lastTap.current < 280) {
      lastTap.current = 0;
      if (pending.current) { clearTimeout(pending.current); pending.current = null; }
      onDoubleTap();
      return;
    }
    lastTap.current = now;
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => { pending.current = null; setPaused((v) => !v); }, onDoubleTap ? 280 : 0);
  };

  // Pages either side stay mounted so their first frame is ready to go.
  if (!active && !preload) return <View style={StyleSheet.absoluteFill} />;
  return (
    <View style={StyleSheet.absoluteFill}>
      {letterbox ? (
        <View style={styles.wideFrame}><View style={cropLayer(crop)}>
          <ClipVideo uri={uri} poster={poster} active={active} muted={muted || silent} paused={paused} fit="contain" trimStart={trimStart} trimEnd={trimEnd} onProgress={onProgress} onReady={setReady} />
        </View></View>
      ) : (
        <View style={cropLayer(crop)}>
          <ClipVideo uri={uri} poster={poster} active={active} muted={muted || silent} paused={paused} fit={fit} trimStart={trimStart} trimEnd={trimEnd} onProgress={onProgress} onReady={setReady} />
        </View>
      )}
      {!ready && active ? <View pointerEvents="none" style={styles.centre}><CourtSpinner ink={discInk ?? 'white'} /></View> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={paused ? 'Play clip' : 'Pause clip'} onPress={tap} style={StyleSheet.absoluteFill}>
        {paused ? (
          <View style={styles.centre}>
            <View style={styles.playBadge}><Ionicons name="play" size={30} color="white" /></View>
          </View>
        ) : null}
      </Pressable>
      {silent || bare ? null : (
        <Pressable accessibilityRole="button" accessibilityLabel={muted ? 'Unmute clip' : 'Mute clip'} hitSlop={12} onPress={() => { setMuted((v) => !v); if (!discPinned) showDisc(); }} style={[styles.soundHit, { top: insets.top + (discInk ? 25 : 22) }]}>
          <Animated.View style={[styles.sound, discInk ? styles.soundThemed : null, discStyle]}>
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={17} color={discInk ?? 'white'} />
          </Animated.View>
        </Pressable>
      )}
      {bare ? null : <View pointerEvents="none" style={styles.track}>
        <Animated.View style={[styles.bar, barStyle]} />
      </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  wideFrame: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' },
  playBadge: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#0008', alignItems: 'center', justifyContent: 'center', paddingLeft: 4 },
  // Top right, level with the wordmark: out of the caption's way and never
  // behind the bottom bar. A quiet disc, not a button that shouts.
  soundHit: { position: 'absolute', right: 18, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  sound: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  // Level with the wordmark and in the same pill: the page colour, the theme's ink.
  soundThemed: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, opacity: 0.88 },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
  bar: { height: 2, backgroundColor: 'rgba(255,255,255,0.9)' },
});

/** Re-renders only when a shown value changes; the handlers passed in read fresh values through their own props, so a new function alone is no reason to rebuild. */
export const ClipPlayback = memo(ClipPlaybackInner, (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = (a as Record<string, unknown>)[k]; const y = (b as Record<string, unknown>)[k];
    if (typeof x === 'function' && typeof y === 'function') continue;
    if (x !== y) return false;
  }
  return true;
});

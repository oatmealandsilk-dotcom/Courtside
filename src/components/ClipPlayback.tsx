import React, { useContext, useEffect, useRef, useState, memo } from 'react';
import { useSoundMuted } from '@/features/feed/sound';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as haptics from '@/lib/haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassFill, liquidGlass } from '@/components/ui/Glass';
import { LinearGradient } from 'expo-linear-gradient';

import { ClipVideo } from './ClipVideo';
import { CourtSpinner } from './CourtSpinner';
import { TOP_SHADE } from './ReelCaption';
import { cropLayer } from '@/lib/crop';
import type { MediaCrop } from '@/data/types';
import { colors, font } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { onSpaceBar } from '@/features/feed/keyboard';
import { STAGE_ON_ANDROID } from '@/features/feed/commentStage';
import { StageChromeContext } from '@/features/feed/useStageMotion';
import { TopBandContext } from '@/features/feed/topBand';

/**
 * A clip in the feed on a phone: plays itself when it is the page on screen,
 * one tap pauses, two likes, a small disc top-right toggles the sound, and a
 * hairline along the bottom shows how far through it is.
 */
function ClipPlaybackInner({ uri, poster, active, preload = false, onDoubleTap, fit = 'cover', trimStart, trimEnd, speed, volume, silent = false, bare = false, discInk, discPinned = false, letterbox = false, onReady, crop, held = false, onStage = false }: {
  uri: string; poster?: string; active: boolean; preload?: boolean; onDoubleTap?: () => void; fit?: 'cover' | 'contain';
  trimStart?: number; trimEnd?: number;
  /** The browser's Feed warming up out of sight (ClipPlayback.web). A phone builds its feed from the start, so it never is. */
  warmOnly?: boolean;
  /** The author's rate (1 is normal) and level (0–1), honoured at playback. */
  speed?: number; volume?: number;
  /** Posted without sound: plays muted and offers no way to unmute. */
  silent?: boolean;
  /** Nothing over the picture at all: no sound disc, no length line. */
  bare?: boolean;
  /**
   * Colour of the sound icon; with it the disc wears the page colour, like the
   * mark's tile. Only the feed passes it, and only the feed has the mark, the
   * disc and the phone's clock over the top of the picture, so it also brings
   * the light top shade that keeps them readable on a bright sky.
   */
  discInk?: string;
  /** Keep the sound disc showing instead of fading it — the very first reel, so it is found. */
  discPinned?: boolean;
  /** A landscape clip: the picture sits in a wide box mid-screen with black around; the disc and line keep to the screen's edges. */
  letterbox?: boolean;
  /**
   * True once the first frame is in and it can play; the feed uses this to
   * know a page is warm. False only when its player is freed, so a rebuilt
   * page is known to be fetching again (a stall mid-play is not reported).
   */
  onReady?: (ready: boolean) => void;
  /** A zoom and shift inside the frame, chosen in the editor. */
  crop?: MediaCrop;
  /** On the comments stage: plays on, shrunk above the sheet, although the comments page is on top. */
  held?: boolean;
  /** Its page is on the comments stage, held or not (a page opened over the comments holds it still): a pause the viewer chose stays. */
  onStage?: boolean;
}) {
  const insets = useSafeAreaInsets();
  // Under the Feed's top row the disc steps down out of its band (features/feed/topBand).
  const drop = useContext(TopBandContext);
  const styles = useThemedStyles(styleDefinitions);
  const [paused, setPaused] = useState(false);
  // Hold the right side of a clip and it plays at double speed until you let
  // go, the way Instagram's Reels do. A hold anywhere else does nothing.
  const [fast, setFast] = useState(false);
  const width = useRef(1);
  const pressX = useRef(0);
  const [ready, setReadyState] = useState(false);
  // Once a clip has been ready it counts as ready: a moment of re-buffering mid-play is not a loading disc.
  const setReady = (ok: boolean) => { setReadyState((was) => was || ok); if (ok) onReady?.(true); };
  // Its player was freed: a new one starts its fetch from nothing.
  const gone = () => { setReadyState(false); onReady?.(false); };
  // Sound on, the way a feed on a phone should be; a tap on the disc mutes it.
  // Sound is one switch for every clip; a clip posted without sound stays silent regardless.
  const [muted, setMuted] = useSoundMuted();
  const lastTap = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Swiped away or covered, a pause is forgotten; held still under a page
  // opened over the comments stage, a pause the viewer chose is kept.
  useEffect(() => { if (!active && !onStage) setPaused(false); }, [active, onStage]);
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
  // A feed disc also fades with the words as its own page goes onto the
  // comments stage, a pinned one too (worked out by the page: StagePage).
  const pageChrome = useContext(StageChromeContext);
  const discStyle = useAnimatedStyle(() => ({
    opacity: disc.value * (pageChrome ? pageChrome.value : 1),
    transform: [{ scale: 0.86 + 0.14 * disc.value }],
  }));
  // Android draws the feed's videos on a texture, the one surface that can
  // shrink and move smoothly onto the comments stage (a slight battery cost).
  // A plain full-screen clip (a story, a hit) keeps the lighter surface: nothing clips or scales it.
  const surfaceType = Platform.OS === 'android' ? (STAGE_ON_ANDROID && discInk ? 'textureView' as const : 'surfaceView' as const) : undefined;

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
          <ClipVideo uri={uri} poster={poster} active={active} muted={muted || silent || !active} paused={paused} fit="contain" trimStart={trimStart} trimEnd={trimEnd} speed={(speed ?? 1) * (fast ? 2 : 1)} volume={volume} onProgress={onProgress} onReady={setReady} onGone={gone} held={held} surfaceType={surfaceType} />
        </View></View>
      ) : (
        <View style={cropLayer(crop)}>
          <ClipVideo uri={uri} poster={poster} active={active} muted={muted || silent || !active} paused={paused} fit={fit} trimStart={trimStart} trimEnd={trimEnd} speed={(speed ?? 1) * (fast ? 2 : 1)} volume={volume} onProgress={onProgress} onReady={setReady} onGone={gone} held={held} surfaceType={surfaceType} />
        </View>
      )}
      {/* Over the picture, under the disc: the top shade darkens the video, never the disc. */}
      {discInk && !bare ? <LinearGradient pointerEvents="none" colors={TOP_SHADE.colors} locations={TOP_SHADE.locations} style={[styles.topShade, { height: insets.top + TOP_SHADE.below }]} /> : null}
      {!ready && active ? <View pointerEvents="none" style={styles.centre}><CourtSpinner ink={discInk ?? 'white'} /></View> : null}
      {fast ? (
        <View pointerEvents="none" style={[styles.fastWrap, { top: insets.top + drop + 24 }]}>
          <View style={styles.fastPill}><Ionicons name="play-forward" size={13} color="white" /><Text style={styles.fastText}>2×</Text></View>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={paused ? 'Play clip' : 'Pause clip'}
        accessibilityHint="Hold the right side to play at double speed"
        onPress={tap}
        onLayout={(e) => { width.current = e.nativeEvent.layout.width || 1; }}
        onPressIn={(e) => { pressX.current = e.nativeEvent.locationX; }}
        delayLongPress={250}
        onLongPress={() => { if (!paused && pressX.current > width.current * 0.66) { haptics.tap(); setFast(true); } }}
        onPressOut={() => { if (fast) setFast(false); }}
        style={StyleSheet.absoluteFill}
      >
        {paused ? (
          <View style={styles.centre}>
            <View style={styles.playBadge}><Ionicons name="play" size={30} color="white" /></View>
          </View>
        ) : null}
      </Pressable>
      {silent || bare ? null : (
        <Pressable accessibilityRole="button" accessibilityLabel={muted ? 'Unmute clip' : 'Mute clip'} hitSlop={12} onPress={() => { setMuted((v) => !v); if (!discPinned) showDisc(); }} style={[styles.soundHit, { top: insets.top + drop + (discInk ? 25 : 22) }]}>
          <Animated.View style={[styles.sound, discInk ? styles.soundThemed : null, discInk && liquidGlass ? styles.soundLiquid : null, discStyle]}>
            {discInk ? <GlassFill radius={18} tint={colors.brand} strength={0.22} /> : null}
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={17} color="white" />
          </Animated.View>
        </Pressable>
      )}
      {bare ? null : <View pointerEvents="none" style={styles.track}>
        <Animated.View style={[styles.bar, barStyle]} />
      </View>}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  fastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  fastPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)' },
  fastText: { color: 'white', fontSize: 14, ...font('700') },
  centre: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  wideFrame: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' },
  playBadge: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#0008', alignItems: 'center', justifyContent: 'center', paddingLeft: 4 },
  // Top right, level with the wordmark: out of the caption's way and never
  // behind the bottom bar. A quiet disc, not a button that shouts.
  soundHit: { position: 'absolute', right: 16, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sound: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  // Level with the mark and in the same tile: the page colour, the theme's ink.
  // The same rounded square as the mark's tile at the other corner, nearly
  // solid so its icon stays crisp, with a hairline so it holds on a white sky.
  // (Its fade-in sets its opacity, so none is set here.)
  // A small frosted dark disc with a white icon, Instagram-style, on any picture (Oct 3).
  soundThemed: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(16,18,17,0.34)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.28)', boxShadow: '0px 2px 10px rgba(0,0,0,0.18)' },
  // On iOS 26 the disc is Apple's glass (GlassFill) with a hint of the theme, so its own fill steps aside.
  soundLiquid: { backgroundColor: 'transparent', boxShadow: 'none' },
  topShade: { position: 'absolute', left: 0, right: 0, top: 0 },
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

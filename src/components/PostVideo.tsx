import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Reanimated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme';

import { ClipVideo, type ClipVideoHandle } from './ClipVideo';
import { CourtSpinner } from './CourtSpinner';
import { ZoomableMedia, type HomeRect, type ZoomableMediaHandle } from './ZoomableMedia';
import { VideoView } from 'expo-video';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { cropLayer } from '@/lib/crop';
import type { MediaCrop } from '@/data/types';
import { onSpaceBar } from '@/features/feed/keyboard';
import { allowTurning, stayUpright } from '@/lib/orientation';

const HIDE_AFTER_MS = 3000;
// A phone's browser is a phone: no hover, no click-to-play. Only a computer gets those.
const desktopWeb = Platform.OS === 'web' && isDesktopBrowser();
const SKIP_S = 5;

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * A video inside a post, the way YouTube plays one: it runs on its own, and a
 * tap brings the controls up over it instead of stopping it — pause in the
 * middle, a time line with the time along the bottom, sound, and a corner
 * button for full screen. They fade away on their own. Two taps like it.
 */
export function PostVideo({ uri, poster, active, preload = false, trimStart, trimEnd, silent = false, onDoubleTap, discInk, onReady, onSize, crop }: {
  uri: string; poster?: string; active: boolean; preload?: boolean; trimStart?: number; trimEnd?: number; silent?: boolean;
  onDoubleTap?: () => void; discInk?: string;
  onReady?: (ready: boolean) => void;
  onSize?: (width: number, height: number) => void;
  crop?: MediaCrop;
}) {
  useTheme();
  const insets = useSafeAreaInsets();
  const player = useRef<ClipVideoHandle>(null);
  // A post's video waits with its play button up; it does not start on its own.
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(silent);
  const [ready, setReady] = useState(false);
  const [full, setFull] = useState(false);
  // Full screen shows the very same player (no second download, no pause):
  // it grows out of the frame on the page and travels back into it on close.
  const rootRef = useRef<View>(null);
  const zoom = useRef<ZoomableMediaHandle>(null);
  const [home, setHome] = useState<HomeRect | undefined>(undefined);
  // Turned sideways while full screen, the picture's spot on the page no longer
  // applies: closing slides away instead of flying to where it was upright.
  const { width: winW, height: winH } = useWindowDimensions();
  const sideways = winW > winH;
  useEffect(() => { if (full && sideways) setHome(undefined); }, [full, sideways]);
  const openFull = () => {
    const node = rootRef.current;
    if (!node) { setFull(true); return; }
    node.measureInWindow((x, y, w, h) => { setHome(w > 0 && h > 0 ? { x, y, width: w, height: h, radius: 14 } : undefined); setFull(true); });
  };
  const closeFull = () => { if (zoom.current) zoom.current.close(); else setFull(false); };
  // Full screen may turn with the phone; the rest of the app stays upright.
  useEffect(() => { if (full) void allowTurning(); else void stayUpright(); }, [full]);
  useEffect(() => {
    if (!full || Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeFull(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { void stayUpright(); }, []);
  const [time, setTime] = useState({ at: 0, length: 0, fraction: 0 });
  const [shown, setShown] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (on: boolean) => {
    shownRef.current = on;
    if (on) setTime({ ...timeRef.current });
    setShown(on);
    Animated.timing(fade, { toValue: on ? 1 : 0, duration: on ? 60 : 110, useNativeDriver: true }).start();
  };
  const armHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => show(false), HIDE_AFTER_MS);
  };
  const reveal = () => { show(true); if (!paused) armHide(); };
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); if (pending.current) clearTimeout(pending.current); }, []);
  // Leaving the page stops it and puts the play button back for next time.
  useEffect(() => { if (!active) { setPaused(true); show(false); } }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  // Space bar on a computer: play / pause, with the controls shown briefly.
  useEffect(() => { if (!active || full) return; return onSpaceBar(() => togglePause()); }, [active, full]); // eslint-disable-line react-hooks/exhaustive-deps

  // YouTube's double tap: the left half skips back ten seconds, the right
  // half forward, with a little "-10 / +10" that fades.
  const [skip, setSkip] = useState<{ side: 'left' | 'right'; n: number } | null>(null);
  const skipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const width = useRef(1);
  const timeRef = useRef(time);
  timeRef.current = time;
  // The line and knob follow a shared value, so a playing video does not redraw its buttons five times a second.
  const progress = useSharedValue(0);
  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  const knobStyle = useAnimatedStyle(() => ({ left: `${progress.value * 100}%` }));
  const shownRef = useRef(false);
  const skipBy = (seconds: number, side: 'left' | 'right') => {
    const t = timeRef.current;
    const at = Math.max(0, Math.min(t.length, t.at + seconds));
    player.current?.seek((trimStart ?? 0) + at);
    setTime((cur) => ({ ...cur, at, fraction: t.length ? at / t.length : 0 }));
    setSkip((prev) => ({ side, n: (prev?.n ?? 0) + 1 }));
    if (skipTimer.current) clearTimeout(skipTimer.current);
    skipTimer.current = setTimeout(() => setSkip(null), 700);
    reveal();
  };
  const tap = (x?: number) => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      lastTap.current = 0;
      if (pending.current) { clearTimeout(pending.current); pending.current = null; }
      const side = (x ?? width.current / 2) < width.current / 2 ? 'left' : 'right';
      skipBy(side === 'left' ? -SKIP_S : SKIP_S, side);
      return;
    }
    lastTap.current = now;
    if (pending.current) clearTimeout(pending.current);
    // On a computer a click plays or pauses, as on YouTube; the buttons come from hovering.
    if (desktopWeb) { pending.current = setTimeout(() => { pending.current = null; togglePause(); }, 280); return; }
    // Waiting with just the play button up: a tap anywhere starts it, and the
    // other buttons show for a moment before fading. Otherwise a tap only
    // shows or hides the buttons.
    // Only the round button plays it; a tap on the picture shows or hides the buttons.
    pending.current = setTimeout(() => {
      pending.current = null;
      shown ? show(false) : reveal();
    }, 280);
  };
  const togglePause = () => {
    setPaused((p) => {
      const next = !p;
      if (next) { if (hideTimer.current) clearTimeout(hideTimer.current); show(true); }
      else { if (hideTimer.current) clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => show(false), 500); }
      return next;
    });
  };

  // The time line: a tap or drag along it moves the video there.
  const trackWidth = useRef(1);
  const scrubTo = (x: number) => {
    const fraction = Math.max(0, Math.min(1, x / trackWidth.current));
    player.current?.seek((trimStart ?? 0) + fraction * time.length);
    setTime((t) => ({ ...t, fraction, at: fraction * t.length }));
    reveal();
  };
  const scrub = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => scrubTo(e.nativeEvent.locationX),
    onPanResponderMove: (e) => scrubTo(e.nativeEvent.locationX),
  })).current;

  // Only the round button itself takes the tap; around it the tap reaches the picture.
  const bigButton = (
    <View style={styles.centre} pointerEvents="box-none">
      <Pressable accessibilityRole="button" accessibilityLabel={paused ? 'Play' : 'Pause'} onPress={togglePause} hitSlop={16} style={styles.big}>
        <Ionicons name={paused ? 'play' : 'pause'} size={44} color="white" style={styles.bigGlyph} />
      </Pressable>
    </View>
  );
  const controls = (
    <Animated.View pointerEvents={shown ? 'box-none' : 'none'} style={[StyleSheet.absoluteFill, { opacity: fade }]}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim]} />
      {!paused ? bigButton : null}
      <View style={styles.bottom}>
        <View style={styles.timeRow}>
          <Text style={styles.time}>{clock(time.at)} <Text style={styles.timeDim}>/ {clock(time.length)}</Text></Text>
          <View style={{ flex: 1 }} />
          <Pressable accessibilityRole="button" accessibilityLabel={muted ? 'Unmute' : 'Mute'} hitSlop={10} onPress={() => { setMuted((m) => !m); reveal(); }} style={styles.small}>
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color="white" />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={full ? 'Leave full screen' : 'Full screen'} hitSlop={10} onPress={() => (full ? closeFull() : openFull())} style={styles.small}>
            <Ionicons name={full ? 'contract' : 'expand'} size={18} color="white" />
          </Pressable>
        </View>
        <View {...scrub.panHandlers} onLayout={(e) => { trackWidth.current = Math.max(1, e.nativeEvent.layout.width); }} style={styles.trackHit}>
          <View style={styles.track}>
            <Reanimated.View style={[styles.fill, fillStyle]} />
          </View>
          <Reanimated.View style={[styles.knob, knobStyle]} />
        </View>
      </View>
    </Animated.View>
  );

  const shared = player.current?.player ?? null;
  // Hover is judged on the whole player, so crossing a button is not "leaving".
  const hovering = useRef(false);
  const hoverIn = () => { hovering.current = true; if (hideTimer.current) clearTimeout(hideTimer.current); if (!shown) show(true); };
  const hoverOut = () => { hovering.current = false; if (hideTimer.current) clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => { if (!hovering.current) show(false); }, 40); };
  return (
    <View ref={rootRef} style={StyleSheet.absoluteFill} onPointerEnter={desktopWeb ? hoverIn : undefined} onPointerLeave={desktopWeb ? hoverOut : undefined}>
      <View style={cropLayer(crop)}>
        <ClipVideo ref={player} uri={uri} poster={poster} active={active} muted={muted} paused={paused} fit="cover" trimStart={trimStart} trimEnd={trimEnd}
          onProgress={(fraction, at, length) => { progress.value = fraction; timeRef.current = { fraction, at, length }; if (shownRef.current || !timeRef.current.length || length !== time.length) setTime({ fraction, at, length }); }} onReady={(ok) => { setReady(ok); onReady?.(ok); }} onSize={onSize} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Show video controls" onPress={(e) => tap(e.nativeEvent.locationX)} onLayout={(e) => { width.current = Math.max(1, e.nativeEvent.layout.width); }} style={StyleSheet.absoluteFill} />
      {!ready && active && !paused ? <View pointerEvents="none" style={styles.centre}><CourtSpinner ink={discInk ?? 'white'} /></View> : null}
      {controls}
      {paused ? bigButton : null}
      {skip ? <View pointerEvents="none" style={[styles.skip, skip.side === 'left' ? { left: 28 } : { right: 28 }]}><Ionicons name={skip.side === 'left' ? 'play-back' : 'play-forward'} size={18} color="white" /><Text style={styles.skipText}>{skip.side === 'left' ? '−' : '+'}{SKIP_S * skip.n}s</Text></View> : null}

      {/* Full screen: the same player, the whole screen (turns with the phone),
          the same buttons — a tap brings them up, a tap puts them away. */}
      <Modal visible={full} transparent animationType="none" statusBarTranslucent supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']} onRequestClose={closeFull}>
        <View style={styles.fullRoot}>
          <ZoomableMedia ref={zoom} home={home} onDismiss={() => { setFull(false); setHome(undefined); }}>
            {shared ? (
              <View style={cropLayer(crop)}><VideoView player={shared} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} allowsPictureInPicture={false} /></View>
            ) : (
              <View style={cropLayer(crop)}><ClipVideo uri={uri} poster={poster} active={full} muted={muted} paused={paused} fit="contain" trimStart={trimStart} trimEnd={trimEnd} /></View>
            )}
            <Pressable accessibilityRole="button" accessibilityLabel="Show video controls" onPress={(e) => tap(e.nativeEvent.locationX)} style={StyleSheet.absoluteFill} />
            {controls}
            {paused ? bigButton : null}
            {skip ? <View pointerEvents="none" style={[styles.skip, skip.side === 'left' ? { left: 40 } : { right: 40 }]}><Ionicons name={skip.side === 'left' ? 'play-back' : 'play-forward'} size={18} color="white" /><Text style={styles.skipText}>{skip.side === 'left' ? '−' : '+'}{SKIP_S * skip.n}s</Text></View> : null}
          </ZoomableMedia>
          <Pressable accessibilityRole="button" accessibilityLabel="Close full screen" onPress={closeFull} style={[styles.close, { top: insets.top + 12 }]}>
            <Ionicons name="close" size={22} color="white" />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(0,0,0,0.28)' },
  centre: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  // Just the glyph, with a soft shadow so it holds on bright footage — no disc, no ring.
  big: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  bigGlyph: { textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingBottom: 6, gap: 2 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  time: { color: 'white', fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  timeDim: { color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  small: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  trackHit: { height: 24, justifyContent: 'center' },
  track: { height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  fill: { height: 3, backgroundColor: 'white' },
  knob: { position: 'absolute', top: 5, marginLeft: -7, width: 14, height: 14, borderRadius: 7, backgroundColor: 'white' },
  fullRoot: { flex: 1, backgroundColor: 'transparent' },
  skip: { position: 'absolute', top: '50%', marginTop: -22, width: 64, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  skipText: { color: 'white', fontSize: 11, fontWeight: '700', marginTop: 1 },
  close: { position: 'absolute', right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
});

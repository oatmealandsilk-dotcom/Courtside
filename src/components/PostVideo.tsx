import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClipPlayback } from './ClipPlayback';
import { ClipVideo, type ClipVideoHandle } from './ClipVideo';
import { CourtSpinner } from './CourtSpinner';
import { ZoomableMedia } from './ZoomableMedia';
import { onSpaceBar } from '@/features/feed/keyboard';

const HIDE_AFTER_MS = 2600;

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
export function PostVideo({ uri, poster, active, preload = false, trimStart, trimEnd, silent = false, onDoubleTap, discInk, onReady }: {
  uri: string; poster?: string; active: boolean; preload?: boolean; trimStart?: number; trimEnd?: number; silent?: boolean;
  onDoubleTap?: () => void; discInk?: string;
  onReady?: (ready: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const player = useRef<ClipVideoHandle>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(silent);
  const [ready, setReady] = useState(false);
  const [full, setFull] = useState(false);
  const [time, setTime] = useState({ at: 0, length: 0, fraction: 0 });
  const [shown, setShown] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (on: boolean) => {
    setShown(on);
    Animated.timing(fade, { toValue: on ? 1 : 0, duration: on ? 140 : 220, useNativeDriver: true }).start();
  };
  const armHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => show(false), HIDE_AFTER_MS);
  };
  const reveal = () => { show(true); if (!paused) armHide(); };
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); if (pending.current) clearTimeout(pending.current); }, []);
  useEffect(() => { if (!active) { setPaused(false); show(false); } }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  // Space bar on a computer: play / pause, with the controls shown briefly.
  useEffect(() => { if (!active || full) return; return onSpaceBar(() => togglePause()); }, [active, full]); // eslint-disable-line react-hooks/exhaustive-deps

  const tap = () => {
    const now = Date.now();
    if (onDoubleTap && now - lastTap.current < 280) {
      lastTap.current = 0;
      if (pending.current) { clearTimeout(pending.current); pending.current = null; }
      onDoubleTap();
      return;
    }
    lastTap.current = now;
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => { pending.current = null; shown ? show(false) : reveal(); }, onDoubleTap ? 280 : 0);
  };
  const togglePause = () => {
    setPaused((p) => { const next = !p; if (next) { if (hideTimer.current) clearTimeout(hideTimer.current); show(true); } else armHide(); return next; });
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

  const controls = (
    <Animated.View pointerEvents={shown ? 'box-none' : 'none'} style={[StyleSheet.absoluteFill, { opacity: fade }]}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim]} />
      <Pressable accessibilityRole="button" accessibilityLabel={paused ? 'Play' : 'Pause'} onPress={togglePause} style={styles.centre}>
        <View style={styles.big}><Ionicons name={paused ? 'play' : 'pause'} size={30} color="white" style={paused ? { marginLeft: 4 } : null} /></View>
      </Pressable>
      <View style={styles.bottom}>
        <View style={styles.timeRow}>
          <Text style={styles.time}>{clock(time.at)} <Text style={styles.timeDim}>/ {clock(time.length)}</Text></Text>
          <View style={{ flex: 1 }} />
          <Pressable accessibilityRole="button" accessibilityLabel={muted ? 'Unmute' : 'Mute'} hitSlop={10} onPress={() => { setMuted((m) => !m); reveal(); }} style={styles.small}>
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color="white" />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Full screen" hitSlop={10} onPress={() => setFull(true)} style={styles.small}>
            <Ionicons name="expand" size={18} color="white" />
          </Pressable>
        </View>
        <View {...scrub.panHandlers} onLayout={(e) => { trackWidth.current = Math.max(1, e.nativeEvent.layout.width); }} style={styles.trackHit}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${time.fraction * 100}%` }]} />
          </View>
          <View style={[styles.knob, { left: `${time.fraction * 100}%` }]} />
        </View>
      </View>
    </Animated.View>
  );

  return (
    <View style={StyleSheet.absoluteFill}>
      <ClipVideo ref={player} uri={uri} poster={poster} active={active && !full} muted={muted} paused={paused} fit="cover" trimStart={trimStart} trimEnd={trimEnd}
        onProgress={(fraction, at, length) => setTime({ fraction, at, length })} onReady={(ok) => { setReady(ok); onReady?.(ok); }} />
      <Pressable accessibilityRole="button" accessibilityLabel="Show video controls" onPress={tap} style={StyleSheet.absoluteFill} />
      {!ready && active ? <View pointerEvents="none" style={styles.centre}><CourtSpinner ink={discInk ?? 'white'} /></View> : null}
      {controls}

      {/* Full screen: the same picture, the whole screen, pinch to zoom, sound on. */}
      <Modal visible={full} animationType="none" statusBarTranslucent onRequestClose={() => setFull(false)}>
        <View style={styles.fullRoot}>
          <ZoomableMedia>
            <ClipPlayback uri={uri} poster={poster} active={full} trimStart={trimStart} trimEnd={trimEnd} silent={silent} fit="contain" onDoubleTap={onDoubleTap} discInk={discInk} />
          </ZoomableMedia>
          <Pressable accessibilityRole="button" accessibilityLabel="Close full screen" onPress={() => setFull(false)} style={[styles.close, { top: insets.top + 12 }]}>
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
  big: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingBottom: 6, gap: 2 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  time: { color: 'white', fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  timeDim: { color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  small: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  trackHit: { height: 24, justifyContent: 'center' },
  track: { height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  fill: { height: 3, backgroundColor: 'white' },
  knob: { position: 'absolute', top: 5, marginLeft: -7, width: 14, height: 14, borderRadius: 7, backgroundColor: 'white' },
  fullRoot: { flex: 1, backgroundColor: '#000' },
  close: { position: 'absolute', right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
});

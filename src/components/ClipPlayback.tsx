import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ClipVideo } from './ClipVideo';

/**
 * A clip in the feed on a phone: plays itself when it is the page on screen,
 * one tap pauses, two likes, and a small pill toggles the sound.
 */
export function ClipPlayback({ uri, poster, active, preload = false, onDoubleTap, fit = 'cover' }: {
  uri: string; poster?: string; active: boolean; preload?: boolean; onDoubleTap?: () => void; fit?: 'cover' | 'contain';
}) {
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const lastTap = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { if (!active) setPaused(false); }, [active]);
  useEffect(() => () => { if (pending.current) clearTimeout(pending.current); }, []);

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
      <ClipVideo uri={uri} poster={poster} active={active} muted={muted} paused={paused} fit={fit} />
      <Pressable accessibilityRole="button" accessibilityLabel={paused ? 'Play clip' : 'Pause clip'} onPress={tap} style={StyleSheet.absoluteFill}>
        {paused ? (
          <View style={styles.centre}>
            <View style={styles.playBadge}><Ionicons name="play" size={30} color="white" /></View>
          </View>
        ) : null}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={muted ? 'Unmute clip' : 'Mute clip'} onPress={() => setMuted((v) => !v)} style={styles.sound}>
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={16} color="white" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  playBadge: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#0008', alignItems: 'center', justifyContent: 'center', paddingLeft: 4 },
  // Instagram's: a small, quiet disc in the corner, not a button that shouts.
  sound: { position: 'absolute', right: 12, bottom: 12, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
});

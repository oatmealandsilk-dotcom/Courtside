import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import Ionicons from '@expo/vector-icons/Ionicons';

import { clock } from '@/features/voice/useVoiceRecorder';
import { show as showToast } from '@/lib/toast';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing } from '@/theme';

/**
 * A voice note in a chat: play and pause, a line that fills as it plays, and
 * its length. The player is only made when it is first played, so a long
 * chat full of voice notes costs nothing until one is tapped.
 */
export function VoiceNote({ url, ms, mine, sentAt }: {
  url: string; ms: number; mine: boolean;
  /** When it was sent ("9:41 AM"), for a screen reader. */
  sentAt?: string;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const [started, setStarted] = useState(false);
  const ink = mine ? colors.brandInk : colors.text;
  if (started) return <Playing url={url} ms={ms} mine={mine} onDone={() => setStarted(false)} />;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Play voice note, ${clock(ms)}${sentAt ? `, sent ${sentAt}` : ''}`} onPress={() => setStarted(true)} style={[styles.note, mine ? styles.mine : styles.theirs]}>
      <Ionicons name="play" size={20} color={ink} />
      <View style={[styles.track, mine && styles.trackMine]} />
      <Text style={[styles.time, { color: ink }]}>{clock(ms)}</Text>
    </Pressable>
  );
}

/** How long a voice note may take to start before it counts as one this phone can't play. */
const LOAD_LIMIT_MS = 10_000;

function Playing({ url, ms, mine, onDone }: { url: string; ms: number; mine: boolean; onDone: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const ink = mine ? colors.brandInk : colors.text;
  // A note this phone can't play (one recorded in a browser in a kind an
  // iPhone can't read, or one gone from the server) never loads: rather than
  // a play button that does nothing, it says so and goes back to how it was.
  const started = useRef(false);
  started.current = started.current || status.isLoaded || status.duration > 0 || status.currentTime > 0;
  const failed = /fail|error/i.test(status.playbackState ?? '') || !!(status as { error?: unknown }).error;
  const cantPlay = useRef(() => {});
  cantPlay.current = () => { showToast({ title: 'Can’t play this voice note', body: 'It may have been removed, or recorded in a way this device can’t play.', icon: 'alert-circle-outline' }); onDone(); };
  useEffect(() => {
    try { player.play(); } catch { cantPlay.current(); return undefined; }
    const timer = setTimeout(() => { if (!started.current) cantPlay.current(); }, LOAD_LIMIT_MS);
    return () => clearTimeout(timer);
  }, [player]);
  useEffect(() => { if (failed && !started.current) cantPlay.current(); }, [failed]);
  useEffect(() => { if (status.didJustFinish) onDone(); }, [status.didJustFinish]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = status.duration > 0 ? status.duration * 1000 : ms;
  const at = status.currentTime * 1000;
  const fraction = total ? Math.min(1, at / total) : 0;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={status.playing ? 'Pause voice note' : 'Play voice note'} onPress={() => (status.playing ? player.pause() : player.play())} style={[styles.note, mine ? styles.mine : styles.theirs]}>
      <Ionicons name={status.playing ? 'pause' : 'play'} size={20} color={ink} />
      <View style={[styles.track, mine && styles.trackMine]}>
        <View style={[styles.fill, mine && styles.fillMine, { width: `${fraction * 100}%` }]} />
      </View>
      <Text style={[styles.time, { color: ink }]}>{clock(status.playing || at > 0 ? at : total)}</Text>
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, minWidth: 200 },
  mine: { backgroundColor: colors.bubbleMine },
  // Theirs in their bubbles' own colour, so a voice note reads as one of their messages.
  theirs: { backgroundColor: colors.bubble },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  trackMine: { backgroundColor: `${colors.brandInk}59` },
  fill: { height: 4, backgroundColor: colors.text },
  fillMine: { backgroundColor: colors.brandInk },
  time: { fontSize: 13, ...font('600'), fontVariant: ['tabular-nums'], minWidth: 34, textAlign: 'right' },
});

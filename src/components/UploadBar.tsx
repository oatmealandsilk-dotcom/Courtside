import { useTheme } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import Reanimated, { Easing as REasing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUploads, type UploadJob } from '@/lib/uploads';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * Instagram's posting strip: slides in across the top while a post goes up,
 * a small picture of it on the left, the percentage on the right and a thin
 * line filling underneath. Turns into a tick when it lands, then lifts away.
 */
export function UploadBar() {
  useTheme();
  const insets = useSafeAreaInsets();
  const jobs = useUploads();
  const job = jobs[jobs.length - 1];
  // The strip stays mounted for the exit animation after the job is gone.
  const [shown, setShown] = useState<UploadJob | null>(null);
  const slide = useRef(new Animated.Value(-110)).current;
  const fill = useSharedValue(0);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  const pop = useRef(new Animated.Value(0)).current;

  const [displayed, setDisplayed] = useState(0);
  const target = useRef(0);
  useEffect(() => {
    if (job) {
      if (!shown) { fill.value = 0; pop.setValue(0); setDisplayed(0); Animated.spring(slide, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 8 }).start(); }
      setShown(job);
      target.current = job.state === 'uploading' ? job.fraction : 1;
      if (job.state !== 'uploading') Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 14 }).start();
    } else if (shown) {
      Animated.timing(slide, { toValue: -110, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => { if (finished) setShown(null); });
    }
  }, [job, shown, slide, fill, pop]);
  // The number eases toward the latest report and keeps creeping a touch
  // ahead of it (never past 97% until it truly lands), so it is always moving.
  useEffect(() => {
    if (!shown) return;
    const uploading = shown.state === 'uploading';
    // Thirty times a second: a slow approach toward the latest report plus a
    // creep that shrinks the higher it gets — quick out of the gate, patient
    // near the end, never standing still, never past 98% until it truly lands.
    const tick = setInterval(() => {
      setDisplayed((d) => {
        const goal = target.current;
        const cap = uploading ? Math.min(0.985, goal + 0.08) : 1;
        const creep = uploading ? 0.0035 * Math.pow(1 - d, 2.2) + 0.00015 : 0.03;
        const next = Math.min(cap, d + Math.max(0, goal - d) * 0.06 + creep);
        fill.value = withTiming(next, { duration: 60, easing: REasing.linear });
        return next < d ? d : next;
      });
    }, 33);
    return () => clearInterval(tick);
  }, [shown, fill]);

  if (!shown) return null;
  const pct = Math.round(displayed * 100);
  const title = shown.state === 'done' ? 'Posted' : shown.state === 'failed' ? 'Could not post' : `Posting… ${pct}%`;
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { top: insets.top + spacing.xs, transform: [{ translateY: slide }] }]}>
      <View style={styles.card}>
        <View style={styles.row}>
          {shown.thumb ? <Image accessibilityIgnoresInvertColors source={{ uri: shown.thumb }} style={styles.thumb} /> : <View style={[styles.thumb, styles.thumbBlank]}><Ionicons name="tennisball" size={18} color={colors.brand} /></View>}
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Text style={styles.body} numberOfLines={2}>{shown.state === 'done' ? 'It is in the feed and on your profile.' : shown.state === 'failed' ? (shown.reason ?? 'Check your connection and try again.') : shown.label}</Text>
          </View>
          {shown.state === 'uploading'
            ? <Text style={styles.pct}>{pct}%</Text>
            : <Animated.View style={{ transform: [{ scale: pop }] }}><Ionicons name={shown.state === 'done' ? 'checkmark-circle' : 'alert-circle'} size={24} color={shown.state === 'done' ? colors.brand : colors.danger} /></Animated.View>}
        </View>
        <View style={styles.track}>
          <Reanimated.View style={[styles.fill, shown.state === 'failed' && { backgroundColor: colors.danger }, fillStyle]} />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: spacing.md, zIndex: 40 },
  card: { width: '100%', maxWidth: 520, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, paddingRight: spacing.md },
  thumb: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  thumbBlank: { alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.smallStrong, color: colors.text },
  body: { ...typography.caption, color: colors.textMuted, letterSpacing: 0, marginTop: 1 },
  pct: { ...typography.smallStrong, color: colors.brand, fontVariant: ['tabular-nums'] },
  track: { height: 3, backgroundColor: colors.surfaceAlt },
  fill: { height: 3, backgroundColor: colors.brand },
});

import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { Easing as REasing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBelowBanner } from '@/features/messages/bannerSpace';
import { revealPost } from '@/features/navigation/scrollToTop';
import { goHome } from '@/lib/goBack';
import { useUploads, type UploadJob } from '@/lib/uploads';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * Instagram's posting strip: slides in across the top while a post goes up,
 * a small picture of it on the left, the percentage on the right and a thin
 * line filling underneath. Turns into a tick when it lands, then lifts away.
 */
export function UploadBar() {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const jobs = useUploads();
  const job = jobs[jobs.length - 1];
  // The strip stays mounted for the exit animation after the job is gone.
  const [shown, setShown] = useState<UploadJob | null>(null);
  // The strip's place, kept on the animation thread so a swipe never waits on the busy JS thread.
  const slide = useSharedValue(-110);
  // A message banner on the same strip: the posting strip sits just under it, never hidden behind it.
  const below = useBelowBanner(spacing.xs);
  const underBanner = useSharedValue(below);
  useEffect(() => { underBanner.value = withTiming(below, { duration: 260, easing: REasing.out(REasing.cubic) }); }, [below, underBanner]);
  // Hidden above the screen it is clear of the banner anyway, so that move fades out as it slides away.
  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateY: slide.value + underBanner.value * Math.max(0, 1 + slide.value / 110) }] }));
  const fill = useSharedValue(0);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  const pop = useRef(new Animated.Value(0)).current;

  // Swiped away: hidden for this job in this state; it returns once the post
  // lands or fails, so the end is never missed.
  const [away, setAway] = useState<string | null>(null);
  const awayKey = job ? `${job.id}:${job.state}` : null;
  const putAway = () => setAway(awayRef.current);
  const swipe = Gesture.Pan()
    .activeOffsetY(-6)
    .failOffsetX([-14, 14])
    .onUpdate((e) => { if (e.translationY < 0) slide.value = e.translationY; })
    .onEnd((e) => {
      if (e.translationY < -24 || e.velocityY < -500) {
        slide.value = withTiming(-110, { duration: 180, easing: REasing.in(REasing.cubic) }, (finished) => { if (finished) runOnJS(putAway)(); });
      } else {
        slide.value = withTiming(0, { duration: 220, easing: REasing.out(REasing.cubic) });
      }
    });
  const awayRef = useRef<string | null>(null);
  awayRef.current = awayKey;

  const hide = () => setShown(null);
  const [displayed, setDisplayed] = useState(0);
  const target = useRef(0);
  useEffect(() => {
    if (job && awayKey === away) return;
    if (job) {
      if (!shown || away) { setAway(null); }
      if (!shown || away) { fill.value = 0; pop.setValue(0); setDisplayed(0); slide.value = withTiming(0, { duration: 340, easing: REasing.out(REasing.cubic) }); }
      setShown(job);
      target.current = job.state === 'uploading' ? job.fraction : 1;
      if (job.state !== 'uploading') Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 3 }).start();
    } else if (shown) {
      slide.value = withTiming(-110, { duration: 240, easing: REasing.in(REasing.cubic) }, (finished) => { if (finished) runOnJS(hide)(); });
    }
  }, [job, shown, slide, fill, pop, away, awayKey]);
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
        return next < d ? d : next;
      });
    }, 33);
    return () => clearInterval(tick);
  }, [shown]);
  // The line follows the number. Set here rather than inside the number's own
  // update, which React may run in the middle of drawing (and twice).
  useEffect(() => { fill.value = withTiming(displayed, { duration: 60, easing: REasing.linear }); }, [displayed, fill]);

  if (!shown || (job && awayKey === away)) return null;
  const pct = Math.round(displayed * 100);
  const title = shown.state === 'done' ? 'Posted' : shown.state === 'failed' ? 'Could not post' : `Posting… ${pct}%`;
  return (
    <GestureDetector gesture={swipe}>
    <Reanimated.View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + spacing.xs }, slideStyle]}>
      <Pressable accessibilityRole={shown.state === 'done' ? 'link' : 'text'} accessibilityLabel={shown.state === 'done' ? 'See it at the top of your feed' : title} disabled={shown.state !== 'done'} onPress={() => { goHome(); revealPost(shown.id); }} style={styles.card}>
        <View style={styles.row}>
          {shown.thumb ? <Image accessibilityIgnoresInvertColors source={{ uri: shown.thumb }} style={styles.thumb} /> : <View style={[styles.thumb, styles.thumbBlank]}><Ionicons name="cloud-upload-outline" size={18} color={colors.brand} /></View>}
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Text style={styles.body} numberOfLines={2}>{shown.state === 'done' ? 'Tap to see it.' : shown.state === 'failed' ? (shown.reason ?? 'Check your connection and try again.') : shown.label}</Text>
          </View>
          {shown.state === 'uploading'
            ? <Text style={styles.pct}>{pct}%</Text>
            : <Animated.View style={{ transform: [{ scale: pop }] }}><Ionicons name={shown.state === 'done' ? 'checkmark-circle' : 'alert-circle'} size={24} color={shown.state === 'done' ? colors.brand : colors.danger} /></Animated.View>}
        </View>
        <View style={styles.track}>
          <Reanimated.View style={[styles.fill, shown.state === 'failed' && { backgroundColor: colors.danger }, fillStyle]} />
        </View>
      </Pressable>
    </Reanimated.View>
    </GestureDetector>
  );
}

const styleDefinitions = StyleSheet.create({
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

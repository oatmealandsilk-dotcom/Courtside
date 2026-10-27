import React, { useSyncExternalStore } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CheckInControl } from '@/features/players/useLocationToggle';
import { useTourOpen } from '@/features/tour/tourStore';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { TextScale, colors, font, radius, spacing, typography } from '@/theme';
import { PRESS_DIM } from '@/theme/press';

/*
 * The one-tap check-in bar (Oct 26, owner: "ok add it"). Each time the map
 * opens (the Find Players card, the full map) and you are not checked in, a
 * small quiet bar over it asks "Check in so friends can see you?". Check in
 * is the same manual check-in as the button (the yes/no question the first
 * time, then Apple's prompt, then your pin until 10pm). Not now hides it
 * for the rest of the day (this phone's date, kept on the phone). Never
 * while checked in, never during the tutorial. No motion: it is there or
 * not, so nothing ever fades a glass parent.
 */

const KEY = 'courtside-checkin-bar-not-now';
/** The day Not now was tapped (YYYY-MM-DD, this phone's date), once read. */
let notNowDay: string | null | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function readOnce() {
  if (notNowDay !== undefined) return;
  notNowDay = null;
  try {
    if (Platform.OS === 'web') { notNowDay = localStorage.getItem(KEY); return; }
    void AsyncStorage.getItem(KEY).then((v) => { if (v !== notNowDay) { notNowDay = v; emit(); } }).catch(() => {});
  } catch { /* shown again; nothing else depends on it */ }
}

function notNow() {
  notNowDay = today();
  emit();
  try {
    if (Platform.OS === 'web') localStorage.setItem(KEY, notNowDay);
    else void AsyncStorage.setItem(KEY, notNowDay).catch(() => {});
  } catch { /* hidden for this session only */ }
}

/** Whether Not now was tapped today. */
function useNotNowToday(): boolean {
  readOnce();
  return useSyncExternalStore(subscribe, () => notNowDay === today(), () => false);
}

/**
 * The bar itself, for `control` (useCheckIn). `compact`: on the Find
 * Players card (smaller words, two lines at most). Draws nothing when it
 * should not show.
 */
export function CheckInBar({ control, compact = false, style }: { control: CheckInControl; compact?: boolean; style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(styleDefinitions);
  const hidden = useNotNowToday();
  const touring = useTourOpen();
  if (control.on || hidden || touring) return null;
  return (
    <View style={[styles.bar, compact && styles.barCompact, style]} accessibilityRole="none">
      <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={2} style={[styles.ask, compact && styles.askCompact]}>Show friends where you are?</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Show friends where you are. Friends who follow you back see you ${control.span}`} accessibilityState={{ busy: control.busy }} hitSlop={6} onPress={control.press} style={({ pressed }) => [styles.yes, pressed && { opacity: PRESS_DIM }]}>
        {control.busy ? <ActivityIndicator size="small" color={colors.bg} /> : <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.yesText}>Show me</Text>}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Not now. Hide this for today" hitSlop={6} onPress={notNow} style={({ pressed }) => [styles.no, pressed && { opacity: PRESS_DIM }]}>
        <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.noText}>Not now</Text>
      </Pressable>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'stretch',
    paddingLeft: spacing.md, paddingRight: spacing.xs, paddingVertical: 6, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  barCompact: { paddingLeft: spacing.sm + 2, paddingVertical: 4, gap: 6, shadowOpacity: 0.08 },
  ask: { ...typography.smallStrong, color: colors.text, flex: 1 },
  askCompact: { ...typography.small, ...font('600'), fontSize: 12, lineHeight: 15 },
  yes: { minHeight: 30, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  yesText: { ...typography.smallStrong, color: colors.bg },
  no: { minHeight: 30, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  noText: { ...typography.smallStrong, color: colors.textMuted },
});

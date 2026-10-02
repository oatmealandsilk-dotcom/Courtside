import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { goBack } from '@/lib/goBack';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { Tappable } from '@/components/Tappable';
import { TennisBallIcon } from '@/components/TennisBallIcon';
import { BrandWash } from '@/components/ui/BrandWash';
import * as haptics from '@/lib/haptics';
import { Screen } from '@/components/ui';
import { appleHealthAvailable } from '@/features/health/appleHealth';
import { useTennisFlags } from '@/features/activity/useTennisFlags';
import { confirm } from '@/lib/confirm';
import { relativeTime } from '@/lib/format';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import type { Integration } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

/** What each source is, in a line, and how it connects. */
const ABOUT: Partial<Record<Integration['provider'], { icon: keyof typeof Ionicons.glyphMap; line: string; how: string }>> = {
  'apple-health': { icon: 'heart-outline', line: 'Sleep, HRV, resting heart rate, steps, active energy.', how: 'Reads the Health app on this phone.' },
  whoop: { icon: 'pulse-outline', line: 'Recovery, strain, HRV, resting heart rate, sleep.', how: 'Signs in to WHOOP once; then it syncs on its own.' },
  cronometer: { icon: 'nutrition-outline', line: 'Calories, protein, carbs, fat.', how: appleHealthAvailable() ? 'Through Apple Health: in Cronometer, turn on sharing with Health.' : 'Reads the export file Cronometer gives you (Settings → Data → Export).' },
  myfitnesspal: { icon: 'restaurant-outline', line: 'Calories, protein, carbs, fat.', how: appleHealthAvailable() ? 'Through Apple Health: in MyFitnessPal, Settings → Sharing & Privacy → Apple Health.' : 'Reads MyFitnessPal\'s export file (Premium → Export data).' },
};

/** The same two, once tennis sessions are switched on for them on the server (migration 58). */
const ABOUT_TENNIS: Partial<Record<Integration['provider'], { line: string; how: string }>> = {
  'apple-health': { line: 'Tennis workouts and their heart rate, plus sleep, HRV, resting heart rate, steps.', how: 'Reads the Health app on this phone. Start a Tennis workout on your Apple Watch; CourtSide picks it up when you open the app.' },
  whoop: { line: 'Tennis sessions, recovery, strain, HRV, sleep.', how: 'Sign in to WHOOP once. A tennis session it records arrives as an alert, usually within an hour.' },
};

/**
 * Where the coach's numbers come from. Three sources, each a row: what it
 * gives, whether it is connected, and one button that does the real thing —
 * Apple Health asks the phone, WHOOP opens its sign-in, Cronometer takes a file.
 */
export default function Health() {
  const styles = useThemedStyles(styleDefinitions);
  const { integrations, healthHistory, actions } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const latest = healthHistory[0];
  const connected = integrations.filter((i) => i.connected).length;
  // Tennis sessions, per source, once the server's switch for it is on. Off, this page is as it always was.
  const flags = useTennisFlags();
  const tennisOn = (provider: Integration['provider']) => (provider === 'apple-health' ? flags.apple : provider === 'whoop' ? flags.whoop : false);

  const run = async (provider: Integration['provider'], what: 'toggle' | 'sync' | 'tennis' | 'tennis-off') => {
    setBusy(provider);
    try {
      // Workouts are asked for only when this screen has said so (Apple Health's explanation, or WHOOP's own sign-in).
      if (what === 'toggle') await actions.toggleIntegration(provider, { tennis: tennisOn(provider) });
      else if (what === 'sync') await actions.syncHealth(provider);
      else if (provider === 'apple-health' || provider === 'whoop') await (what === 'tennis' ? actions.turnOnTennis(provider) : actions.turnOffTennis(provider));
    } catch (err) {
      showToast({ title: 'Could not connect', body: err instanceof Error ? err.message : 'Try again in a moment.', icon: 'alert-circle-outline' });
    } finally {
      setBusy(null);
    }
  };

  // Apple Health's own permission sheet comes next, so CourtSide says why first.
  const askApple = (what: 'toggle' | 'tennis') => confirm({
    title: 'Tennis sessions from Apple Health',
    message: 'CourtSide reads your Tennis workouts and your heart rate during them, so you can log and post them, plus sleep, HRV, resting heart rate and steps. Nothing is posted unless you choose to.',
    confirmLabel: 'Continue',
    onConfirm: () => run('apple-health', what),
  });

  // Once WHOOP's switch is on, disconnecting it also removes what it sent (the server does), so ask first.
  const disconnect = (provider: Integration['provider']) => (provider === 'whoop' && flags.whoop
    ? confirm({
      title: 'Disconnect WHOOP?',
      message: 'Its numbers and tennis sessions are removed from CourtSide. Connecting again brings back only the last week.',
      confirmLabel: 'Disconnect',
      destructive: true,
      onConfirm: () => run('whoop', 'toggle'),
    })
    : run(provider, 'toggle'));

  const stat = (label: string, value: string | null) => (
    <View style={styles.stat}><Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value ?? '—'}</Text><Text style={styles.statLabel} numberOfLines={1}>{label}</Text></View>
  );

  return (
    <Screen title="Health" compactTitle onBack={() => goBack()}>
      <Text style={styles.lead}>{connected ? 'The coach plans around these.' : 'Connect a source and the coach plans around how recovered you are.'}</Text>

      {latest ? (
        <View style={styles.today}>
          <Text style={styles.todayTitle}>Latest<Text style={styles.todayDate}> · {new Date(latest.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text></Text>
          <View style={styles.stats}>
            {stat('Recovery', latest.recovery ? `${latest.recovery}%` : null)}
            {stat('Sleep', latest.sleepHours ? `${latest.sleepHours}h` : null)}
            {stat('HRV', latest.hrvMs ? `${latest.hrvMs}` : null)}
            {stat('Resting HR', latest.restingHeartRate ? `${latest.restingHeartRate}` : null)}
          </View>
          <View style={styles.stats}>
            {stat('Calories', latest.calories ? `${latest.calories}` : null)}
            {stat('Protein', latest.proteinGrams ? `${latest.proteinGrams}g` : null)}
            {stat('Steps', latest.steps ? latest.steps.toLocaleString() : null)}
            {stat('Days', `${healthHistory.length}`)}
          </View>
        </View>
      ) : null}

      <View style={styles.list}>
        {integrations.map((i, index) => {
          const base = ABOUT[i.provider];
          if (!base) return null;
          const tennis = tennisOn(i.provider);
          const about = tennis ? { ...base, ...ABOUT_TENNIS[i.provider] } : base;
          const loading = busy === i.provider;
          const needsBuild = i.provider === 'apple-health' && Platform.OS === 'ios' && !appleHealthAvailable();
          const wrongPhone = i.provider === 'apple-health' && Platform.OS !== 'ios';
          const blocked = needsBuild || wrongPhone;
          return (
            <View key={i.provider} style={[styles.row, index > 0 && styles.rowLine]}>
              <View style={[styles.disc, i.connected && styles.discOn]}>
                <Ionicons name={about.icon} size={20} color={i.connected ? colors.brandInk : colors.text} />
              </View>
              <View style={styles.words}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{i.label}</Text>
                  {i.connected ? <View style={styles.dot} /> : null}
                </View>
                <Text style={styles.line}>{about.line}</Text>
                <Text style={styles.how}>
                  {i.connected && i.lastSyncedAt ? `Synced ${relativeTime(i.lastSyncedAt)}.` : blocked ? (wrongPhone ? 'iPhone only.' : 'Available in the App Store version of CourtSide.') : about.how}
                </Text>
                {i.connected ? (
                  <View style={styles.actions}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Sync ${i.label}`} disabled={loading} onPress={() => run(i.provider, 'sync')} style={styles.small}>
                      <Ionicons name="refresh" size={14} color={colors.text} /><Text style={styles.smallText}>{(i.provider === 'cronometer' || i.provider === 'myfitnesspal') && !appleHealthAvailable() ? 'Import again' : 'Sync now'}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Disconnect ${i.label}`} disabled={loading} onPress={() => disconnect(i.provider)} style={styles.smallGhost}>
                      <Text style={styles.smallGhostText}>Disconnect</Text>
                    </Pressable>
                  </View>
                ) : null}
                {i.connected && tennis ? (
                  i.readsWorkouts ? (
                    // On: the ball settles in its own soft disc and a tick pops onto it, so
                    // switching on reads as something happening, not a line of text swapping.
                    <Reanimated.View key="tennis-on" entering={FadeIn.duration(260)} exiting={FadeOut.duration(140)} style={styles.tennisCard}>
                      <View style={styles.tennisDisc}>
                        <Reanimated.View entering={ZoomIn.springify().damping(12).stiffness(220).delay(60)}>
                          <TennisBallIcon size={20} fill={colors.brand} seam={colors.surface} />
                        </Reanimated.View>
                        <Reanimated.View entering={ZoomIn.springify().damping(10).stiffness(260).delay(220)} style={styles.tennisTick}>
                          <Ionicons name="checkmark" size={10} color={colors.brandInk} />
                        </Reanimated.View>
                      </View>
                      <View style={styles.tennisWords}>
                        <Text style={styles.tennisTitle}>Tennis sessions on</Text>
                      </View>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Turn off tennis sessions from ${i.label}`} disabled={loading} onPress={() => { haptics.untap(); run(i.provider, 'tennis-off'); }} hitSlop={8} style={({ pressed }) => [styles.smallGhost, pressed && styles.pressedDim]}>
                        <Text style={styles.smallGhostText}>Turn off</Text>
                      </Pressable>
                    </Reanimated.View>
                  ) : blocked ? null : (
                    // Not offered where it could never work (Expo Go, or not an iPhone): the row is as it always was.
                    <Reanimated.View key="tennis-off" entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)} style={styles.actions}>
                      {/* WHOOP's own sign-in says what it shares; Apple Health is explained here first.
                          The app's own filled pill (with its soft wash) dips under the finger; while it
                          works, the pill itself says so rather than the row going quiet. */}
                      <Tappable accessibilityRole="button" accessibilityLabel={`Turn on tennis sessions from ${i.label}`} disabled={loading} scaleTo={0.96} onPress={() => { haptics.tap(); if (i.provider === 'apple-health') askApple('tennis'); else run(i.provider, 'tennis'); }} style={styles.turnOn}>
                        <BrandWash />
                        {loading ? <ActivityIndicator size="small" color={colors.brandInk} /> : <TennisBallIcon size={16} fill={colors.brandInk} seam={colors.brand} />}
                        <Text style={styles.turnOnText}>{loading ? 'Turning on…' : 'Turn on tennis sessions'}</Text>
                      </Tappable>
                    </Reanimated.View>
                  )
                ) : null}
              </View>
              {/* The tennis pill shows its own "Turning on…"; a second spinner beside it would be one too many. */}
              {loading && !(i.connected && tennis && !i.readsWorkouts) ? (
                <CourtSpinner size={26} />
              ) : i.connected || loading ? null : (
                <Pressable accessibilityRole="button" accessibilityLabel={`Connect ${i.label}`} accessibilityState={{ disabled: blocked }} disabled={blocked} onPress={() => (tennis && i.provider === 'apple-health' ? askApple('toggle') : run(i.provider, 'toggle'))} style={[styles.connect, blocked && styles.connectOff]}>
                  <Text style={[styles.connectText, blocked && styles.connectTextOff]}>{(i.provider === 'cronometer' || i.provider === 'myfitnesspal') && !appleHealthAvailable() ? 'Import' : 'Connect'}</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>

      {/* Says what the server does: WHOOP's numbers go on disconnect only once its switch is on. */}
      <Text style={styles.foot}>
        {flags.whoop
          ? 'Only you and the AI coach see these, and WHOOP’s numbers never go to the coach. Tennis sessions stay private until you post one. Disconnecting WHOOP removes what it sent; other sources stay until you delete your account.'
          : flags.apple
            ? 'Only you and the AI coach see these. Tennis sessions stay private until you post one. Disconnecting stops new numbers; what was already read stays until you delete your account.'
            : 'Only you and the coach see these. Disconnecting stops new numbers; what was already read stays until you delete your account.'}
      </Text>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  lead: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingBottom: spacing.lg },
  today: { gap: spacing.md, paddingBottom: spacing.xl },
  todayTitle: { ...typography.heading, color: colors.text },
  todayDate: { ...typography.small, color: colors.textFaint },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, gap: 2, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  statValue: { ...typography.heading, color: colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { ...typography.caption, color: colors.textMuted, letterSpacing: 0.2 },
  list: { borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.lg },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  disc: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  discOn: { backgroundColor: colors.brand },
  words: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { ...typography.bodyStrong, color: colors.text },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand },
  line: { ...typography.small, color: colors.textMuted },
  how: { ...typography.small, color: colors.textFaint, lineHeight: 18 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  small: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
  smallText: { ...typography.smallStrong, color: colors.text },
  smallGhost: { height: 32, paddingHorizontal: 8, justifyContent: 'center' },
  smallGhostText: { ...typography.smallStrong, color: colors.textMuted },
  turnOn: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.brand, overflow: 'hidden' },
  turnOnText: { ...typography.smallStrong, color: colors.brandInk },
  tennisCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm, padding: spacing.sm, paddingRight: spacing.xs, borderRadius: radius.md, backgroundColor: colors.bgElevated },
  tennisDisc: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  tennisTick: { position: 'absolute', right: -2, bottom: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.brand, borderWidth: 2, borderColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  tennisWords: { flex: 1, gap: 1 },
  tennisTitle: { ...typography.smallStrong, color: colors.text },
  pressedDim: { opacity: 0.55 },
  connect: { height: 36, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  connectOff: { backgroundColor: colors.surfaceAlt },
  connectText: { ...typography.smallStrong, color: colors.brandInk },
  connectTextOff: { color: colors.textFaint },
  foot: { ...typography.small, color: colors.textFaint, lineHeight: 18, paddingTop: spacing.lg },
});

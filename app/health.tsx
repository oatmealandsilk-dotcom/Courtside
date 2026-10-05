import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { goBack } from '@/lib/goBack';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { Tappable } from '@/components/Tappable';
import { BrandWash } from '@/components/ui/BrandWash';
import * as haptics from '@/lib/haptics';
import { Screen } from '@/components/ui';
import { appleHealthAvailable, inExpoGo } from '@/features/health/appleHealth';
import { FoodSection } from '@/features/health/FoodSection';
import { alertsAllowed } from '@/features/health/workoutWatch';
import { useTennisFlags } from '@/features/activity/useTennisFlags';
import { WORKOUTS_ASK } from '@/features/activity/workouts';
import { isTracker, useTrackerStatus } from '@/features/activity/trackers';
import { confirm } from '@/lib/confirm';
import { withCatalog } from '@/lib/integrations';
import { relativeTime, hoursAndMinutes } from '@/lib/format';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useAiCoachOn } from '@/features/aiCoach/switch';
import type { Integration } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

/** What each source is, in a line, and how it connects. */
const ABOUT: Partial<Record<Integration['provider'], { icon: keyof typeof Ionicons.glyphMap; line: string; how: string }>> = {
  'apple-health': { icon: 'heart-outline', line: 'Sleep, HRV, resting heart rate, steps, active energy.', how: 'Reads the Health app on this phone.' },
  whoop: { icon: 'pulse-outline', line: 'Recovery, strain, HRV, resting heart rate, sleep.', how: 'Signs in to WHOOP once; then it syncs on its own.' },
  // Tennis sessions only, through the server's trackers function (migration 69).
  fitbit: { icon: 'watch-outline', line: 'Tennis sessions and your heart rate during them.', how: 'Sign in to Fitbit once. Tennis you record shows up here.' },
  oura: { icon: 'ellipse-outline', line: 'Tennis workouts and your heart rate during them.', how: 'Sign in to Oura once. Tennis it records shows up here.' },
  polar: { icon: 'stopwatch-outline', line: 'Tennis sessions and their heart rate.', how: 'Sign in to Polar Flow once. Tennis you record shows up here.' },
  garmin: {
    icon: 'navigate-outline',
    line: 'Tennis activities and their heart rate.',
    how: Platform.OS === 'ios'
      ? 'In Garmin Connect: Settings → Connected Apps → Apple Health, turn on Workouts. Its tennis then comes in with Apple Watch.'
      : 'On iPhone, it comes in through Apple Health.',
  },
  cronometer: { icon: 'nutrition-outline', line: 'Calories, protein, carbs, fat.', how: appleHealthAvailable() ? 'Through Apple Health: in Cronometer, turn on sharing with Health.' : 'Reads the export file Cronometer gives you (Settings → Data → Export).' },
  myfitnesspal: { icon: 'restaurant-outline', line: 'Calories, protein, carbs, fat.', how: appleHealthAvailable() ? 'Through Apple Health: in MyFitnessPal, Settings → Sharing & Privacy → Apple Health.' : 'Reads MyFitnessPal\'s export file (Premium → Export data).' },
};

/** The name a row shows, where it differs from the source's own label. */
const NAME: Partial<Record<Integration['provider'], string>> = { 'apple-health': 'Apple Watch' };
/** The trackers list, in this order; everything else (food) goes below it. */
const TRACKER_ROWS: Integration['provider'][] = ['whoop', 'apple-health', 'fitbit', 'oura', 'polar', 'garmin'];

/** Apple Health once every workout is switched on for it on the server (migration 107; owner, Oct 5). */
const ABOUT_WORKOUTS = {
  line: 'Through Apple Health: your workouts (tennis, runs, rides, the gym and more) and their heart rate, plus sleep, HRV, resting heart rate, steps.',
  how: 'Reads the Health app on this phone. Record a workout on your Apple Watch or iPhone; CourtSide picks it up when you open the app.',
};

/** The same two, once tennis sessions are switched on for them on the server (migration 58). */
const ABOUT_TENNIS: Partial<Record<Integration['provider'], { line: string; how: string }>> = {
  'apple-health': { line: 'Through Apple Health: tennis workouts and their heart rate, plus sleep, HRV, resting heart rate, steps.', how: 'Reads the Health app on this phone. Start a Tennis workout on your Apple Watch; CourtSide picks it up when you open the app.' },
  whoop: { line: 'Tennis sessions, recovery, strain, HRV, sleep.', how: 'Sign in to WHOOP once. A tennis session it records arrives as an alert, usually within an hour.' },
};

/**
 * On an iPhone with Apple Health, the Food card above the list connects
 * Cronometer and MyFitnessPal (through Health), so their own rows would only
 * repeat it. One already connected keeps its row, so it can still be synced
 * or disconnected. Elsewhere the rows stay: they import the apps' export files.
 */
const foodCardCovers = (i: Integration) => (i.provider === 'cronometer' || i.provider === 'myfitnesspal') && !i.connected && appleHealthAvailable();

/**
 * Where the coach's numbers come from. Three sources, each a row: what it
 * gives, whether it is connected, and one button that does the real thing —
 * Apple Health asks the phone, WHOOP opens its sign-in, Cronometer takes a file.
 */
export default function Health() {
  const styles = useThemedStyles(styleDefinitions);
  const app = useApp();
  const { healthHistory, actions, currentUserId } = app;
  // Every source always has a row: the catalog, with this account's connections laid over it.
  const integrations = withCatalog(app.integrations);
  // Food apps the Food card does not already cover (see foodCardCovers).
  const foodRows = integrations.filter((i) => !TRACKER_ROWS.includes(i.provider) && ABOUT[i.provider] && !foodCardCovers(i));
  const [busy, setBusy] = useState<string | null>(null);
  // Which step is working, so the "every workout" pill can say so itself.
  const [step, setStep] = useState<string | null>(null);
  const latest = healthHistory[0];
  const connected = integrations.filter((i) => i.connected).length;
  // Tennis sessions, per source, once the server's switch for it is on. Off, this page is as it always was.
  const flags = useTennisFlags();
  // The coach is only mentioned once it is switched on: nothing here promises a feature nobody can find (App Review 2.1).
  const coachOn = useAiCoachOn() === true;
  const tennisOn = (provider: Integration['provider']) => (provider === 'apple-health' ? flags.apple || flags.workoutsApple : provider === 'whoop' || isTracker(provider) ? flags[provider] : false);
  // Apple Health can read every workout, not only tennis (migration 107): its words say so.
  const workouts = (provider: Integration['provider']) => provider === 'apple-health' && flags.workoutsApple;
  // Every workout is its own yes: someone who turned on tennis sessions only still has tennis only.
  const allOn = (i: Integration) => workouts(i.provider) && !!i.readsAllWorkouts;
  /** What turning on (or off) means for this row: "tennis sessions", or "workouts" (every workout). */
  const what = (i: Integration) => (workouts(i.provider) && (!i.readsWorkouts || i.readsAllWorkouts) ? 'workouts' : 'tennis sessions');
  // Fitbit, Oura and Polar: open once the server has their keys and their switch is on.
  const trackers = useTrackerStatus();
  const open = (provider: Integration['provider']) => !isTracker(provider) || (trackers[provider] && flags[provider]);
  const apple = integrations.find((i) => i.provider === 'apple-health');
  // The phone's own "Workout detected" alert (from build 15, features/health/workoutWatch): the card
  // says so only when it will come (this build has it, Settings' alert switch is on, and the phone allows alerts).
  const pushActivity = app.prefs.pushActivity;
  const [alertsOn, setAlertsOn] = useState(false);
  useEffect(() => {
    let stale = false;
    if (!pushActivity) setAlertsOn(false);
    else void alertsAllowed().then((ok) => { if (!stale) setAlertsOn(ok); });
    return () => { stale = true; };
  }, [pushActivity]);
  /*
   * Only what works is listed (Oct 4, owner: Apple must see nothing half-built
   * at review): a tracker the server is not set up for has no row at all,
   * where it used to show "Coming soon". One already connected keeps its row,
   * so it can still be synced or disconnected. Garmin has no sign-in of its
   * own; its tennis comes in through Apple Health's workouts, so it shows on
   * an iPhone once those are on (flag:tennis-apple), as before.
   */
  // Android (Oct 5): Apple Health lives on iPhones only, so its row shows there only once
  // connected on an iPhone, and says so (no dead Connect, no Sync that does nothing).
  const shown = (i: Integration) => (i.provider === 'garmin' ? Platform.OS === 'ios' && flags.apple
    : i.provider === 'apple-health' && Platform.OS === 'android' ? i.connected
    : i.connected || open(i.provider));
  const trackerRows = TRACKER_ROWS.map((p) => integrations.find((i) => i.provider === p)).filter((i): i is Integration => !!i && !!ABOUT[i.provider] && shown(i));
  // The footer names only the trackers listed, WHOOP first: "WHOOP, Fitbit or Polar".
  const removers = ['WHOOP', ...trackerRows.filter((i) => isTracker(i.provider)).map((i) => i.label)];
  const removersText = removers.length > 1 ? `${removers.slice(0, -1).join(', ')} or ${removers[removers.length - 1]}` : removers[0];

  const run = async (provider: Integration['provider'], what: 'toggle' | 'sync' | 'tennis' | 'tennis-off' | 'workouts') => {
    setBusy(provider);
    setStep(what);
    try {
      // Workouts are asked for only when this screen has said so (Apple Health's explanation, or WHOOP's own sign-in);
      // every workout only when what it said was "Workouts from Apple Health".
      if (what === 'toggle') await actions.toggleIntegration(provider, { tennis: tennisOn(provider), workouts: workouts(provider) });
      else if (what === 'sync') await actions.syncHealth(provider);
      else if (what === 'workouts') await actions.turnOnTennis('apple-health', { workouts: true });
      else if (provider === 'apple-health' || provider === 'whoop' || isTracker(provider)) await (what === 'tennis' ? actions.turnOnTennis(provider, { workouts: workouts(provider) }) : actions.turnOffTennis(provider));
    } catch (err) {
      showToast({ title: 'Could not connect', body: err instanceof Error ? err.message : 'Try again in a moment.', icon: 'alert-circle-outline' });
    } finally {
      setBusy(null);
      setStep(null);
    }
  };

  // Apple Health's own permission sheet comes next, so CourtSide says why first.
  // 'workouts': someone with tennis sessions on, saying yes to every workout as well.
  const askApple = (next: 'toggle' | 'tennis' | 'workouts') => confirm(flags.workoutsApple ? {
    ...WORKOUTS_ASK,
    confirmLabel: 'Continue',
    onConfirm: () => run('apple-health', next),
  } : {
    title: 'Tennis sessions from Apple Health',
    message: 'CourtSide reads your Tennis workouts and your heart rate during them, so you can log and post them, plus sleep, HRV, resting heart rate and steps. Nothing is posted unless you choose to.',
    confirmLabel: 'Continue',
    onConfirm: () => run('apple-health', next),
  });

  // Once WHOOP's switch is on, disconnecting it also removes what it sent (the server does), so ask first.
  // Fitbit, Oura and Polar always remove their tennis sessions on disconnect.
  const disconnect = (provider: Integration['provider']) => (isTracker(provider)
    ? confirm({
      title: `Disconnect ${integrations.find((i) => i.provider === provider)?.label ?? 'this tracker'}?`,
      message: 'Its tennis sessions are removed from CourtSide. Sessions you already logged stay.',
      confirmLabel: 'Disconnect',
      destructive: true,
      onConfirm: () => run(provider, 'toggle'),
    })
    : provider === 'whoop' && flags.whoop
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

  const row = (i: Integration, index: number) => {
    const base = ABOUT[i.provider];
    if (!base) return null;
    const tennis = tennisOn(i.provider);
    const about = tennis ? { ...base, ...(what(i) === 'workouts' ? ABOUT_WORKOUTS : ABOUT_TENNIS[i.provider]) } : base;
    const loading = busy === i.provider;
    const needsBuild = i.provider === 'apple-health' && Platform.OS === 'ios' && !appleHealthAvailable();
    const wrongPhone = i.provider === 'apple-health' && Platform.OS !== 'ios';
    const blocked = needsBuild || wrongPhone;
    // Garmin has no sign-in of its own: on an iPhone its workouts arrive through Apple Health.
    const garmin = i.provider === 'garmin';
    const viaHealth = garmin && Platform.OS === 'ios';
    const linked = garmin ? viaHealth && !!apple?.connected && !!apple.readsWorkouts : i.connected;
    // A tracker is connected for its tennis sessions, so "on" needs no card of its own; only "off" (its sign-in ran out) does.
    const tennisCard = i.connected && tennis && !(isTracker(i.provider) && i.readsWorkouts);
    // Tennis sessions on, every workout not yet (they agreed to tennis only): offered, never switched on for them.
    const offer = tennisCard && !!i.readsWorkouts && workouts(i.provider) && !i.readsAllWorkouts && !blocked;
    const offerBusy = loading && step === 'workouts';
    return (
      <View key={i.provider} style={[styles.row, index > 0 && styles.rowLine]}>
        <View style={[styles.disc, linked && styles.discOn]}>
          <Ionicons name={about.icon} size={20} color={linked ? colors.brandInk : colors.text} />
        </View>
        <View style={styles.words}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{NAME[i.provider] ?? i.label}</Text>
            {linked ? <View style={styles.dot} /> : null}
          </View>
          <Text style={styles.line}>{about.line}</Text>
          <Text style={styles.how}>
            {wrongPhone && i.connected && Platform.OS === 'android' ? 'Connected on your iPhone. It syncs from there.'
              : i.connected && i.lastSyncedAt ? `Synced ${relativeTime(i.lastSyncedAt)}.` : blocked ? (wrongPhone ? 'iPhone only.' : inExpoGo() ? 'Available in the App Store version of CourtSide.' : 'Coming in the next app update.') : about.how}
          </Text>
          {i.connected ? (
            <View style={styles.actions}>
              {/* Android cannot read Apple Health: syncing it is the iPhone's job. */}
              {wrongPhone && Platform.OS === 'android' ? null : (
                <Pressable accessibilityRole="button" accessibilityLabel={`Sync ${i.label}`} disabled={loading} onPress={() => run(i.provider, 'sync')} style={styles.small}>
                  <Ionicons name="refresh" size={14} color={colors.text} /><Text style={styles.smallText}>{(i.provider === 'cronometer' || i.provider === 'myfitnesspal') && !appleHealthAvailable() ? 'Import again' : 'Sync now'}</Text>
                </Pressable>
              )}
              <Pressable accessibilityRole="button" accessibilityLabel={`Disconnect ${i.label}`} disabled={loading} onPress={() => disconnect(i.provider)} style={styles.smallGhost}>
                <Text style={styles.smallGhostText}>Disconnect</Text>
              </Pressable>
            </View>
          ) : null}
          {tennisCard ? (
            i.readsWorkouts ? (
              <>
                {/* On: a plain tick in the brand colour springs in, the way iPhone's own
                    Settings confirms a choice, so switching on reads as something happening
                    (no cartoon ball: William found it childish). */}
                <Reanimated.View key="tennis-on" entering={FadeIn.duration(260)} exiting={FadeOut.duration(140)} style={styles.tennisCard}>
                  <Reanimated.View entering={ZoomIn.springify().damping(12).stiffness(240).delay(60)} style={styles.tennisTick}>
                    <Ionicons name="checkmark" size={14} color={colors.brandInk} />
                  </Reanimated.View>
                  <View style={styles.tennisWords}>
                    <Text style={styles.tennisTitle}>{allOn(i) ? 'Workouts on' : 'Tennis sessions on'}</Text>
                    {i.provider === 'apple-health' && alertsOn && (allOn(i) || flags.apple) ? (
                      <Text style={styles.line}>{allOn(i) ? 'You’ll get a notification after each workout.' : 'You’ll get a notification after each tennis session.'}</Text>
                    ) : null}
                    {/* The last 30 days of them, with Log it on any not logged (Oct 5). */}
                    {allOn(i) ? (
                      <Text accessibilityRole="link" onPress={() => router.push('/workouts')} style={styles.pastLink}>See past workouts</Text>
                    ) : null}
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Turn off ${what(i)} from ${i.label}`} disabled={loading} onPress={() => { haptics.untap(); run(i.provider, 'tennis-off'); }} hitSlop={8} style={({ pressed }) => [styles.smallGhost, pressed && styles.pressedDim]}>
                    <Text style={styles.smallGhostText}>Turn off</Text>
                  </Pressable>
                </Reanimated.View>
                {offer ? (
                  // Every other workout too: their own yes, after the same explanation anyone new gets.
                  <Reanimated.View key="workouts-offer" entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)} style={styles.offer}>
                    <Text style={styles.offerText}>Also pick up runs, rides and the gym?</Text>
                    <Tappable accessibilityRole="button" accessibilityLabel={`Turn on every workout from ${i.label}: runs, rides, the gym and more`} disabled={loading} scaleTo={0.96} onPress={() => { haptics.tap(); askApple('workouts'); }} style={styles.turnOn}>
                      <BrandWash />
                      {offerBusy ? <ActivityIndicator size="small" color={colors.brandInk} /> : null}
                      <Text style={styles.turnOnText}>{offerBusy ? 'Turning on…' : 'Turn on'}</Text>
                    </Tappable>
                  </Reanimated.View>
                ) : null}
              </>
            ) : blocked ? null : (
              // Not offered where it could never work (Expo Go, or not an iPhone): the row is as it always was.
              <Reanimated.View key="tennis-off" entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)} style={styles.actions}>
                {/* WHOOP's (and each tracker's) own sign-in says what it shares; Apple Health is explained here first.
                    The app's own filled pill (with its soft wash) dips under the finger; while it
                    works, the pill itself says so rather than the row going quiet. */}
                <Tappable accessibilityRole="button" accessibilityLabel={`Turn on ${what(i)} from ${i.label}`} disabled={loading} scaleTo={0.96} onPress={() => { haptics.tap(); if (i.provider === 'apple-health') askApple('tennis'); else run(i.provider, 'tennis'); }} style={styles.turnOn}>
                  <BrandWash />
                  {loading ? <ActivityIndicator size="small" color={colors.brandInk} /> : null}
                  <Text style={styles.turnOnText}>{loading ? 'Turning on…' : `Turn on ${what(i)}`}</Text>
                </Tappable>
              </Reanimated.View>
            )
          ) : null}
        </View>
        {/* The tennis pill shows its own "Turning on…"; a second spinner beside it would be one too many. */}
        {loading && !(tennisCard && !i.readsWorkouts) && !offerBusy ? (
          <CourtSpinner size={26} />
        ) : viaHealth ? (
          // Not something to press: a quiet label in the button's place.
          <View style={styles.badge}><Text style={styles.badgeText}>Via Apple Health</Text></View>
        ) : i.connected || loading ? null : (
          <Pressable accessibilityRole="button" accessibilityLabel={`Connect ${i.label}`} accessibilityState={{ disabled: blocked }} disabled={blocked} onPress={() => (tennis && i.provider === 'apple-health' ? askApple('toggle') : run(i.provider, 'toggle'))} style={[styles.connect, blocked && styles.connectOff]}>
            <Text style={[styles.connectText, blocked && styles.connectTextOff]}>{(i.provider === 'cronometer' || i.provider === 'myfitnesspal') && !appleHealthAvailable() ? 'Import' : 'Connect'}</Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <Screen title="Health" compactTitle onBack={() => goBack()}>
      <Text style={styles.lead}>{coachOn
        ? (connected ? 'If you use the AI coach, it plans around these.' : 'Connect a source and, if you use the AI coach, it plans around how recovered you are.')
        : 'Your sleep and recovery, from the sources you connect.'}</Text>

      {latest ? (
        <View style={styles.today}>
          <Text style={styles.todayTitle}>Latest<Text style={styles.todayDate}> · {new Date(latest.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text></Text>
          <View style={styles.stats}>
            {stat('Recovery', latest.recovery ? `${latest.recovery}%` : null)}
            {stat('Sleep', latest.sleepHours ? hoursAndMinutes(latest.sleepHours) : null)}
            {stat('HRV', latest.hrvMs ? `${latest.hrvMs}` : null)}
            {/* Four tiles a row leave a phone about 58 points for each: "Resting HR" and "11,432" were cut off. */}
            {stat('RHR', latest.restingHeartRate ? `${latest.restingHeartRate}` : null)}
          </View>
          <View style={styles.stats}>
            {stat('Calories', latest.calories ? `${latest.calories}` : null)}
            {stat('Protein', latest.proteinGrams ? `${latest.proteinGrams}g` : null)}
            {stat('Steps', latest.steps ? (latest.steps >= 10000 ? `${(latest.steps / 1000).toFixed(1)}k` : latest.steps.toLocaleString()) : null)}
            {stat('Days', `${healthHistory.length}`)}
          </View>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Your trackers</Text>
      <View style={styles.list}>
        {trackerRows.map(row)}
      </View>

      {/* Food: the card that reads Cronometer or MyFitnessPal through Apple Health
          (it draws its own "Food" heading), then any food app rows it does not cover. */}
      <View style={styles.sectionGap}>
        <FoodSection userId={currentUserId} />
      </View>
      {foodRows.length ? (
        <View style={[styles.list, styles.foodRows]}>
          {foodRows.map(row)}
        </View>
      ) : null}

      {/* Says what the server does: WHOOP's numbers go on disconnect only once its switch is on. Who else
          gets the numbers is said plainly: nobody, unless you agree to the AI coach, which is powered by
          Anthropic (App Review 5.1.2 and 5.1.3, Oct 5). */}
      <Text style={styles.foot}>
        {`Only you see these.${coachOn ? ` If you agree to use the AI coach, your recent sleep and heart rate variability are sent to Anthropic, which powers it${flags.whoop ? '; WHOOP’s numbers never are' : ''}.` : ''} `}
        {flags.whoop
          ? `${flags.workoutsApple ? 'Tennis sessions and workouts stay' : 'Tennis sessions stay'} private until you post one. Disconnecting ${removersText} removes what it sent; other sources stay until you delete your account.`
          : flags.workoutsApple
            ? 'Tennis sessions and workouts stay private until you post one. Disconnecting stops new numbers; what was already read stays until you delete your account.'
          : flags.apple
            ? 'Tennis sessions stay private until you post one. Disconnecting stops new numbers; what was already read stays until you delete your account.'
            : 'Disconnecting stops new numbers; what was already read stays until you delete your account.'}
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
  turnOn: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 36, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.brand, overflow: 'hidden' },
  turnOnText: { ...typography.smallStrong, color: colors.brandInk },
  tennisCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm, padding: spacing.sm, paddingRight: spacing.xs, borderRadius: radius.md, backgroundColor: colors.bgElevated },
  tennisTick: { width: 24, height: 24, borderRadius: 12, marginLeft: 4, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  tennisWords: { flex: 1, gap: 1 },
  tennisTitle: { ...typography.smallStrong, color: colors.text },
  pastLink: { ...typography.smallStrong, color: colors.brand, alignSelf: 'flex-start' },
  // The offer of every workout, under "Tennis sessions on": its question, then the same filled pill.
  offer: { gap: spacing.sm, marginTop: spacing.sm, alignItems: 'flex-start' },
  offerText: { ...typography.small, color: colors.textMuted },
  pressedDim: { opacity: 0.55 },
  sectionTitle: { ...typography.smallStrong, color: colors.textMuted, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  sectionGap: { paddingTop: spacing.xl },
  foodRows: { marginTop: spacing.md },
  badge: { height: 28, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  badgeText: { ...typography.caption, color: colors.textMuted },
  connect: { height: 36, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  connectOff: { backgroundColor: colors.surfaceAlt },
  connectText: { ...typography.smallStrong, color: colors.brandInk },
  connectTextOff: { color: colors.textFaint },
  foot: { ...typography.small, color: colors.textFaint, lineHeight: 18, paddingTop: spacing.lg },
});

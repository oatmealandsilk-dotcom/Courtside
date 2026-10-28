import { PRESS_DIM, PRESS_SHRINK } from '@/theme/press';
import { LESS_AI } from '@/theme/look';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Reanimated, { FadeIn, FadeOut, LayoutAnimationConfig, LinearTransition, ZoomIn } from 'react-native-reanimated';
import { goBack } from '@/lib/goBack';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { Tappable } from '@/components/Tappable';
import { BrandWash } from '@/components/ui/BrandWash';
import { GlideHeight } from '@/components/ui/GlideHeight';
import * as haptics from '@/lib/haptics';
import { Screen } from '@/components/ui';
import { appleHealthAvailable, inExpoGo } from '@/features/health/appleHealth';
import { FoodSection } from '@/features/health/FoodSection';
import { alertsAllowed } from '@/features/health/workoutWatch';
import { useTennisFlags } from '@/features/activity/useTennisFlags';
import { WHOOP_WORKOUTS_ASK, WORKOUTS_ASK, askWithSharing } from '@/features/activity/workouts';
import { consentLine, shownTo } from '@/features/activity/autoLogSharing';
import { isTracker, useTrackerStatus } from '@/features/activity/trackers';
import { confirm } from '@/lib/confirm';
import { withCatalog } from '@/lib/integrations';
import { agoInWords, hoursAndMinutes } from '@/lib/format';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useAiCoachOn } from '@/features/aiCoach/switch';
import type { Integration } from '@/data/types';
import { buttonShape, colors, radius, spacing, typography } from '@/theme';

/** What each source is, in a line, and how it connects. */
const ABOUT: Partial<Record<Integration['provider'], { icon: keyof typeof Ionicons.glyphMap; line: string; how: string }>> = {
  'apple-health': { icon: 'heart-outline', line: 'Sleep, HRV, resting heart rate, steps, active energy, food.', how: 'Reads the Health app on this phone.' },
  whoop: { icon: 'pulse-outline', line: 'Recovery, strain, HRV, resting heart rate, sleep.', how: 'Signs in to WHOOP once; then it syncs on its own.' },
  // Tennis sessions only, through the server's trackers function (migration 69). Fitbit signs in with Google since Oct 10 (Google's Health API).
  fitbit: { icon: 'watch-outline', line: 'Tennis sessions and your heart rate during them.', how: 'Sign in once with the Google account your Fitbit uses. Tennis you record shows up here.' },
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

/** "5 hours ago", "just now", "Sep 21": when a source last synced, for "Synced 5 hours ago." */
function syncedWhen(iso: string): string {
  const words = agoInWords(iso);
  return words === 'Just now' ? 'just now' : words;
}

/** The name a row shows, where it differs from the source's own label. */
const NAME: Partial<Record<Integration['provider'], string>> = { 'apple-health': 'Apple Watch' };
/** The trackers list, in this order; everything else (food) goes below it. */
const TRACKER_ROWS: Integration['provider'][] = ['whoop', 'apple-health', 'fitbit', 'oura', 'polar', 'garmin'];

/** Apple Health and WHOOP once every workout is switched on for them on the server (migrations 107 and 135; owner, Oct 5). */
const ABOUT_WORKOUTS: Partial<Record<Integration['provider'], { line: string; how: string }>> = {
  'apple-health': {
    line: 'Through Apple Health: your workouts (tennis, runs, rides, the gym and more) and their heart rate, plus sleep, HRV, resting heart rate, steps, food.',
    how: 'Reads the Health app on this phone. Record a workout on your Apple Watch or iPhone; CourtSide picks it up when you open the app.',
  },
  whoop: {
    line: 'Your workouts (tennis, runs, rides, the gym and more), recovery, strain, HRV, sleep.',
    how: 'Sign in to WHOOP once. A workout it records arrives as an alert, usually within an hour; the past week’s show up in Notifications.',
  },
};

/** The same two, once tennis sessions are switched on for them on the server (migration 58). */
const ABOUT_TENNIS: Partial<Record<Integration['provider'], { line: string; how: string }>> = {
  'apple-health': { line: 'Through Apple Health: tennis workouts and their heart rate, plus sleep, HRV, resting heart rate, steps, food.', how: 'Reads the Health app on this phone. Start a Tennis workout on your Apple Watch; CourtSide picks it up when you open the app.' },
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
  // Who will see the tennis that logs itself (migration 193): said before Apple Health connects, so Continue is the yes.
  const seenBy = shownTo(app.autoLogSharing, null, app.currentUser);
  const sharing = consentLine(seenBy);
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
  const tennisOn = (provider: Integration['provider']) => (provider === 'apple-health' ? flags.apple || flags.workoutsApple
    : provider === 'whoop' ? flags.whoop || flags.workoutsWhoop : isTracker(provider) ? flags[provider] : false);
  // Apple Health and WHOOP can read every workout, not only tennis (migrations 107 and 135): their words say so.
  const workouts = (provider: Integration['provider']) => (provider === 'apple-health' && flags.workoutsApple) || (provider === 'whoop' && flags.workoutsWhoop);
  // Every workout is its own yes: someone who turned on tennis sessions only still has tennis only.
  const allOn = (i: Integration) => workouts(i.provider) && !!i.readsAllWorkouts;
  /** What turning on (or off) means for this row: "tennis sessions", or "workouts" (every workout: what Connect turns on, too). */
  const what = (i: Integration) => (workouts(i.provider) && (!i.connected || !i.readsWorkouts || i.readsAllWorkouts) ? 'workouts' : 'tennis sessions');
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

  const run = async (provider: Integration['provider'], what: 'toggle' | 'sync' | 'tennis' | 'tennis-off' | 'workouts', told = false) => {
    setBusy(provider);
    setStep(what);
    try {
      // Workouts are asked for only when this screen has said so (Apple Health's explanation, or WHOOP's own sign-in);
      // every workout only when what it said was "workouts" (Apple Health's or WHOOP's row, or its own ask).
      if (what === 'toggle') await actions.toggleIntegration(provider, { tennis: tennisOn(provider), workouts: workouts(provider) });
      else if (what === 'sync') {
        // A long look (a month of sessions) can outlast the wait: after 20 s the button lets go and says
        // where the sessions will land; the sync carries on in the background (Oct 24, Trishiv's spun on).
        const slow = await Promise.race([actions.syncHealth(provider).then(() => false), new Promise<boolean>((done) => setTimeout(() => done(true), 20_000))]);
        if (slow) showToast({ title: 'Still syncing', body: 'New sessions show up in To do in a minute.', icon: 'time-outline' });
      }
      else if (what === 'workouts') { if (provider === 'apple-health' || provider === 'whoop') await actions.turnOnTennis(provider, { workouts: true }); }
      else if (provider === 'apple-health' || provider === 'whoop' || isTracker(provider)) await (what === 'tennis' ? actions.turnOnTennis(provider, { workouts: workouts(provider) }) : actions.turnOffTennis(provider));
      // Connected after being told who sees the tennis that logs itself: a choice never made is saved as that (migration 193).
      if (told && app.autoLogSharing === null) void actions.setAutoLogSharing(seenBy);
    } catch (err) {
      // What failed, in its own words: a failed Sync never says "Could not connect".
      const was = integrations.find((i) => i.provider === provider)?.connected;
      const title = what === 'sync' ? 'Couldn’t sync'
        : what === 'tennis-off' ? 'Couldn’t turn that off'
        : what === 'tennis' || what === 'workouts' ? 'Couldn’t turn that on'
        : was ? 'Couldn’t disconnect' : 'Couldn’t connect';
      showToast({ title, body: err instanceof Error ? err.message : 'Try again in a moment.', icon: 'alert-circle-outline' });
    } finally {
      setBusy(null);
      setStep(null);
    }
  };

  // Apple Health's own permission sheet comes next, so CourtSide says why first.
  // 'workouts': someone with tennis sessions on, saying yes to every workout as well.
  const askApple = (next: 'toggle' | 'tennis' | 'workouts') => confirm(flags.workoutsApple ? {
    ...askWithSharing(WORKOUTS_ASK, sharing),
    confirmLabel: 'Continue',
    onConfirm: () => run('apple-health', next, true),
  } : {
    ...askWithSharing({
      title: 'Tennis sessions from Apple Health',
      message: 'CourtSide reads your Tennis workouts and your heart rate during them, so you can log and post them, plus sleep, HRV, resting heart rate, steps, active energy and food (calories, protein, carbs, fat) for your Health page.',
    }, sharing),
    confirmLabel: 'Continue',
    onConfirm: () => run('apple-health', next, true),
  });

  // WHOOP, with tennis sessions on, saying yes to every workout as well: its own yes, though WHOOP already shares them.
  const askWhoop = () => confirm({ ...askWithSharing(WHOOP_WORKOUTS_ASK, sharing), confirmLabel: 'Turn on', onConfirm: () => run('whoop', 'workouts', true) });

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
    : provider === 'whoop' && (flags.whoop || flags.workoutsWhoop)
    ? confirm({
      title: 'Disconnect WHOOP?',
      message: `Its numbers and ${integrations.find((i) => i.provider === 'whoop')?.readsAllWorkouts && flags.workoutsWhoop ? 'workouts' : 'tennis sessions'} are removed from CourtSide. Connecting again brings back only the last week.`,
      confirmLabel: 'Disconnect',
      destructive: true,
      onConfirm: () => run('whoop', 'toggle'),
    })
    : run(provider, 'toggle'));

  // Four to a row leaves a narrow phone about 75 points a tile: a longer number steps down a size (a browser cannot shrink it to fit), so "6h 6m" and "Recovery" are never cut.
  const stat = (label: string, value: string | null) => (
    <View style={styles.stat}><Text style={[styles.statValue, (value ?? '').length > 5 && styles.statValueLong]} numberOfLines={1} adjustsFontSizeToFit>{value ?? '—'}</Text><Text style={styles.statLabel} numberOfLines={1}>{label}</Text></View>
  );

  const row = (i: Integration, index: number) => {
    const base = ABOUT[i.provider];
    if (!base) return null;
    const tennis = tennisOn(i.provider);
    const about = tennis ? { ...base, ...(what(i) === 'workouts' ? ABOUT_WORKOUTS[i.provider] : ABOUT_TENNIS[i.provider]) } : base;
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
      // A row eases to its new height when its buttons or cards come and go (Oct 22 sweep).
      <Reanimated.View key={i.provider} layout={ROW_GLIDE} style={[styles.row, index > 0 && styles.rowLine]}>
        {LESS_AI ? null : <View style={[styles.disc, linked && styles.discOn]}>
          <Ionicons name={about.icon} size={20} color={linked ? colors.brandInk : colors.text} />
        </View>}
        <Words style={styles.wordsBox} contentStyle={styles.wordsInner}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{NAME[i.provider] ?? i.label}</Text>
            {linked ? <View style={styles.dot} /> : null}
          </View>
          <Text style={styles.line}>{about.line}</Text>
          {LESS_AI && !(i.connected && i.lastSyncedAt) && !blocked && !loading && !(wrongPhone && i.connected) ? null : <Text style={styles.how}>
            {wrongPhone && i.connected && Platform.OS === 'android' ? 'Connected on your iPhone. It syncs from there.'
              : i.connected && i.lastSyncedAt ? `Synced ${syncedWhen(i.lastSyncedAt)}.` : blocked ? (wrongPhone ? 'iPhone only.' : inExpoGo() ? 'Available in the App Store version of CourtSide.' : 'Coming in the next app update.') : about.how}
          </Text>}
          {i.connected ? (
            <Reanimated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)} style={styles.actions}>
              {/* Android cannot read Apple Health: syncing it is the iPhone's job. */}
              {wrongPhone && Platform.OS === 'android' ? null : (
                <Pressable accessibilityRole="button" accessibilityLabel={`Sync ${i.label}`} disabled={loading} onPress={() => run(i.provider, 'sync')} style={({ pressed }) => [styles.small, pressed && styles.pressedShrink]}>
                  <Ionicons name="refresh" size={14} color={colors.text} /><Text style={styles.smallText}>{(i.provider === 'cronometer' || i.provider === 'myfitnesspal') && !appleHealthAvailable() ? 'Import again' : 'Sync now'}</Text>
                </Pressable>
              )}
              <Pressable accessibilityRole="button" accessibilityLabel={`Disconnect ${i.label}`} disabled={loading} onPress={() => disconnect(i.provider)} style={({ pressed }) => [styles.smallGhost, pressed && styles.pressedShrink]}>
                <Text style={styles.smallGhostText}>Disconnect</Text>
              </Pressable>
            </Reanimated.View>
          ) : null}
          {tennisCard ? (
            i.readsWorkouts && LESS_AI ? (
              // The hand-made look (Oct 24): a line, not a card in the card, and the offer as a link.
              <Reanimated.View key="tennis-on-line" entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)} style={styles.onLine}>
                <View style={styles.onRow}>
                  <Text style={styles.onText}>{allOn(i) ? 'Workouts on' : 'Tennis on'}</Text>
                  <Text style={styles.onDot}>·</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Turn off ${what(i)} from ${i.label}`} disabled={loading} onPress={() => { haptics.untap(); run(i.provider, 'tennis-off'); }} hitSlop={10} style={({ pressed }) => pressed && styles.pressedDim}>
                    <Text style={styles.smallGhostText}>Turn off</Text>
                  </Pressable>
                </View>
                {i.provider === 'apple-health' && alertsOn && (allOn(i) || flags.apple) ? (
                  <Text style={styles.line}>{allOn(i) ? 'You’ll get a notification after each workout.' : 'You’ll get a notification after each tennis session.'}</Text>
                ) : null}
                {allOn(i) && i.provider === 'apple-health' ? (
                  <Pressable accessibilityRole="link" accessibilityLabel="See past workouts" hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }} onPress={() => router.push('/workouts')} style={({ pressed }) => [styles.pastLinkBox, pressed && styles.pressedDim]}>
                    <Text style={styles.pastLink}>See past workouts</Text>
                    <Ionicons name="chevron-forward" size={13} color={colors.textMuted} />
                  </Pressable>
                ) : null}
                {offer ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Turn on every workout from ${i.label}: runs, rides, the gym and more`} disabled={loading} hitSlop={10} onPress={() => { haptics.tap(); if (i.provider === 'whoop') askWhoop(); else askApple('workouts'); }} style={({ pressed }) => [styles.offerLink, pressed && styles.pressedDim]}>
                    {offerBusy ? <ActivityIndicator size="small" color={colors.brand} /> : null}
                    <Text style={styles.offerLinkText}>{offerBusy ? 'Turning on…' : 'Add runs, rides and gym'}</Text>
                  </Pressable>
                ) : null}
              </Reanimated.View>
            ) : i.readsWorkouts ? (
              <>
                {/* On: a plain tick in the brand colour springs in, the way iPhone's own
                    Settings confirms a choice, so switching on reads as something happening
                    (no cartoon ball: William found it childish). */}
                <Reanimated.View key="tennis-on" entering={FadeIn.duration(260)} exiting={FadeOut.duration(140)} style={styles.tennisCard}>
                  <Reanimated.View entering={ZoomIn.springify().damping(12).stiffness(240).delay(60)} style={styles.tennisTick}>
                    <Ionicons name="checkmark" size={14} color={colors.brandInk} />
                  </Reanimated.View>
                  <View style={styles.tennisWords}>
                    {/* Short enough to stay on one line beside Turn off on the narrowest phones. */}
                    <Text style={styles.tennisTitle} numberOfLines={1}>{allOn(i) ? 'Workouts on' : 'Tennis on'}</Text>
                    {i.provider === 'apple-health' && alertsOn && (allOn(i) || flags.apple) ? (
                      <Text style={styles.line}>{allOn(i) ? 'You’ll get a notification after each workout.' : 'You’ll get a notification after each tennis session.'}</Text>
                    ) : null}
                    {/* The last 30 days of them, with Log it on any not logged (Oct 5). Apple Health's: the page reads this iPhone's Health. */}
                    {allOn(i) && i.provider === 'apple-health' ? (
                      // A real button with room round it (44 tall to a finger), not a line of words.
                      <Pressable accessibilityRole="link" accessibilityLabel="See past workouts" hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }} onPress={() => router.push('/workouts')} style={({ pressed }) => [styles.pastLinkBox, pressed && styles.pressedDim]}>
                        <Text style={styles.pastLink}>See past workouts</Text>
                        <Ionicons name="chevron-forward" size={13} color={colors.textMuted} />
                      </Pressable>
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
                    <Tappable accessibilityRole="button" accessibilityLabel={`Turn on every workout from ${i.label}: runs, rides, the gym and more`} disabled={loading} onPress={() => { haptics.tap(); if (i.provider === 'whoop') askWhoop(); else askApple('workouts'); }} hitSlop={buttonShape.smallSlop} style={styles.turnOn}>
                      <BrandWash radius={buttonShape.smallRadius} curve />
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
                <Tappable accessibilityRole="button" accessibilityLabel={`Turn on ${what(i)} from ${i.label}`} disabled={loading} onPress={() => { haptics.tap(); if (i.provider === 'apple-health') askApple('tennis'); else run(i.provider, 'tennis'); }} hitSlop={buttonShape.smallSlop} style={styles.turnOn}>
                  <BrandWash radius={buttonShape.smallRadius} curve />
                  {loading ? <ActivityIndicator size="small" color={colors.brandInk} /> : null}
                  <Text style={styles.turnOnText}>{loading ? 'Turning on…' : `Turn on ${what(i)}`}</Text>
                </Tappable>
              </Reanimated.View>
            )
          ) : null}
        </Words>
        {/* The tennis pill shows its own "Turning on…"; a second spinner beside it would be one too many. */}
        {loading && !(tennisCard && !i.readsWorkouts) && !offerBusy ? (
          <CourtSpinner size={26} />
        ) : viaHealth ? (
          // Not something to press: a quiet label in the button's place.
          <View style={styles.badge}><Text style={styles.badgeText}>Via Apple Health</Text></View>
        ) : i.connected || loading ? null : (
          <Reanimated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Connect ${i.label}`} accessibilityState={{ disabled: blocked }} disabled={blocked} onPress={() => (tennis && i.provider === 'apple-health' ? askApple('toggle') : run(i.provider, 'toggle'))} hitSlop={buttonShape.smallSlop} style={({ pressed }) => [styles.connect, LESS_AI && styles.connectSoft, blocked && styles.connectOff, pressed && styles.pressedShrink]}>
              <Text style={[styles.connectText, LESS_AI && styles.connectTextSoft, blocked && styles.connectTextOff]}>{(i.provider === 'cronometer' || i.provider === 'myfitnesspal') && !appleHealthAvailable() ? 'Import' : 'Connect'}</Text>
            </Pressable>
          </Reanimated.View>
        )}
      </Reanimated.View>
    );
  };

  return (
    <Screen title="Health" compactTitle onBack={() => goBack()}>
      {LESS_AI ? null : <Text style={styles.lead}>{coachOn
        ? (connected ? 'If you use the AI coach, it plans around these.' : 'Connect a source and, if you use the AI coach, it plans around how recovered you are.')
        : 'Your sleep and recovery, from the sources you connect.'}</Text>}

      {/* A plain day ("2026-10-06") is read as that day here, at noon: read alone it is midnight in London, the day before in America. */}
      {latest && LESS_AI ? (
        // The hand-made look (Oct 24): the numbers as two quiet lines, not a grid of boxes.
        <View style={styles.today}>
          <Text style={styles.todayTitle}>Latest<Text style={styles.todayDate}> · {new Date(latest.date.length === 10 ? `${latest.date}T12:00:00` : latest.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text></Text>
          {[
            [latest.recovery ? `Recovery ${latest.recovery}%` : null, latest.sleepHours ? `Sleep ${hoursAndMinutes(latest.sleepHours)}` : null, latest.hrvMs ? `HRV ${latest.hrvMs}` : null, latest.restingHeartRate ? `RHR ${latest.restingHeartRate}` : null],
            [latest.calories ? `${latest.calories.toLocaleString()} cal` : null, latest.proteinGrams ? `${latest.proteinGrams}g protein` : null, latest.steps ? `${latest.steps.toLocaleString()} steps` : null],
          ].map((parts, k) => parts.some(Boolean) ? <Text key={k} style={k === 0 ? styles.numLine : styles.numLineSoft}>{parts.filter(Boolean).join('  ·  ')}</Text> : null)}
        </View>
      ) : latest ? (
        <View style={styles.today}>
          <Text style={styles.todayTitle}>Latest<Text style={styles.todayDate}> · {new Date(latest.date.length === 10 ? `${latest.date}T12:00:00` : latest.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text></Text>
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
            {stat('Steps', latest.steps ? (latest.steps >= 10000 ? `${+(latest.steps / 1000).toFixed(1)}k` : latest.steps.toLocaleString()) : null)}
            {stat('Days', `${healthHistory.length}`)}
          </View>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Your trackers</Text>
      {/* Rows there on arrival just show; what changes afterwards fades and glides. */}
      <LayoutAnimationConfig skipEntering>
      <View style={styles.list}>
        {trackerRows.map(row)}
      </View>
      </LayoutAnimationConfig>

      {/* Food: the card that reads Cronometer or MyFitnessPal through Apple Health
          (it draws its own "Food" heading), then any food app rows it does not cover. */}
      <View style={styles.sectionGap}>
        <FoodSection userId={currentUserId} />
      </View>
      {foodRows.length ? (
        <LayoutAnimationConfig skipEntering>
        <View style={[styles.list, styles.foodRows]}>
          {foodRows.map(row)}
        </View>
        </LayoutAnimationConfig>
      ) : null}

      {/* Says what the server does: WHOOP's numbers go on disconnect only once its switch is on. Who else
          gets the numbers is said plainly: nobody, unless you agree to the AI coach, which is powered by
          Anthropic (App Review 5.1.2 and 5.1.3, Oct 5). */}
      <Text style={styles.foot}>
        {`Only you see these.${coachOn ? ` If you agree to use the AI coach, your recent sleep and heart rate variability are sent to Anthropic, which powers it${flags.whoop ? '; WHOOP’s numbers never are' : ''}.` : ''} `}
        {flags.whoop
          ? `${seenBy !== 'private' ? (flags.workoutsApple || flags.workoutsWhoop ? `${sharing} Other workouts stay private until you post one.` : sharing) : `${flags.workoutsApple || flags.workoutsWhoop ? 'Tennis sessions and workouts stay' : 'Tennis sessions stay'} private until you post one.`} Disconnecting ${removersText} removes what it sent; other sources stay until you delete your account.`
          : flags.workoutsApple
            ? `${seenBy !== 'private' ? `${sharing} Other workouts stay private until you post one.` : 'Tennis sessions and workouts stay private until you post one.'} Disconnecting stops new numbers; what was already read stays until you delete your account.`
          : flags.apple
            ? `${seenBy !== 'private' ? sharing : 'Tennis sessions stay private until you post one.'} Disconnecting stops new numbers; what was already read stays until you delete your account.`
            : 'Disconnecting stops new numbers; what was already read stays until you delete your account.'}
      </Text>
    </Screen>
  );
}

/*
 * A row eases to its new height when its buttons or cards come and go. On a phone the
 * row itself glides (a layout transition). In a browser Reanimated does that by
 * scaling the row, which stretches its words, so there the words column changes its
 * real height instead (GlideHeight) and the row follows.
 */
const ROW_GLIDE = Platform.OS === 'web' ? undefined : LinearTransition.duration(220);
function Words({ style, contentStyle, children }: { style: StyleProp<ViewStyle>; contentStyle: StyleProp<ViewStyle>; children: React.ReactNode }) {
  if (Platform.OS === 'web') return <GlideHeight style={style} contentStyle={contentStyle} duration={220}>{children}</GlideHeight>;
  return <View style={[style, contentStyle]}>{children}</View>;
}

const styleDefinitions = StyleSheet.create({
  lead: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingBottom: spacing.lg },
  today: { gap: spacing.md, paddingBottom: spacing.xl },
  todayTitle: { ...typography.heading, color: colors.text },
  todayDate: { ...typography.small, color: colors.textFaint },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, minWidth: 0, gap: 2, paddingVertical: spacing.md, paddingHorizontal: 10, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  statValue: { ...typography.heading, lineHeight: 22, color: colors.text, fontVariant: ['tabular-nums'] },
  statValueLong: { fontSize: 15, letterSpacing: -0.2 },
  statLabel: { ...typography.caption, color: colors.textMuted, letterSpacing: 0.2 },
  list: { borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.lg },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  disc: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  discOn: { backgroundColor: colors.brand },
  wordsBox: { flex: 1 },
  wordsInner: { gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { ...typography.bodyStrong, color: colors.text },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand },
  line: { ...typography.small, color: colors.textMuted },
  how: { ...typography.small, color: colors.textFaint, lineHeight: 18 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  small: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: 12, borderRadius: buttonShape.smallRadius, ...buttonShape.curve, borderWidth: 1, borderColor: colors.borderStrong },
  smallText: { ...typography.smallStrong, color: colors.text },
  smallGhost: { height: 32, paddingHorizontal: 8, justifyContent: 'center' },
  smallGhostText: { ...typography.smallStrong, color: colors.textMuted },
  turnOn: { flexDirection: 'row', alignItems: 'center', gap: 7, height: buttonShape.smallHeight, paddingHorizontal: 16, borderRadius: buttonShape.smallRadius, ...buttonShape.curve, backgroundColor: colors.brand, overflow: 'hidden' },
  turnOnText: { ...typography.smallStrong, fontSize: buttonShape.smallLabel, color: colors.brandInk },
  tennisCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm, padding: spacing.sm, paddingRight: spacing.xs, borderRadius: radius.md, backgroundColor: colors.bgElevated },
  tennisTick: { width: 24, height: 24, borderRadius: 12, marginLeft: 4, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  tennisWords: { flex: 1, gap: 1 },
  tennisTitle: { ...typography.smallStrong, color: colors.text },
  // In ink, not the brand: brand words on this card's raised ground fell under 4.5:1 on some courts (clay, Melbourne).
  pastLinkBox: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingVertical: 2 },
  pastLink: { ...typography.smallStrong, color: colors.text },
  // The offer of every workout, under "Tennis sessions on": its question, then the same filled pill.
  offer: { gap: spacing.sm, marginTop: spacing.sm, alignItems: 'flex-start' },
  offerText: { ...typography.small, color: colors.textMuted },
  pressedDim: { opacity: PRESS_DIM },
  // A pill button held: it shrinks slightly (theme/press).
  pressedShrink: { transform: [{ scale: PRESS_SHRINK }] },
  sectionTitle: { ...typography.smallStrong, color: colors.textMuted, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  sectionGap: { paddingTop: spacing.xl },
  foodRows: { marginTop: spacing.md },
  badge: { height: 28, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  badgeText: { ...typography.caption, color: colors.textMuted },
  connect: { height: buttonShape.smallHeight, paddingHorizontal: 16, borderRadius: buttonShape.smallRadius, ...buttonShape.curve, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  connectOff: { backgroundColor: colors.surfaceAlt },
  // The quiet Connect (Oct 24): the same pale brand fill as a list row's Follow.
  connectSoft: { backgroundColor: colors.brandDim },
  connectTextSoft: { color: colors.brand },
  numLine: { ...typography.body, color: colors.text, fontVariant: ['tabular-nums'] },
  numLineSoft: { ...typography.small, color: colors.textMuted, fontVariant: ['tabular-nums'], marginTop: -spacing.sm },
  onLine: { gap: 4, marginTop: spacing.xs },
  onRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  onText: { ...typography.smallStrong, color: colors.text },
  onDot: { ...typography.small, color: colors.textFaint },
  offerLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
  offerLinkText: { ...typography.smallStrong, color: colors.brand },
  connectText: { ...typography.smallStrong, fontSize: buttonShape.smallLabel, color: colors.brandInk },
  connectTextOff: { color: colors.textFaint },
  foot: { ...typography.small, color: colors.textFaint, lineHeight: 18, paddingTop: spacing.lg },
});

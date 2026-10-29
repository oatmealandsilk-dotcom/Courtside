import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import { SetupFooter, SetupProgress, setupLook } from '@/components/setup/SetupBits';
import { useSetupCount } from '@/features/onboarding/setupCount';
import { ONBOARDING_V2 } from '@/features/onboarding/onboardingV2';
import { StatusShade } from '@/components/StatusShade';
import { Wash } from '@/components/Wash';
import { useAutoLog, type AutoLogSource } from '@/features/activity/autoLog';
import { consentLine } from '@/features/activity/autoLogSharing';
import { useApp } from '@/store/AppContext';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';
import { useGateSpace } from '@/lib/useGateSpace';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, lift, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';
import { corner } from '@/theme/look';

const enter = (i: number) => FadeInDown.delay(80 + i * 80).duration(420).easing(Easing.out(Easing.cubic));

/** How long the page waits to hear the server's switches before moving on without them. */
const WAIT_MS = 3000;

/**
 * Setup's last step, before the first-move page (owner, Oct 6: a friend who
 * had worked out that day joined and got no "log activity" row, because
 * nothing ever asked him to connect Apple Health). One card: connect Apple
 * Health (an iPhone) or WHOOP (where it is switched on), or Not now. Once,
 * never again: after Not now it waits as a slim row at the top of
 * Activities, and on the Health page (features/activity/autoLog).
 *
 * Nothing to offer here (Android, a browser, or already connected): the
 * page steps straight on to the first-move page.
 */
export default function AutoLog() {
  const styles = useThemedStyles(styleDefinitions);
  const space = useGateSpace();
  const auto = useAutoLog();
  const { currentUser, autoLogSharing } = useApp();
  const [busy, setBusy] = useState<AutoLogSource | null>(null);
  // Setup's one step count (Oct 20 sweep).
  const setupCount = useSetupCount('auto-log', true);
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => { const t = setTimeout(() => setGaveUp(true), WAIT_MS); return () => clearTimeout(t); }, []);

  const onward = () => router.replace('/first-move');
  // Decided once: a card on screen stays (connecting from it must not bounce the page away mid-tap).
  const offering = auto.ready && !auto.connected && (auto.apple || auto.whoop);
  const [shown, setShown] = useState(false);
  useEffect(() => { if (offering) setShown(true); }, [offering]);
  // Nothing this phone could connect (Android or a browser, WHOOP not switched on): straight on, with no page flashing first.
  if (!shown && !offering && (auto.ready || gaveUp || (auto.known && !auto.apple && !auto.whoop))) return <Redirect href="/first-move" />;

  const connect = async (source: AutoLogSource) => {
    if (busy) return;
    haptics.tap();
    setBusy(source);
    try {
      // The card said who sees the tennis that logs itself (migration 193): connecting WHOOP when it said friends is the
      // yes to it. With Apple Health on the card too, it said Apple Health's words, so nothing is chosen here.
      await auto.connect(source, { told: !auto.apple });
      // The week's workouts are being read now; each one found lands in Notifications, ready to log.
      showToast({ title: source === 'whoop' ? 'WHOOP connected' : 'Apple Health connected', body: 'Your past week’s workouts show up in Notifications, ready to log.', icon: 'checkmark-circle-outline' });
      onward();
    } catch (err) {
      showToast({ title: 'Couldn’t connect', body: err instanceof Error ? err.message : 'Try again in a moment.', icon: 'alert-circle-outline' });
      setBusy(null);
    }
  };

  return (
    <View style={styles.root}>
      {/* The sign-up redraw (ONBOARDING_V2): a flat page, the bar at setup's one height. */}
      {ONBOARDING_V2 ? null : <Wash height={420} />}
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: ONBOARDING_V2 && setupCount ? space.header : space.top, paddingBottom: spacing.xl }]}>
        {setupCount ? <Animated.View entering={enter(0)}><SetupProgress count={setupCount} /></Animated.View> : null}
        <Animated.View entering={enter(0)} style={styles.head}>
          <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.title}>Log your tennis automatically</Text>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.lead}>Connect once. Every hit, match and workout shows up ready to log.</Text>
        </Animated.View>

        <Animated.View entering={enter(1)} style={ONBOARDING_V2 ? styles.cardV2 : styles.card}>
          {!shown && !offering ? (
            <View style={styles.waiting}><ActivityIndicator color={colors.textFaint} /></View>
          ) : (
            <View>
              <View style={styles.cardHead}>
                {ONBOARDING_V2 ? null : <View style={styles.tile}><Ionicons name="pulse" size={20} color={colors.brand} /></View>}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.cardTitle}>Your workouts, ready to log</Text>
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.cardBody}>The last 7 days come in first. {consentLine(auto.seenBy(auto.apple ? 'apple-health' : 'whoop'), currentUser, autoLogSharing)} Other workouts only you see until you post one.{auto.apple ? ' Apple Health also shares their heart rate, plus sleep, steps and food (calories, protein, carbs, fat) for your Health page.' : ''}</Text>
                </View>
              </View>
            </View>
          )}
        </Animated.View>

        <Animated.Text entering={enter(2)} style={styles.foot}>You can connect later from Activities or Settings.</Animated.Text>
      </ScrollView>
      {/* Setup's bottom, the same on every setup page (Oct 20 sweep): the connect button full width, Not now as a word under it. */}
      <Animated.View entering={enter(3)}>
        <SetupFooter
          primary={auto.apple || !auto.whoop
            ? { label: busy === 'apple-health' ? 'Connecting…' : 'Connect Apple Health', loading: busy === 'apple-health' || (!shown && !offering), disabled: !!busy || !auto.apple, onPress: () => { void connect('apple-health'); } }
            : { label: busy === 'whoop' ? 'Connecting…' : 'Connect WHOOP', loading: busy === 'whoop', disabled: !!busy, onPress: () => { void connect('whoop'); } }}
          secondary={auto.apple && auto.whoop ? { label: busy === 'whoop' ? 'Connecting…' : 'Connect WHOOP', loading: busy === 'whoop', disabled: !!busy, onPress: () => { void connect('whoop'); } } : undefined}
          link={{ label: 'Not now', onPress: onward, disabled: !!busy }}
        />
      </Animated.View>
      <StatusShade wash={ONBOARDING_V2 ? undefined : { height: 420 }} />
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.xl, maxWidth: 460, width: '100%', alignSelf: 'center' },
  head: { gap: spacing.sm },
  title: { ...typography.display, color: colors.text },
  lead: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  // The same card as the first-move page's.
  card: { ...lift, borderRadius: corner(20), backgroundColor: colors.surface, overflow: 'hidden', padding: spacing.lg },
  waiting: { height: 120, alignItems: 'center', justifyContent: 'center' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tile: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { ...typography.heading, color: colors.text },
  cardBody: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  foot: { ...typography.small, color: colors.textFaint, textAlign: 'center' },
  // The redraw (ONBOARDING_V2): a plain hairline inset card, words only.
  cardV2: { ...setupLook.inset, padding: spacing.lg },
});

import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/ui';
import { noteAppTap } from '@/features/guest/campaign';
import { IPHONE_APP_URL } from '@/features/guest/joinAsk';
import { useTourBusy } from '@/features/tour/tourStore';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, lift, radius, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';

/*
 * "Get CourtSide on your iPhone" on the website (Oct 20 sweep, R3: "People
 * who sign up on the website get no alerts and no emails, and nothing tells
 * them to get the app"). The website cannot send alerts, so someone who made
 * their account here hears nothing from CourtSide unless they come back by
 * themselves. Two calm, optional cards point them to the iPhone app, which
 * can:
 *   - PhoneAppWelcome: once, a moment after they first land in the app
 *     after signing up here (accounts under two days old), on a calm page,
 *     with "Get the iPhone app" and "Not now". Never again after either.
 *   - PhoneAppRow: a card at the top of Profile, with a close button, until
 *     they close it or open the phone app.
 * Both only while the database says this account has never opened the
 * phone app (has_phone_app, migration 167); while it cannot say, nothing
 * shows. Nothing is ever blocked: both close with one tap. The link is the
 * guest strip's own (IPHONE_APP_URL: TestFlight until the App Store
 * approves the app), and a tap is counted for the link they came through,
 * as the guest strip's is (noteAppTap). The phone apps show neither
 * (PhoneAppCard.tsx).
 */

/** An account this new has just signed up. */
const NEW_MS = 2 * 86_400_000;
/** A beat after landing, so it never lands on the app's own opening. */
const SETTLE_MS = 2500;

const welcomeKey = (id: string) => `courtside-phone-welcome:${id}`;
const rowKey = (id: string) => `courtside-phone-row-closed:${id}`;
const kept = (key: string) => { try { return localStorage.getItem(key) === '1'; } catch { return false; } };
const keep = (key: string) => { try { localStorage.setItem(key, '1'); } catch { /* closed for this visit only */ } };

/** Whether this account has never opened the phone app, asked once per account per visit (null: not known). */
const asked = new Map<string, Promise<boolean | null>>();
function useNoPhoneApp(): boolean {
  const { currentUserId, currentUser, isGuest, actions } = useApp();
  const [none, setNone] = useState(false);
  useEffect(() => {
    setNone(false);
    if (!currentUserId || !currentUser || isGuest) return undefined;
    let on = true;
    let ask = asked.get(currentUserId);
    if (!ask) { ask = actions.loadPhoneAppSeen().catch(() => null); asked.set(currentUserId, ask); }
    void ask.then((seen) => { if (on) setNone(seen === false); });
    return () => { on = false; };
  }, [currentUserId, !!currentUser, isGuest]); // eslint-disable-line react-hooks/exhaustive-deps
  return none;
}

const open = () => { noteAppTap(); void Linking.openURL(IPHONE_APP_URL); };

/** The card at the top of Profile. */
export function PhoneAppRow({ style }: { style?: object }) {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUserId } = useApp();
  const none = useNoPhoneApp();
  const [closed, setClosed] = useState(() => !!currentUserId && kept(rowKey(currentUserId)));
  useEffect(() => { setClosed(!!currentUserId && kept(rowKey(currentUserId))); }, [currentUserId]);
  if (!none || closed || !currentUserId) return null;
  const close = () => { keep(rowKey(currentUserId)); setClosed(true); };
  return (
    <View style={[styles.row, style]}>
      <Pressable accessibilityRole="link" accessibilityLabel="Get the iPhone app" onPress={open} style={styles.rowMain}>
        <Ionicons name="logo-apple" size={20} color={colors.brand} />
        <View style={{ flex: 1 }}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowTitle}>Get CourtSide on your iPhone</Text>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowMeta}>So you hear when someone wants to hit or replies to you.</Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Close the iPhone app card" hitSlop={10} onPress={close} style={styles.rowClose}>
        <Ionicons name="close" size={16} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

/** Once, just after signing up on the website. Mounted once, in AppShell. */
export function PhoneAppWelcome({ calm }: { calm: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { currentUserId, currentUser, onboardingComplete } = useApp();
  const touring = useTourBusy();
  const none = useNoPhoneApp();
  const joined = currentUser?.joinedAt ? Date.parse(currentUser.joinedAt) : NaN;
  const fresh = Number.isFinite(joined) && Date.now() - joined < NEW_MS;
  const due = !!currentUserId && onboardingComplete && none && fresh && !kept(welcomeKey(currentUserId));
  const [up, setUp] = useState(false);
  useEffect(() => {
    if (!due || !calm || touring || up) return undefined;
    const timer = setTimeout(() => setUp(true), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [due, calm, touring, up]);
  // Once on screen it counts as shown, whatever is tapped.
  useEffect(() => { if (up && currentUserId) keep(welcomeKey(currentUserId)); }, [up, currentUserId]);
  // Escape closes it on a computer, as every sheet does.
  useEffect(() => {
    if (!up) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setUp(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [up]);
  if (!up) return null;
  const close = () => setUp(false);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View entering={FadeIn.duration(380).easing(RISE)} exiting={FadeOut.duration(220).easing(FALL)} style={[StyleSheet.absoluteFill, styles.dim]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Not now" style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>
      <Animated.View entering={SlideInDown.duration(380).easing(RISE)} exiting={SlideOutDown.duration(220).easing(FALL)} accessibilityViewIsModal style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.inner}>
          <View style={styles.mark}><BrandMark size={30} /></View>
          <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.title}>Get CourtSide on your iPhone</Text>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.body}>The app tells you when someone near you wants to hit, or replies to you. The website can’t.</Text>
          <Button label="Get the iPhone app" full onPress={() => { open(); close(); }} />
          <Button label="Not now" variant="secondary" full onPress={close} />
          <Text style={styles.foot}>No iPhone? Everything works here in your browser too.</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const RISE = Easing.bezier(0.32, 0.72, 0, 1);
const FALL = Easing.bezier(0.4, 0, 1, 1);

const styleDefinitions = StyleSheet.create({
  // The same card as Profile's "Make your first move" and "Finish setting up".
  row: { marginTop: 16, borderRadius: 16, backgroundColor: colors.brandDim, flexDirection: 'row', alignItems: 'center' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingLeft: 14 },
  rowTitle: { ...typography.smallStrong, fontSize: 14, color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted, lineHeight: 19 },
  rowClose: { padding: 14 },
  // The same sheet as guest mode's "Join CourtSide to …" (JoinSheet).
  dim: { backgroundColor: colors.overlay },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: spacing.lg, paddingHorizontal: spacing.lg, ...lift },
  inner: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: spacing.md },
  mark: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.title, color: colors.text },
  body: { ...typography.body, color: colors.textMuted, lineHeight: 22, marginTop: -spacing.xs },
  foot: { ...typography.small, color: colors.textMuted, textAlign: 'center' },
});

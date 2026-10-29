import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { usePathname } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { FullWindowOverlay } from 'react-native-screens';

import { POP_FROM_SCALE, POP_IN, POP_OUT, POP_SETTLE_MS, POP_SPRING } from '@/components/popMotion';
import { Submit } from '@/components/sheet/SheetForm';
import { isBusy } from '@/components/HitFollowUp';
import { SwipeArea } from '@/features/navigation/swipePress';
import { useHoldTour } from '@/features/tour/tourHold';
import { useTourBusy } from '@/features/tour/tourStore';
import { alertsWhyWords, markAlertsWhyShown, setAlertsWhyHost, type AlertsWhyRequest } from '@/features/push/alertsWhy';
import { registerForPush } from '@/features/push/push';
import { useModalOpenWhile } from '@/lib/modalOpen';
import { isShowing as toastShowing } from '@/lib/toast';
import { useAnyUploading } from '@/lib/uploads';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { TextScale, buttonShape, colors, radius, spacing, typography } from '@/theme';

/** A moment after the screen is clear (the sheet closed, the pin landed), so the card never lands on what was just done. */
const SETTLE_MS = 900;
/** Still busy this long after the moment (writing, a sheet up, the tutorial): it is dropped, and not counted. */
const GIVE_UP_MS = 20_000;
const TITLE_ID = 'courtside-alerts-why-title';

/**
 * "Why turn on alerts" (alertsWhy.ts; off until he picks it): the card drawn
 * before Apple's own alerts question, in the look of the first "Who can see
 * you" card (design E1, app/map-visibility): a small card in the middle of
 * the dimmed screen, everything on one left edge, the question in the app's
 * title weight, two or three short reasons for this moment, then two
 * full-width buttons: "Turn on alerts", the solid green one, and "Not now",
 * plain grey, plain to see.
 *
 * Turn on alerts: the card goes, then Apple's question. Someone who already
 * said no to Apple: "Open Settings", which opens the phone's Settings for
 * CourtSide. Not now (or a tap outside, Android's Back): nothing is asked.
 *
 * Drawn once by the root layout, over everything, the way ConfirmHost is
 * (straight on the phone's window on an iPhone; a pop-up layer on Android).
 * It waits for a clear screen: no sheet being written in, no chat, no
 * tutorial, no upload, no note (toast) already up. A browser has no alerts (AlertsWhyHost.web.tsx draws nothing).
 */
export function AlertsWhyHost() {
  const styles = useThemedStyles(styleDefinitions);
  const reduce = useReducedMotion();
  const pathname = usePathname();
  const touring = useTourBusy();
  const { currentUserId } = useApp();
  const uploading = useAnyUploading();
  // Bumped to look again a little later while a note (toast) is still up.
  const [retry, setRetry] = useState(0);
  // Asked for, not yet shown (waiting for a clear screen).
  const [pending, setPending] = useState<(AlertsWhyRequest & { at: number }) | null>(null);
  // On screen (kept while it fades out).
  const [request, setRequest] = useState<AlertsWhyRequest | null>(null);
  useHoldTour(request !== null);
  useModalOpenWhile(request !== null);
  const live = useRef(false);
  const openedAt = useRef(0);
  const touchAt = useRef(0);
  const titleRef = useRef<Text>(null);
  const shown = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    setAlertsWhyHost((r) => setPending({ ...r, at: Date.now() }));
    return () => setAlertsWhyHost(null);
  }, []);

  // Signed out meanwhile: nothing waits.
  useEffect(() => { if (!currentUserId) setPending(null); }, [currentUserId]);

  // Shown once the screen is clear, a beat after; dropped if it never clears.
  // Clear: no tutorial, no sheet or chat, nothing uploading, and no note (toast) up.
  const clear = !touring && !uploading && !isBusy(pathname);
  useEffect(() => {
    if (!pending || request) return undefined;
    if (Date.now() - pending.at > GIVE_UP_MS) { setPending(null); return undefined; }
    if (!clear) {
      const t = setTimeout(() => setPending((p) => (p && Date.now() - p.at > GIVE_UP_MS ? null : p)), GIVE_UP_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      // A note is up (such as "You're open to hit · Off the map until Location
      // is on"): the card never dims it; looked at again a beat later.
      if (toastShowing()) { setRetry((n) => n + 1); return; }
      const { moment, ask } = pending;
      setPending(null);
      live.current = true;
      openedAt.current = Date.now();
      touchAt.current = 0;
      setRequest({ moment, ask });
      void markAlertsWhyShown();
    }, SETTLE_MS);
    return () => clearTimeout(t);
  }, [pending, clear, request, retry]);

  useEffect(() => {
    if (!request) return undefined;
    scale.value = reduce ? 1 : POP_FROM_SCALE;
    shown.value = withTiming(1, POP_IN);
    if (!reduce) scale.value = withSpring(1, POP_SPRING);
    const t = setTimeout(() => {
      if (titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current as unknown as Parameters<typeof AccessibilityInfo.sendAccessibilityEvent>[0], 'focus');
    }, 100);
    return () => clearTimeout(t);
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps

  const gone = () => setRequest(null);
  /** `then` runs once the card has gone, so Apple's question or Settings opens over a clear screen. */
  const leave = (then?: () => void) => {
    if (!live.current) return;
    live.current = false;
    shown.value = withTiming(0, POP_OUT, (end) => { if (end) runOnJS(gone)(); });
    setTimeout(() => { setRequest(null); then?.(); }, POP_OUT.duration + 40);
  };
  // A touch that began while the card was still coming up is the second half of the tap that asked: not an answer.
  const settled = () => {
    const began = touchAt.current || Date.now();
    touchAt.current = 0;
    return began - openedAt.current >= POP_SETTLE_MS;
  };
  const notNow = () => { if (settled()) leave(); };
  const turnOn = () => {
    if (!request || Date.now() - openedAt.current < POP_SETTLE_MS) return;
    const ask = request.ask;
    leave(() => {
      if (ask === 'settings') void Linking.openSettings().catch(() => undefined);
      else void registerForPush({ ask: true });
    });
  };

  const dimStyle = useAnimatedStyle(() => ({ opacity: shown.value }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ scale: scale.value }] }));

  if (!request) return null;
  const words = alertsWhyWords(request.moment);
  const settings = request.ask === 'settings';

  const layer = (
    <View style={styles.layer}>
      <Animated.View pointerEvents="none" style={[styles.dim, dimStyle]} />
      <View style={styles.box} accessibilityViewIsModal onAccessibilityEscape={() => leave()}>
        <Animated.View style={[styles.card, cardStyle]}>
          {/* Only scrolls if the phone's largest text would push the buttons off the screen. */}
          <ScrollView style={styles.cardScroll} contentContainerStyle={styles.cardWords} bounces={false} alwaysBounceVertical={false} showsVerticalScrollIndicator={false}>
            <Text ref={titleRef} nativeID={TITLE_ID} accessibilityRole="header" maxFontSizeMultiplier={TextScale.TITLE} {...EVEN} style={[styles.cardTitle, EVEN_WEB]}>{words.title}</Text>
            <View style={styles.reasons}>
              {words.reasons.map((r) => (
                <View key={r.text} style={styles.reason}>
                  <Ionicons name={r.icon as React.ComponentProps<typeof Ionicons>['name']} size={17} color={colors.textMuted} style={styles.reasonIcon} />
                  <Text style={styles.reasonText}>{r.text}</Text>
                </View>
              ))}
            </View>
            {/* Apple asks only once: someone who said no reads where to turn them on instead. */}
            {settings ? <Text style={styles.cardLine}>Alerts are off for CourtSide in your phone’s Settings.</Text> : null}
          </ScrollView>
          <View style={styles.cardActions}>
            <Submit short radius={BUTTON_CORNER} label={settings ? 'Open Settings' : 'Turn on alerts'} onPress={turnOn} />
            {/* The decline stays plain to see and one tap: the same shape, in plain grey, never hidden. */}
            <Pressable accessibilityRole="button" accessibilityLabel="Not now" onPressIn={() => { touchAt.current = Date.now(); }} onPress={notNow} style={({ pressed }) => [styles.notNow, pressed && styles.pressed]}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.notNowText}>Not now</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
      {/* A tap outside is Not now. Not a button for a screen reader: Not now on the card says it. */}
      <Pressable accessible={false} focusable={false} importantForAccessibility="no" style={StyleSheet.absoluteFill} onPressIn={() => { touchAt.current = Date.now(); }} onPress={notNow} />
    </View>
  );

  if (Platform.OS === 'ios') {
    return <FullWindowOverlay unstable_accessibilityContainerViewIsModal>{layer}</FullWindowOverlay>;
  }
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => leave()}><SwipeArea on={false}>
      {layer}
    </SwipeArea></Modal>
  );
}

/** Lines that wrap as a sentence does, never one word alone on the last (as the "Who can see you" card). */
const EVEN = { lineBreakStrategyIOS: 'push-out', textBreakStrategy: 'balanced' } as const;
const EVEN_WEB = Platform.OS === 'web' ? ({ textWrap: 'pretty' } as unknown as TextStyle) : null;

/** The card's inner side margin, as the "Who can see you" card's: the words and both buttons share one left edge. */
const CARD_PAD = spacing.lg + spacing.xs;
/** The buttons' corner: a step under the card's, never rounder than the card that holds them. */
const BUTTON_CORNER = radius.md;

// The "Who can see you" card's own look (app/map-visibility, design E1), with a short list of reasons in place of its faces.
const styleDefinitions = StyleSheet.create({
  layer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xxxl },
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay },
  box: { zIndex: 1, width: '100%', maxWidth: 332, maxHeight: '100%' },
  card: {
    flexShrink: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...buttonShape.curve,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.12)',
  },
  cardScroll: { flexGrow: 0, flexShrink: 1 },
  cardWords: { paddingHorizontal: CARD_PAD, paddingTop: spacing.lg + 2 },
  cardTitle: { ...typography.heading, lineHeight: 22, color: colors.text },
  reasons: { marginTop: spacing.md, gap: spacing.sm + 2 },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 2 },
  reasonIcon: { marginTop: 1 },
  reasonText: { ...typography.small, fontSize: 15, lineHeight: 20, color: colors.text, flex: 1 },
  cardLine: { ...typography.small, fontSize: 14, lineHeight: 19, color: colors.textMuted, marginTop: spacing.md },
  cardActions: { paddingHorizontal: CARD_PAD, paddingTop: spacing.lg + 2, paddingBottom: CARD_PAD, gap: spacing.sm },
  notNow: { minHeight: buttonShape.height, borderRadius: BUTTON_CORNER, ...buttonShape.curve, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, backgroundColor: colors.surfaceAlt },
  notNowText: { ...typography.bodyStrong, fontSize: buttonShape.label, color: colors.text, textAlign: 'center' },
  pressed: { transform: [{ scale: 0.99 }] },
});

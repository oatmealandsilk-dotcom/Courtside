import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Linking, Modal, Platform, type Text } from 'react-native';
import { usePathname } from 'expo-router';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { FullWindowOverlay } from 'react-native-screens';

import { POP_FROM_SCALE, POP_IN, POP_OUT, POP_SETTLE_MS, POP_SPRING } from '@/components/popMotion';
import { AlertsWhyCard } from '@/components/AlertsWhyCard';
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

/** A moment after the screen is clear (the sheet closed, the pin landed), so the card never lands on what was just done. */
const SETTLE_MS = 900;
/** Still busy this long after the moment (writing, a sheet up, the tutorial): it is dropped, and not counted. */
const GIVE_UP_MS = 20_000;

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
  // Apple's 5.1.1(iv) (build 22 review, Nov 12): on an iPhone or iPad, a card before Apple's own alerts question may
  // not be closed or put off. There, Continue is its one way out (no Not now, no tap outside, no escape), and
  // Apple's question, where a no is given, always follows. "Open Settings" asks nothing, so it keeps its Not now.
  // Its button says Continue there, never words that read as the yes itself (Apple: "Continue" or "Next", not "Allow").
  const onlyOn = Platform.OS === 'ios' && !settings;

  const layer = (
    <AlertsWhyCard
      words={words}
      settings={settings}
      onlyOn={onlyOn}
      dimStyle={dimStyle}
      cardStyle={cardStyle}
      reduce={reduce}
      shown={shown}
      titleRef={titleRef}
      onTurnOn={turnOn}
      onNotNow={notNow}
      onTouch={() => { touchAt.current = Date.now(); }}
      onEscape={onlyOn ? undefined : () => leave()}
    />
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

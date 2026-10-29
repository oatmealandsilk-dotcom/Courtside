import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { Faces, useFriendsBack } from './map-visibility';
import { POP_FROM_SCALE, POP_IN, POP_OUT, POP_SETTLE_MS, POP_SPRING } from '@/components/popMotion';
import { Submit } from '@/components/sheet/SheetForm';
import type { AutoLogAudience } from '@/data/types';
import { askLine, demoAsk, markAsked, sourcesWords, willSeeWords } from '@/features/activity/autoLogAsk';
import { isDemo } from '@/features/activity/flags';
import { useAndroidBack } from '@/lib/androidBack';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { TextScale, buttonShape, colors, radius, spacing, typography } from '@/theme';

/**
 * "Show your tennis to friends?" (owner, Oct 29: "Can you somehow push them
 * to pick friends", "Show to friends should be emphasized and pushed hard"),
 * asked once of a player who never chose who sees the tennis that logs
 * itself (features/activity/autoLogAsk): opened by itself the next time the
 * app is open (components/AutoLogAsk), or by its one phone alert.
 *
 * The map's "Who can see you" card (design E1, app/map-visibility), in the
 * same place and with the same motion: on its left edge, the faces and names
 * of the friends who follow you back, the ones a yes shows them to ("Sam,
 * Marcus and 5 friends will see it"); the question; one line on who sees
 * them and what of them (an adult's heart rate, zones and calories; under
 * 18 or no birthday, only when and how long); one on what it brings.
 * "Show to friends" is the big, solid green button. "Keep private" is a
 * plain text button under it: smaller, but in the page's own ink, one tap,
 * and saved as a real answer (Only me), like iOS's own "Not Now" (Apple's
 * 5.1.3: shown to others only on a clear yes). Either answer is saved as
 * Settings saves it; a yes shows the sessions already logged at once. A tap
 * outside, Back or Escape closes it and saves nothing (nothing is shared).
 */
export default function AutoLogAsk() {
  const styles = useThemedStyles(styleDefinitions);
  const reduce = useReducedMotion();
  const params = useLocalSearchParams<{ from?: string; preview?: string }>();
  const { actions, autoLogSharing, currentUser, currentUserId, detectedActivities } = useApp();
  const friends = useFriendsBack();
  // The demo can show a teen's card (`preview=teen`, or `?ask=teen`); a real account is always its own age.
  const teen = isDemo(currentUserId) && (params.preview === 'teen' || demoAsk() === 'teen');
  const [busy, setBusy] = useState<AutoLogAudience | null>(null);
  const busyRef = useRef(false);
  const alive = useRef(true);
  const answered = useRef(false);
  const [error, setError] = useState('');
  const leaving = useRef(false);
  const done = useRef(false);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedAt = useRef(Date.now());
  const touchAt = useRef(0);
  const boxRef = useRef<View>(null);
  const titleRef = useRef<Text>(null);
  const keepRef = useRef<View>(null);
  const scroll = useRef<ScrollView>(null);
  const sizes = useRef({ content: 0, view: 0, settled: false });
  const [overflow, setOverflow] = useState(false);
  const checkOverflow = () => { const z = sizes.current; if (z.settled) setOverflow(z.content > z.view + 1); };
  useEffect(() => { if (overflow) scroll.current?.flashScrollIndicators(); }, [overflow]);
  useEffect(() => () => { alive.current = false; if (fallback.current) clearTimeout(fallback.current); }, []);

  // Seen once, however it was opened: never put up by itself again on this phone.
  useEffect(() => { if (currentUserId) void markAsked(currentUserId); }, [currentUserId]);
  // Already chosen (in Settings, on "Tennis logged", or on another phone) before an answer here: Settings' page instead.
  useEffect(() => {
    if (answered.current || autoLogSharing == null) return;
    answered.current = true;
    router.replace('/auto-log-sharing');
  }, [autoLogSharing]);

  const shown = useSharedValue(0);
  const scale = useSharedValue(reduce ? 1 : POP_FROM_SCALE);
  useEffect(() => {
    shown.value = withTiming(1, POP_IN);
    if (!reduce) scale.value = withSpring(1, POP_SPRING);
    const up = setTimeout(() => { sizes.current.settled = true; checkOverflow(); }, POP_IN.duration + 120);
    // A screen reader starts on the question; a keyboard on Keep private, so a stray Enter never shares anything.
    const focus = setTimeout(() => {
      if (Platform.OS === 'web') (keepRef.current as unknown as HTMLElement | null)?.focus?.();
      else if (titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current as unknown as Parameters<typeof AccessibilityInfo.sendAccessibilityEvent>[0], 'focus');
    }, Platform.OS === 'web' ? 0 : 100);
    return () => { clearTimeout(up); clearTimeout(focus); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = () => {
    if (done.current) return;
    done.current = true;
    if (fallback.current) clearTimeout(fallback.current);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  const leave = () => {
    if (leaving.current || busyRef.current) return;
    leaving.current = true;
    shown.value = withTiming(0, POP_OUT, (end) => { if (end) runOnJS(finish)(); });
    fallback.current = setTimeout(finish, POP_OUT.duration + 200);
  };
  const outsideTap = () => {
    const began = touchAt.current || Date.now();
    touchAt.current = 0;
    if (began - openedAt.current < POP_SETTLE_MS) return;
    leave();
  };

  const choose = async (v: AutoLogAudience) => {
    if (busyRef.current || leaving.current) return;
    // The second half of a double tap on what opened it is not an answer.
    if (Date.now() - openedAt.current < POP_SETTLE_MS) return;
    setError('');
    busyRef.current = true;
    answered.current = true;
    setBusy(v);
    let ok = false;
    try {
      // Settings' own save: the server shows (or keeps) the sessions already logged at once.
      ok = await actions.setAutoLogSharing(v);
    } catch {
      ok = false;
    } finally {
      busyRef.current = false;
    }
    if (!alive.current) return;
    setBusy(null);
    if (!ok) { answered.current = false; setError('Couldn’t save that. Try again.'); return; }
    leave();
  };

  useAndroidBack(() => { leave(); return true; });
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      leave();
    };
    const onFocus = (e: FocusEvent) => {
      const box = boxRef.current as unknown as HTMLElement | null;
      if (box && e.target instanceof Node && !box.contains(e.target)) (keepRef.current as unknown as HTMLElement | null)?.focus?.();
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocus);
    return () => { window.removeEventListener('keydown', onKey, true); document.removeEventListener('focusin', onFocus); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dimStyle = useAnimatedStyle(() => ({ opacity: shown.value }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ scale: scale.value }] }));
  const webDialog = Platform.OS === 'web' ? { role: 'dialog' as const, 'aria-modal': true, 'aria-labelledby': TITLE_ID, 'aria-describedby': LINE_ID } : {};
  const sees = willSeeWords(friends);

  return (
    <View style={styles.layer}>
      <Animated.View pointerEvents="none" style={[styles.dim, dimStyle]} />
      <View ref={boxRef} style={[styles.box, desktop && styles.boxWide]} accessibilityViewIsModal onAccessibilityEscape={leave} {...webDialog}>
        <Animated.View style={[styles.card, cardStyle]}>
          <ScrollView
            ref={scroll}
            style={styles.cardScroll}
            contentContainerStyle={styles.cardWords}
            bounces={false}
            alwaysBounceVertical={false}
            showsVerticalScrollIndicator={overflow}
            onLayout={(e) => { sizes.current.view = e.nativeEvent.layout.height; checkOverflow(); }}
            onContentSizeChange={(_, h) => { sizes.current.content = Math.ceil(h); checkOverflow(); }}
          >
            {/* Who a yes shows them to, by face and name: real friends who follow you back only; none, no row. */}
            {friends.length ? <Faces people={friends} words={sees} label={sees} lines={2} /> : null}
            <Text ref={titleRef} nativeID={TITLE_ID} accessibilityRole="header" maxFontSizeMultiplier={TextScale.TITLE} {...EVEN} style={[styles.cardTitle, EVEN_WEB]}>Show your tennis to friends?</Text>
            {/* Apple 5.1.3: who sees them and exactly what of them, said before the yes. */}
            <Text nativeID={LINE_ID} {...EVEN} style={[styles.cardLine, EVEN_WEB]}>{askLine(sourcesWords(currentUserId, detectedActivities), currentUser, teen)}</Text>
            <Text {...EVEN} style={[styles.cardLine, EVEN_WEB]}>Friends can like and comment on them in Activities. Change it anytime in Settings.</Text>
          </ScrollView>
          <View style={styles.cardActions}>
            {error ? <Text style={[styles.error, styles.errorGap]}>{error}</Text> : null}
            {/* The one to tap: the sheet-size, solid green button, the card's full width. */}
            <Submit radius={BUTTON_CORNER} label="Show to friends" busy={busy === 'mutuals'} disabled={busy === 'private'} busyLabel="Saving…" onPress={() => { void choose('mutuals'); }} />
            {/* The no: smaller and plain, never hidden or greyed out, in the page's own ink, one tap, a real answer (Only me). */}
            <Pressable ref={keepRef} accessibilityRole="button" accessibilityLabel="Keep private" accessibilityState={{ disabled: !!busy, busy: busy === 'private' }} disabled={!!busy} hitSlop={6} onPress={() => { void choose('private'); }} style={({ pressed }) => [styles.keep, pressed && !busy && styles.keepPressed]}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.keepText}>{busy === 'private' ? 'Saving…' : 'Keep private'}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
      {/* A tap outside closes it and saves nothing. Not a button for a screen reader: Keep private says no. */}
      <Pressable accessible={false} focusable={false} importantForAccessibility="no" style={StyleSheet.absoluteFill} onPressIn={() => { touchAt.current = Date.now(); }} onPress={outsideTap} />
    </View>
  );
}

const TITLE_ID = 'courtside-auto-log-ask-title';
const LINE_ID = 'courtside-auto-log-ask-line';
/** Lines that wrap as a sentence does, never one word alone on the last (as the map's card). */
const EVEN = { lineBreakStrategyIOS: 'push-out', textBreakStrategy: 'balanced' } as const;
const EVEN_WEB = Platform.OS === 'web' ? ({ textWrap: 'pretty' } as unknown as TextStyle) : null;
/** The card's inner side margin, as the map's card. */
const CARD_PAD = spacing.lg + spacing.xs;
/** The button's corner: a step under the card's, as the map's card. */
const BUTTON_CORNER = radius.md;
const desktop = isDesktopBrowser();

const styleDefinitions = StyleSheet.create({
  // The map's "Who can see you" card (E1): its size, place, corner, edge and shadow.
  layer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xxxl },
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay },
  box: { zIndex: 1, width: '100%', maxWidth: 332, maxHeight: '100%' },
  boxWide: { maxWidth: 400 },
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
  cardLine: { ...typography.small, fontSize: 14, lineHeight: 19, color: colors.textMuted, marginTop: spacing.xs },
  cardActions: { paddingHorizontal: CARD_PAD, paddingTop: spacing.lg + 2, paddingBottom: spacing.md, gap: spacing.xs },
  // Keep private: plain words under the button, a full finger's height, in the page's own ink.
  keep: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: BUTTON_CORNER },
  keepPressed: { backgroundColor: colors.surfaceAlt },
  keepText: { ...typography.body, fontSize: 15, color: colors.text, textAlign: 'center' },
  error: { ...typography.small, color: colors.danger },
  errorGap: { marginBottom: spacing.xs },
});

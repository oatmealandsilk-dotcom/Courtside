import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useModalOpenWhile } from '@/lib/modalOpen';
import Animated, { Easing, ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { FullWindowOverlay } from 'react-native-screens';

import { isDesktopBrowser } from '@/lib/browserDevice';
import { useHoldTour } from '@/features/tour/tourHold';
import { alsoChoices, setConfirmHost, type ConfirmOptions } from '@/lib/confirm';
import * as haptics from '@/lib/haptics';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { colors, font, radius, spacing, typography } from '@/theme';

// Timed by hand below, so Reduce Motion is honoured here (fade only) rather than by skipping the fade too.
const NEVER = ReduceMotion.Never;
/** The card grows the last few percent on a spring: quick, with the faintest settle. */
const FROM_SCALE = 0.92;
const SPRING = { damping: 20, stiffness: 320, mass: 0.8, reduceMotion: NEVER } as const;
const IN = { duration: 180, easing: Easing.out(Easing.quad), reduceMotion: NEVER } as const;
const OUT = { duration: 140, easing: Easing.in(Easing.quad), reduceMotion: NEVER } as const;
/**
 * A touch that begins this soon after the card comes up is the second half
 * of a double tap on whatever asked, not an answer, so it is ignored (the
 * phone's own alert does the same while it appears). 300 ms is Android's
 * double-tap window. Escape, Android's back and the screen reader's escape
 * still cancel at once.
 */
const SETTLE_MS = 300;
const TITLE_ID = 'courtside-confirm-title';
const MESSAGE_ID = 'courtside-confirm-message';

const sameQuestion = (a: ConfirmOptions, b: ConfirmOptions) =>
  a.title === b.title && a.message === b.message && a.confirmLabel === b.confirmLabel
  && alsoChoices(a).map((c) => c.label).join('\n') === alsoChoices(b).map((c) => c.label).join('\n');

/** Which row was tapped: Cancel, the action, or one of the other answers (`also`, by its place in the list). */
type Answer = 'cancel' | 'yes' | number;

/**
 * Every "are you sure?" in the app (`confirm` in src/lib/confirm.ts), drawn
 * once by the root layout: the app's own card, the way Instagram and TikTok
 * ask, instead of the phone's grey system alert.
 *
 * A rounded card in the middle of a dimmed screen: the question in bold, one
 * muted line, then two full-width rows on hairlines, the action's own word on
 * top (red when it deletes or cuts someone off) and Cancel under it. A
 * question with a second answer (`also`) has it on a row of its own between
 * the two. It
 * springs in from a touch smaller with a light tap of the phone (a warning
 * beat when it is red), and fades away when answered; with Reduce Motion on it
 * only fades. A tap on the dimmed screen, Android's back, Escape or the
 * VoiceOver escape gesture is Cancel.
 *
 * It has to sit above everything, sheets and menus included. On an iPhone the
 * pages that slide up (a post's menu, comments, Send to) are the phone's own
 * layers, which a plain view or even a pop-up of React Native's cannot cover,
 * so the card is put straight on the phone's window (FullWindowOverlay). On
 * Android and in a browser a pop-up layer is drawn over whatever is already
 * open, so that is what it uses.
 */
export function ConfirmHost() {
  const styles = useThemedStyles(styleDefinitions);
  const reduce = useReducedMotion();
  const reduceRef = useRef(reduce);
  reduceRef.current = reduce;
  // What the card says. Kept while it fades out, so the words do not vanish on the way.
  const [request, setRequest] = useState<ConfirmOptions | null>(null);
  // The tutorial never starts under a question; it waits until the card has gone.
  useHoldTour(request !== null);
  // Android draws the card in a Modal: the message banner stands aside meanwhile (see modalOpen).
  useModalOpenWhile(request !== null);
  // The question still waiting for an answer: null once answered, even mid-fade.
  const live = useRef<ConfirmOptions | null>(null);
  // The question whose card is on screen (coming in, up, or fading out): null once it has gone. A
  // question is only asked, not yet on screen, until its card starts to come in (the effect below).
  const onScreen = useRef<ConfirmOptions | null>(null);
  // How many cards have come in, so a fade that ends just as a newer card comes in leaves that one be.
  const drawn = useRef(0);
  // Anything asked while a card was up waits its turn.
  const line = useRef<ConfirmOptions[]>([]);
  const shown = useSharedValue(0);
  const scale = useSharedValue(1);
  const titleRef = useRef<Text>(null);
  const cancelRef = useRef<View>(null);

  // When the current card came up, and when the touch now on it began (0: none yet).
  const openedAt = useRef(0);
  const touchAt = useRef(0);

  const present = (next: ConfirmOptions) => {
    live.current = next;
    openedAt.current = Date.now();
    touchAt.current = 0; // a touch begun on the card before this question is not an answer to it
    setRequest(next);
  };

  useEffect(() => {
    setConfirmHost({
      show: (next) => {
        const asking = live.current;
        if (!asking) { present(next); return; }
        // A double tap asks the same thing twice; it is asked once.
        if (sameQuestion(asking, next) || line.current.some((q) => sameQuestion(q, next))) return;
        line.current.push(next);
      },
      // The screen that asked has gone: its question leaves unanswered, as Cancel would leave it.
      withdraw: (request) => {
        line.current = line.current.filter((q) => q !== request);
        if (live.current === request) answer('cancel');
      },
    });
    return () => setConfirmHost(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The card is gone from view (`turn`: which card it was): the next question in line, or nothing.
  const gone = (turn = drawn.current) => {
    if (turn !== drawn.current) return; // a newer card came in as this one finished; it is on screen now
    onScreen.current = null;
    if (live.current) return; // a new question came in while this one faded; its card comes in now
    const next = line.current.shift();
    if (next) present(next);
    else setRequest(null);
  };

  /** `own`: the safe answer's own row was tapped (its onCancel runs then, never on a tap outside or Escape). */
  const answer = (choice: Answer, own = false) => {
    const asked = live.current;
    if (!asked) return; // already answered: a second tap, or Escape heard twice
    live.current = null;
    if (onScreen.current === asked) {
      const turn = drawn.current;
      shown.value = withTiming(0, OUT, (done) => { if (done) runOnJS(gone)(turn); });
    } else if (onScreen.current) {
      // Taken back before its card came in (withdrawConfirm in the same moment it was asked), so it
      // never shows: the card still fading out from before keeps its own words and finishes going.
      setRequest(onScreen.current);
    } else {
      gone(); // ...and with nothing on screen, the next question in line comes straight away, or nothing
    }
    // The action runs as the card leaves, the way Instagram's delete does.
    if (choice === 'yes') void asked.onConfirm();
    else if (typeof choice === 'number') void alsoChoices(asked)[choice]?.onPress();
    else if (own) asked.onCancel?.();
  };

  // A tap on a button or the dimmed screen counts only if it began once the card had settled (SETTLE_MS).
  const touchBegan = () => { touchAt.current = Date.now(); };
  const tapped = (choice: Answer, own = false) => {
    // No touch began (TalkBack's double tap goes straight to the press): judged by now instead.
    const began = touchAt.current || Date.now();
    touchAt.current = 0;
    if (began - openedAt.current < SETTLE_MS) return;
    answer(choice, own);
  };

  // Each new question: in it comes, felt as well as seen, with the focus put where it belongs.
  useEffect(() => {
    if (!request) return undefined;
    // Taken back before its card could come in (see answer): it never comes in, so nothing is left up that cannot answer.
    if (live.current !== request) return undefined;
    onScreen.current = request;
    drawn.current += 1;
    // The phone's keyboard sits above the app and would cover the card's buttons.
    if (Platform.OS !== 'web') Keyboard.dismiss();
    haptics.asking(!!request.destructive);
    // Straight from nothing it grows in; a question that follows one still fading picks up where that one is.
    if (shown.value < 0.05) scale.value = reduceRef.current ? 1 : FROM_SCALE;
    shown.value = withTiming(1, IN);
    scale.value = reduceRef.current ? 1 : withSpring(1, SPRING);
    // A keyboard in a browser starts on Cancel, so a stray Enter never deletes anything.
    // A screen reader starts on the question, where a double tap does nothing.
    const t = setTimeout(() => {
      if (Platform.OS === 'web') (cancelRef.current as unknown as HTMLElement | null)?.focus?.();
      else if (titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current as unknown as Parameters<typeof AccessibilityInfo.sendAccessibilityEvent>[0], 'focus');
    }, Platform.OS === 'web' ? 0 : 100);
    return () => clearTimeout(t);
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps

  // A keyboard on a computer: Escape is Cancel, and nothing beneath the card
  // hears a key while it is up (Escape there would also close the sheet the
  // question came from; the arrows would change tabs). Tab, Enter and Space
  // still work the card's own two buttons.
  useEffect(() => {
    if (Platform.OS !== 'web' || !request) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); answer('cancel'); return; }
      if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ') return;
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps

  const dimStyle = useAnimatedStyle(() => ({ opacity: shown.value }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ scale: scale.value }] }));

  if (!request) return null;

  const web = Platform.OS === 'web';
  // In a browser it is announced as an alert dialog: the question, then the line under it.
  // The card itself can hold the focus (never by Tab) because a menu closing
  // underneath hands the focus back to the page; the browser's pop-up layer
  // then pulls it into the card, and the card passes it straight on to
  // Cancel, a beat later so that layer has finished moving it.
  const webDialog = web ? {
    role: 'alertdialog' as const, 'aria-modal': true, 'aria-labelledby': TITLE_ID, 'aria-describedby': request.message ? MESSAGE_ID : undefined,
    tabIndex: -1 as const,
    onFocus: (e: { target: unknown; currentTarget: unknown }) => {
      if (e.target === e.currentTarget) setTimeout(() => (cancelRef.current as unknown as HTMLElement | null)?.focus?.(), 0);
    },
  } : {};
  const layer = (
    <View style={styles.layer}>
      {/* The card comes first, so a keyboard Tab never lands on the dimmed screen; it is raised above it instead.
          The dialog's own box is a plain view: the browser drops focus settings from an animated one. */}
      <View
        style={[styles.box, desktop && styles.boxWide]}
        accessibilityViewIsModal
        onAccessibilityEscape={() => answer('cancel')}
        {...webDialog}
      >
        <Animated.View style={[styles.card, cardStyle]}>
          {/* Only scrolls if the phone's largest text would push the buttons off the screen. */}
          <ScrollView style={styles.scroll} contentContainerStyle={styles.words} bounces={false} alwaysBounceVertical={false} showsVerticalScrollIndicator={false}>
            <Text ref={titleRef} nativeID={TITLE_ID} accessibilityRole="header" style={styles.title}>{request.title}</Text>
            {request.message ? <Text nativeID={MESSAGE_ID} style={styles.message}>{request.message}</Text> : null}
          </ScrollView>
          {/* Cancel comes first for the keyboard and the browser's own focus, so the safe answer is
              the one already chosen; the column is turned over so the action still reads on top. */}
          <View style={styles.actions}>
            <Pressable
              ref={cancelRef}
              accessibilityRole="button"
              accessibilityLabel={request.cancelLabel ?? 'Cancel'}
              onPressIn={touchBegan}
              onPress={() => tapped('cancel', true)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Text style={styles.cancel}>{request.cancelLabel ?? 'Cancel'}</Text>
            </Pressable>
            {/* The other answers, between the two; laid in backwards, as the column is turned over. */}
            {alsoChoices(request).map((choice, at) => (
              <Pressable
                key={`${at}-${choice.label}`}
                accessibilityRole="button"
                accessibilityLabel={choice.label}
                onPressIn={touchBegan}
                onPress={() => tapped(at)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <Text style={[styles.action, choice.destructive && styles.danger]}>{choice.label}</Text>
              </Pressable>
            )).reverse()}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={request.confirmLabel}
              onPressIn={touchBegan}
              onPress={() => tapped('yes')}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Text style={[styles.action, request.destructive && styles.danger]}>{request.confirmLabel}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
      {/* The dimmed screen: a tap on it is Cancel. Not a button, so neither a
          screen reader nor the Tab key ever lands on it; Cancel already says it. */}
      <Animated.View
        style={[styles.dim, dimStyle]}
        onStartShouldSetResponder={() => true}
        onResponderGrant={touchBegan}
        onResponderRelease={() => tapped('cancel')}
      />
    </View>
  );

  if (Platform.OS === 'ios') {
    return <FullWindowOverlay unstable_accessibilityContainerViewIsModal>{layer}</FullWindowOverlay>;
  }
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => answer('cancel')}>
      {layer}
    </Modal>
  );
}

// A computer's screen has the room for Instagram's wider box; a phone gets the narrower one.
const desktop = isDesktopBrowser();

const styleDefinitions = StyleSheet.create({
  layer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl, paddingVertical: spacing.xxxl },
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay },
  box: { zIndex: 1, width: '100%', maxWidth: 300, maxHeight: '100%' },
  boxWide: { maxWidth: 400 },
  card: {
    flexShrink: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    // The page behind is dimmed, but on a dark court the card is dark too: a faint edge keeps it a card.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    boxShadow: '0px 10px 30px rgba(0, 0, 0, 0.2)',
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  words: { alignItems: 'center', gap: 6, paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.lg + 2 },
  title: { ...typography.heading, ...font('700'), color: colors.text, textAlign: 'center' },
  message: { ...typography.small, fontSize: 14, lineHeight: 19, color: colors.textMuted, textAlign: 'center' },
  actions: { flexDirection: 'column-reverse' },
  row: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  pressed: { backgroundColor: colors.surfaceAlt },
  action: { ...typography.body, ...font('600'), color: colors.brand, textAlign: 'center' },
  danger: { color: colors.danger },
  cancel: { ...typography.body, color: colors.text, textAlign: 'center' },
});

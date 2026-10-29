import { PRESS_DIM } from '@/theme/press';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type TextStyle } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useAndroidBack } from '@/lib/androidBack';

import { DragSheet } from '@/components/DragSheet';
import { POP_FROM_SCALE, POP_IN, POP_OUT, POP_SETTLE_MS, POP_SPRING } from '@/components/popMotion';
import { SheetTitle, Submit } from '@/components/sheet/SheetForm';
import { isDesktopBrowser } from '@/lib/browserDevice';
import type { MapVisibility } from '@/data/types';
import { CONSENT_CHOICES, FIRST_YES, TEEN_NOTICE, onTeenMap, settleWhoSeesYou } from '@/features/players/mapPrivacy';
import { checkInEnds, clock } from '@/features/players/checkIn';
import { BIRTHDAY_OPENS_IT, ageUnknown } from '@/features/players/age';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { TextScale, colors, font, lift, radius, spacing, typography, withAlpha } from '@/theme';

/**
 * "Who can see you on the map?" (migration 189, after Apple's 5.1.2(i)
 * review): a plain yes or no. Yes: friends who follow each other with you
 * see your pin, but only after you tap Check in, and only until 10pm that
 * day. Strangers never see where you are. No: nothing of yours is ever on
 * the map.
 *
 * `mode=first`: the first ask, design C1, the small pop-up card (Oct 28,
 * owner: "C is better but make it a bit more aesthetic and the whole card a
 * bit smaller"; before that, "Too many words, Too big / a whole sheet, We
 * want to encourage them to turn it on"). A small card in the middle of the
 * dimmed screen, the way every "are you sure?" in the app asks (ConfirmHost:
 * the same width, corner, shadow, dim and motion, popMotion). Words only, no
 * faces (review, Oct 28: tiny initials read as placeholders, not people):
 * "Let friends see you're up to hit?", and one short line: only friends who
 * follow you back, only when you tap, and it ends by itself (at 10pm, or in 2
 * hours from 8pm). "Turn on" saves the yes; then Apple's own location prompt,
 * then Up to hit. "Not now" (or a tap outside, Escape, Android's Back) saves
 * nothing and shares nothing; it asks again the next time you tap Up to hit.
 * `from` says what asked (WhoSeesFrom): only Up to hit's ask names its time.
 * I'm playing here (`court`), Show friends, a teen's Open to hit and the
 * re-ask each end on their own clock, so theirs ask "Let friends see where
 * you are?" and say only when you share, and that it ends by itself. A teen's
 * line says their rule instead (under 18, only friends who follow you back,
 * only your rough area) and that it ends by itself.
 * `mode=manage`: from Settings → Privacy. A tap saves at once; "No one"
 * also takes any live check-in off the map.
 *
 * A teen (migration 78) reads the same two answers under a short notice;
 * their rule is unchanged: only friends who follow each other, only their
 * rough area, off until they say yes here (under 16s too, migration 119).
 */
export default function MapVisibilityScreen() {
  const params = useLocalSearchParams<{ mode?: string; from?: string }>();
  if (params.mode === 'manage') return <ManageSheet />;
  // Up to hit's own words; any other ask (I'm playing here's too), the general ones.
  return <FirstAsk upToHit={params.from === 'uth'} />;
}

/* ------------------------------------------------------------ the first ask */

/** A tap this soon after an ask comes up is the second half of a double tap on what opened it, not an answer (popMotion). */
const SETTLE_MS = POP_SETTLE_MS;
const TITLE_ID = 'courtside-who-sees-title';
const LINE_ID = 'courtside-who-sees-line';

/**
 * The first ask, design C1: a small card in the middle of the dimmed screen.
 * It comes and goes as the app's "are you sure?" card does (popMotion): the
 * dim and the card fade in, the card growing the last few percent; on an
 * answer both fade away, then the screen closes and whoever asked hears the
 * answer. Only the card and its own dim move, never anything under them.
 *
 * As that card does, it waits out a double tap (SETTLE_MS): a tap on Turn
 * on, Not now or the dimmed screen that began that soon after it came up is the
 * second half of the tap on Up to hit, so neither a yes nor a Not now. Back,
 * Escape and the screen reader's escape still close it at once. While the
 * yes is saving nothing closes it, so a Not now never lands after a yes that
 * then saves anyway. A screen reader starts on the question; a keyboard on
 * Not now, the safe answer, and Tab stays inside the card.
 */
function FirstAsk({ upToHit }: { upToHit: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const reduce = useReducedMotion();
  const { fontScale } = useWindowDimensions();
  const { actions, currentUser, teenMap } = useApp();
  const teen = onTeenMap(currentUser, teenMap);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const alive = useRef(true);
  const [error, setError] = useState('');
  // What the screen closes with: the yes once it is saved, else nothing (Not now saves nothing).
  const answer = useRef<MapVisibility | null>(null);
  const leaving = useRef(false);
  const done = useRef(false);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedAt = useRef(Date.now());
  // When the touch now on the dimmed screen began (0: none yet).
  const touchAt = useRef(0);
  const boxRef = useRef<View>(null);
  const titleRef = useRef<Text>(null);
  const notNowRef = useRef<View>(null);
  // The phone's largest text can make the words taller than the card; they then scroll under the
  // buttons, so the scroll bar shows and flashes once the card is up, saying there is more.
  const scroll = useRef<ScrollView>(null);
  const sizes = useRef({ content: 0, view: 0, settled: false });
  const [overflow, setOverflow] = useState(false);
  const checkOverflow = () => { const z = sizes.current; if (z.settled) setOverflow(z.content > z.view + 1); };
  useEffect(() => { if (overflow) scroll.current?.flashScrollIndicators(); }, [overflow]);
  // However the screen goes, whoever asked hears how it ended.
  useEffect(() => () => {
    alive.current = false;
    if (fallback.current) clearTimeout(fallback.current);
    settleWhoSeesYou(answer.current);
  }, []);

  const shown = useSharedValue(0);
  const scale = useSharedValue(reduce ? 1 : POP_FROM_SCALE);
  useEffect(() => {
    shown.value = withTiming(1, POP_IN);
    if (!reduce) scale.value = withSpring(1, POP_SPRING);
    // Up and still: now an overflow is real, not a size caught mid-grow.
    const up = setTimeout(() => { sizes.current.settled = true; checkOverflow(); }, POP_IN.duration + 120);
    // The focus where it belongs (as ConfirmHost): a keyboard on Not now, so a stray Enter never says yes;
    // a screen reader on the question.
    const focus = setTimeout(() => {
      if (Platform.OS === 'web') (notNowRef.current as unknown as HTMLElement | null)?.focus?.();
      else if (titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current as unknown as Parameters<typeof AccessibilityInfo.sendAccessibilityEvent>[0], 'focus');
    }, Platform.OS === 'web' ? 0 : 100);
    return () => { clearTimeout(up); clearTimeout(focus); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = () => {
    if (done.current) return;
    done.current = true;
    if (fallback.current) clearTimeout(fallback.current);
    router.back();
    settleWhoSeesYou(answer.current);
  };
  const leave = () => {
    // While the yes is saving it stays: leaving now would say no to whoever asked, then save the yes anyway.
    if (leaving.current || busyRef.current) return;
    leaving.current = true;
    shown.value = withTiming(0, POP_OUT, (end) => { if (end) runOnJS(finish)(); });
    // Whatever happens to the fade, the screen is not left open behind it.
    fallback.current = setTimeout(finish, POP_OUT.duration + 200);
  };
  // Not now, once the card has settled (a tap on it sooner is the second half of a double tap).
  const notNow = () => { if (Date.now() - openedAt.current >= SETTLE_MS) leave(); };
  // A tap on the dimmed screen is Not now, but only one that began once the card had settled.
  const outsideTap = () => {
    // No touch began (a screen reader's double tap goes straight to the press): judged by now instead.
    const began = touchAt.current || Date.now();
    touchAt.current = 0;
    if (began - openedAt.current < SETTLE_MS) return;
    leave();
  };

  const turnOn = async () => {
    if (busyRef.current || leaving.current) return;
    // The second half of a double tap on what asked is not a yes.
    if (Date.now() - openedAt.current < SETTLE_MS) return;
    setError('');
    busyRef.current = true;
    setBusy(true);
    // A save that throws is a save that failed: the card never stays locked over the app (Not now, Back and Escape wait on it).
    let ok = false;
    try {
      ok = await actions.setMapVisibility('mutuals');
    } catch {
      ok = false;
    } finally {
      busyRef.current = false;
    }
    if (!alive.current) return;
    setBusy(false);
    if (!ok) { setError('Couldn’t save that. Try again.'); return; }
    answer.current = 'mutuals';
    leave();
  };

  // Android's Back and a computer's Escape are Not now, as a tap outside is (never while the yes is saving).
  useAndroidBack(() => { leave(); return true; });
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    // Heard first of all (the window, on the way in) and stopped there, so neither the sheet this was asked
    // from (I'm playing here's, Show friends') nor the shell's own Escape (a plain step back) closes as well.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      leave();
    };
    // Tab never walks out into the page beneath: focus that leaves the card comes back to Not now.
    const onFocus = (e: FocusEvent) => {
      const box = boxRef.current as unknown as HTMLElement | null;
      if (box && e.target instanceof Node && !box.contains(e.target)) (notNowRef.current as unknown as HTMLElement | null)?.focus?.();
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocus);
    return () => { window.removeEventListener('keydown', onKey, true); document.removeEventListener('focusin', onFocus); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dimStyle = useAnimatedStyle(() => ({ opacity: shown.value }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ scale: scale.value }] }));
  // In a browser it is announced as a dialog: the question, then the line under it.
  const webDialog = Platform.OS === 'web' ? { role: 'dialog' as const, 'aria-modal': true, 'aria-labelledby': TITLE_ID, 'aria-describedby': LINE_ID } : {};

  return (
    <View style={styles.layer}>
      <Animated.View pointerEvents="none" style={[styles.dim, dimStyle]} />
      {/* The dialog's own box is a plain view (a browser drops dialog settings from an animated one), raised over the dimmed screen. */}
      <View ref={boxRef} style={[styles.box, desktop && styles.boxWide]} accessibilityViewIsModal onAccessibilityEscape={leave} {...webDialog}>
        <Animated.View style={[styles.card, cardStyle]}>
          {/* Only scrolls if the phone's largest text would push the buttons off the screen; then its bar says so. */}
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
            {/* Words only: the question starts the card. */}
            <Text ref={titleRef} nativeID={TITLE_ID} accessibilityRole="header" maxFontSizeMultiplier={TextScale.TITLE} {...EVEN} style={[styles.cardTitle, EVEN_WEB]}>{askTitle(upToHit, fontScale <= 1)}</Text>
            {/* Apple 5.1.2(i) / 5.1.1: who sees you (only friends who follow you back), only when you tap or share, and that it ends by itself. */}
            <Text nativeID={LINE_ID} {...EVEN} style={[styles.cardLine, EVEN_WEB]}>{askLine(upToHit, teen, ageUnknown(currentUser))}</Text>
          </ScrollView>
          <View style={styles.cardActions}>
            {error ? <Text style={[styles.error, styles.centred]}>{error}</Text> : null}
            <Submit short label={FIRST_YES} busy={busy} busyLabel="Saving…" onPress={() => { void turnOn(); }} />
            {/* The decline stays plain to see and one tap (Apple 5.1.1(iv)): quieter than Turn on, never hidden. */}
            <Pressable ref={notNowRef} accessibilityRole="button" accessibilityLabel="Not now" accessibilityState={{ disabled: busy }} disabled={busy} hitSlop={4} onPress={notNow} style={({ pressed }) => [styles.notNow, pressed && { opacity: PRESS_DIM }]}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.notNowText}>Not now</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
      {/* A tap outside is Not now. Not a button for a screen reader or the Tab key: Not now on the card says it. */}
      <Pressable accessible={false} focusable={false} importantForAccessibility="no" style={StyleSheet.absoluteFill} onPressIn={() => { touchAt.current = Date.now(); }} onPress={outsideTap} />
    </View>
  );
}

/**
 * The first ask's question: Up to hit's own, or the general one for anything
 * else that asked. At the phone's usual text size it is broken in two by
 * hand, so the centred card reads in two even lines; with larger text it
 * wraps by itself (evenly: EVEN), so the hand break never leaves "see" alone.
 */
function askTitle(upToHit: boolean, handBreak: boolean): string {
  const t = upToHit ? 'Let friends see\nyou’re up to hit?' : 'Let friends see\nwhere you are?';
  return handBreak ? t : t.replace('\n', ' ');
}

/**
 * Lines that wrap evenly, never one word left alone on the last: the phone's
 * own rule for it (iPhone, Android), and the browser's (as start-session).
 */
const EVEN = { lineBreakStrategyIOS: 'push-out', textBreakStrategy: 'balanced' } as const;
const EVEN_WEB = Platform.OS === 'web' ? ({ textWrap: 'balance' } as unknown as TextStyle) : null;

/** When Up to hit tapped now ends by itself: "at 10pm", or "in 2 hours" from 8pm on (checkInEnds). */
function endsWords(now: Date = new Date()): string {
  return now.getHours() >= 20 ? 'in 2 hours' : `at ${clock(checkInEnds(now))}`;
}

/**
 * The first ask's one short line, two lines at most on a phone (Oct 28,
 * owner: "Too many words"). Up to hit's: only friends who follow you back,
 * only when you tap (one share at a time, never ongoing: Apple 5.1.2(i)), and
 * when it ends by itself. Any other ask (I'm playing here, Show friends, the
 * re-ask): only friends who follow you back, only when you share, and it ends
 * by itself, each on its own clock. A teen's line is their rule, only friends
 * who follow you back and only the rough area (no birthday on file: the same
 * rule, said why), and that it ends by itself. Each one says who sees you,
 * and that no one else does.
 */
function askLine(upToHit: boolean, teen: boolean, noBirthday: boolean): string {
  if (teen) return `${noBirthday ? 'No birthday yet, so only' : 'Under 18, only'} friends who follow you back see your rough area. Ends by itself.`;
  if (upToHit) return `Only friends who follow you back, only when you tap. Ends by itself ${endsWords()}.`;
  return 'Only friends who follow you back, only when you share. Ends by itself.';
}

/* --------------------------------------------------- Settings → Privacy */

/** A teen's short notice (migration 78): their rule, said before anything is shared. Nothing for anyone else. */
function TeenNotice() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, teenMap } = useApp();
  if (!onTeenMap(currentUser, teenMap)) return null;
  return (
    <View style={styles.notice} accessibilityRole="text">
      <Ionicons name="shield-checkmark-outline" size={18} color={colors.brand} />
      <View style={styles.noticeWords}>
        <Text style={styles.noticeText}>{TEEN_NOTICE}</Text>
        <Text style={styles.noticeSmall}>Under 18, only people you follow who follow you back can see you, and only your rough area.</Text>
        {/* No birthday given (it is optional since Oct 17): say what adding one opens up. */}
        {ageUnknown(currentUser) ? <Text style={styles.noticeSmall}>{BIRTHDAY_OPENS_IT}</Text> : null}
      </View>
    </View>
  );
}

/**
 * `mode=manage`, from Settings → Privacy: the two answers, saved as they are
 * tapped. Unchanged from design B.
 */
function ManageSheet() {
  const styles = useThemedStyles(styleDefinitions);
  const { actions, mapVisibility } = useApp();
  const yesNow = mapVisibility === 'mutuals' || mapVisibility === 'nearby';
  const [picked, setPicked] = useState<MapVisibility>(yesNow ? 'mutuals' : 'none');
  const [busy, setBusy] = useState<MapVisibility | null>(null);
  const [error, setError] = useState('');
  const [closeSignal, setCloseSignal] = useState(0);
  // The sheet hugs its words and buttons (Oct 28, owner: "I don't like the at big who can see you on the map screen"):
  // without these heights a phone's sheet opened to its peek and left a wide empty gap above the buttons.
  const [contentH, setContentH] = useState(0);
  const [footH, setFootH] = useState(0);
  // Big iPhone Text Size (a teen's notice too) can make the words taller than the sheet; they then scroll under
  // the buttons, so the scroll bar shows and flashes once the sheet has opened, saying there is more (review, Oct 28).
  const scroll = useRef<ScrollView>(null);
  const sizes = useRef({ content: 0, view: 0, settled: false });
  const [overflow, setOverflow] = useState(false);
  const checkOverflow = () => { const z = sizes.current; if (z.settled) setOverflow(z.content > z.view + 1); };
  useEffect(() => { if (overflow) scroll.current?.flashScrollIndicators(); }, [overflow]);
  // What the screen closes with: the answer once it is saved, else what it already was.
  const answer = useRef<MapVisibility | null>(null);
  const close = () => setCloseSignal((n) => n + 1);
  const settled = () => answer.current ?? mapVisibility ?? null;
  // However the screen goes (a phone's Back as well as Close), whoever asked hears how it ended.
  useEffect(() => () => { settleWhoSeesYou(settled()); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (v: MapVisibility) => {
    if (busy) return;
    setPicked(v);
    setError('');
    if (v === 'mutuals' ? yesNow : mapVisibility === 'none') { answer.current = v; return; }
    setBusy(v);
    const ok = await actions.setMapVisibility(v);
    setBusy(null);
    if (!ok) { setError('Couldn’t save that. Try again.'); setPicked(yesNow ? 'mutuals' : 'none'); return; }
    answer.current = v;
  };

  return (
    <DragSheet
      peekFraction={0.7}
      fitContent
      contentHeight={contentH && footH ? contentH + footH : undefined}
      // It rises once, straight to its words and buttons, never up to the peek and back down.
      waitForFit
      onSettled={() => { sizes.current.settled = true; checkOverflow(); }}
      closeSignal={closeSignal}
      onDismissed={() => { router.back(); settleWhoSeesYou(settled()); }}
      // A touch smaller than other sheets' titles, so the question stays on one line on a phone.
      header={<SheetTitle title="Who can see you on the map?" titleSize={21} onClose={close} />}
    >
      <ScrollView
        ref={scroll}
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={overflow}
        onLayout={(e) => { sizes.current.view = e.nativeEvent.layout.height; checkOverflow(); }}
        onContentSizeChange={(_, h) => { const r = Math.ceil(h); sizes.current.content = r; if (r !== contentH) setContentH(r); checkOverflow(); }}
      >
        {/* Plain words, no drawing and no icon bullets (Oct 27, owner: "make who can see you on the map look more aesthetic less ai"). */}
        <View style={styles.facts}>
          {facts().map((f) => (
            <Text key={f} style={styles.factText}>{f}</Text>
          ))}
        </View>
        <TeenNotice />
        <View style={styles.choices} accessibilityRole="radiogroup">
          {CONSENT_CHOICES.map((c) => {
            const on = picked === c.value;
            return (
              <Pressable key={c.value} accessibilityRole="radio" accessibilityState={{ selected: on, busy: busy === c.value }} accessibilityLabel={`${c.label}. ${c.line}`} onPress={() => { void save(c.value); }} style={({ pressed }) => [styles.choice, on && styles.choiceOn, pressed && { transform: [{ scale: 0.985 }] }]}>
                <View style={[styles.tile, on && styles.tileOn]}><Ionicons name={c.value === 'none' ? 'eye-off-outline' : 'swap-horizontal-outline'} size={19} color={on ? colors.bg : colors.textMuted} /></View>
                <View style={styles.words}>
                  <Text style={styles.label}>{c.label}</Text>
                  <Text style={styles.line}>{c.line}</Text>
                </View>
                <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      {/* Settings → Privacy has no buttons under its choices (a tap saves): only the sheet's own foot. */}
      <View style={[styles.footer, styles.footerBare]} onLayout={(e) => { const h = Math.ceil(e.nativeEvent.layout.height); if (h !== footH) setFootH(h); }}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </DragSheet>
  );
}

/**
 * What a yes means, said plainly before it is given (design A's words), in
 * Settings → Privacy, where it explains Up to hit: its tap and its 10pm.
 */
function facts(): string[] {
  return [
    'You show on the map only when you tap Up to hit. Never on your own.',
    'Only friends who follow each other with you see your pin. Strangers never see where you are.',
    'It ends by itself at 10pm (after 2 hours, late in the day). Tap Turn off to hide at once.',
  ];
}

/** The card's inner side margin: the words, the button and Not now share one edge. */
const CARD_PAD = spacing.lg + spacing.xs;

/** ConfirmHost's own test: a computer's browser gets the wider card. */
const desktop = isDesktopBrowser();

const styleDefinitions = StyleSheet.create({
  // The first ask: a card in the middle of the dimmed screen, ConfirmHost's own size, corner, shadow and dim.
  layer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl, paddingVertical: spacing.xxxl },
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay },
  box: { zIndex: 1, width: '100%', maxWidth: 300, maxHeight: '100%' },
  // A computer's screen has the room for ConfirmHost's wider box; a phone gets the narrower one.
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
  cardScroll: { flexGrow: 0, flexShrink: 1 },
  cardWords: { alignItems: 'center', paddingHorizontal: CARD_PAD, paddingTop: spacing.lg + 6 },
  // A step under the old card's 20, set tight the way the phone sets a short bold title.
  cardTitle: { ...font('700'), fontSize: 18, lineHeight: 23, letterSpacing: -0.35, color: colors.text, textAlign: 'center' },
  // ConfirmHost's own line: 14 on 19, muted.
  cardLine: { ...typography.small, fontSize: 14, lineHeight: 19, color: colors.textMuted, textAlign: 'center', marginTop: 6 },
  cardActions: { paddingHorizontal: CARD_PAD, paddingTop: spacing.lg + 2, paddingBottom: 6, gap: 2 },
  // Quiet but plain to read: the muted ink, semibold, a full finger's height.
  notNow: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  notNowText: { ...typography.bodyStrong, ...font('600'), color: colors.textMuted, textAlign: 'center' },
  centred: { textAlign: 'center', marginBottom: spacing.xs },
  // Settings → Privacy's sheet.
  scroll: { flexShrink: 1 },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.md },
  // A clear step down from the words to the buttons.
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  // Settings → Privacy has no buttons under its choices (a tap saves): only the sheet's own foot.
  footerBare: { paddingTop: 0 },
  facts: { gap: spacing.md },
  factText: { ...typography.body, color: colors.text, flex: 1, lineHeight: 21 },
  choices: { gap: spacing.sm },
  choice: { ...lift, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: 'transparent' },
  choiceOn: { borderColor: colors.text },
  tile: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  tileOn: { backgroundColor: colors.text },
  words: { flex: 1, gap: 2 },
  label: { ...typography.bodyStrong, color: colors.text },
  line: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.text },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.text },
  notice: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: withAlpha(colors.brand, 0.08), borderWidth: 1, borderColor: withAlpha(colors.brand, 0.2) },
  noticeWords: { flex: 1, gap: 4 },
  noticeText: { ...typography.bodyStrong, color: colors.text, lineHeight: 21 },
  noticeSmall: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  error: { ...typography.small, color: colors.danger },
});

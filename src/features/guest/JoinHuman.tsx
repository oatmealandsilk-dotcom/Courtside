import { PRESS_DIM } from '@/theme/press';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { router, usePathname } from 'expo-router';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui';
import { rememberShareTarget } from '@/features/invite/referral';
import { TAB_BAR_H } from '@/features/navigation/barInset';
import { useResponsive } from '@/lib/useResponsive';
import { buttonShape, colors, font, radius, spacing, typography } from '@/theme';
import { closeJoinSheet, type JoinAsk } from './joinAsk';
import { humanCopy } from './joinHumanCopy';
import type { JoinLook } from './joinLook';

/**
 * Four other takes on the website's sign-up ask (Nov 28, owner: "The new web
 * link pop ups are better could could be even better" / "I just feel like the
 * square and green button does not seem human and seems like ai toy like").
 * Shown only in the demo website with ?joinlook=a|b|c|d (joinLook.ts); every
 * visitor still gets today's prompt (JoinSheet). Each one: the same asks, the
 * same two ways in ("Create account" to sign-up with mode=create, "Log in" to
 * sign-in, both remembering the page), Escape, a tap outside or the × to close,
 * the focus going in and coming back to what was tapped. Ink, not green, for the
 * button (the theme's text colour: near-black on light, cream on dark), the
 * theme's own colours throughout, no icon tile, nothing centred that need not be.
 *   a  a small bubble by the button that was tapped, pointing at it (YouTube)
 *   b  a sheet that leads with the person: their face and the post, then the ask
 *   c  no pop-up: a bar at the foot says it for a few seconds (Instagram web)
 *   d  a plain letter: words, a hairline, two quiet buttons side by side
 */
const RISE = Easing.bezier(0.32, 0.72, 0, 1);
const FALL = Easing.bezier(0.4, 0, 1, 1);
// The same rise and fall as today's prompt and every sheet on the website (JoinSheet, DragSheet.web).
const DIM_IN = FadeIn.duration(380).easing(RISE);
const DIM_OUT = FadeOut.duration(220).easing(FALL);
const SHEET_IN = SlideInDown.duration(380).easing(RISE);
const SHEET_OUT = SlideOutDown.duration(220).easing(FALL);
const POP_IN = FadeIn.duration(140).easing(RISE);
const POP_OUT = FadeOut.duration(100).easing(FALL);
const BAR_IN = SlideInDown.duration(280).easing(RISE);
const BAR_OUT = SlideOutDown.duration(200).easing(FALL);
/** How long the foot bar (c) stays before it settles back, unless a pointer rests on it or the keyboard is in it. */
const BAR_STAYS = 6000;
const TITLE_ID = 'join-human-title';
const LINE_ID = 'join-human-line';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[tabindex]:not([tabindex="-1"]), a[href], button:not([disabled]), [role="button"], [role="link"]'))
    .filter((el) => el.getAttribute('tabindex') !== '-1' && el.offsetParent !== null);
}

/**
 * Escape closes; the focus goes into the box as it opens (retrying while its entering animation hides it)
 * and back to what was tapped as it closes. `trap` keeps Tab inside (the sheets and the letter, which dim
 * the page); `steal` false leaves the focus where it is (the foot bar, which does not stop the page).
 */
function useAskFocus(ask: JoinAsk, box: React.RefObject<View | null>, { trap, steal = true }: { trap: boolean; steal?: boolean }) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const before = document.activeElement as HTMLElement | null;
    const root = () => box.current as unknown as HTMLElement | null;
    let frame = 0;
    const giveUp = Date.now() + 600;
    const focusIn = () => {
      const el = root();
      if (el && el.contains(document.activeElement)) return;
      el?.focus?.({ preventScroll: true });
      if (el && el.contains(document.activeElement)) return;
      if (Date.now() < giveUp) frame = requestAnimationFrame(focusIn);
    };
    if (steal) frame = requestAnimationFrame(focusIn);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeJoinSheet(); return; }
      if (!trap || e.key !== 'Tab') return;
      const el = root(); if (!el) return;
      const list = focusables(el); if (!list.length) return;
      const first = list[0]; const last = list[list.length - 1];
      const now = document.activeElement as HTMLElement | null;
      const inside = !!now && el.contains(now);
      if (e.shiftKey && (!inside || now === first || now === el)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (!inside || now === last)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
      // Back to the heart, unless they have already moved on to something else on the page.
      const now = document.activeElement;
      const el = root();
      const stillHere = !now || now === document.body || (!!el && el.contains(now));
      if (stillHere && before && before.isConnected && typeof before.focus === 'function') before.focus({ preventScroll: true });
    };
  }, [ask.at, box, trap, steal]);
}

/** Either way in, as today's prompt does: remember the page (or the hit to join), then sign-up or sign-in. */
function useGo(ask: JoinAsk) {
  const pathname = usePathname();
  return async (create: boolean) => {
    const search = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.search.replace(/([?&])(ref|r|joinlook)=[^&]*/g, '$1').replace(/[?&]+$/, '') : '';
    const label = `Make a free account to ${ask.what}`;
    if (ask.target) await rememberShareTarget(ask.target.href, create ? ask.target.joinHit : undefined, { label, host: ask.target.host });
    else await rememberShareTarget(`${pathname}${search}`, undefined, { label });
    closeJoinSheet();
    router.push({ pathname: '/sign-in', params: { mode: create ? 'create' : 'sign-in' } });
  };
}

const reportMail = (report: string) => `mailto:support@courtsidebase.com?subject=${encodeURIComponent(`Report ${report}`)}`;
const webDialog = (labelled: boolean) => (Platform.OS === 'web'
  ? { role: 'dialog' as const, 'aria-modal': labelled, 'aria-labelledby': TITLE_ID, 'aria-describedby': LINE_ID, tabIndex: -1 as const }
  : {});

export function JoinHuman({ ask, look }: { ask: JoinAsk; look: Exclude<JoinLook, 'today'> }) {
  // Reporting has its own way out (an email), which the bubble and the foot bar have no room for: the letter says it.
  if (ask.report && (look === 'a' || look === 'c')) return <JoinLetter ask={ask} />;
  if (look === 'a') return <JoinBubble ask={ask} />;
  if (look === 'b') return <JoinPerson ask={ask} />;
  if (look === 'c') return <JoinFootBar ask={ask} />;
  return <JoinLetter ask={ask} />;
}

/** A small close ×, quiet, for the keyboard and screen readers as much as the finger. */
function CloseX({ size = 18, style }: { size?: number; style?: object }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={closeJoinSheet} style={({ pressed }) => [styles.close, style, pressed && styles.pressed]}>
      <Ionicons name="close" size={size} color={colors.textMuted} />
    </Pressable>
  );
}

/** The one filled button: ink on the page's own colour, never green. */
function InkButton({ label, onPress, small = false, grow = false }: { label: string; onPress: () => void; small?: boolean; grow?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={small ? buttonShape.smallSlop : 0} style={({ pressed }) => [styles.ink, small ? styles.inkSmall : styles.inkFull, grow && styles.grow, pressed && styles.pressed]}>
      <Text numberOfLines={1} style={[styles.inkText, small && styles.inkTextSmall]}>{label}</Text>
    </Pressable>
  );
}

/** "Log in" as words: no box, no fill. */
function TextLink({ label, onPress, small = false, grow = false }: { label: string; onPress: () => void; small?: boolean; grow?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.link, small ? styles.linkSmall : styles.linkFull, grow && styles.grow, pressed && styles.pressed]}>
      <Text numberOfLines={1} style={[styles.linkText, small && styles.linkTextSmall]}>{label}</Text>
    </Pressable>
  );
}

function ReportLine({ report }: { report: string }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable accessibilityRole="link" hitSlop={6} onPress={() => { void Linking.openURL(reportMail(report)); closeJoinSheet(); }} style={styles.report}>
      <Text style={styles.reportText}>No account? <Text style={styles.reportLink}>Email us about it</Text></Text>
    </Pressable>
  );
}

/* ---------- a · the bubble ---------- */

function JoinBubble({ ask }: { ask: JoinAsk }) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const box = useRef<View>(null);
  const go = useGo(ask);
  const copy = humanCopy(ask, 'a');
  useAskFocus(ask, box, { trap: false });
  // No dim and nothing to catch the tap: a press anywhere else closes it and still does what it pressed.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const onDown = (e: PointerEvent) => {
      const el = box.current as unknown as HTMLElement | null;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      closeJoinSheet();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [ask.at]);

  const W = Math.min(300, width - 24);
  const a = ask.anchor;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  let place: { left: number; top?: number; bottom?: number };
  let tip: number | null = null;
  let above = true;
  if (a) {
    const cx = a.x + a.width / 2;
    const right = cx > width * 0.6;
    const left = clamp(right ? cx - W + 30 : cx - 30, 12, width - W - 12);
    // A clip's buttons sit down the right: the bubble rises above-left of the heart. Elsewhere it hangs under the button.
    const onRail = right && a.y > height * 0.25;
    above = onRail || height - (a.y + a.height) < 200;
    tip = clamp(cx - left, 20, W - 20);
    place = above ? { left, bottom: height - a.y + 12 } : { left, top: a.y + a.height + 12 };
  } else {
    // Nothing to point at (a page that needs an account): low in the middle, clear of the bar.
    place = { left: (width - W) / 2, bottom: Math.max(insets.bottom, 12) + TAB_BAR_H + spacing.xl };
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View entering={POP_IN} exiting={POP_OUT} style={[styles.bubble, { width: W }, place]}>
        <View ref={box} style={styles.bubbleInner} {...(Platform.OS === 'web' ? { role: 'dialog' as const, 'aria-labelledby': TITLE_ID, 'aria-describedby': LINE_ID, tabIndex: -1 as const } : {})}>
          <Text nativeID={TITLE_ID} accessibilityRole="header" style={styles.bubbleTitle}>{copy.title}</Text>
          <Text nativeID={LINE_ID} style={styles.bubbleLine}>{copy.line}</Text>
          <View style={styles.bubbleRow}>
            <InkButton small label="Join" onPress={() => { void go(true); }} />
            <TextLink small label="Log in" onPress={() => { void go(false); }} />
          </View>
          <CloseX size={16} style={styles.bubbleClose} />
        </View>
        {tip !== null ? <View pointerEvents="none" style={[styles.tip, above ? styles.tipDown : styles.tipUp, { left: tip - 6 }]} /> : null}
      </Animated.View>
    </View>
  );
}

/* ---------- b · the person first ---------- */

function JoinPerson({ ask }: { ask: JoinAsk }) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();
  const box = useRef<View>(null);
  const go = useGo(ask);
  const copy = humanCopy(ask, 'b');
  useAskFocus(ask, box, { trap: true });
  const person = ask.about?.person;
  const cover = ask.about?.post?.cover;
  const clip = ask.about?.post?.kind === 'clip';
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View entering={DIM_IN} exiting={DIM_OUT} style={[StyleSheet.absoluteFill, styles.dim]}>
        <Pressable accessible={false} focusable={false} tabIndex={-1} style={StyleSheet.absoluteFill} onPress={closeJoinSheet} />
      </Animated.View>
      <View style={styles.foot} pointerEvents="box-none">
        <Animated.View entering={SHEET_IN} exiting={SHEET_OUT} style={[styles.personSheet, !isPhone && styles.personSheetWide, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View ref={box} style={styles.focusBox} {...webDialog(true)}>
            {person || cover ? (
              <View style={styles.faces}>
                {person ? <Avatar uri={person.photo} name={person.name} seed={person.seed} size={44} /> : null}
                {cover ? (
                  <View style={styles.cover}>
                    <Image accessibilityIgnoresInvertColors source={{ uri: cover }} contentFit="cover" style={StyleSheet.absoluteFill} />
                    {clip ? <Ionicons name="play" size={12} color="#FFFFFF" style={styles.coverPlay} /> : null}
                  </View>
                ) : null}
              </View>
            ) : null}
            <Text nativeID={TITLE_ID} accessibilityRole="header" style={styles.personTitle}>{copy.title}</Text>
            <Text nativeID={LINE_ID} style={styles.personLine}>{copy.line}</Text>
            <View style={styles.personRow}>
              <InkButton label="Create account" onPress={() => { void go(true); }} />
              <TextLink label="Log in" onPress={() => { void go(false); }} />
            </View>
            {ask.report ? <ReportLine report={ask.report} /> : null}
            <CloseX style={styles.sheetClose} />
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

/* ---------- c · the foot bar ---------- */

function JoinFootBar({ ask }: { ask: JoinAsk }) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();
  const box = useRef<View>(null);
  const go = useGo(ask);
  const copy = humanCopy(ask, 'c');
  // The page carries on: the bar does not take the focus (a keyboard reaches it next) and it reads itself out.
  useAskFocus(ask, box, { trap: false, steal: false });
  // It settles back after a few seconds: not while a pointer rests on it or the keyboard is in it.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      const el = box.current as unknown as HTMLElement | null;
      const busy = Platform.OS === 'web' && !!el && typeof el.matches === 'function' && (el.matches(':hover') || !!el.querySelector(':focus-visible'));
      if (busy) timer = setTimeout(check, 1500);
      else closeJoinSheet();
    };
    timer = setTimeout(check, BAR_STAYS);
    return () => clearTimeout(timer);
  }, [ask.at]);
  const person = ask.about?.person;
  const live = Platform.OS === 'web' ? { role: 'region' as const, 'aria-live': 'polite' as const, 'aria-label': copy.title } : {};
  // On a phone it sits where the tab bar is, covering it while it shows; on a computer, along the window's foot.
  const foot = Math.max(insets.bottom, 12);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View entering={BAR_IN} exiting={BAR_OUT} style={[styles.bar, isPhone ? { paddingBottom: foot, minHeight: TAB_BAR_H + foot + spacing.md } : styles.barWide]}>
        <View ref={box} style={[styles.barRow, !isPhone && styles.barRowWide]} {...live}>
          <CloseX size={16} style={styles.barClose} />
          {person ? <Avatar uri={person.photo} name={person.name} seed={person.seed} size={32} /> : null}
          <Text nativeID={TITLE_ID} numberOfLines={2} style={styles.barTitle}>{copy.title}</Text>
          <InkButton small label="Sign up" onPress={() => { void go(true); }} />
          <TextLink small label="Log in" onPress={() => { void go(false); }} />
        </View>
      </Animated.View>
    </View>
  );
}

/* ---------- d · the letter ---------- */

function JoinLetter({ ask }: { ask: JoinAsk }) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const box = useRef<View>(null);
  const go = useGo(ask);
  const copy = humanCopy(ask, 'd');
  useAskFocus(ask, box, { trap: true });
  const dialog = width >= 640;
  const body = (
    <View ref={box} style={styles.focusBox} {...webDialog(true)}>
      <Text nativeID={TITLE_ID} accessibilityRole="header" style={styles.letterTitle}>{copy.title}</Text>
      <Text nativeID={LINE_ID} style={styles.letterLine}>{copy.line}</Text>
      <View style={styles.hairline} />
      <View style={styles.letterRow}>
        <TextLink grow label="Log in" onPress={() => { void go(false); }} />
        <InkButton grow label="Join CourtSide" onPress={() => { void go(true); }} />
      </View>
      {ask.report ? <ReportLine report={ask.report} /> : null}
      <CloseX style={styles.letterClose} />
    </View>
  );
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View entering={dialog ? POP_IN : DIM_IN} exiting={dialog ? POP_OUT : DIM_OUT} style={[StyleSheet.absoluteFill, styles.dim]}>
        <Pressable accessible={false} focusable={false} tabIndex={-1} style={StyleSheet.absoluteFill} onPress={closeJoinSheet} />
      </Animated.View>
      {dialog ? (
        <View style={styles.center} pointerEvents="box-none">
          <Animated.View entering={POP_IN} exiting={POP_OUT} style={styles.letterDialog}>{body}</Animated.View>
        </View>
      ) : (
        <Animated.View entering={SHEET_IN} exiting={SHEET_OUT} style={[styles.letterSheet, { paddingBottom: insets.bottom + spacing.xl }]}>{body}</Animated.View>
      )}
    </View>
  );
}

// Overlays keep the theme's neutral overlay shadow (DESIGN.md, Shadow Vocabulary: Overlay); nothing glows.
const OVERLAY_SHADOW = '0px 6px 16px rgba(0, 0, 0, 0.14)';

const styleDefinitions = StyleSheet.create({
  dim: { backgroundColor: colors.overlay },
  pressed: { opacity: PRESS_DIM },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  focusBox: { outlineStyle: 'none' } as never,
  grow: { flex: 1 },

  ink: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text, ...buttonShape.curve },
  inkFull: { height: buttonShape.height, paddingHorizontal: spacing.xl, borderRadius: radius.md },
  inkSmall: { height: buttonShape.smallHeight, paddingHorizontal: spacing.lg, borderRadius: radius.sm },
  inkText: { ...font('600'), fontSize: buttonShape.label, color: colors.bg },
  inkTextSmall: { fontSize: buttonShape.smallLabel },
  link: { alignItems: 'center', justifyContent: 'center' },
  linkFull: { height: buttonShape.height, paddingHorizontal: spacing.md },
  linkSmall: { height: buttonShape.smallHeight, paddingHorizontal: spacing.xs },
  linkText: { ...font('600'), fontSize: buttonShape.label, color: colors.text },
  linkTextSmall: { fontSize: buttonShape.smallLabel },
  report: { alignSelf: 'flex-start', paddingTop: spacing.md },
  reportText: { ...typography.small, color: colors.textMuted },
  reportLink: { ...typography.smallStrong, color: colors.text, textDecorationLine: 'underline' },

  // a
  bubble: { position: 'absolute', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, boxShadow: OVERLAY_SHADOW, ...buttonShape.curve },
  bubbleInner: { paddingTop: 14, paddingBottom: spacing.md, paddingHorizontal: spacing.lg, outlineStyle: 'none' } as never,
  bubbleTitle: { ...typography.bodyStrong, color: colors.text, paddingRight: 28 },
  bubbleLine: { ...typography.small, lineHeight: 18, color: colors.textMuted, marginTop: 2, paddingRight: spacing.sm },
  bubbleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  bubbleClose: { position: 'absolute', top: 6, right: 6, width: 28, height: 28 },
  tip: { position: 'absolute', width: 12, height: 12, backgroundColor: colors.surface, borderColor: colors.border, transform: [{ rotate: '45deg' }] },
  tipDown: { bottom: -6.5, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  tipUp: { top: -6.5, borderLeftWidth: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth },

  // b
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  personSheet: { width: '100%', backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: spacing.xl, paddingHorizontal: spacing.xl, boxShadow: '0px -4px 16px rgba(0, 0, 0, 0.10)', ...buttonShape.curve },
  personSheetWide: { maxWidth: 520 },
  faces: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  cover: { width: 33, height: 44, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', ...buttonShape.curve },
  coverPlay: { textShadowColor: 'rgba(0, 0, 0, 0.35)', textShadowRadius: 3 },
  personTitle: { ...font('500'), fontSize: 20, lineHeight: 26, letterSpacing: -0.3, color: colors.text, paddingRight: spacing.xl },
  personLine: { ...typography.body, lineHeight: 21, color: colors.textMuted, marginTop: 6 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
  sheetClose: { position: 'absolute', top: -spacing.sm, right: -spacing.sm },

  // c
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, justifyContent: 'center', paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  barWide: { paddingBottom: spacing.md },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: spacing.sm, paddingRight: spacing.lg },
  barRowWide: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  barClose: { width: 28, height: 28 },
  barTitle: { ...typography.bodyStrong, lineHeight: 19, color: colors.text, flex: 1, minWidth: 0 },

  // d
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  letterDialog: { width: '100%', maxWidth: 440, backgroundColor: colors.surface, borderRadius: radius.lg, paddingTop: spacing.xl, paddingBottom: spacing.xl, paddingHorizontal: spacing.xl, boxShadow: OVERLAY_SHADOW, ...buttonShape.curve },
  letterSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: spacing.xl, paddingHorizontal: spacing.xl, boxShadow: '0px -4px 16px rgba(0, 0, 0, 0.10)', ...buttonShape.curve },
  letterTitle: { ...font('400'), fontSize: 22, lineHeight: 29, letterSpacing: -0.3, color: colors.text, paddingRight: spacing.xl },
  letterLine: { ...typography.body, lineHeight: 22, color: colors.textMuted, marginTop: spacing.sm },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginTop: spacing.xl, marginBottom: spacing.lg },
  letterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  letterClose: { position: 'absolute', top: -spacing.md, right: -spacing.md },
});

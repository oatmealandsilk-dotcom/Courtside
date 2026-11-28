import { PRESS_DIM } from '@/theme/press';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { router, usePathname } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSidePanel } from '@/features/feed/sidePanel';
import { rememberShareTarget } from '@/features/invite/referral';
import { isTabPage } from '@/features/navigation/startTab';
import { LAYOUT, useResponsive } from '@/lib/useResponsive';
import { buttonShape, colors, font, radius, spacing, typography } from '@/theme';
import { noteAppTap } from './campaign';
import { IPHONE_APP_URL, closeJoinSheet, type JoinAsk } from './joinAsk';
import { plainCopy } from './joinPlainCopy';

/**
 * The website's sign-up ask, the plain letter (Nov 28, owner, of four takes:
 * "i think d is solid"; joinLook.ts). It opens only when a visitor tries
 * something that needs an account (a like, a comment, a follow, a save, I'm in,
 * a report …), never on its own. Words first, about the person: "Kai posted
 * this. / Join to like it.", one plain line under it, then "Log in" as words
 * and the one filled button, "Join CourtSide", in ink (the theme's text colour:
 * near-black on light, cream on dark), never green. Small corners, no icon.
 *
 * A sheet from the foot on a phone; on a computer it rises from the foot of the
 * clip's own column, not a box in the middle of the window. The page dims behind
 * it, except over comments that already dim it (a phone's sheet, a computer's
 * centred box); beside a computer's docked comments, which dim nothing, it dims
 * as it does everywhere else. Escape (heard before the comments underneath, so
 * it closes only this), a tap outside or the × close it; the focus goes in as
 * it opens and back to what was tapped as it closes. It slides on its own
 * layer, never fading anything the tab bar's glass sits in.
 *
 * Either button remembers where to bring them back to and the app opens there
 * once they are in (useShareLanding): the hit they said I'm in to, the post it
 * was about (always its own page: the Feed keeps no clip in its address, and
 * the comments' address would open over whichever clip the app starts on), or
 * else the page they are on.
 */
const RISE = Easing.bezier(0.32, 0.72, 0, 1);
const FALL = Easing.bezier(0.4, 0, 1, 1);
// The same rise and fall as every other sheet on the website (JoinSheet, DragSheet.web).
const DIM_IN = FadeIn.duration(380).easing(RISE);
const DIM_OUT = FadeOut.duration(220).easing(FALL);
const SHEET_IN = SlideInDown.duration(380).easing(RISE);
const SHEET_OUT = SlideOutDown.duration(220).easing(FALL);
const TITLE_ID = 'join-plain-title';
const LINE_ID = 'join-plain-line';
/** A browser evens out a wrapped line, so a sentence never ends on one word alone (as auto-log-ask and AlertsWhyHost do). */
const EVEN_WEB = Platform.OS === 'web' ? ({ textWrap: 'pretty' } as unknown as TextStyle) : null;

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[tabindex]:not([tabindex="-1"]), a[href], button:not([disabled]), [role="button"], [role="link"]'))
    .filter((el) => el.getAttribute('tabindex') !== '-1' && el.offsetParent !== null);
}

/**
 * Escape closes; Tab stays inside; the focus goes into the letter as it opens (retrying each frame while
 * its entering animation hides it) and back to what was tapped (the heart) as it closes. Keys are heard on
 * the window on the way in, before the comments sheet underneath (which listens on the document on the way
 * in, DragSheet.web's useEscape), and Escape goes no further: it closes the letter, never the comments.
 */
function useLetterFocus(ask: JoinAsk, box: React.RefObject<View | null>) {
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
    frame = requestAnimationFrame(focusIn);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeJoinSheet(); return; }
      if (e.key !== 'Tab') return;
      const el = root(); if (!el) return;
      const list = focusables(el); if (!list.length) return;
      const first = list[0]; const last = list[list.length - 1];
      const now = document.activeElement as HTMLElement | null;
      const inside = !!now && el.contains(now);
      if (e.shiftKey && (!inside || now === first || now === el)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (!inside || now === last)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey, true);
      // Back to the heart, unless they have already moved on to something else on the page.
      const now = document.activeElement;
      const el = root();
      const stillHere = !now || now === document.body || (!!el && el.contains(now));
      if (stillHere && before && before.isConnected && typeof before.focus === 'function') before.focus({ preventScroll: true });
    };
  }, [ask.at, box]);
}

/**
 * Where they come back to once they are in, and whether that is really "here": the hit they said I'm in
 * to; the post it was about, always its own page (opened over the app's start, the comments' address
 * would put them beside whichever clip the Feed starts on, not this one; from its page the comments are
 * one tap); or the page they are on, which is "here" only when it has its own address. A tab's own page
 * is not: the Feed's clip is not in its address, so it would open at the top.
 */
function comeBack(ask: JoinAsk, pathname: string): { href: string; back: boolean } {
  const search = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.search.replace(/([?&])(ref|r)=[^&]*/g, '$1').replace(/[?&]+$/, '') : '';
  const here = `${pathname}${search}`;
  if (ask.target) return { href: ask.target.href, back: true };
  if (ask.post) return { href: `/post/${encodeURIComponent(ask.post.id)}`, back: true };
  return { href: here, back: !isTabPage(pathname) && /^\/[a-z]/.test(pathname) };
}

/**
 * Where the letter sits: on a phone, the whole width; on a computer, the page's middle column beside the
 * sidebar, a clip's width (the Feed's clip is the window's height at 9:16, centred there), so it rises
 * from the foot of the clip it is about rather than sitting in the middle of the window. With the
 * comments docked at the right (a computer's side panel), the clip moves left beside them, and so does it.
 */
function useColumn(): { left: number; width: number } | null {
  const { width, height, isPhone, isCompactSidebar } = useResponsive();
  const panel = useSidePanel();
  if (isPhone) return null;
  const side = isCompactSidebar ? LAYOUT.sidebarCompact : LAYOUT.sidebar;
  const room = width - side - panel;
  const w = Math.max(280, Math.min(room - spacing.lg * 2, 520, Math.max(360, Math.round((height * 9) / 16))));
  return { left: side + (room - w) / 2, width: w };
}

/**
 * The comments are up and already dim the page (a phone's sheet, a computer's centred box): the letter over
 * them does not dim it twice. A computer's docked comments (the side panel, `panel` > 0) dim nothing, so
 * there it dims as it does everywhere else.
 */
const overDimmingSheet = (pathname: string, panel: number) => pathname.startsWith('/comments') && panel === 0;

export function JoinPlain({ ask }: { ask: JoinAsk }) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const column = useColumn();
  const panel = useSidePanel();
  const pathname = usePathname();
  const box = useRef<View>(null);
  useLetterFocus(ask, box);
  const { href, back } = comeBack(ask, pathname);
  const copy = plainCopy(ask, back);
  const dimmed = !overDimmingSheet(pathname, panel);

  const go = async (create: boolean) => {
    const label = `Make a free account to ${ask.what}`;
    // An open hit's I'm in is joined for them on the way to a new account, as the peek's is.
    await rememberShareTarget(href, ask.target && create ? ask.target.joinHit : undefined, { label, host: ask.target?.host });
    closeJoinSheet();
    router.push({ pathname: '/sign-in', params: { mode: create ? 'create' : 'sign-in' } });
  };
  const report = ask.report;
  const web = Platform.OS === 'web';
  const a11y = web ? { role: 'dialog' as const, 'aria-modal': true, 'aria-labelledby': TITLE_ID, 'aria-describedby': LINE_ID, tabIndex: -1 as const } : {};

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View entering={DIM_IN} exiting={DIM_OUT} style={[StyleSheet.absoluteFill, dimmed && styles.dim]}>
        {/* A tap outside closes it; the × is the button for the keyboard and screen readers. */}
        <Pressable accessible={false} focusable={false} tabIndex={-1} style={StyleSheet.absoluteFill} onPress={closeJoinSheet} />
      </Animated.View>
      <Animated.View entering={SHEET_IN} exiting={SHEET_OUT} style={[styles.sheet, column ? { left: column.left, width: column.width } : styles.sheetFull, { paddingBottom: (column ? 0 : insets.bottom) + spacing.xl }]}>
        <View ref={box} accessibilityViewIsModal onAccessibilityEscape={closeJoinSheet} style={styles.focusBox} {...a11y}>
          <Text nativeID={TITLE_ID} accessibilityRole="header" style={[styles.title, EVEN_WEB]}>{copy.title}</Text>
          <Text nativeID={LINE_ID} style={[styles.line, EVEN_WEB]}>{copy.line}</Text>
          <View style={styles.row}>
            <Pressable accessibilityRole="button" accessibilityLabel="Log in" hitSlop={8} onPress={() => { void go(false); }} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
              <Text numberOfLines={1} style={styles.linkText}>Log in</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Join CourtSide" onPress={() => { void go(true); }} style={({ pressed }) => [styles.ink, pressed && styles.pressed]}>
              <Text numberOfLines={1} style={styles.inkText}>Join CourtSide</Text>
            </Pressable>
          </View>
          {report ? (
            <Pressable accessibilityRole="link" hitSlop={6} onPress={() => { void Linking.openURL(`mailto:support@courtsidebase.com?subject=${encodeURIComponent(`Report ${report}`)}`); closeJoinSheet(); }} style={[styles.quiet, styles.near]}>
              <Text style={styles.quietText}>No account? <Text style={styles.quietLink}>Email us about it</Text></Text>
            </Pressable>
          ) : null}
          {/* Today's prompt had it, so it stays: a quiet line of words, no icon. */}
          <Pressable accessibilityRole="link" accessibilityLabel="Get the iPhone app" hitSlop={8} onPress={() => { noteAppTap(); void Linking.openURL(IPHONE_APP_URL); }} style={({ pressed }) => [styles.quiet, !!report && styles.near, pressed && styles.pressed]}>
            <Text style={styles.quietText}>Get the iPhone app</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={closeJoinSheet} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

// The sheet keeps the theme's neutral overlay shadow (DESIGN.md, Shadow Vocabulary: Overlay); nothing glows.
const SHEET_SHADOW = '0px -4px 16px rgba(0, 0, 0, 0.10)';

const styleDefinitions = StyleSheet.create({
  dim: { backgroundColor: colors.overlay },
  pressed: { opacity: PRESS_DIM },
  // A sheet from the foot, the window's width on a phone, the clip's column on a computer.
  sheet: { position: 'absolute', bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: spacing.xl + spacing.xs, paddingHorizontal: spacing.xl, boxShadow: SHEET_SHADOW, ...buttonShape.curve },
  sheetFull: { left: 0, right: 0 },
  focusBox: { outlineStyle: 'none' } as never,
  // Words, then the two buttons at the right, Log in as words before the one filled button.
  title: { ...font('400'), fontSize: 22, lineHeight: 29, letterSpacing: -0.3, color: colors.text, paddingRight: 36 },
  line: { ...typography.body, lineHeight: 22, color: colors.textMuted, marginTop: spacing.sm, paddingRight: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.xl },
  link: { height: buttonShape.height, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  linkText: { ...font('600'), fontSize: buttonShape.label, color: colors.text },
  ink: { height: buttonShape.height, paddingHorizontal: spacing.xl, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text, ...buttonShape.curve },
  inkText: { ...font('600'), fontSize: buttonShape.label, color: colors.bg },
  // The quiet ways out, under the buttons with a little air: no account to report, the iPhone app.
  quiet: { alignSelf: 'flex-start', paddingTop: spacing.lg },
  // The report line sits as close under the buttons as in the D he was shown (its ReportLine); the app's line keeps that step under it.
  near: { paddingTop: spacing.md },
  quietText: { ...typography.small, color: colors.textMuted },
  quietLink: { ...typography.smallStrong, color: colors.text, textDecorationLine: 'underline' },
  close: { position: 'absolute', top: -spacing.sm, right: -spacing.md, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});

import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { router, usePathname } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { rememberShareTarget } from '@/features/invite/referral';
import { colors, radius, spacing, typography } from '@/theme';
import { IPHONE_APP_URL, closeJoinSheet, useJoinSheet } from './joinAsk';
import { noteAppTap } from './campaign';
import { joinCopy } from './joinCopy';
import { JOIN_LOOK } from './joinLook';
import { JoinPlain } from './JoinPlain';

/**
 * The one sign-up ask in guest mode (Oct 17, owner: "it's just when you
 * want to actually do something that requires profile it will make you sign
 * up, that way we can provide value and make ppl want to sign up and know our
 * brand rather than a automatic straight up promotion"). It opens only when
 * a guest tries something that needs a profile, never on its own, and "Not
 * now" (the ×, or a tap outside, or Escape) puts them straight back to reading.
 *
 * Either account button remembers the page they were on, and the app opens
 * there again once they are in (useShareLanding). Reporting stays possible
 * without an account: an email to support that names only what it was about.
 *
 * It slides up on its own layer, over the tab bar, never fading anything
 * the bar's glass sits in (Oct 17: a fading parent left the glass see-through).
 *
 * The look (Nov 28, owner: "for tapping a like. do what instagram facebook or
 * strava or any big companies like this would do"): X's signed-out prompt.
 * It is about the action and the person: the action's icon in the brand
 * colour, a headline about the action, one line naming who it was for, then
 * "Create account" and "Log in" (joinCopy.ts has the words). On a computer it
 * is a small dialog in the middle over a dim of the page; on a phone the
 * same content is a bottom sheet with a grab handle. Flat, no logo tile.
 *
 * Since Nov 28 evening (owner, of four other takes: "i think d is solid") the
 * website shows the plain letter instead (JoinPlain.tsx); this one stays one
 * switch away (JOIN_LOOK in joinLook.ts).
 */
// The same rise and fall as every other sheet on the website (DragSheet.web): in over 380 ms on its
// curve, away over 220 ms, with the dim following the sheet on the same timing.
const RISE = Easing.bezier(0.32, 0.72, 0, 1);
const FALL = Easing.bezier(0.4, 0, 1, 1);
// Shared with the peek's "I'm in" sheet (app/peek.tsx), so both rise and fall alike.
export const DIM_IN = FadeIn.duration(380).easing(RISE);
export const DIM_OUT = FadeOut.duration(220).easing(FALL);
export const SHEET_IN = SlideInDown.duration(380).easing(RISE);
export const SHEET_OUT = SlideOutDown.duration(220).easing(FALL);
// The computer's dialog only fades in and out, quickly, on its own layer (nothing under it holds glass).
const DIALOG_IN = FadeIn.duration(160).easing(RISE);
const DIALOG_OUT = FadeOut.duration(120).easing(FALL);
/** From this width the prompt is a dialog in the middle (a computer, a tablet across); below, a bottom sheet. */
const DIALOG_FROM = 640;
const TITLE_ID = 'join-prompt-title';
const LINE_ID = 'join-prompt-line';

/** The browser's focusable things inside the prompt, for keeping Tab within it. */
function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[tabindex]:not([tabindex="-1"]), a[href], button:not([disabled]), [role="button"], [role="link"]'))
    .filter((el) => el.getAttribute('tabindex') !== '-1' && el.offsetParent !== null);
}

export function JoinSheet() {
  return JOIN_LOOK === 'plain' ? <PlainJoinSheet /> : <XJoinSheet />;
}

function PlainJoinSheet() {
  const ask = useJoinSheet();
  // A new ask (another heart while one is open) starts fresh: its own focus, its own words.
  return ask ? <JoinPlain key={ask.at} ask={ask} /> : null;
}

/** X's signed-out prompt (Nov 28 morning), kept for JOIN_LOOK 'x'. */
function XJoinSheet() {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const ask = useJoinSheet();
  const pathname = usePathname();
  const box = useRef<View>(null);
  const open = !!ask;
  const at = ask?.at;

  // Escape closes it; Tab stays inside it; the focus goes in on open and back to what was tapped (the heart) on close.
  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const before = document.activeElement as HTMLElement | null;
    const root = () => box.current as unknown as HTMLElement | null;
    // The entering animation keeps the box hidden for its first frames, and focus() on a hidden box does
    // nothing, so it keeps trying each frame (up to ~600ms) until the focus is inside.
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
      if (e.key === 'Escape') { e.preventDefault(); closeJoinSheet(); return; }
      if (e.key !== 'Tab') return;
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
      if (before && before.isConnected && typeof before.focus === 'function') before.focus({ preventScroll: true });
    };
  }, [open, at]);

  if (!ask) return null;
  const go = async (create: boolean) => {
    const search = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.search.replace(/([?&])(ref|r)=[^&]*/g, '$1').replace(/[?&]+$/, '') : '';
    const label = `Make a free account to ${ask.what}`;
    if (ask.target) await rememberShareTarget(ask.target.href, create ? ask.target.joinHit : undefined, { label, host: ask.target.host });
    else await rememberShareTarget(`${pathname}${search}`, undefined, { label });
    closeJoinSheet();
    router.push({ pathname: '/sign-in', params: { mode: create ? 'create' : 'sign-in' } });
  };
  const report = ask.report;
  const copy = joinCopy(ask);
  const dialog = width >= DIALOG_FROM;
  const web = Platform.OS === 'web';
  const a11y = web ? { role: 'dialog' as const, 'aria-modal': true, 'aria-labelledby': TITLE_ID, 'aria-describedby': LINE_ID, tabIndex: -1 as const } : {};

  const content = (
    <View ref={box} accessibilityViewIsModal onAccessibilityEscape={closeJoinSheet} style={styles.inner} {...a11y}>
      {dialog ? null : <View style={styles.handle} />}
      <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={closeJoinSheet} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
        <Ionicons name="close" size={22} color={colors.textMuted} />
      </Pressable>
      <View style={styles.words}>
        <Ionicons name={copy.icon} size={34} color={colors.brand} style={styles.icon} />
        <Text nativeID={TITLE_ID} accessibilityRole="header" style={styles.title}>{copy.headline}</Text>
        <Text nativeID={LINE_ID} style={styles.line}>{copy.line}</Text>
      </View>
      <View style={styles.buttons}>
        <Button label="Create account" full onPress={() => { void go(true); }} />
        <Button label="Log in" variant="secondary" full style={styles.outline} onPress={() => { void go(false); }} />
      </View>
      {report ? (
        <Pressable accessibilityRole="link" hitSlop={6} onPress={() => { void Linking.openURL(`mailto:support@courtsidebase.com?subject=${encodeURIComponent(`Report ${report}`)}`); closeJoinSheet(); }} style={styles.quiet}>
          <Ionicons name="flag-outline" size={14} color={colors.textMuted} />
          <Text style={styles.quietText}>No account? <Text style={styles.quietLink}>Email us about it</Text></Text>
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="link" accessibilityLabel="Get the iPhone app" hitSlop={8} onPress={() => { noteAppTap(); void Linking.openURL(IPHONE_APP_URL); }} style={styles.quiet}>
        <Ionicons name="logo-apple" size={14} color={colors.textMuted} />
        <Text style={styles.quietText}>Get the iPhone app</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View entering={dialog ? DIALOG_IN : DIM_IN} exiting={dialog ? DIALOG_OUT : DIM_OUT} style={[StyleSheet.absoluteFill, styles.dim]}>
        {/* A tap outside closes it; the × is the button for the keyboard and screen readers. */}
        <Pressable accessible={false} focusable={false} tabIndex={-1} style={StyleSheet.absoluteFill} onPress={closeJoinSheet} />
      </Animated.View>
      {dialog ? (
        <View style={styles.center} pointerEvents="box-none">
          <Animated.View entering={DIALOG_IN} exiting={DIALOG_OUT} style={styles.dialog}>{content}</Animated.View>
        </View>
      ) : (
        <Animated.View entering={SHEET_IN} exiting={SHEET_OUT} style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>{content}</Animated.View>
      )}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  dim: { backgroundColor: colors.overlay },
  // Overlays keep a neutral shadow (DESIGN.md, Shadow Vocabulary: Overlay); the page under it casts none.
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: spacing.sm, paddingHorizontal: spacing.lg, boxShadow: '0px -4px 16px rgba(0, 0, 0, 0.12)' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  dialog: { width: '100%', maxWidth: 400, backgroundColor: colors.surface, borderRadius: radius.lg, paddingTop: spacing.xl, paddingBottom: spacing.lg, paddingHorizontal: spacing.xl, boxShadow: '0px 6px 16px rgba(0, 0, 0, 0.18)' },
  inner: { width: '100%', maxWidth: 400, alignSelf: 'center', outlineStyle: 'none' } as never,
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.md },
  close: { position: 'absolute', top: -spacing.sm, right: -spacing.sm, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  pressed: { opacity: 0.6 },
  words: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  icon: { marginBottom: spacing.md },
  title: { ...typography.title, fontWeight: '700', color: colors.text, textAlign: 'center' },
  line: { ...typography.body, color: colors.textMuted, lineHeight: 21, textAlign: 'center', marginTop: spacing.sm },
  buttons: { gap: spacing.sm, marginTop: spacing.xl },
  outline: { backgroundColor: 'transparent' },
  quiet: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingTop: spacing.md },
  quietText: { ...typography.small, color: colors.textMuted },
  quietLink: { ...typography.smallStrong, color: colors.brand },
});

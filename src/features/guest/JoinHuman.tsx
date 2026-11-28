import { PRESS_DIM } from '@/theme/press';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type TextStyle } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { router, usePathname } from 'expo-router';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui';
import { rememberShareTarget } from '@/features/invite/referral';
import { TAB_BAR_GAP, useBarInset } from '@/features/navigation/barInset';
import { LAYOUT, useResponsive } from '@/lib/useResponsive';
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
 *   c  no pop-up: a slim bar at the foot says it until the next swipe (Instagram web)
 *   d  a plain letter: words and two quiet buttons, right-aligned
 * On a computer, b, c and d rise from the foot of the clip's own column, not
 * the middle of the window (review, Nov 28: a box in the middle is "the square").
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
const TITLE_ID = 'join-human-title';
const LINE_ID = 'join-human-line';
/** The phone's tab pages, where the floating tab bar is (TabsPager's TAB_PATHS: not imported, it pulls in the tabs themselves). */
const TAB_PAGES = new Set(['/discuss', '/', '/coaches', '/profile']);
/** Asks made from a clip's own buttons down its right side: only these rise above-left of the button (look a). */
const RAIL_ASKS = new Set(['like posts', 'save posts', 'comment']);
/** One-tap things (a heart, a save, a follow): look b dims the page only lightly for them. */
const ONE_TAP = new Set(['like posts', 'like comments', 'save posts', 'follow players']);
/** The bubble's width: both of its lines fit, and on a 390 phone it leaves most of the clip in view. */
const BUBBLE_W = 262;
/** A browser evens out a wrapped line, so a sentence never ends on one word alone (as auto-log-ask and AlertsWhyHost do). */
const EVEN_WEB = Platform.OS === 'web' ? ({ textWrap: 'pretty' } as unknown as TextStyle) : null;

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

/**
 * Where b, c and d sit: on a phone, the whole width; on a computer, the page's middle column beside the
 * sidebar, a clip's width (the Feed's clip is the window's height at 9:16, centred there), so the ask
 * rises from the foot of the clip it is about rather than sitting in the middle of the window.
 */
function useColumn(): { left: number; width: number } | null {
  const { width, height, isPhone, isCompactSidebar } = useResponsive();
  if (isPhone) return null;
  const side = isCompactSidebar ? LAYOUT.sidebarCompact : LAYOUT.sidebar;
  const room = width - side;
  const w = Math.max(280, Math.min(room - spacing.lg * 2, 520, Math.max(360, Math.round((height * 9) / 16))));
  return { left: side + (room - w) / 2, width: w };
}

/** A sheet already up (the comments over a clip): a second ask over it does not dim the page twice. */
const overSheet = (pathname: string) => pathname.startsWith('/comments');

const reportMail = (report: string) => `mailto:support@courtsidebase.com?subject=${encodeURIComponent(`Report ${report}`)}`;
const webDialog = (labelled: boolean) => (Platform.OS === 'web'
  ? { role: 'dialog' as const, 'aria-modal': labelled, 'aria-labelledby': TITLE_ID, 'aria-describedby': LINE_ID, tabIndex: -1 as const }
  : {});

export function JoinHuman({ ask, look }: { ask: JoinAsk; look: Exclude<JoinLook, 'today'> }) {
  // Reporting has its own way out (an email), which the bubble and the foot bar have no room for: the letter says it.
  if (ask.report && (look === 'a' || look === 'c')) return <JoinLetter ask={ask} />;
  // The bubble needs a button to point at; a page that needs an account has none, so the person-first sheet asks there.
  if (look === 'a') return ask.anchor ? <JoinBubble ask={ask} /> : <JoinPerson ask={ask} />;
  if (look === 'b') return <JoinPerson ask={ask} />;
  if (look === 'c') return <JoinFootBar ask={ask} />;
  return <JoinLetter ask={ask} />;
}

/** A small close ×, quiet, for the keyboard and screen readers as much as the finger. */
function CloseX({ size = 18, light = false, style }: { size?: number; light?: boolean; style?: object }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={closeJoinSheet} style={({ pressed }) => [styles.close, style, pressed && styles.pressed]}>
      <Ionicons name="close" size={size} color={light ? colors.textFaint : colors.textMuted} />
    </Pressable>
  );
}

/** The one filled button: ink on the page's own colour, never green. `tight` is the bubble's: its label at the bubble's small size. */
function InkButton({ label, onPress, small = false, tight = false }: { label: string; onPress: () => void; small?: boolean; tight?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={small ? buttonShape.smallSlop : 0} style={({ pressed }) => [styles.ink, small ? styles.inkSmall : styles.inkFull, pressed && styles.pressed]}>
      <Text numberOfLines={1} style={[styles.inkText, small && styles.inkTextSmall, tight && styles.tightText]}>{label}</Text>
    </Pressable>
  );
}

/** "Log in" as words: no box, no fill. */
function TextLink({ label, onPress, small = false, tight = false }: { label: string; onPress: () => void; small?: boolean; tight?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.link, small ? styles.linkSmall : styles.linkFull, pressed && styles.pressed]}>
      <Text numberOfLines={1} style={[styles.linkText, small && styles.linkTextSmall, tight && styles.tightText]}>{label}</Text>
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

/**
 * The bubble's pointer: one filled triangle whose two slanted sides carry the card's hairline on, so
 * the outline runs unbroken round the card and down to the tip (a turned square showed a seam at 1x).
 */
function Pointer({ down, at }: { down: boolean; at: number }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View pointerEvents="none" style={[styles.pointer, down ? styles.pointerDown : styles.pointerUp, { left: at - 8 }]}>
      <Svg width={16} height={9}>
        <Path d={down ? 'M0 0 L8 8.5 L16 0 Z' : 'M0 9 L8 0.5 L16 9 Z'} fill={colors.surface} />
        <Path d={down ? 'M0 0.5 L8 8.5 L16 0.5' : 'M0 8.5 L8 0.5 L16 8.5'} fill="none" stroke={colors.border} strokeWidth={1} />
      </Svg>
    </View>
  );
}

function JoinBubble({ ask }: { ask: JoinAsk }) {
  const styles = useThemedStyles(styleDefinitions);
  const { width, height } = useWindowDimensions();
  const box = useRef<View>(null);
  const go = useGo(ask);
  const copy = humanCopy(ask, 'a');
  useAskFocus(ask, box, { trap: false });
  const a = ask.anchor;
  // No dim and nothing to catch the tap: a press anywhere else closes it and still does what it pressed.
  // A press on the button it points at leaves it be (the same ask again keeps it open: openJoinSheet),
  // so a second tap on the heart does not close it and pop it straight back up.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const onDown = (e: PointerEvent) => {
      const el = box.current as unknown as HTMLElement | null;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      if (a && e.clientX >= a.x - 4 && e.clientX <= a.x + a.width + 4 && e.clientY >= a.y - 4 && e.clientY <= a.y + a.height + 4) return;
      closeJoinSheet();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [ask.at, a]);

  const W = Math.min(BUBBLE_W, width - 24);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  let place: { left: number; top?: number; bottom?: number } = { left: (width - W) / 2, bottom: spacing.xl };
  let tip = W / 2;
  let above = true;
  if (a) {
    const cx = a.x + a.width / 2;
    const right = cx > width * 0.6;
    const left = clamp(right ? cx - W + 30 : cx - 30, 12, width - W - 12);
    // A clip's own buttons sit down its right side: the bubble rises above-left of the heart, the save,
    // the comment. Any other button (Follow in the comments, a comment's heart) has it hang underneath,
    // so it never covers the sheet's title or its ×; above only when there is no room below.
    const onRail = RAIL_ASKS.has(ask.what) && !!ask.about?.post && right && a.y > height * 0.25;
    above = onRail || height - (a.y + a.height) < 200;
    tip = clamp(cx - left, 20, W - 20);
    place = above ? { left, bottom: height - a.y + 10 } : { left, top: a.y + a.height + 10 };
  }
  const person = ask.about?.person;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View entering={POP_IN} exiting={POP_OUT} style={[styles.bubble, { width: W }, place]}>
        <View ref={box} style={styles.bubbleInner} {...(Platform.OS === 'web' ? { role: 'dialog' as const, 'aria-labelledby': TITLE_ID, 'aria-describedby': LINE_ID, tabIndex: -1 as const } : {})}>
          <View style={styles.bubbleHead}>
            {person ? <Avatar uri={person.photo} name={person.name} seed={person.seed} size={20} /> : null}
            <Text nativeID={TITLE_ID} accessibilityRole="header" numberOfLines={2} style={styles.bubbleTitle}>{copy.title}</Text>
          </View>
          <Text nativeID={LINE_ID} style={[styles.bubbleLine, EVEN_WEB]}>{copy.line}</Text>
          <View style={styles.bubbleRow}>
            <InkButton small tight label="Join" onPress={() => { void go(true); }} />
            <TextLink small tight label="Log in" onPress={() => { void go(false); }} />
          </View>
          <CloseX size={14} light style={styles.bubbleClose} />
        </View>
        {a ? <Pointer down={above} at={tip} /> : null}
      </Animated.View>
    </View>
  );
}

/* ---------- b · the person first ---------- */

/** Their face in front, the post's cover tucked behind it: one picture, not two stickers side by side. */
function PersonFaces({ ask }: { ask: JoinAsk }) {
  const styles = useThemedStyles(styleDefinitions);
  const person = ask.about?.person;
  const cover = ask.about?.post?.cover;
  if (person && cover) {
    return (
      <View style={styles.faces}>
        <View style={styles.cover}>
          <Image accessibilityIgnoresInvertColors source={{ uri: cover }} contentFit="cover" style={StyleSheet.absoluteFill} />
        </View>
        <View style={styles.faceRing}>
          <Avatar uri={person.photo} name={person.name} seed={person.seed} size={FACE} />
        </View>
      </View>
    );
  }
  if (person) return <View style={styles.facesOne}><Avatar uri={person.photo} name={person.name} seed={person.seed} size={44} /></View>;
  if (cover) return <View style={[styles.cover, styles.coverAlone]}><Image accessibilityIgnoresInvertColors source={{ uri: cover }} contentFit="cover" style={StyleSheet.absoluteFill} /></View>;
  return null;
}

// The face (inside a 2-point ring of the sheet's colour), the cover behind it up and to the right, and the row they make.
const FACE = 40;
const RING = 2;
const COVER_W = 36;
const COVER_H = 48;
const COVER_LEFT = 28;
const FACE_TOP = 14;
const FACES_H = FACE_TOP + FACE + RING * 2;

function JoinPerson({ ask }: { ask: JoinAsk }) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const column = useColumn();
  const pathname = usePathname();
  const box = useRef<View>(null);
  const go = useGo(ask);
  const copy = humanCopy(ask, 'b');
  useAskFocus(ask, box, { trap: true });
  const person = ask.about?.person;
  const cover = ask.about?.post?.cover;
  const facesH = person && cover ? FACES_H : person || cover ? 44 : 0;
  // A like is a small thing: the page only just dims. Over the comments (a sheet already up), not at all.
  const dim = overSheet(pathname) ? null : ONE_TAP.has(ask.what) ? styles.dimLight : styles.dim;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View entering={DIM_IN} exiting={DIM_OUT} style={StyleSheet.absoluteFill}>
        {dim ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, dim]} /> : null}
        <Pressable accessible={false} focusable={false} tabIndex={-1} style={StyleSheet.absoluteFill} onPress={closeJoinSheet} />
      </Animated.View>
      <Animated.View entering={SHEET_IN} exiting={SHEET_OUT} style={[styles.sheet, column ? { left: column.left, width: column.width } : styles.sheetFull, { paddingBottom: (column ? 0 : insets.bottom) + spacing.lg }]}>
        <View ref={box} style={styles.focusBox} {...webDialog(true)}>
          {facesH ? <PersonFaces ask={ask} /> : null}
          <Text nativeID={TITLE_ID} accessibilityRole="header" style={[styles.personTitle, EVEN_WEB]}>{copy.title}</Text>
          <Text nativeID={LINE_ID} style={[styles.personLine, EVEN_WEB]}>{copy.line}</Text>
          <View style={styles.personRow}>
            <InkButton label="Create account" onPress={() => { void go(true); }} />
            <TextLink label="Log in" onPress={() => { void go(false); }} />
          </View>
          {ask.report ? <ReportLine report={ask.report} /> : null}
          {/* Level with the middle of the faces (or of the first line, with none). */}
          <CloseX style={[styles.sheetClose, { top: facesH ? (facesH - 32) / 2 : -3 }]} />
        </View>
      </Animated.View>
    </View>
  );
}

/* ---------- c · the foot bar ---------- */

function JoinFootBar({ ask }: { ask: JoinAsk }) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const column = useColumn();
  const barInset = useBarInset();
  const pathname = usePathname();
  const box = useRef<View>(null);
  const go = useGo(ask);
  const copy = humanCopy(ask, 'c');
  // The page carries on: the bar does not take the focus (a keyboard reaches it next) and it reads itself out.
  useAskFocus(ask, box, { trap: false, steal: false });
  // It stays until they move on, not on a clock (a finger has no hover to hold it, so a timer took it mid-read):
  // the next swipe, scroll or wheel on the page, the arrow keys that turn a clip, or another page.
  const opened = useRef(pathname);
  useEffect(() => { if (pathname !== opened.current) closeJoinSheet(); }, [pathname]);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const inBar = (t: EventTarget | null) => { const el = box.current as unknown as HTMLElement | null; return !!el && t instanceof Node && el.contains(t); };
    let from: { x: number; y: number } | null = null;
    const moved = (x: number, y: number) => !!from && (Math.abs(x - from.x) > 12 || Math.abs(y - from.y) > 12);
    const onWheel = (e: WheelEvent) => { if (!inBar(e.target) && Math.abs(e.deltaX) + Math.abs(e.deltaY) > 2) closeJoinSheet(); };
    const onTouchStart = (e: TouchEvent) => { const t = e.touches[0]; from = t && !inBar(e.target) ? { x: t.clientX, y: t.clientY } : null; };
    const onTouchMove = (e: TouchEvent) => { const t = e.touches[0]; if (t && moved(t.clientX, t.clientY)) closeJoinSheet(); };
    const onDown = (e: PointerEvent) => { if (e.pointerType === 'mouse') from = inBar(e.target) ? null : { x: e.clientX, y: e.clientY }; };
    const onMove = (e: PointerEvent) => { if (e.pointerType === 'mouse' && e.buttons === 1 && moved(e.clientX, e.clientY)) closeJoinSheet(); };
    const onKey = (e: KeyboardEvent) => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key) && !inBar(e.target)) closeJoinSheet(); };
    const opts = { capture: true, passive: true } as const;
    document.addEventListener('wheel', onWheel, opts);
    document.addEventListener('touchstart', onTouchStart, opts);
    document.addEventListener('touchmove', onTouchMove, opts);
    document.addEventListener('pointerdown', onDown, opts);
    document.addEventListener('pointermove', onMove, opts);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('wheel', onWheel, opts);
      document.removeEventListener('touchstart', onTouchStart, opts);
      document.removeEventListener('touchmove', onTouchMove, opts);
      document.removeEventListener('pointerdown', onDown, opts);
      document.removeEventListener('pointermove', onMove, opts);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [ask.at]);
  const live = Platform.OS === 'web' ? { role: 'region' as const, 'aria-live': 'polite' as const, 'aria-label': copy.title } : {};
  // On a phone it floats just above the tab bar, never over it (a tap meant for Profile would have landed on
  // "Sign up"): 8 over the pill's top (the bar's inset less the air it keeps above the pill), where it lies over
  // a clip's words and leaves the poster's name showing above it. With no tab bar (the comments), just above
  // the foot. On a computer, at the foot of the clip's column.
  const place = column
    ? { left: column.left + spacing.md, width: column.width - spacing.md * 2, bottom: spacing.md }
    : { left: spacing.lg, right: spacing.lg, bottom: (TAB_PAGES.has(pathname) ? barInset - TAB_BAR_GAP : Math.max(insets.bottom, 12)) + spacing.sm };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View entering={BAR_IN} exiting={BAR_OUT} style={[styles.bar, place]}>
        <View ref={box} style={styles.barRow} {...live}>
          <Text nativeID={TITLE_ID} numberOfLines={1} style={styles.barTitle}>{copy.title}</Text>
          <InkButton small label="Sign up" onPress={() => { void go(true); }} />
          <TextLink small label="Log in" onPress={() => { void go(false); }} />
          <CloseX size={16} light style={styles.barClose} />
        </View>
      </Animated.View>
    </View>
  );
}

/* ---------- d · the letter ---------- */

function JoinLetter({ ask }: { ask: JoinAsk }) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const column = useColumn();
  const pathname = usePathname();
  const box = useRef<View>(null);
  const go = useGo(ask);
  const copy = humanCopy(ask, 'd');
  useAskFocus(ask, box, { trap: true });
  const dimmed = !overSheet(pathname);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View entering={DIM_IN} exiting={DIM_OUT} style={[StyleSheet.absoluteFill, dimmed && styles.dim]}>
        <Pressable accessible={false} focusable={false} tabIndex={-1} style={StyleSheet.absoluteFill} onPress={closeJoinSheet} />
      </Animated.View>
      {/* The same letter on every screen: a sheet from the foot; on a computer, from the foot of the clip's column. */}
      <Animated.View entering={SHEET_IN} exiting={SHEET_OUT} style={[styles.sheet, styles.letterSheet, column ? { left: column.left, width: column.width } : styles.sheetFull, { paddingBottom: (column ? 0 : insets.bottom) + spacing.xl }]}>
        <View ref={box} style={styles.focusBox} {...webDialog(true)}>
          <Text nativeID={TITLE_ID} accessibilityRole="header" style={[styles.letterTitle, EVEN_WEB]}>{copy.title}</Text>
          <Text nativeID={LINE_ID} style={[styles.letterLine, EVEN_WEB]}>{copy.line}</Text>
          <View style={styles.letterRow}>
            <TextLink label="Log in" onPress={() => { void go(false); }} />
            <InkButton label="Join CourtSide" onPress={() => { void go(true); }} />
          </View>
          {ask.report ? <ReportLine report={ask.report} /> : null}
          <CloseX style={styles.letterClose} />
        </View>
      </Animated.View>
    </View>
  );
}

// Overlays keep the theme's neutral overlay shadow (DESIGN.md, Shadow Vocabulary: Overlay); nothing glows.
const OVERLAY_SHADOW = '0px 6px 16px rgba(0, 0, 0, 0.14)';
const SHEET_SHADOW = '0px -4px 16px rgba(0, 0, 0, 0.10)';

const styleDefinitions = StyleSheet.create({
  dim: { backgroundColor: colors.overlay },
  // The same overlay at two fifths: the page stays readable behind a one-tap ask.
  dimLight: { backgroundColor: colors.overlay, opacity: 0.4 },
  pressed: { opacity: PRESS_DIM },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  focusBox: { outlineStyle: 'none' } as never,

  ink: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text, ...buttonShape.curve },
  inkFull: { height: buttonShape.height, paddingHorizontal: spacing.xl, borderRadius: radius.md },
  inkSmall: { height: buttonShape.smallHeight, paddingHorizontal: spacing.lg, borderRadius: radius.sm },
  inkText: { ...font('600'), fontSize: buttonShape.label, color: colors.bg },
  inkTextSmall: { fontSize: buttonShape.smallLabel },
  tightText: { fontSize: typography.smallStrong.fontSize },
  link: { alignItems: 'center', justifyContent: 'center' },
  linkFull: { height: buttonShape.height, paddingHorizontal: spacing.md },
  linkSmall: { height: buttonShape.smallHeight, paddingHorizontal: spacing.xs },
  linkText: { ...font('600'), fontSize: buttonShape.label, color: colors.text },
  linkTextSmall: { fontSize: buttonShape.smallLabel },
  report: { alignSelf: 'flex-start', paddingTop: spacing.md },
  reportText: { ...typography.small, color: colors.textMuted },
  reportLink: { ...typography.smallStrong, color: colors.text, textDecorationLine: 'underline' },

  // a: two sizes only, the first line at 15 and everything else (the line under it, both buttons) at 13.
  bubble: { position: 'absolute', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, boxShadow: OVERLAY_SHADOW, ...buttonShape.curve },
  bubbleInner: { paddingTop: spacing.md, paddingBottom: spacing.md, paddingHorizontal: spacing.md + 2, outlineStyle: 'none' } as never,
  bubbleHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingRight: 22 },
  bubbleTitle: { ...typography.bodyStrong, lineHeight: 20, color: colors.text, flexShrink: 1 },
  bubbleLine: { ...typography.small, lineHeight: 18, color: colors.textMuted, marginTop: spacing.xs },
  bubbleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  bubbleClose: { position: 'absolute', top: spacing.xs, right: spacing.xs, width: 28, height: 28 },
  pointer: { position: 'absolute', width: 16, height: 9 },
  // Its top (or bottom) row lies over the card's own hairline, so the outline turns down to the tip with no seam.
  pointerDown: { bottom: -9 },
  pointerUp: { top: -9 },

  // b and d: a sheet from the foot, the window's width on a phone, the clip's column on a computer.
  sheet: { position: 'absolute', bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: spacing.xl, paddingHorizontal: spacing.xl, boxShadow: SHEET_SHADOW, ...buttonShape.curve },
  sheetFull: { left: 0, right: 0 },
  faces: { width: COVER_LEFT + COVER_W, height: FACES_H, marginBottom: spacing.lg },
  facesOne: { marginBottom: spacing.lg, alignSelf: 'flex-start' },
  cover: { position: 'absolute', left: COVER_LEFT, top: 0, width: COVER_W, height: COVER_H, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt, ...buttonShape.curve },
  coverAlone: { position: 'relative', left: 0, width: 33, height: 44, marginBottom: spacing.lg },
  faceRing: { position: 'absolute', left: 0, top: FACE_TOP, padding: RING, borderRadius: radius.pill, backgroundColor: colors.surface },
  personTitle: { ...font('500'), fontSize: 20, lineHeight: 26, letterSpacing: -0.3, color: colors.text, paddingRight: spacing.xl },
  personLine: { ...typography.body, lineHeight: 21, color: colors.textMuted, marginTop: 6 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
  sheetClose: { position: 'absolute', right: -spacing.sm },

  // c: one slim line, the × last.
  bar: { position: 'absolute', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, boxShadow: OVERLAY_SHADOW, ...buttonShape.curve },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52, paddingLeft: spacing.md + 2, paddingRight: spacing.xs },
  barClose: { width: 28, height: 28 },
  barTitle: { ...typography.bodyStrong, lineHeight: 20, color: colors.text, flex: 1, minWidth: 0 },

  // d: words, then the two buttons at the right, Log in as words before the one filled button.
  letterSheet: { paddingTop: spacing.xl + spacing.xs },
  letterTitle: { ...font('400'), fontSize: 22, lineHeight: 29, letterSpacing: -0.3, color: colors.text, paddingRight: 36 },
  letterLine: { ...typography.body, lineHeight: 22, color: colors.textMuted, marginTop: spacing.sm, paddingRight: spacing.lg },
  letterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.xl },
  letterClose: { position: 'absolute', top: -spacing.sm, right: -spacing.md },
});

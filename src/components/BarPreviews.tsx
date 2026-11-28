import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, PixelRatio, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, interpolate, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Glass } from '@/components/ui/Glass';
import { BAR_RECEDE } from '@/features/compose/createMenu';
import { FeedHold } from '@/features/feed/FeedHold';
import { HOLD_MARK, HOLD_MS, NO_CALLOUT, SHOW_ALL_FEEDS, holdFeedTab, noteFeedPressIn, noteFeedPressOut } from '@/features/feed/feedWindows';
import { useFeedOnPicture, useRowOnFeed } from '@/features/navigation/barOverMedia';
import { barCompact } from '@/features/navigation/barShrink';
import { BAR_METRICS } from '@/features/navigation/tabBarLook';
import { TextScale, font, inkOn, typography, withAlpha } from '@/theme';
import { darkColors, themes, useTheme } from '@/theme/ThemeProvider';
import type { LookItem } from './TabBarLooks';
import { BarGlyph, glyphOf, type GlyphKind } from './BarGlyphs';

/**
 * Other bottom bars, pictures only (Nov 28, owner: "Let me see some other bottom bars"; features/navigation/barPreview).
 * A demo build only; nothing here is drawn anywhere else. Every one keeps what today's bar does: the same five places
 * (Community, Feed, +, Coaching, Profile) with Profile's count, the rise on a fresh open, the Create box's veil, the
 * tutorial's targets, the Feed tab's hold, the tab lit at the touch, dark over a clip on the Feed. The bar stays still
 * while the pages slide under it; nothing that holds glass ever fades (only the icons and words themselves do).
 *
 *   1  Classic edge   full width on the bottom edge, solid in the page's colour, a visible hairline on top; icons with
 *                     small words; the lit tab in ink with its icon filled; the + the square-plus with its word, "Create".
 *   2  Icons only     Instagram's classic bar: five line icons evenly spaced, all in ink, the lit one filled; the +
 *                     Instagram's square-plus outline; a hairline on top.
 *   3  Small capsule  a floating glass capsule (Threads, X on iOS 26), near full width, icons only, the lit one filled in
 *                     ink, no coloured bubble; neutral clear glass with a light top edge; the + a plain plus as heavy as
 *                     the icons; it tucks as you scroll.
 * Round 2 (the critic, Nov 28): one icon set of their own (BarGlyphs: one stroke, a reel for Feed, a clipboard with a tick
 * for Coaching), no dip or pop as a tab lights (the fill swaps and the colour crosses over in 120 ms, as Instagram's,
 * Threads' and Apple's do), and Profile's count smaller, ringed in the bar's ground, on the icon's top-right corner.
 */
export type PreviewOption = '1' | '2' | '3';

const PX = PixelRatio.get();
/** A tab lit at the touch whose page has not come goes dark again after this (as today's bar). */
const LIT_GIVE_UP_MS = 1500;

/** The edge bars' row over the phone's bottom strip: the height a phone's own tab bar has always had. */
const EDGE_ROW = 49;
/** A little more air between the edge bars' hairline and their icons (the icons stay where they were). */
const EDGE_TOP = 3;
/** The capsule: its height, and its air either side (Apple's own floats about this far in). */
const CAP_H = 56;
const CAP_SIDE = 24;
/** How far the small capsule tucks toward the edge while you scroll down (the new bar's). */
const CAP_TUCK = 6;

/** How long a tab takes to light: the fill swaps and the colour crosses over, nothing grows or dips. */
const LIGHT_MS = 120;

/**
 * A tab's icon (and word) lighting: the line glyph in the idle colour under the filled one in the lit colour,
 * crossed over on the animation thread in 120 ms (each icon a leaf of its own: nothing holding glass fades), the
 * word's colour mixed the same way. No scale at all (Instagram, Threads and Apple do none on a tab change).
 * `litIcon`: the filled glyph's own colour where it differs from the word's (the calmer pill over a clip).
 */
export function LitMark({ glyph, size, idle, lit, litIcon, active, label, labelStyle, labelFade, badge, stroke, ms = LIGHT_MS }: {
  glyph: GlyphKind; size: number; idle: string; lit: string; litIcon?: string; active: boolean;
  label?: string; labelStyle?: object; labelFade?: object; badge?: React.ReactNode; stroke?: number; ms?: number;
}) {
  const on = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(active ? 1 : 0, { duration: ms, easing: Easing.out(Easing.quad) });
  }, [active, ms, on]);
  const idleOn = useAnimatedStyle(() => ({ opacity: 1 - on.value }));
  const litOn = useAnimatedStyle(() => ({ opacity: on.value }));
  const tint = useAnimatedStyle(() => ({ color: interpolateColor(on.value, [0, 1], [idle, lit]) }), [idle, lit]);
  return (
    <>
      <View>
        <Animated.View style={idleOn}><BarGlyph kind={glyph} size={size} color={idle} stroke={stroke} /></Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, litOn]}><BarGlyph kind={glyph} filled size={size} color={litIcon ?? lit} stroke={stroke} /></Animated.View>
        {badge}
      </View>
      {label ? <Animated.Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CHROME} style={[labelStyle, tint, labelFade]}>{label}</Animated.Text> : null}
    </>
  );
}

/**
 * Profile's count (round 2): 15 points of full-strength red with 10-point bold figures, in a 2-point ring of the bar's
 * own ground that cuts it clear of the icon, its middle on the icon's top-right corner. On a dark bar (a dark court or
 * over a clip) the light courts' red and white, never the dark palette's washed-out salmon.
 */
export function BarBadge({ count, iconSize, ground, dark }: { count: number; iconSize: number; ground: string; dark: boolean }) {
  const { theme } = useTheme();
  const c = dark ? themes.clean : themes[theme];
  return (
    <View pointerEvents="none" style={[badge.ring, { left: iconSize - BADGE_RING - 7, borderColor: ground }]}>
      <View style={[badge.dot, { backgroundColor: c.danger }]}>
        <Text maxFontSizeMultiplier={TextScale.CHROME} style={[badge.text, { color: c.onDanger }]}>{count > 9 ? '9+' : count}</Text>
      </View>
    </View>
  );
}
const BADGE_H = 15;
const BADGE_RING = 2;
const badge = StyleSheet.create({
  ring: { position: 'absolute', top: -BADGE_H / 2 - BADGE_RING + 1, borderWidth: BADGE_RING, borderRadius: BADGE_H / 2 + BADGE_RING },
  dot: { minWidth: BADGE_H, height: BADGE_H, borderRadius: BADGE_H / 2, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 10, lineHeight: 12, ...font('700'), fontVariant: ['tabular-nums'], includeFontPadding: false, textAlign: 'center' },
});

export const PreviewBar = React.memo(function PreviewBar({
  option, items, activeRoute, feedUnder, tabsUnder, profileAlerts, onTab, onTabPressIn, onCreate, tourRef, tourCreate,
  inset, outerStyle, hideFromReader, veilStyle, veilBlocks, onVeil, onFeedHold,
}: {
  option: PreviewOption;
  items: LookItem[];
  activeRoute: string | undefined;
  feedUnder: boolean;
  tabsUnder: boolean;
  profileAlerts: number;
  onTab: (route: string) => void;
  onTabPressIn?: (route: string) => void;
  onCreate: () => void;
  tourRef: (route: string) => ((node: View | null) => void) | undefined;
  tourCreate: (node: View | null) => void;
  /** The phone's bottom strip (home bar), 0 where there is none. */
  inset: number;
  outerStyle: React.ComponentProps<typeof Animated.View>['style'];
  hideFromReader: 'auto' | 'no-hide-descendants';
  veilStyle: React.ComponentProps<typeof Animated.View>['style'];
  veilBlocks: boolean;
  onVeil: () => void;
  onFeedHold?: () => void;
}) {
  const { theme } = useTheme();
  const c = themes[theme];
  const darkPage = inkOn(c.bg) === '#FFFFFF';
  // Over a clip on the Feed itself: dark, as today's bar (the same two signals as TabBarLooks).
  const onPicture = useFeedOnPicture();
  const rowOnFeed = useRowOnFeed();
  const feedShown = rowOnFeed ?? activeRoute === 'index';
  const overFeed = feedShown && (rowOnFeed === null ? feedUnder : tabsUnder);
  const media = overFeed && onPicture;
  const ground = media ? (darkPage ? c.bg : darkColors.bg) : c.bg;
  const darkBar = media || darkPage;
  const ink = media ? c.onMedia : c.text;
  // Instagram's idle icons are in ink too (the lit one is only filled); the others' idle tabs step back.
  const idle = option === '2' ? ink : media ? withAlpha(c.onMedia, 0.62) : c.textMuted;
  // The edge bars' hairline: one device pixel, dark enough to see where a white sheet above meets the white bar.
  const line = media ? withAlpha(c.onMedia, 0.14) : withAlpha(c.text, darkPage ? 0.16 : 0.15);

  // The tab lit at the touch, as today's bar: the page follows; the address catching up makes it lit by right.
  const [pressed, setPressed] = useState<string | null>(null);
  const [seen, setSeen] = useState(activeRoute);
  if (seen !== activeRoute) {
    setSeen(activeRoute);
    if (pressed !== null) setPressed(null);
  }
  useEffect(() => {
    if (pressed === null) return undefined;
    const t = setTimeout(() => setPressed(null), LIT_GIVE_UP_MS);
    return () => clearTimeout(t);
  }, [pressed]);
  const lit = pressed ?? activeRoute;
  const now = useRef({ activeRoute, onTab, onTabPressIn });
  now.current = { activeRoute, onTab, onTabPressIn };
  const pressIn = useCallback((route: string) => {
    setPressed(route === now.current.activeRoute ? null : route);
    now.current.onTabPressIn?.(route);
  }, []);
  const press = useCallback((route: string) => now.current.onTab(route), []);

  const st = option === '1' ? classic : option === '2' ? iconsOnly : capsule;
  const iconSize = option === '2' ? 26 : 25;
  const words = option === '1';
  const plusLit = veilBlocks;

  // The +: the square-plus (with its word on the classic edge), or on the capsule a plain plus drawn a touch heavier
  // and bigger so it weighs what the outlined icons beside it do. Filled while the Create box is up.
  const plusMark = option === '3' ? (
    <LitMark glyph="plus" size={27} stroke={2.1} idle={idle} lit={ink} active={plusLit} />
  ) : (
    <LitMark glyph="squarePlus" size={iconSize} idle={idle} lit={ink} active={plusLit} label={words ? 'Create' : undefined} labelStyle={st.label} />
  );
  const row: React.ReactNode[] = [];
  items.forEach((item, index) => {
    if (index === 2) {
      row.push(
        <View key="create" style={[st.slot, st.above]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Create a post" onPress={onCreate} style={st.hit}>
            <View ref={tourCreate} style={st.target}>{plusMark}</View>
          </Pressable>
        </View>,
      );
    }
    const active = item.route === lit;
    const hold = item.route === 'index' ? onFeedHold : undefined;
    const count = item.route === 'profile' && profileAlerts > 0
      ? <BarBadge count={profileAlerts} iconSize={iconSize} ground={option === '3' ? (darkBar ? darkColors.bg : c.onMedia) : ground} dark={darkBar} />
      : null;
    row.push(
      <View key={item.route} style={st.slot}>
        <FeedHold onHold={hold ? holdFeedTab : undefined}>
          <Pressable
            onPressIn={() => { pressIn(item.route); if (hold) noteFeedPressIn(); }}
            onPressOut={() => { if (hold) noteFeedPressOut(); }}
            onPress={() => press(item.route)}
            onLongPress={hold ? holdNoop : undefined}
            delayLongPress={hold ? HOLD_MS : undefined}
            accessibilityRole="tab"
            accessibilityState={{ selected: item.route === activeRoute }}
            accessibilityLabel={item.label}
            accessibilityActions={hold ? SHOW_ALL_FEEDS : undefined}
            onAccessibilityAction={hold ? (e) => { if (e.nativeEvent.actionName === 'showAllFeeds') hold(); } : undefined}
            style={hold ? [st.hit, NO_CALLOUT] : st.hit}
            {...(hold ? HOLD_MARK : null)}
          >
            <View ref={tourRef(item.route)} style={st.target}>
              <LitMark glyph={glyphOf(item.route)} size={iconSize} idle={idle} lit={ink} active={active}
                label={words ? item.label : undefined} labelStyle={st.label} badge={count} />
            </View>
          </Pressable>
        </FeedHold>
      </View>,
    );
  });
  // While the Create box is up, a veil of the bar's own ground steps the tabs back (only it fades), and a tap on it closes the box.
  const veil = (radius: number, over: string = ground) => (
    <Animated.View pointerEvents={veilBlocks ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { zIndex: 1, borderRadius: radius, backgroundColor: withAlpha(over, BAR_RECEDE) }, veilStyle]}>
      <Pressable accessible={false} importantForAccessibility="no" onPress={onVeil} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );

  // The capsule's tuck as you scroll down, on the screen's real pixels (never scaled: icons stay sharp).
  const tuck = useAnimatedStyle(() => ({ transform: [{ translateY: Math.round(interpolate(barCompact.value, [0, 1], [0, CAP_TUCK]) * PX) / PX }] }));
  if (option === '3') {
    const bottom = Math.max(inset, 12);
    // Its foot 22 above the edge on a phone with a home bar (12 into the strip, as the new bar's), its top never past today's.
    const foot = Math.min(Math.max(bottom - 12, 12), bottom + BAR_METRICS.height - CAP_H);
    const width = Dimensions.get('window').width - 2 * CAP_SIDE;
    // Neutral clear glass, as Apple's own (round 2: tinted with the page's ground it read as a cream lozenge and caught a
    // muddy wash from what was under it): white over a light page, near-black on a dark one and over a clip, half and
    // under half strength. Its edge: a faint neutral line, and a light top edge in place of the grey rim.
    const glassTint = darkBar ? darkColors.bg : c.onMedia;
    return (
      <Animated.View pointerEvents="box-none" importantForAccessibility={hideFromReader} style={[capsule.float, { bottom: foot }, outerStyle]}>
        <Animated.View pointerEvents="box-none" style={tuck}>
          <View style={[capsule.shadow, Platform.OS === 'ios' ? capsule.shadowPath : null, { width }]}>
            <Glass clear tint={glassTint} tintAlpha={darkBar ? 0.45 : 0.55} dark={darkBar} radius={CAP_H / 2} style={capsule.pill}>
              {row}
              <View pointerEvents="none" style={[capsule.rim, { borderColor: darkBar ? withAlpha(c.onMedia, media ? 0.18 : 0.22) : withAlpha(c.text, 0.07) }]} />
              <View pointerEvents="none" style={[capsule.topLight, { borderTopColor: withAlpha(c.onMedia, darkBar ? 0.3 : 0.95) }]} />
              {veil(CAP_H / 2, glassTint)}
            </Glass>
          </View>
        </Animated.View>
      </Animated.View>
    );
  }
  return (
    <Animated.View pointerEvents="box-none" importantForAccessibility={hideFromReader} style={[edge.bar, { height: EDGE_TOP + EDGE_ROW + inset, backgroundColor: ground, borderTopColor: line }, outerStyle]}>
      <View style={edge.row}>{row}</View>
      {veil(0)}
    </Animated.View>
  );
});

const holdNoop = () => undefined;

const edge = StyleSheet.create({
  // On the bottom edge, full width, solid; the hairline is its top border (no glass here, so a border is fine).
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 30, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: EDGE_TOP },
  row: { height: EDGE_ROW, flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: 4 },
});

const classic = StyleSheet.create({
  slot: { flex: 1 },
  above: { zIndex: 2 },
  hit: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 1 },
  target: { alignSelf: 'stretch', alignItems: 'center', gap: 2 },
  // Semibold for every word, lit or not (only the colour changes), so nothing changes width as a tab lights.
  label: { ...typography.smallStrong, fontSize: 10, letterSpacing: 0.1 },
});

const iconsOnly = StyleSheet.create({
  slot: { flex: 1 },
  above: { zIndex: 2 },
  hit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  target: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', height: 44 },
  label: {},
});

const capsule = StyleSheet.create({
  float: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 30 },
  // Half the shadow it had: Apple's glass floats on very little.
  shadow: { borderRadius: CAP_H / 2, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  shadowPath: { shadowOpacity: 0, boxShadow: '0px 4px 22px rgba(0, 0, 0, 0.045)' },
  pill: { height: CAP_H, borderRadius: CAP_H / 2, overflow: 'hidden', flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: 10 },
  rim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2, borderRadius: CAP_H / 2, borderWidth: StyleSheet.hairlineWidth },
  // The light top edge: a one-point line along the top that thins away round the ends, as glass catches light.
  topLight: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2, borderRadius: CAP_H / 2, borderTopWidth: 1 },
  slot: { flex: 1 },
  above: { zIndex: 2 },
  hit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  target: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', height: 44 },
  label: {},
});

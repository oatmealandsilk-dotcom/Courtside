import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, PixelRatio, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, interpolate, interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Glass } from '@/components/ui/Glass';
import { BAR_RECEDE } from '@/features/compose/createMenu';
import { FeedHold } from '@/features/feed/FeedHold';
import { HOLD_MARK, HOLD_MS, NO_CALLOUT, SHOW_ALL_FEEDS, holdFeedTab, noteFeedPressIn, noteFeedPressOut } from '@/features/feed/feedWindows';
import { useFeedOnPicture, useRowOnFeed } from '@/features/navigation/barOverMedia';
import { barCompact } from '@/features/navigation/barShrink';
import { BAR_METRICS } from '@/features/navigation/tabBarLook';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { TextScale, font, inkOn, typography, withAlpha } from '@/theme';
import { darkColors, themes, useTheme } from '@/theme/ThemeProvider';
import type { LookItem } from './TabBarLooks';

/**
 * Other bottom bars, pictures only (Nov 28, owner: "Let me see some other bottom bars"; features/navigation/barPreview).
 * A demo build only; nothing here is drawn anywhere else. Every one keeps what today's bar does: the same five places
 * (Community, Feed, +, Coaching, Profile) with Profile's count, the rise on a fresh open, the Create box's veil, the
 * tutorial's targets, the Feed tab's hold, the tab lit at the touch, dark over a clip on the Feed. The bar stays still
 * while the pages slide under it; nothing that holds glass ever fades (only the icons and words themselves do).
 *
 *   1  Classic edge   full width on the bottom edge, solid in the page's colour, a hairline on top; icons with small
 *                     words; the lit tab in ink with its icon filled, crossing over in 160 ms; the + a plain outlined plus.
 *   2  Icons only     Instagram's classic bar: five line icons evenly spaced, all in ink, the lit one filled (it dips a
 *                     touch as it lights); the + Instagram's square-plus outline; a hairline on top.
 *   3  Small capsule  a compact floating glass capsule (Threads, X on iOS 26), icons only, the lit one filled in ink with
 *                     a small pop as it lights, no coloured bubble; the + a plain icon in the row; it tucks as you scroll.
 */
export type PreviewOption = '1' | '2' | '3';

const PX = PixelRatio.get();
/** A tab lit at the touch whose page has not come goes dark again after this (as today's bar). */
const LIT_GIVE_UP_MS = 1500;

/** The edge bars' row over the phone's bottom strip: the height a phone's own tab bar has always had. */
const EDGE_ROW = 49;
/** The small capsule: its height, its width at most, and its least air either side on a narrow phone. */
const CAP_H = 52;
const CAP_W = 288;
const CAP_SIDE = 32;
/** How far the small capsule tucks toward the edge while you scroll down (the new bar's). */
const CAP_TUCK = 6;

type Motion = 'fade' | 'dip' | 'pop';

/**
 * A tab's icon (and word) lighting: the plain icon in the idle colour under the filled one in the lit colour,
 * crossed over on the animation thread (each icon a leaf of its own: nothing holding glass fades), the word's
 * colour mixed the same way. `motion`: 'fade' only; 'dip' (it dips to 0.88 and comes back as it lights);
 * 'pop' (a touch bigger, then back). With Reduce Motion, the crossing only.
 */
export function LitMark({ icon, activeIcon, size, idle, lit, active, motion, label, labelStyle, labelFade, badge, ms = 160 }: {
  icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap;
  size: number; idle: string; lit: string; active: boolean; motion: Motion;
  label?: string; labelStyle?: object; labelFade?: object; badge?: React.ReactNode; ms?: number;
}) {
  const calm = useReducedMotion();
  const on = useSharedValue(active ? 1 : 0);
  const scale = useSharedValue(1);
  const was = useRef(active);
  useEffect(() => {
    on.value = withTiming(active ? 1 : 0, { duration: ms, easing: Easing.out(Easing.quad) });
    if (active && !was.current && !calm) {
      if (motion === 'dip') scale.value = withSequence(withTiming(0.88, { duration: 70, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: 230, easing: Easing.out(Easing.cubic) }));
      else if (motion === 'pop') scale.value = withSequence(withTiming(1.1, { duration: 110, easing: Easing.out(Easing.quad) }), withSpring(1, { dampingRatio: 1, duration: 280 }));
    }
    was.current = active;
  }, [active, calm, motion, ms, on, scale]);
  const idleOn = useAnimatedStyle(() => ({ opacity: 1 - on.value }));
  const litOn = useAnimatedStyle(() => ({ opacity: on.value }));
  const grow = useAnimatedStyle(() => (scale.value === 1 ? { transform: [] } : { transform: [{ scale: scale.value }] }));
  const tint = useAnimatedStyle(() => ({ color: interpolateColor(on.value, [0, 1], [idle, lit]) }), [idle, lit]);
  return (
    <>
      <View>
        <Animated.View style={grow}>
          <Animated.View style={idleOn}><Ionicons name={icon} size={size} color={idle} /></Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, litOn]}><Ionicons name={activeIcon} size={size} color={lit} /></Animated.View>
        </Animated.View>
        {badge}
      </View>
      {label ? <Animated.Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CHROME} style={[labelStyle, tint, labelFade]}>{label}</Animated.Text> : null}
    </>
  );
}

/** Instagram's square-plus, drawn (Ionicons has none): a rounded square outline with a plus in it; solid while the Create box is up. */
function SquarePlus({ size, color, ground, lit }: { size: number; color: string; ground: string; lit: boolean }) {
  const stroke = 1.7;
  const arm = Math.round(size * 0.46);
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.29, borderWidth: stroke, borderColor: color, backgroundColor: lit ? color : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: arm, height: stroke, borderRadius: stroke / 2, backgroundColor: lit ? ground : color }} />
      <View style={{ position: 'absolute', width: stroke, height: arm, borderRadius: stroke / 2, backgroundColor: lit ? ground : color }} />
    </View>
  );
}

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
  const ink = media ? c.onMedia : c.text;
  // Instagram's idle icons are in ink too (the lit one is only filled); the others' idle tabs step back.
  const idle = option === '2' ? ink : media ? withAlpha(c.onMedia, 0.62) : c.textMuted;
  const line = media ? withAlpha(c.onMedia, 0.12) : c.border;

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
  const iconSize = option === '1' ? 24 : option === '2' ? 26 : 24;
  const motion: Motion = option === '1' ? 'fade' : option === '2' ? 'dip' : 'pop';
  const words = option === '1';
  // The capsule's words would go as you scroll; it has none, so only the edge bar's stay put (an edge bar never ducks).
  const plusLit = veilBlocks;

  const plusMark = option === '1' ? (
    <LitMark icon="add-circle-outline" activeIcon="add-circle" size={iconSize} idle={idle} lit={ink} active={plusLit} motion="fade" label="Create" labelStyle={st.label} />
  ) : option === '2' ? (
    <SquarePlus size={23} color={ink} ground={ground} lit={plusLit} />
  ) : (
    <Ionicons name="add" size={29} color={plusLit ? ink : idle} />
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
    const badge = item.route === 'profile' && profileAlerts > 0 ? (
      <View style={[st.badge, { backgroundColor: c.danger }]}>
        <Text maxFontSizeMultiplier={TextScale.CHROME} style={[st.badgeText, { color: c.onDanger }]}>{profileAlerts > 9 ? '9+' : profileAlerts}</Text>
      </View>
    ) : null;
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
              <LitMark icon={item.icon} activeIcon={item.activeIcon} size={iconSize} idle={idle} lit={ink} active={active} motion={motion}
                label={words ? item.label : undefined} labelStyle={st.label} badge={badge} />
            </View>
          </Pressable>
        </FeedHold>
      </View>,
    );
  });
  // While the Create box is up, a veil of the bar's own ground steps the tabs back (only it fades), and a tap on it closes the box.
  const veil = (radius: number) => (
    <Animated.View pointerEvents={veilBlocks ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { zIndex: 1, borderRadius: radius, backgroundColor: withAlpha(ground, BAR_RECEDE) }, veilStyle]}>
      <Pressable accessible={false} importantForAccessibility="no" onPress={onVeil} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );

  // The small capsule's tuck as you scroll down, on the screen's real pixels (never scaled: icons stay sharp).
  const tuck = useAnimatedStyle(() => ({ transform: [{ translateY: Math.round(interpolate(barCompact.value, [0, 1], [0, CAP_TUCK]) * PX) / PX }] }));
  if (option === '3') {
    const bottom = Math.max(inset, 12);
    // Its foot 22 above the edge on a phone with a home bar (12 into the strip, as the new bar's), its top never past today's.
    const foot = Math.min(Math.max(bottom - 12, 12), bottom + BAR_METRICS.height - CAP_H);
    const width = Math.min(CAP_W, Dimensions.get('window').width - 2 * CAP_SIDE);
    return (
      <Animated.View pointerEvents="box-none" importantForAccessibility={hideFromReader} style={[capsule.float, { bottom: foot }, outerStyle]}>
        <Animated.View pointerEvents="box-none" style={tuck}>
          <View style={[capsule.shadow, Platform.OS === 'ios' ? capsule.shadowPath : null, { width }]}>
            <Glass clear tint={ground} dark={media ? true : undefined} radius={CAP_H / 2} style={capsule.pill}>
              {row}
              <View pointerEvents="none" style={[capsule.rim, { borderColor: media ? withAlpha(c.onMedia, 0.14) : c.border }]} />
              {veil(CAP_H / 2)}
            </Glass>
          </View>
        </Animated.View>
      </Animated.View>
    );
  }
  return (
    <Animated.View pointerEvents="box-none" importantForAccessibility={hideFromReader} style={[edge.bar, { height: EDGE_ROW + inset, backgroundColor: ground, borderTopColor: line }, outerStyle]}>
      <View style={edge.row}>{row}</View>
      {veil(0)}
    </Animated.View>
  );
});

const holdNoop = () => undefined;

const badgeBase = {
  position: 'absolute' as const, top: -5, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
  alignItems: 'center' as const, justifyContent: 'center' as const,
};
const badgeText = { fontSize: 11, lineHeight: 13, ...font('700'), fontVariant: ['tabular-nums' as const], includeFontPadding: false, textAlign: 'center' as const };

const edge = StyleSheet.create({
  // On the bottom edge, full width, solid; the hairline is its top border (no glass here, so a border is fine).
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 30, borderTopWidth: StyleSheet.hairlineWidth },
  row: { height: EDGE_ROW, flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: 4 },
});

const classic = StyleSheet.create({
  slot: { flex: 1 },
  above: { zIndex: 2 },
  hit: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 1 },
  target: { alignSelf: 'stretch', alignItems: 'center', gap: 2 },
  label: { ...typography.smallStrong, fontSize: 10, letterSpacing: 0.1 },
  badge: { ...badgeBase, left: 15 },
  badgeText,
});

const iconsOnly = StyleSheet.create({
  slot: { flex: 1 },
  above: { zIndex: 2 },
  hit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  target: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', height: 44 },
  label: {},
  badge: { ...badgeBase, left: 16 },
  badgeText,
});

const capsule = StyleSheet.create({
  float: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 30 },
  shadow: { borderRadius: CAP_H / 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  shadowPath: { shadowOpacity: 0, boxShadow: '0px 4px 22px rgba(0, 0, 0, 0.09)' },
  pill: { height: CAP_H, borderRadius: CAP_H / 2, overflow: 'hidden', flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: 8 },
  rim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2, borderRadius: CAP_H / 2, borderWidth: StyleSheet.hairlineWidth },
  slot: { flex: 1 },
  above: { zIndex: 2 },
  hit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  target: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', height: 44 },
  label: {},
  badge: { ...badgeBase, left: 14 },
  badgeText,
});

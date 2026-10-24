import { PRESS_DIM } from '@/theme/press';
import React, { useCallback, useContext, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Reanimated, { type SharedValue, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { Wash } from '@/components/Wash';
import { useRestKey } from '@/components/ui/restMotion';
import { PAGE_WASH, PageWashContext } from '@/components/ui/pageWash';
import { PROFILE_TABS, type ProfileTab } from '@/features/players/profileTab';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, pageIsDark, radius, spacing, typography, withAlpha } from '@/theme';
import { trackCorner } from '@/theme/look';
import { TextScale, oneLine } from '@/theme/textScale';

/**
 * How far under the top of the scrolling page the tabs ride once pinned: a
 * little room under the title, filled (with the room under them) by a band
 * in the page's own colour, so nothing passing underneath shows around them.
 */
export const PIN_GAP = spacing.sm;
/** The band's reach past the bar: out over the page's 16-point gutter, and a little below it. */
const BAND_SIDE = spacing.lg;
const BAND_BELOW = spacing.sm;
/** The bar's padding and the space between its tabs. */
const TRACK_PAD = 4;
const TAB_GAP = 4;

/** In a browser the page's own sticky positioning pins them, exactly in step with the scroll. */
const WEB = Platform.OS === 'web';
const webSticky = WEB ? ({ position: 'sticky', top: PIN_GAP } as unknown as ViewStyle) : null;

/** A browser element's place on the screen (React Native for Web's views are the page's own elements). */
const rect = (node: unknown): DOMRect | null => {
  const el = node as { getBoundingClientRect?: () => DOMRect } | null;
  return el && typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
};

/**
 * Activity · Health · Game (Oct 5, option A): a quiet cream bar under the
 * Log a session and Edit buttons, the chosen tab raised in white (on a dark
 * page, a shade lighter than the bar), so the green button stays the only
 * loud thing on the page. Scrolled past, it stays pinned at the top of the
 * page on a band of the page's colour that hides what scrolls beneath; on a
 * phone it is carried down by the scroll (`offsetY`, the page's own scroll,
 * from Screen), in a browser by sticky positioning, and there the band
 * carries on the page's wash, which stays put in a browser. `onPlaced` says
 * where it sits on the page, for a switch made while it is pinned. `value`
 * is null until the remembered tab has been read, so no tab shows chosen and
 * then jumps.
 */
export function ProfileTabs({ value, onChange, offsetY, onPlaced, pill, onStride }: {
  value: ProfileTab | null;
  onChange: (next: ProfileTab) => void;
  offsetY: SharedValue<number>;
  /** Where the bar sits in the page, and its height. */
  onPlaced?: (y: number, height: number) => void;
  /**
   * The raised pill's place (useTabUnderline's base and progress), for a page whose
   * sections slide (Oct 22): the pill then rides with a swipe and glides on a
   * tap instead of jumping to the tab. Without it the chosen tab is raised in place.
   */
  pill?: { base: SharedValue<number>; progress: SharedValue<number> };
  /** One tab along (a tab's width and the gap after it), once laid out. */
  onStride?: (stride: number) => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const dark = pageIsDark();
  const [tabW, setTabW] = useState(0);
  const sliding = !!pill && tabW > 0 && value !== null;
  // On a phone the pill is built afresh each time it lands on a tab, so its first frame is that tab
  // and a settled place Reanimated drops unsynced can never put it back under Activity (Oct 23).
  const [pillKey, pillLanded] = useRestKey();
  // Only the two shared values go to the worklet: the caller's `pill` object is new each render (and
  // may carry an animated-style handle), which would restart the reaction and be sent across every time.
  const pBase = pill?.base;
  const pProgress = pill?.progress;
  useAnimatedReaction(() => {
    if (!pBase || !pProgress) return -1;
    const at = pBase.value + pProgress.value;
    return pProgress.value === 0 && Math.abs(at - Math.round(at)) < 0.001 ? Math.round(at) : -1;
  }, (n, was) => { if (n >= 0 && was !== null && n !== was) runOnJS(pillLanded)(); });
  // Where the bar sits in the page; far below until it has been laid out, so it never starts pinned.
  const top = useSharedValue(1e9);
  const pin = useAnimatedStyle(() => (WEB ? {} : { transform: [{ translateY: Math.max(0, offsetY.value - (top.value - PIN_GAP)) }] }));
  // On a phone the band shows the moment the bar pins, on the same frame as the scroll.
  const bandShown = useAnimatedStyle(() => (WEB ? {} : { opacity: offsetY.value >= top.value - PIN_GAP ? 1 : 0 }));

  // In a browser: whether the bar is pinned, and where the page's wash falls behind its band then.
  const frame = useContext(PageWashContext);
  const track = useRef<View>(null);
  const [webPinned, setWebPinned] = useState<{ top: number; left: number; width: number } | null | false>(false);
  const onWebPin = useCallback((on: boolean) => {
    if (!on) { setWebPinned(false); return; }
    // Pinned, the band's top is the top of the scrolling part, which sits `y` below the wash's top;
    // across, the wash spans the scrolling part from its left edge.
    const f = frame?.current;
    const box = f ? rect(f.node) : null;
    const bar = rect(track.current);
    setWebPinned(f && box && bar ? { top: -f.y, left: box.left - (bar.left - BAND_SIDE), width: box.width } : null);
  }, [frame]);
  useAnimatedReaction(
    () => WEB && offsetY.value >= top.value - PIN_GAP,
    (on, was) => { if (WEB && on !== was && (on || was !== null)) runOnJS(onWebPin)(on); },
  );

  return (
    <Reanimated.View
      onLayout={(e) => { const { y, height } = e.nativeEvent.layout; top.value = y; onPlaced?.(y, height); }}
      style={[styles.spot, webSticky, pin]}
    >
      {WEB ? (
        webPinned !== false ? (
          <View pointerEvents="none" style={styles.band}>
            {webPinned ? <Wash height={PAGE_WASH.height} strength={PAGE_WASH.strength} style={{ top: webPinned.top, left: webPinned.left, width: webPinned.width, right: undefined }} /> : null}
          </View>
        ) : null
      ) : <Reanimated.View pointerEvents="none" style={[styles.band, bandShown]} />}
      <View
        ref={track}
        style={[styles.track, dark && styles.trackDark]}
        accessibilityRole="tablist"
        onLayout={(e) => {
          // Inside the bar's 4-point padding, its tabs with 4 points between each.
          const n = PROFILE_TABS.length;
          const w = (e.nativeEvent.layout.width - TRACK_PAD * 2 - StyleSheet.hairlineWidth * 2 - TAB_GAP * (n - 1)) / n;
          if (w > 0) { setTabW(w); onStride?.(w + TAB_GAP); }
        }}
      >
        {sliding ? (
          <SlidingPill key={`${tabW}:${pillKey}`} base={pBase!} progress={pProgress!} stride={tabW + TAB_GAP} style={[styles.pill, { width: tabW }, dark ? [styles.tabOnDark, { borderColor: withAlpha(colors.borderStrong, 0.55) }] : styles.tabOn]} />
        ) : null}
        {PROFILE_TABS.map((t) => {
          const on = t.value === value;
          return (
            <Pressable
              key={t.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              aria-selected={on}
              accessibilityLabel={t.label}
              onPress={() => onChange(t.value)}
              style={({ pressed }) => [styles.tab, on && !sliding && (dark ? [styles.tabOnDark, { borderColor: withAlpha(colors.borderStrong, 0.55) }] : styles.tabOn), pressed && !on && styles.pressed]}
            >
              <Text {...oneLine(TextScale.TITLE)} style={[styles.label, on && styles.labelOn]} numberOfLines={1}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </Reanimated.View>
  );
}

/**
 * The raised pill under the tabs' words. Its own component, rebuilt (a new key) for a new tab width
 * and at each landing, so its first frame always reads the width and the tab it is at now.
 */
function SlidingPill({ base, progress, stride, style }: { base: SharedValue<number>; progress: SharedValue<number>; stride: number; style: StyleProp<ViewStyle> }) {
  const end = PROFILE_TABS.length - 1;
  const at = useAnimatedStyle(() => ({ transform: [{ translateX: Math.max(0, Math.min(end, base.value + progress.value)) * stride }] }));
  return <Reanimated.View pointerEvents="none" style={[style, at]} />;
}

const styleDefinitions = StyleSheet.create({
  // Above the sections it passes over while pinned.
  spot: { marginTop: spacing.lg, zIndex: 2 },
  // Behind the bar, only while it is pinned: the page's colour from the top of the page to a little under the bar, gutter to gutter.
  band: { position: 'absolute', top: -PIN_GAP, bottom: -BAND_BELOW, left: -BAND_SIDE, right: -BAND_SIDE, overflow: 'hidden', backgroundColor: colors.bg },
  track: { flexDirection: 'row', gap: TAB_GAP, padding: TRACK_PAD, borderRadius: trackCorner(TRACK_PAD), backgroundColor: colors.surfaceAlt, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  // On a dark page the bar sinks a shade below the boxes, so the chosen tab can sit a shade above them.
  trackDark: { backgroundColor: colors.bgElevated },
  tab: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radius.chip, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
  tabOn: { ...lift, backgroundColor: colors.surface },
  // The raised pill on its own, under the words, so it can slide between tabs.
  pill: { position: 'absolute', top: TRACK_PAD, bottom: TRACK_PAD, left: TRACK_PAD, borderRadius: radius.chip, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
  // Raised on a dark page by being lighter, with a faint lit edge (set where it is drawn); a shadow cannot show there.
  tabOnDark: { backgroundColor: colors.surfaceAlt },
  pressed: { opacity: PRESS_DIM },
  label: { ...typography.body, ...font('500'), color: colors.textMuted },
  labelOn: { ...font('600'), color: colors.text },
});

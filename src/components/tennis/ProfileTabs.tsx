import React, { useCallback, useContext, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Reanimated, { type SharedValue, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { Wash } from '@/components/Wash';
import { PAGE_WASH, PageWashContext } from '@/components/ui/pageWash';
import { PROFILE_TABS, type ProfileTab } from '@/features/players/profileTab';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, pageIsDark, radius, spacing, typography, withAlpha } from '@/theme';

/**
 * How far under the top of the scrolling page the tabs ride once pinned: a
 * little room under the title, filled (with the room under them) by a band
 * in the page's own colour, so nothing passing underneath shows around them.
 */
export const PIN_GAP = spacing.sm;
/** The band's reach past the bar: out over the page's 16-point gutter, and a little below it. */
const BAND_SIDE = spacing.lg;
const BAND_BELOW = spacing.sm;

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
export function ProfileTabs({ value, onChange, offsetY, onPlaced }: {
  value: ProfileTab | null;
  onChange: (next: ProfileTab) => void;
  offsetY: SharedValue<number>;
  onPlaced?: (y: number) => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const dark = pageIsDark();
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
      onLayout={(e) => { const y = e.nativeEvent.layout.y; top.value = y; onPlaced?.(y); }}
      style={[styles.spot, webSticky, pin]}
    >
      {WEB ? (
        webPinned !== false ? (
          <View pointerEvents="none" style={styles.band}>
            {webPinned ? <Wash height={PAGE_WASH.height} strength={PAGE_WASH.strength} style={{ top: webPinned.top, left: webPinned.left, width: webPinned.width, right: undefined }} /> : null}
          </View>
        ) : null
      ) : <Reanimated.View pointerEvents="none" style={[styles.band, bandShown]} />}
      <View ref={track} style={[styles.track, dark && styles.trackDark]} accessibilityRole="tablist">
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
              style={({ pressed }) => [styles.tab, on && (dark ? [styles.tabOnDark, { borderColor: withAlpha(colors.borderStrong, 0.55) }] : styles.tabOn), pressed && !on && styles.pressed]}
            >
              <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </Reanimated.View>
  );
}

const styleDefinitions = StyleSheet.create({
  // Above the sections it passes over while pinned.
  spot: { marginTop: spacing.lg, zIndex: 2 },
  // Behind the bar, only while it is pinned: the page's colour from the top of the page to a little under the bar, gutter to gutter.
  band: { position: 'absolute', top: -PIN_GAP, bottom: -BAND_BELOW, left: -BAND_SIDE, right: -BAND_SIDE, overflow: 'hidden', backgroundColor: colors.bg },
  track: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  // On a dark page the bar sinks a shade below the boxes, so the chosen tab can sit a shade above them.
  trackDark: { backgroundColor: colors.bgElevated },
  tab: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
  tabOn: { ...lift, backgroundColor: colors.surface },
  // Raised on a dark page by being lighter, with a faint lit edge (set where it is drawn); a shadow cannot show there.
  tabOnDark: { backgroundColor: colors.surfaceAlt },
  pressed: { opacity: 0.6 },
  label: { ...typography.body, ...font('500'), color: colors.textMuted },
  labelOn: { ...font('600'), color: colors.text },
});

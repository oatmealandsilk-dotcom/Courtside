import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Reanimated, { type SharedValue, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { PROFILE_TABS, type ProfileTab } from '@/features/players/profileTab';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

/**
 * How far under the top of the scrolling page the tabs ride once pinned:
 * flush with it, just under the title, so no sliver of a box shows above
 * them as the page passes underneath.
 */
export const PIN_GAP = 0;

/** In a browser the page's own sticky positioning pins them, exactly in step with the scroll. */
const WEB = Platform.OS === 'web';
const webSticky = WEB ? ({ position: 'sticky', top: PIN_GAP } as unknown as ViewStyle) : null;

/**
 * Activity · Health · Game (Oct 5, option A): a quiet cream bar under the
 * Log a session and Edit buttons, the chosen tab raised in white, so the
 * green button stays the only loud thing on the page. Scrolled past, it
 * stays pinned at the top of the page; on a phone it is carried down by the
 * scroll (`offsetY`, the page's own scroll, from Screen), in a browser by
 * sticky positioning. `onPlaced` says where it sits on the page, for a
 * switch made while it is pinned. `value` is null until the remembered tab
 * has been read, so no tab shows chosen and then jumps.
 */
export function ProfileTabs({ value, onChange, offsetY, onPlaced }: {
  value: ProfileTab | null;
  onChange: (next: ProfileTab) => void;
  offsetY: SharedValue<number>;
  onPlaced?: (y: number) => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  // Where the bar sits in the page; far below until it has been laid out, so it never starts pinned.
  const top = useSharedValue(1e9);
  const pin = useAnimatedStyle(() => (WEB ? {} : { transform: [{ translateY: Math.max(0, offsetY.value - (top.value - PIN_GAP)) }] }));
  return (
    <Reanimated.View
      onLayout={(e) => { const y = e.nativeEvent.layout.y; top.value = y; onPlaced?.(y); }}
      style={[styles.spot, webSticky, pin]}
    >
      <View style={styles.track} accessibilityRole="tablist">
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
              style={({ pressed }) => [styles.tab, on && styles.tabOn, pressed && !on && styles.pressed]}
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
  track: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  tab: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radius.pill },
  tabOn: { ...lift, backgroundColor: colors.surface },
  pressed: { opacity: 0.6 },
  label: { ...typography.body, ...font('500'), color: colors.textMuted },
  labelOn: { ...font('600'), color: colors.text },
});

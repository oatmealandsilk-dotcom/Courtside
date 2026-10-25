import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar } from '@/components/ui/Avatar';
import { BAR_DOCKED, TAB_BAR_LOOK } from '@/features/navigation/tabBarLook';
import { useFeedOnPicture } from '@/features/navigation/barOverMedia';
import { TAB_BAR_H } from '@/features/navigation/barInset';
import { activeFade, FadeCopy, FadeSpot } from '@/theme/ThemeFade';
import { darkColors, themes, useTheme, type ThemeName } from '@/theme/ThemeProvider';
import { TextScale, colors, font, inkOn, withAlpha } from '@/theme';
import type { User } from '@/data/types';

type Palette = (typeof themes)[ThemeName];
/** A style an animated view takes: plain, or moved on the animation thread. */
type AnimStyle = React.ComponentProps<typeof Animated.View>['style'];

export interface LookItem {
  route: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
}

/**
 * The phone's tab bar in one of the looks offered in place of today's glass
 * pill (src/features/navigation/tabBarLook.ts: A, B or C). NavBar keeps
 * everything it does (the rise on a fresh open, the tuck as you scroll, the
 * Create box's dim, the tutorial's targets); this only draws the bar.
 */
export function LookBar({
  items, activeRoute, profileAlerts, me, onTab, onCreate, tourRef, tourCreate,
  bottom, outerStyle, tuckStyle, hideFromReader, veilStyle, veilBlocks, onVeil,
}: {
  items: LookItem[];
  activeRoute: string | undefined;
  profileAlerts: number;
  me: User | null | undefined;
  onTab: (route: string) => void;
  onCreate: () => void;
  tourRef: (route: string) => ((node: View | null) => void) | undefined;
  tourCreate: (node: View | null) => void;
  /** The phone's own bottom strip (home indicator), or a little air where there is none. */
  bottom: number;
  /** The rise on a fresh open (NavBar's `held` and `duck`). */
  outerStyle: AnimStyle;
  /** The tuck toward the edge while scrolling down (a floating bar only). */
  tuckStyle: AnimStyle;
  hideFromReader: 'auto' | 'no-hide-descendants';
  veilStyle: AnimStyle;
  veilBlocks: boolean;
  onVeil: () => void;
}) {
  const { theme } = useTheme();
  // Over a clip on the Feed the bar turns dark, as today's glass does over a picture.
  const onPicture = useFeedOnPicture();
  const media = activeRoute === 'index' && onPicture;
  const face = (palette: Palette, live: boolean) => (
    <Face palette={palette} media={media} live={live} items={items} activeRoute={activeRoute} profileAlerts={profileAlerts} me={me}
      onTab={onTab} onCreate={onCreate} tourRef={tourRef} tourCreate={tourCreate} bottom={bottom} veilStyle={veilStyle} veilBlocks={veilBlocks} onVeil={onVeil} />
  );
  // A theme picked on the Theme page: the bar in the court being left, laid over the live one and
  // fading with the page (ThemeFade). Nothing here is glass, so nothing under a fade can go see-through.
  const copies = (
    <FadeSpot store={activeFade} render={(layers) => layers.map((layer) => (
      <FadeCopy key={layer.key} op={layer.op} style={StyleSheet.absoluteFill} testID="theme-fade-bar">{face(themes[layer.theme], false)}</FadeCopy>
    ))} />
  );
  if (BAR_DOCKED) {
    return (
      <Animated.View pointerEvents="box-none" importantForAccessibility={hideFromReader} style={[styles.dock, outerStyle]}>
        <View>
          {face(themes[theme], true)}
          {copies}
        </View>
      </Animated.View>
    );
  }
  return (
    <Animated.View pointerEvents="box-none" importantForAccessibility={hideFromReader} style={[styles.float, { bottom }, outerStyle]}>
      <Animated.View style={[styles.pillWrap, tuckStyle]}>
        <View style={styles.pillShadow}>
          {face(themes[theme], true)}
          {copies}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

/** The bar's ground and its row, in one court's colours: the live bar, or a fading copy of it. */
function Face({ palette: c, media, live, items, activeRoute, profileAlerts, me, onTab, onCreate, tourRef, tourCreate, bottom, veilStyle, veilBlocks, onVeil }: {
  palette: Palette; media: boolean; live: boolean;
  items: LookItem[]; activeRoute: string | undefined; profileAlerts: number; me: User | null | undefined;
  onTab: (route: string) => void; onCreate: () => void;
  tourRef: (route: string) => ((node: View | null) => void) | undefined; tourCreate: (node: View | null) => void;
  bottom: number; veilStyle: AnimStyle; veilBlocks: boolean; onVeil: () => void;
}) {
  // Over a picture: a dark ground (the page's own where it is dark already, as on New York) and white marks.
  const darkPage = inkOn(c.bg) === '#FFFFFF';
  const ground = media ? (darkPage ? c.bg : darkColors.bg) : TAB_BAR_LOOK === 'B' ? c.surface : c.bg;
  const line = media ? withAlpha(c.onMedia, 0.14) : c.border;
  const ink = media ? c.onMedia : c.text;
  const muted = media ? withAlpha(c.onMedia, 0.66) : c.textMuted;
  // The lit tab: ink in A and C; the brand's colour in B (white over a picture).
  const lit = TAB_BAR_LOOK === 'B' && !media ? c.brand : ink;
  // C draws every icon in ink, filled when lit, as Instagram does.
  const idle = TAB_BAR_LOOK === 'C' ? ink : muted;
  const brandMark = media ? c.brandBright : c.brand;

  const badge = profileAlerts > 0 ? (
    <View style={[styles.badge, TAB_BAR_LOOK === 'C' && styles.badgeOnAvatar, { backgroundColor: c.danger }]}>
      <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.badgeText, { color: c.onDanger }]}>{profileAlerts > 9 ? '9+' : profileAlerts}</Text>
    </View>
  ) : null;

  const plus = (
    <View style={[styles.slot, styles.plusAbove]} key="create">
      <Pressable ref={live ? tourCreate : undefined} disabled={!live} accessible={live} accessibilityRole="button" accessibilityLabel="Create a post" onPress={onCreate} hitSlop={8} style={styles.hit}>
        <View style={styles.iconBox}>
          {TAB_BAR_LOOK === 'A' ? (
            <View style={[styles.plusOutline, { borderColor: brandMark }]}><Ionicons name="add" size={19} color={brandMark} /></View>
          ) : TAB_BAR_LOOK === 'B' ? (
            <View style={[styles.plusSquare, { backgroundColor: c.brand }]}><Ionicons name="add" size={22} color={c.brandInk} /></View>
          ) : (
            <View style={[styles.plusInk, { borderColor: ink }]}><Ionicons name="add" size={19} color={ink} /></View>
          )}
        </View>
        {TAB_BAR_LOOK === 'A' ? <View style={styles.labelSpace} /> : null}
      </Pressable>
    </View>
  );

  const row: React.ReactNode[] = [];
  items.forEach((item, index) => {
    if (index === 2) row.push(plus);
    const active = item.route === activeRoute;
    const tint = active ? lit : idle;
    const avatar = TAB_BAR_LOOK === 'C' && item.route === 'profile' && me;
    row.push(
      <View style={styles.slot} key={item.route}>
        <Pressable
          ref={live ? tourRef(item.route) : undefined}
          disabled={!live}
          accessible={live}
          onPress={() => onTab(item.route)}
          accessibilityRole="tab"
          accessibilityState={{ selected: active }}
          accessibilityLabel={item.label}
          style={styles.hit}
        >
          <View style={styles.iconBox}>
            {avatar ? (
              // Your own picture, ringed in ink when Profile is the tab on show (Instagram's way).
              <View style={[styles.avatarRing, { borderColor: active ? ink : 'transparent' }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <Avatar name={me.name} seed={me.avatarSeed} uri={me.avatarUrl} size={24} />
              </View>
            ) : (
              <Ionicons name={active ? item.activeIcon : item.icon} size={TAB_BAR_LOOK === 'C' ? 25 : 24} color={tint} />
            )}
            {item.route === 'profile' ? badge : null}
          </View>
          {TAB_BAR_LOOK === 'A' ? (
            <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CHROME} style={[styles.label, { color: tint }, active && styles.labelLit]}>{item.label}</Text>
          ) : null}
        </Pressable>
      </View>,
    );
  });

  const veil = live ? (
    <Animated.View pointerEvents={veilBlocks ? 'auto' : 'none'} style={[styles.veil, !BAR_DOCKED && styles.veilRound, { backgroundColor: colors.overlay }, veilStyle]}>
      <Pressable accessible={false} importantForAccessibility="no" onPress={onVeil} style={StyleSheet.absoluteFill} />
    </Animated.View>
  ) : null;

  if (BAR_DOCKED) {
    return (
      <View style={[styles.dockBar, { backgroundColor: ground, borderTopColor: line, paddingBottom: bottom }]}>
        <View style={styles.row}>{row}</View>
        {veil}
      </View>
    );
  }
  return (
    <View style={[styles.pill, { backgroundColor: ground, borderColor: line }]}>
      {row}
      {veil}
    </View>
  );
}

const PILL_RADIUS = 18;

const styles = StyleSheet.create({
  // A and C: along the bottom edge, the whole width.
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 30 },
  dockBar: { borderTopWidth: StyleSheet.hairlineWidth },
  row: { height: TAB_BAR_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  // B: floating, slimmer and squarer than today's pill.
  float: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 30 },
  pillWrap: { width: '100%', paddingHorizontal: 16 },
  pillShadow: { borderRadius: PILL_RADIUS, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  pill: { height: TAB_BAR_H, borderRadius: PILL_RADIUS, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, borderWidth: StyleSheet.hairlineWidth },
  slot: { flex: 1, alignSelf: 'stretch' },
  hit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // The + stands above the Create box's dim (zIndex 2 over the veil's 1).
  plusAbove: { zIndex: 2 },
  iconBox: { height: 28, minWidth: 28, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, lineHeight: 12, marginTop: 1, ...font('500'), letterSpacing: 0.1 },
  labelLit: { ...font('600') },
  // The + in A has no word under it; this keeps its square level with the icons.
  labelSpace: { height: 13 },
  plusOutline: { width: 26, height: 26, borderRadius: 8, borderWidth: 1.75, alignItems: 'center', justifyContent: 'center' },
  plusSquare: { width: 38, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  plusInk: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  avatarRing: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: -3, left: 16,
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeOnAvatar: { top: -6, left: 21 },
  badgeText: { fontSize: 11, lineHeight: 13, ...font('700'), fontVariant: ['tabular-nums'], includeFontPadding: false, textAlign: 'center' },
  veil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 },
  veilRound: { borderRadius: PILL_RADIUS },
});

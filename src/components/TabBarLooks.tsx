import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, makeMutable, runOnJS, withTiming, type SharedValue } from 'react-native-reanimated';
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

/** The bar going dark over a clip, or light again: the Feed's top row's own 180 ms, so the two change together. */
const MEDIA_FADE_MS = 180;
let mediaSeq = 0;
/** The bar as it was before a clip came or went (`media`), laid over the live bar and fading out. */
interface MediaLayer { key: number; media: boolean; op: SharedValue<number> }

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
  // A clip coming or going (or the Feed being left) changes the bar's ground: the look being left is
  // laid over the new one in the same redraw and fades out, then is taken away, so the bar never
  // snaps from light to dark under a top row that eases, and nothing rests on an animated value.
  const [shownMedia, setShownMedia] = useState(media);
  const [mediaLayers, setMediaLayers] = useState<readonly MediaLayer[]>([]);
  if (shownMedia !== media) {
    const layer: MediaLayer = { key: ++mediaSeq, media: shownMedia, op: makeMutable(1) };
    setShownMedia(media);
    setMediaLayers((layers) => [layer, ...layers].slice(0, 3));
  }
  const begun = useRef(new Set<number>());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const drop = (key: number) => {
      const timer = timers.current.get(key);
      if (timer) clearTimeout(timer);
      timers.current.delete(key);
      begun.current.delete(key);
      setMediaLayers((layers) => layers.filter((l) => l.key !== key));
    };
    for (const layer of mediaLayers) {
      if (begun.current.has(layer.key)) continue;
      begun.current.add(layer.key);
      const { key } = layer;
      layer.op.value = withTiming(0, { duration: MEDIA_FADE_MS, easing: Easing.out(Easing.quad) }, (finished) => {
        'worklet';
        if (finished) runOnJS(drop)(key);
      });
      // Whatever the animation reports, the copy goes.
      timers.current.set(key, setTimeout(() => drop(key), MEDIA_FADE_MS + 300));
    }
  }, [mediaLayers]);
  useEffect(() => () => { timers.current.forEach((t) => clearTimeout(t)); timers.current.clear(); }, []);
  const face = (palette: Palette, live: boolean, overMedia: boolean = media) => (
    <Face palette={palette} media={overMedia} live={live} items={items} activeRoute={activeRoute} profileAlerts={profileAlerts} me={me}
      onTab={onTab} onCreate={onCreate} tourRef={tourRef} tourCreate={tourCreate} bottom={bottom} veilStyle={veilStyle} veilBlocks={veilBlocks} onVeil={onVeil} />
  );
  // A theme picked on the Theme page: the bar in the court being left, laid over the live one and
  // fading with the page (ThemeFade). Nothing here is glass, so nothing under a fade can go see-through.
  const copies = (
    <>
    {mediaLayers.map((layer) => (
      <FadeCopy key={layer.key} op={layer.op} style={StyleSheet.absoluteFill} testID="media-fade-bar">{face(themes[theme], false, layer.media)}</FadeCopy>
    ))}
    <FadeSpot store={activeFade} render={(layers) => layers.map((layer) => (
      <FadeCopy key={layer.key} op={layer.op} style={StyleSheet.absoluteFill} testID="theme-fade-bar">{face(themes[layer.theme], false)}</FadeCopy>
    ))} />
    </>
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
  // A's +: the court's own colour. Over a clip on a light court (its ground gone near-black) it is lifted
  // toward white so it still reads, in that court's own hue: never another court's green (New York's
  // + stays yellow, Paris's terracotta, Melbourne's blue).
  const brandMark = media && !darkPage ? toward(c.brand, c.onMedia, 0.35) : c.brand;

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

/** `hex` moved part of the way (`t`, 0 to 1) toward `to`; both `#RRGGBB`, anything else comes back as it was. */
function toward(hex: string, to: string, t: number): string {
  const a = hex.replace('#', '');
  const b = to.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(a) || !/^[0-9a-f]{6}$/i.test(b)) return hex;
  const mixed = [0, 2, 4].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t));
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
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

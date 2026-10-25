import React, { useEffect, useRef, useState } from 'react';
import { PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, interpolate, makeMutable, runOnJS, useAnimatedStyle, withTiming, type SharedValue } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BrandWash } from '@/components/ui/BrandWash';
import { Glass } from '@/components/ui/Glass';
import { useFeedOnPicture } from '@/features/navigation/barOverMedia';
import { TAB_BAR_H } from '@/features/navigation/barInset';
import { barCompact } from '@/features/navigation/barShrink';
import { getStage } from '@/features/feed/commentStage';
import { activeFade, FadeCopy, FadeSpot } from '@/theme/ThemeFade';
import { brandShadow } from '@/theme/fillMode';
import { darkColors, themes, useTheme, type ThemeName } from '@/theme/ThemeProvider';
import { TextScale, colors, font, inkOn, typography, withAlpha } from '@/theme';

type Palette = (typeof themes)[ThemeName];
/** A style an animated view takes: plain, or moved on the animation thread. */
type AnimStyle = React.ComponentProps<typeof Animated.View>['style'];

/** The screen's pixels per point, read once: the bar's moves are rounded to whole pixels. */
const PX = PixelRatio.get();

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
 * The phone's tab bar as a quiet pill (src/features/navigation/tabBarLook.ts):
 * today's bar in a new shape, on the old bar's Liquid Glass (Oct 25, owner:
 * "Te bottom bar should be Liquid Glass like Strava and instagram"). NavBar
 * keeps everything it does (the rise on a fresh open, the tuck as you scroll,
 * the Create box's dim, the tutorial's targets); this only draws the bar.
 *
 * The glass bar's rules, kept here: nothing that holds the glass ever fades
 * (the rise and the tuck only move it; the fading copies are solid and laid
 * over it, never around it); its hairline edge is a plain layer, not a border
 * on the glass; its shadow sits on the rounded layer around it, as on the old
 * glass bar for weeks.
 */
export function LookBar({
  items, activeRoute, feedUnder, profileAlerts, onTab, onCreate, tourRef, tourCreate,
  bottom, outerStyle, tuckStyle, hideFromReader, veilStyle, veilBlocks, onVeil,
}: {
  items: LookItem[];
  activeRoute: string | undefined;
  /** Whether the page under the bar is the Feed itself, not a page opened over it (AppShell). */
  feedUnder: boolean;
  profileAlerts: number;
  onTab: (route: string) => void;
  onCreate: () => void;
  tourRef: (route: string) => ((node: View | null) => void) | undefined;
  tourCreate: (node: View | null) => void;
  /** The phone's own bottom strip (home indicator), or a little air where there is none. */
  bottom: number;
  /** The rise on a fresh open (NavBar's `held` and `duck`). */
  outerStyle: AnimStyle;
  /** The tuck toward the edge while scrolling down. */
  tuckStyle: AnimStyle;
  hideFromReader: 'auto' | 'no-hide-descendants';
  veilStyle: AnimStyle;
  veilBlocks: boolean;
  onVeil: () => void;
}) {
  const { theme } = useTheme();
  // Over a clip on the Feed the bar turns dark, as today's glass does over a picture: on the Feed
  // itself, never on a light page opened from the clip (a player, a court), where the Feed tab is still the lit one.
  const onPicture = useFeedOnPicture();
  const media = activeRoute === 'index' && feedUnder && onPicture;
  // A clip coming or going (or the Feed being left) changes the bar's ground: the look being left is
  // laid over the new one in the same redraw and fades out, then is taken away, so the bar never
  // snaps from light to dark under a top row that eases, and nothing rests on an animated value.
  const [shownMedia, setShownMedia] = useState(media);
  const [mediaLayers, setMediaLayers] = useState<readonly MediaLayer[]>([]);
  // The glass's own dark or light: `media`, except for two frames after a clip's comments were up.
  const [glassHeld, setGlassHeld] = useState<boolean | null>(null);
  if (shownMedia !== media) {
    const layer: MediaLayer = { key: ++mediaSeq, media: shownMedia, op: makeMutable(1) };
    setShownMedia(media);
    setMediaLayers((layers) => [layer, ...layers].slice(0, 3));
    // With a clip's comments up (commentStage) the bar sits under their fade (AppShell's navFade, down
    // to nothing), and a page opened over them (a profile, a court) flips `media` in the same redraw that
    // lets the fade go, which reaches the screen only a frame later. Glass re-tinted under a parent at
    // nothing can stay see-through (Oct 17), so there it keeps its look until the bar is whole again,
    // under the solid copy fading over it. Anywhere else it re-tints at once, as before.
    if (glassHeld === null && getStage()?.mode === 'stage') setGlassHeld(shownMedia);
  }
  useEffect(() => {
    if (glassHeld === null) return undefined;
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setGlassHeld(null)); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [glassHeld]);
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
    <Face palette={palette} media={overMedia} glassMedia={live ? (glassHeld ?? overMedia) : overMedia} live={live} items={items} activeRoute={activeRoute} profileAlerts={profileAlerts}
      onTab={onTab} onCreate={onCreate} tourRef={tourRef} tourCreate={tourCreate} veilStyle={veilStyle} veilBlocks={veilBlocks} onVeil={onVeil} />
  );
  return (
    <Animated.View pointerEvents="box-none" importantForAccessibility={hideFromReader} style={[styles.float, { bottom }, outerStyle]}>
      <Animated.View style={[styles.pillWrap, tuckStyle]}>
        <View style={styles.pillShadow}>
          {face(themes[theme], true)}
          {/* The bar as it was before a clip came or went, solid, fading out over the live glass (already re-tinted). */}
          {mediaLayers.map((layer) => (
            <FadeCopy key={layer.key} op={layer.op} style={StyleSheet.absoluteFill} testID="media-fade-bar">{face(themes[theme], false, layer.media)}</FadeCopy>
          ))}
          {/* A theme picked on the Theme page: the bar in the court being left, laid over the live one (beside
              the glass, never holding it) and fading with the page (ThemeFade). The glass re-tints at the tap, under it. */}
          <FadeSpot store={activeFade} render={(layers) => layers.map((layer) => (
            <FadeCopy key={layer.key} op={layer.op} style={StyleSheet.absoluteFill} testID="theme-fade-bar">{face(themes[layer.theme], false)}</FadeCopy>
          ))} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

/** The bar's ground and its row, in one court's colours: the live bar, or a fading copy of it. */
function Face({ palette: c, media, glassMedia, live, items, activeRoute, profileAlerts, onTab, onCreate, tourRef, tourCreate, veilStyle, veilBlocks, onVeil }: {
  /** `glassMedia`: the live glass's own dark or light, which may trail `media` by two frames (LookBar). */
  palette: Palette; media: boolean; glassMedia: boolean; live: boolean;
  items: LookItem[]; activeRoute: string | undefined; profileAlerts: number;
  onTab: (route: string) => void; onCreate: () => void;
  tourRef: (route: string) => ((node: View | null) => void) | undefined; tourCreate: (node: View | null) => void;
  veilStyle: AnimStyle; veilBlocks: boolean; onVeil: () => void;
}) {
  // Ducking lets the words go and settles the icons into the middle, as today's bar does
  // (NavBar: half a word's line and its gap, landed on the screen's real pixels).
  const settle = useAnimatedStyle(() => ({ transform: [{ translateY: Math.round(interpolate(barCompact.value, [0, 1], [0, 7]) * PX) / PX }] }));
  const labelFade = useAnimatedStyle(() => ({ opacity: interpolate(barCompact.value, [0, 0.6], [1, 0], 'clamp') }));
  // The ground: the old glass bar's Liquid Glass, tinted with the page's own colour (NavBar's 'now'),
  // and on a fading copy that colour solid. Over a picture: dark glass (the page's own colour where it
  // is dark already, as on New York) and white marks, the glass told so too, so the two always agree.
  const darkPage = inkOn(c.bg) === '#FFFFFF';
  const groundOf = (overMedia: boolean) => (overMedia ? (darkPage ? c.bg : darkColors.bg) : c.bg);
  const ground = groundOf(media);
  const line = media ? withAlpha(c.onMedia, 0.14) : c.border;
  const idleIcon = media ? withAlpha(c.onMedia, 0.66) : c.textMuted;
  const idleLabel = media ? withAlpha(c.onMedia, 0.6) : c.textFaint;
  // The lit tab in today's colours: Community amber, Coaching blue, the rest the court's own colour.
  // Over a clip on a light court (its ground gone near-black) that colour is lifted a little toward
  // white so it still reads, in the same hue.
  const litOf = (route: string) => {
    const base = route === 'coaches' ? c.info : route === 'discuss' ? c.warning : c.brand;
    return media && !darkPage ? toward(base, c.onMedia, 0.35) : base;
  };

  const plus = (
    <View style={[styles.slot, styles.plusAbove]} key="create">
      <Pressable disabled={!live} accessible={live} accessibilityRole="button" accessibilityLabel="Create a post" onPress={onCreate} style={styles.hit}>
        <View ref={live ? tourCreate : undefined} style={[styles.plus, { backgroundColor: c.brand }]}>
          <BrandWash radius={PLUS_RADIUS} />
          <Ionicons name="add" size={24} color={c.brandInk} />
        </View>
      </Pressable>
    </View>
  );

  const row: React.ReactNode[] = [];
  items.forEach((item, index) => {
    if (index === 2) row.push(plus);
    const active = item.route === activeRoute;
    row.push(
      <View style={styles.slot} key={item.route}>
        <Pressable
          disabled={!live}
          accessible={live}
          onPress={() => onTab(item.route)}
          accessibilityRole="tab"
          accessibilityState={{ selected: active }}
          accessibilityLabel={item.label}
          style={styles.hit}
        >
          {/* What the tutorial lights: the tab's width, the icon and its word's height, as today. */}
          <View ref={live ? tourRef(item.route) : undefined} style={styles.target}>
            <Animated.View style={[styles.inner, settle]}>
              <View>
                <Ionicons name={active ? item.activeIcon : item.icon} size={23} color={active ? litOf(item.route) : idleIcon} />
                {item.route === 'profile' && profileAlerts > 0 ? (
                  <View style={[styles.badge, { backgroundColor: c.danger }]}>
                    <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.badgeText, { color: c.onDanger }]}>{profileAlerts > 9 ? '9+' : profileAlerts}</Text>
                  </View>
                ) : null}
              </View>
              <Animated.Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CHROME} style={[styles.label, { color: active ? litOf(item.route) : idleLabel }, labelFade]}>{item.label}</Animated.Text>
            </Animated.View>
          </View>
        </Pressable>
      </View>,
    );
  });

  const inside = (
    <>
      {row}
      {/* The hairline edge is a plain layer of its own, never a border on the glass, and under the
          Create box's dim, so it darkens with the rest (Oct 17, owner: "outer edge not brighter"). */}
      <View pointerEvents="none" style={[styles.rim, { borderColor: line }]} />
      {live ? (
        <Animated.View pointerEvents={veilBlocks ? 'auto' : 'none'} style={[styles.veil, { backgroundColor: colors.overlay }, veilStyle]}>
          <Pressable accessible={false} importantForAccessibility="no" onPress={onVeil} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : null}
    </>
  );
  // A fading copy is never glass: it is the one thing here whose opacity moves, and glass under a
  // fade can go see-through and stay that way (Oct 17). Solid, it reads as the glass it stands for.
  if (!live) return <View style={[styles.pill, { backgroundColor: ground }]}>{inside}</View>;
  // The live bar: real Liquid Glass on iOS 26, a frosted blur on older iPhones, the tint nearly solid
  // on Android and the web (Glass). It re-tints at once when a court is picked or a clip comes or goes,
  // under the solid copy fading over it; nothing that holds it ever fades.
  return (
    <Glass clear tint={groundOf(glassMedia)} dark={glassMedia ? true : undefined} radius={PILL_RADIUS} style={styles.pill}>
      {inside}
    </Glass>
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

/** Less round than today's pill (its ends were half its height). */
const PILL_RADIUS = 18;
/** The +'s shape in the quiet pill (Oct 25, owner: "Show me square vs circle"): 'square' a 42×32 rounded square, 'circle' a 38 round button. */
const PLUS_SHAPE = 'circle' as 'square' | 'circle';
const PLUS_RADIUS = PLUS_SHAPE === 'circle' ? 19 : 11;

const styles = StyleSheet.create({
  float: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 30 },
  // As far in from each side as today's pill (the tutorial's lit tab keeps inside it: TourOverlay's BAR_SIDE).
  pillWrap: { width: '100%', paddingHorizontal: 14 },
  // The shadow on a rounded layer of its own around the glass (no fill, never faded), as the old glass bar's.
  pillShadow: { borderRadius: PILL_RADIUS, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  pill: { height: TAB_BAR_H, borderRadius: PILL_RADIUS, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
  rim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: PILL_RADIUS, borderWidth: StyleSheet.hairlineWidth },
  slot: { flex: 1, alignSelf: 'stretch' },
  hit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  target: { alignSelf: 'stretch', alignItems: 'center' },
  inner: { alignItems: 'center', justifyContent: 'center', gap: 3 },
  // The + stands above the Create box's dim (zIndex 2 over the veil's 1).
  plusAbove: { zIndex: 2 },
  plus: { width: PLUS_SHAPE === 'circle' ? 38 : 42, height: PLUS_SHAPE === 'circle' ? 38 : 32, borderRadius: PLUS_RADIUS, alignItems: 'center', justifyContent: 'center', ...brandShadow },
  label: { ...typography.smallStrong, fontSize: 11, letterSpacing: 0.15 },
  // Sits off the icon's shoulder rather than on top of it, as today.
  badge: {
    position: 'absolute', top: -5, left: 14,
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 11, lineHeight: 13, ...font('700'), fontVariant: ['tabular-nums'], includeFontPadding: false, textAlign: 'center' },
  veil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1, borderRadius: PILL_RADIUS },
});

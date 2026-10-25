import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PixelRatio, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, interpolate, makeMutable, runOnJS, useAnimatedStyle, withTiming, type SharedValue } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BrandWash } from '@/components/ui/BrandWash';
import { CLEAR_GLASS_ALPHA, Glass } from '@/components/ui/Glass';
import { useFeedOnPicture, useRowOnFeed } from '@/features/navigation/barOverMedia';
import { usePressV2 } from '@/features/navigation/pressV2';
import { TAB_BAR_H } from '@/features/navigation/barInset';
import { barCompact } from '@/features/navigation/barShrink';
import { getStage } from '@/features/feed/commentStage';
import { BAR_RECEDE } from '@/features/compose/createMenu';
import { HOLD_MARK, HOLD_MS, NO_CALLOUT, SHOW_ALL_FEEDS, noteFeedPressIn, noteFeedPressOut } from '@/features/feed/feedWindows';
import { activeFade, FadeCopy, FadeSpot } from '@/theme/ThemeFade';
import { brandShadow } from '@/theme/fillMode';
import { darkColors, themes, useTheme, type ThemeName } from '@/theme/ThemeProvider';
import { TextScale, font, inkOn, typography, withAlpha } from '@/theme';

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
/** A tab lit at the touch whose page has not come (the finger slid off, or the page never answered) goes dark again after this. */
const LIT_GIVE_UP_MS = 1500;
/** After a finger lifts, how long a tab lit at the touch waits for the tap itself before it is taken back. */
const LIT_TAP_WAIT_MS = 150;
/**
 * A tab answers the touch at once. A browser otherwise holds a press back 50 ms (react-native-web's
 * own wait, meant for a finger that may yet scroll; the bar never scrolls), and adds that wait to a
 * hold, so the Feed's hold keeps it to stay as long as it was. React Native has no such wait.
 */
const PRESS_AT_ONCE = (Platform.OS === 'web' ? { delayPressIn: 0 } : {}) as object;
const HOLD_EXTRA_MS = Platform.OS === 'web' ? 50 : 0;

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
 * the Create box's veil, the tutorial's targets); this only draws the bar.
 *
 * The glass bar's rules, kept here: nothing that holds the glass ever fades
 * (the rise and the tuck only move it; the fading copies are solid and laid
 * over it, never around it); its hairline edge is a plain layer, not a border
 * on the glass; its shadow sits on the rounded layer around it, as on the old
 * glass bar for weeks.
 */
export const LookBar = React.memo(function LookBar({
  items, activeRoute, feedUnder, tabsUnder, profileAlerts, onTab, onTabPressIn, onCreate, tourRef, tourCreate,
  bottom, outerStyle, tuckStyle, hideFromReader, veilStyle, veilBlocks, onVeil, onFeedHold,
}: {
  items: LookItem[];
  activeRoute: string | undefined;
  /** Whether the page under the bar is the Feed itself, not a page opened over it (AppShell). */
  feedUnder: boolean;
  /** Whether it is one of the four tabs, not a page opened over them (AppShell). */
  tabsUnder: boolean;
  profileAlerts: number;
  onTab: (route: string) => void;
  /** A finger came down on a tab: the page it will open can get ready while it is down. */
  onTabPressIn?: (route: string) => void;
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
  /** A hold on the Feed tab while on the Feed: the Feed's windows (features/feed/feedWindows). Only given while they are on. */
  onFeedHold?: () => void;
}) {
  const { theme } = useTheme();
  // Over a clip on the Feed the bar turns dark, as today's glass does over a picture: on the Feed
  // itself, never on a light page opened from the clip (a player, a court), where the Feed tab is still the lit one.
  const onPicture = useFeedOnPicture();
  // Whether the Feed is the tab under the bar: on the phone, as the tab row slides (half way across,
  // TabsPager), not at the tap while the row still shows the tab being left, and with no page opened
  // over the tabs; in a browser, whose tabs change in one go, the tab on show.
  const rowOnFeed = useRowOnFeed();
  const feedShown = rowOnFeed ?? activeRoute === 'index';
  const media = feedShown && (rowOnFeed === null ? feedUnder : tabsUnder) && onPicture;
  // A clip coming or going (or a page opened over the Feed) changes the bar's ground: the look being
  // left is laid over the new one in the same redraw and fades out, then is taken away, so the bar
  // never snaps from light to dark under a top row that eases, and nothing rests on an animated value.
  // A change of tab does not: the page under the bar is changing whole then, and the glass simply
  // turns, once (Oct 25 audit: a solid white or black slab at the tap that washed through grey,
  // with the icons all but gone, on every tap to or from the Feed over a clip).
  const [shownMedia, setShownMedia] = useState(media);
  const [shownFeed, setShownFeed] = useState(feedShown);
  const [mediaLayers, setMediaLayers] = useState<readonly MediaLayer[]>([]);
  // The glass's own dark or light: `media`, except for two frames after a clip's comments were up.
  const [glassHeld, setGlassHeld] = useState<boolean | null>(null);
  if (shownMedia !== media || shownFeed !== feedShown) {
    setShownMedia(media);
    setShownFeed(feedShown);
    if (shownMedia !== media && shownFeed === feedShown) {
      const layer: MediaLayer = { key: ++mediaSeq, media: shownMedia, op: makeMutable(1) };
      setMediaLayers((layers) => [layer, ...layers].slice(0, 3));
    }
    // With a clip's comments up (commentStage) the bar sits under their fade (AppShell's navFade, down
    // to nothing), and a page opened over them (a profile, a court, or another tab) flips `media` in the
    // same redraw that lets the fade go, which reaches the screen only a frame later. Glass re-tinted under
    // a parent at nothing can stay see-through (Oct 17), so there it keeps its look until the bar is whole
    // again. Anywhere else it re-tints at once, as before.
    if (shownMedia !== media && glassHeld === null && getStage()?.mode === 'stage') setGlassHeld(shownMedia);
  }
  // The tab lit at the touch (Oct 25 audit: the new tab lit only once the router had redrawn about a
  // thousand parts, 60-170 ms after the finger lifted, with no answer to the touch before that). It
  // lights the moment the finger comes down, in a redraw of the bar alone, and the page follows; the
  // address catching up makes it the lit tab by right. A finger that slides off takes it back.
  const [pressed, setPressed] = useState<string | null>(null);
  const [seenRoute, setSeenRoute] = useState(activeRoute);
  if (seenRoute !== activeRoute) {
    setSeenRoute(activeRoute);
    if (pressed !== null) setPressed(null);
  }
  const lit = pressed ?? activeRoute;
  useEffect(() => {
    if (pressed === null) return undefined;
    const t = setTimeout(() => setPressed(null), LIT_GIVE_UP_MS);
    return () => clearTimeout(t);
  }, [pressed]);
  // Read by the handlers below, which are made once (the bar redraws only when what it shows changes).
  const now = useRef({ activeRoute, onTab, onTabPressIn });
  now.current = { activeRoute, onTab, onTabPressIn };
  const press = useRef({ route: null as string | null, tapped: false, painted: true, frame: 0, wait: undefined as ReturnType<typeof setTimeout> | undefined, seq: 0 });
  useEffect(() => () => { clearTimeout(press.current.wait); cancelAnimationFrame(press.current.frame); }, []);
  const tabPressIn = useCallback((route: string) => {
    const p = press.current;
    clearTimeout(p.wait);
    p.tapped = false;
    p.route = route;
    // The tab already on show: any other tab lit by a quicker tap whose page has not come yet goes dark.
    if (route === now.current.activeRoute) setPressed(null);
    else {
      setPressed(route);
      // In a browser the bar's redraw and the page's share one thread: the page waits for a frame
      // with the lit tab in it (below). A phone draws the bar's redraw on its own.
      p.painted = false;
      cancelAnimationFrame(p.frame);
      p.frame = requestAnimationFrame(() => { p.painted = true; });
    }
    now.current.onTabPressIn?.(route);
  }, []);
  const tabPressOut = useCallback(() => {
    const p = press.current;
    clearTimeout(p.wait);
    // The tap itself comes just after (or just before) the finger lifts; a press that never became one goes dark again.
    p.wait = setTimeout(() => { if (!p.tapped) { p.route = null; setPressed(null); } }, LIT_TAP_WAIT_MS);
  }, []);
  const tabPress = useCallback((route: string) => {
    const p = press.current;
    clearTimeout(p.wait);
    p.tapped = true;
    // Only the latest tap goes: one held for its lit frame (below) never lands after a later tap.
    const mine = ++p.seq;
    const go = () => { if (p.seq === mine) now.current.onTab(route); };
    if (route === now.current.activeRoute) { setPressed(null); go(); return; }
    // Lit already at the touch, and drawn: the page goes now. Otherwise (a quick tap in a busy
    // browser, a keyboard, a screen reader) the lit tab is drawn first, then the page.
    const litFirst = p.route !== route || !p.painted;
    p.route = route;
    setPressed(route);
    if (Platform.OS === 'web' && litFirst) {
      cancelAnimationFrame(p.frame);
      p.frame = requestAnimationFrame(() => { setTimeout(go, 0); });
      return;
    }
    go();
  }, []);
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
  const face = (palette: Palette, live: boolean, overMedia: boolean = media, copyAlpha = 1) => (
    <Face palette={palette} media={overMedia} glassMedia={live ? (glassHeld ?? overMedia) : overMedia} live={live} copyAlpha={copyAlpha} items={items} activeRoute={lit} profileAlerts={profileAlerts}
      onTabPressIn={tabPressIn} onTabPressOut={tabPressOut} onTab={tabPress} onCreate={onCreate} tourRef={tourRef} tourCreate={tourCreate} veilStyle={veilStyle} veilBlocks={veilBlocks} onVeil={onVeil} onFeedHold={live ? onFeedHold : undefined} />
  );
  // The shadow around the glass: on an iPhone, drawn along the pill's own outline (a box shadow),
  // not worked out from everything inside it, which redrew the bar off screen every frame while a
  // page slid or scrolled under the glass (Oct 25 audit). The same shadow to look at. Quicker press feel only (admins first).
  const quick = usePressV2();
  return (
    <Animated.View pointerEvents="box-none" importantForAccessibility={hideFromReader} style={[styles.float, { bottom }, outerStyle]}>
      <Animated.View style={[styles.pillWrap, tuckStyle]}>
        <View style={[styles.pillShadow, quick && Platform.OS === 'ios' ? styles.pillShadowPath : null]}>
          {face(themes[theme], true)}
          {/* The bar as it was before a clip came or went, as see-through as the glass, fading out over the live glass (already re-tinted). */}
          {mediaLayers.map((layer) => (
            <FadeCopy key={layer.key} op={layer.op} style={StyleSheet.absoluteFill} testID="media-fade-bar">{face(themes[theme], false, layer.media, CLEAR_GLASS_ALPHA)}</FadeCopy>
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
});

/** The bar's ground and its row, in one court's colours: the live bar, or a fading copy of it. */
function Face({ palette: c, media, glassMedia, live, copyAlpha, items, activeRoute, profileAlerts, onTabPressIn, onTabPressOut, onTab, onCreate, tourRef, tourCreate, veilStyle, veilBlocks, onVeil, onFeedHold }: {
  /** `glassMedia`: the live glass's own dark or light, which may trail `media` by two frames (LookBar). */
  palette: Palette; media: boolean; glassMedia: boolean; live: boolean;
  /** A copy's ground: solid (1) for a court being left, whose page is fading under it too; as see-through as the glass for a clip's look. */
  copyAlpha: number;
  items: LookItem[]; activeRoute: string | undefined; profileAlerts: number;
  onTabPressIn: (route: string) => void; onTabPressOut: () => void;
  onTab: (route: string) => void; onCreate: () => void;
  tourRef: (route: string) => ((node: View | null) => void) | undefined; tourCreate: (node: View | null) => void;
  veilStyle: AnimStyle; veilBlocks: boolean; onVeil: () => void; onFeedHold?: () => void;
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
    const hold = item.route === 'index' ? onFeedHold : undefined;
    row.push(
      <View style={styles.slot} key={item.route}>
        <Pressable
          disabled={!live}
          accessible={live}
          onPressIn={() => { onTabPressIn(item.route); if (hold) noteFeedPressIn(); }}
          onPressOut={() => { onTabPressOut(); if (hold) noteFeedPressOut(); }}
          onPress={() => onTab(item.route)}
          onLongPress={hold}
          delayLongPress={hold ? HOLD_MS + HOLD_EXTRA_MS : undefined}
          {...PRESS_AT_ONCE}
          accessibilityRole="tab"
          accessibilityState={{ selected: active }}
          accessibilityLabel={item.label}
          accessibilityActions={hold ? SHOW_ALL_FEEDS : undefined}
          onAccessibilityAction={hold ? (e) => { if (e.nativeEvent.actionName === 'showAllFeeds') hold(); } : undefined}
          style={hold ? [styles.hit, NO_CALLOUT] : styles.hit}
          {...(hold ? HOLD_MARK : null)}
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
      {/* The hairline edge is a plain layer of its own, never a border on the glass, and above the
          Create box's veil, so the bar keeps its own edge while the box is up. */}
      <View pointerEvents="none" style={[styles.rim, { borderColor: line }]} />
      {/* While the Create box is up the bar keeps its colour (Oct 25, owner: "Don't like how this bottom
          gets dark grey"): a veil of its own ground, not the page's dim, steps the four tabs back so the
          lit + stands out, and catches a tap there to close the box. Only this child fades, never the glass. */}
      {live ? (
        <Animated.View pointerEvents={veilBlocks ? 'auto' : 'none'} style={[styles.veil, { backgroundColor: withAlpha(ground, BAR_RECEDE) }, veilStyle]}>
          <Pressable accessible={false} importantForAccessibility="no" onPress={onVeil} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : null}
    </>
  );
  // A fading copy is never glass: it is the one thing here whose opacity moves, and glass under a
  // fade can go see-through and stay that way (Oct 17). For a clip's look its ground is as
  // see-through as the glass's own tint, so it reads as the glass it stands for, never as a solid
  // slab over it (Oct 25 audit); for a court being left, solid, as that court's page is under it.
  if (!live) return <View style={[styles.pill, { backgroundColor: copyAlpha < 1 ? withAlpha(ground, copyAlpha) : ground }]}>{inside}</View>;
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
  // The same shadow along the pill's outline (an iPhone's shadowRadius is half a box shadow's blur).
  pillShadowPath: { shadowOpacity: 0, boxShadow: '0px 3px 20px rgba(0, 0, 0, 0.07)' },
  pill: { height: TAB_BAR_H, borderRadius: PILL_RADIUS, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
  rim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2, borderRadius: PILL_RADIUS, borderWidth: StyleSheet.hairlineWidth },
  slot: { flex: 1, alignSelf: 'stretch' },
  hit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  target: { alignSelf: 'stretch', alignItems: 'center' },
  inner: { alignItems: 'center', justifyContent: 'center', gap: 3 },
  // The + stands above the Create box's veil (zIndex 2 over the veil's 1), at full strength.
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

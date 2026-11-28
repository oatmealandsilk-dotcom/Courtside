import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { PixelRatio, Pressable, StyleSheet, View, useWindowDimensions, type NativeSyntheticEvent } from 'react-native';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Tabs,
  type PlatformIconIOS,
  type TabSelectedEvent,
  type TabSelectionPreventedEvent,
  type TabSelectionRejectedEvent,
  type TabsScreenAppearanceIOS,
} from 'react-native-screens';

import { BrandWash } from '@/components/ui/BrandWash';
import { FeedHold } from '@/features/feed/FeedHold';
import { HOLD_MS, holdFeedTab } from '@/features/feed/feedWindows';
import { BAR_RECEDE } from '@/features/compose/createMenu';
import { LENS_TABS } from '@/features/navigation/barLens';
import { useFeedOnPicture, useRowOnFeed } from '@/features/navigation/barOverMedia';
import { barCompact } from '@/features/navigation/barShrink';
import { NATIVE_BAR, NEW_BAR, nativeBarRoom, nativeBarSetup } from '@/features/navigation/tabBarLook';
import { SIM_DRIVER, simLog } from '@/lib/simDriver';
import { brandShadow } from '@/theme/fillMode';
import { darkColors, themes, useTheme } from '@/theme/ThemeProvider';
import { inkOn, withAlpha } from '@/theme';
import { lightened, type LookItem } from './TabBarLooks';

/**
 * Apple's own iOS 26 tab bar, "Bar A" (Nov 2, owner: "Let's make the bottom bar even more like instagrams Liquid Glass.
 * The animation especially"; Nov 28, his pick: "Apples own bottom bar"; barLens's useBarApple, admins first, iPhones with
 * Liquid Glass only). The bar itself is the phone's: its Liquid Glass, the lens that lifts, slides and settles on a tab
 * switch, the press and slide along it, all drawn by iOS (react-native-screens' Tabs, a UITabBarController; already in
 * the app's native build). Its words at 9 points (tabBarLook's NATIVE_BUBBLE 'small', his Nov 4 "smaller words").
 *
 * Only the bar: the four tabs' pages stay where they are (TabsPager, the sideways swipe between them, the pages
 * opened over them), and the phone's tab controller holds four empty, see-through pages of its own in a box
 * exactly the bar's size at the bottom of the screen. A tab tapped on it tells the app (onTab), as today's bar
 * does; the tab the app is on (a swipe, a link, Back) is told to it, and it moves its lens there itself.
 *
 * Kept from today's bar: the five places in the same order, the words, our own icons (drawn into pictures for
 * it, Apple's symbols if that does not answer in time), the lit tab in the court's colour, Profile's count, our solid
 * round + on top of the middle place (Apple's bar has no round button: its middle place is a tab that never opens,
 * under our +), dark glass over a clip on the Feed, the rise on a fresh open, the tuck as you scroll down (the
 * whole bar moves 6 points; the words stay), the Create box's veil, the tutorial's targets, the Feed tab's hold
 * (while on the Feed, our own catcher over Apple's Feed place takes the finger, as today's bar's Feed tab does: a tap
 * there is the Feed tab's tap, a still finger opens the feed windows and sliding picks one; Apple's bar never sees that
 * finger, so its bubble does not lift there or slide away with it to another tab).
 * Not kept: the swipe dragging the lens along frame by frame (it moves once the swipe has picked its tab), the court's
 * tint in the glass itself (Apple's glass is only light or dark: the court's colour is laid under it instead), the
 * theme change's fade, the + growing with the bar under a press.
 *
 * Never faded: it only moves (the rise, the tuck), as every glass here.
 */

/** The bar's five places, Apple's symbols for each tab should our icon pictures not come in time. */
const SYMBOLS: Record<string, [string, string]> = {
  discuss: ['person.2', 'person.2.fill'],
  index: ['play.circle', 'play.circle.fill'],
  coaches: ['list.clipboard', 'list.clipboard.fill'],
  profile: ['person', 'person.fill'],
};
/** The middle place, under our round +: a tab that is never opened (preventNativeSelection). */
const CREATE_KEY = 'create';
const PX = PixelRatio.get();

/** Each tab's icon for Apple's bar, as it rests and as it is lit. */
export type NativeIcons = Readonly<Record<string, { icon: PlatformIconIOS; selected: PlatformIconIOS }>>;

/**
 * The longest our icons may take to be drawn into pictures, from the moment they are first asked for (Nov 28): on the
 * iPhone SE and 13 mini Simulators the drawing never answered (Nov 4) and the app silently kept the old bar. Past this,
 * Apple's own symbols, for the rest of the run: the bar never waits longer, never shows without icons, and never
 * changes its icons once it is up. They are asked for under the splash, so the wait is almost always over before the
 * bar comes up: in the Simulator all eight took 0.3 to 0.6 s on an iPhone 17e and 0.7 to 1.1 s on an SE as the app
 * opened (its busiest moment), hence a limit well above that.
 */
export const ICON_WAIT_MS = 3000;

/** The icons Apple's bar has for this run of the app: null until decided, then fixed. */
let iconsMade: NativeIcons | null = null;
let iconsAsked = false;
const iconListeners = new Set<() => void>();
const readIcons = () => iconsMade;
const subscribeIcons = (fn: () => void) => { iconListeners.add(fn); return () => { iconListeners.delete(fn); }; };
/** The icons decided, once: whatever comes later (a slow drawing finishing after the time limit) is dropped. */
function settleIcons(made: NativeIcons, how: string) {
  if (iconsMade) return;
  iconsMade = made;
  simLog(`[bar] apple icons ${how}`);
  iconListeners.forEach((fn) => fn());
}

/** Apple's symbols, for when our icons could not be drawn into pictures in time. */
function symbolIcons(items: readonly LookItem[]): NativeIcons {
  return Object.fromEntries(items.map((it) => {
    const [rest, lit] = SYMBOLS[it.route] ?? ['circle', 'circle.fill'];
    return [it.route, { icon: { type: 'sfSymbol', name: rest } as PlatformIconIOS, selected: { type: 'sfSymbol', name: lit } as PlatformIconIOS }];
  }));
}

/**
 * The Simulator's proof of the time limit only (a demo build bundled with EXPO_PUBLIC_SIM_ICON_HANG=1): the drawing never
 * answers, as it did on Nov 4's small iPhones. A store build or an over-the-air update never reads it.
 */
const SIM_ICON_HANG = SIM_DRIVER && process.env.EXPO_PUBLIC_SIM_ICON_HANG === '1';

/** Our eight icons drawn into pictures (a "template": only their shape counts, Apple's bar tints them as its own). */
async function drawIcons(items: readonly LookItem[]): Promise<NativeIcons> {
  if (SIM_ICON_HANG) return new Promise<NativeIcons>(() => undefined);
  const pairs = await Promise.all(items.map(async (it) => {
    const [rest, lit] = await Promise.all([
      Ionicons.getImageSource(it.icon, NATIVE_BAR.icon, '#000000'),
      Ionicons.getImageSource(it.activeIcon, NATIVE_BAR.icon, '#000000'),
    ]);
    if (!rest || !lit) throw new Error('no icon picture');
    return [it.route, {
      icon: { type: 'templateSource', templateSource: rest } as PlatformIconIOS,
      selected: { type: 'templateSource', templateSource: lit } as PlatformIconIOS,
    }] as const;
  }));
  return Object.fromEntries(pairs) as NativeIcons;
}

/**
 * Our own icons (Ionicons, as today's bar) for Apple's bar, asked for once, as early as it is known this person has A
 * (AppShell's usePrepareAppleBar: during the splash, long before the bar comes up). A drawing that fails is tried once
 * more; one that has not answered within ICON_WAIT_MS gives way to Apple's symbols.
 */
export function prepareNativeBarIcons(items: readonly LookItem[]) {
  if (iconsAsked || iconsMade) return;
  iconsAsked = true;
  const started = Date.now();
  const limit = setTimeout(() => settleIcons(symbolIcons(items), `symbols (no answer in ${ICON_WAIT_MS} ms)`), ICON_WAIT_MS);
  const attempt = (tries: number): Promise<void> => drawIcons(items).then(
    (made) => { clearTimeout(limit); settleIcons(made, `drawn in ${Date.now() - started} ms`); },
    () => {
      if (tries > 1 && Date.now() - started < ICON_WAIT_MS) return attempt(tries - 1);
      clearTimeout(limit);
      settleIcons(symbolIcons(items), 'symbols (drawing failed)');
      return undefined;
    },
  );
  void attempt(2);
}

/**
 * The icons for Apple's bar: null until decided (and always with `on` false). Asks for them if nobody has yet. NavBar
 * keeps a bar that has not come up yet below the screen's edge until they are (at most ICON_WAIT_MS), so Apple's bar
 * never shows without its icons and never swaps them.
 */
export function useNativeBarIcons(on: boolean, items: readonly LookItem[]): NativeIcons | null {
  const made = useSyncExternalStore(subscribeIcons, readIcons, readIcons);
  useEffect(() => { if (on) prepareNativeBarIcons(items); }, [on, items]);
  return on ? made : null;
}

/** A tab route the bar has a place for, or null (a page that belongs to no tab). */
function tabKey(route: string | undefined): string | null {
  return route && (LENS_TABS as readonly string[]).includes(route) ? route : null;
}

/** How wide each target is: about the icon and its word. */
const PLACE_MARK_W = 62;
/** The court themes, whose glass carries the court's colour on today's bar. */
const COURT_THEMES: readonly string[] = ['ao', 'roland-garros', 'wimbledon', 'us-open'];
/** How strong the court's colour under Apple's glass is (as today's bar's glass tint, LIGHT_GLASS_ALPHA on an iPhone). */
const COURT_UNDER_ALPHA = 0.45;
/**
 * How wide the Feed's catcher is (while on the Feed), centred on Apple's Feed place: about its button (82 on a 390-point
 * phone) less a little each side, so it never reaches the round + or Community's button.
 */
const FEED_CATCH_W = 70;
/** A hold is FeedHold's (the finger can then slide between the windows): this keeps it from also counting as a tap. */
const noHold = () => undefined;

/** How long a tab picked on the bar waits for the app to say it is there before the app's word counts again. */
const PICK_WAIT_MS = 1500;

export const NativeBar = React.memo(function NativeBar({
  items, icons, activeRoute, feedUnder, tabsUnder, profileAlerts, onTab, onCreate, tourRef, tourCreate,
  inset, outerStyle, hideFromReader, veilStyle, veilBlocks, onVeil, onFeedHold,
}: {
  items: readonly LookItem[];
  /** Null only while the bar waits below the screen's edge for them (NavBar's iconWait); never once it is up. */
  icons: NativeIcons | null;
  activeRoute: string | undefined;
  feedUnder: boolean;
  tabsUnder: boolean;
  profileAlerts: number;
  onTab: (route: string) => void;
  onCreate: () => void;
  tourRef: (route: string) => ((node: View | null) => void) | undefined;
  tourCreate: (node: View | null) => void;
  /** The phone's bottom strip (home bar), 0 where there is none. */
  inset: number;
  /** The rise on a fresh open (NavBar's). */
  outerStyle: React.ComponentProps<typeof Animated.View>['style'];
  hideFromReader: 'auto' | 'no-hide-descendants';
  veilStyle: React.ComponentProps<typeof Animated.View>['style'];
  veilBlocks: boolean;
  onVeil: () => void;
  /** A hold on the Feed tab while on the Feed: the Feed's windows (features/feed/feedWindows), as today's bar. Only given while they are on. */
  onFeedHold?: () => void;
}) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  // The words' size and the five places (tabBarLook's NATIVE_BUBBLE).
  const setup = useMemo(() => nativeBarSetup(width), [width]);
  const placeX = (i: number) => setup.places[i];
  const c = themes[theme];
  const darkPage = inkOn(c.bg) === '#FFFFFF';
  // Over a clip on the Feed itself, dark glass (as today's bar: the same two signals, TabBarLooks).
  const onPicture = useFeedOnPicture();
  const rowOnFeed = useRowOnFeed();
  const feedShown = rowOnFeed ?? activeRoute === 'index';
  const overFeed = feedShown && (rowOnFeed === null ? feedUnder : tabsUnder);
  const media = overFeed && onPicture;
  const dark = media || darkPage;
  // The lit tab in the court's own colour (lightened in its own hue over a clip on a light court, as the new bar's);
  // the rest in the page's ink, white over a clip.
  const lit = media && !darkPage ? lightened(c.brand) : c.brand;
  const courtUnder = !media && COURT_THEMES.includes(theme);
  const idle = media ? withAlpha(c.onMedia, 0.92) : c.text;
  const ground = media ? (darkPage ? c.bg : darkColors.bg) : c.bg;
  // One look for every place (a tab item's look is the whole bar's while that tab is lit), made again only when its colours change.
  // A set word size keeps Apple's own weights: medium at rest, semibold lit.
  const word = setup.word;
  const appearance = useMemo<TabsScreenAppearanceIOS>(() => ({
    stacked: {
      normal: {
        tabBarItemIconColor: idle, tabBarItemTitleFontColor: idle, tabBarItemBadgeBackgroundColor: c.danger,
        ...(word ? { tabBarItemTitleFontSize: word, tabBarItemTitleFontWeight: '500' as const } : null),
      },
      selected: {
        tabBarItemIconColor: lit, tabBarItemTitleFontColor: lit, tabBarItemBadgeBackgroundColor: c.danger,
        ...(word ? { tabBarItemTitleFontSize: word, tabBarItemTitleFontWeight: '600' as const } : null),
      },
    },
  }), [idle, lit, c.danger, word]);

  // The tab the phone's bar is asked to show: the app's, as the address (or a swipe's pick) says. A tab picked on
  // the bar itself is shown by the bar at once; the app's word then catches up, and until it has (or for
  // PICK_WAIT_MS), an older word is not sent back to the bar (it would flick the lens back and forth).
  const provenance = useRef(0);
  const picked = useRef<{ key: string; at: number } | null>(null);
  const [request, setRequest] = useState(() => ({ selectedScreenKey: tabKey(activeRoute) ?? LENS_TABS[0], baseProvenance: 0 }));
  const wanted = tabKey(activeRoute);
  if (wanted && picked.current && (wanted === picked.current.key || Date.now() - picked.current.at > PICK_WAIT_MS)) picked.current = null;
  if (wanted && !picked.current && wanted !== request.selectedScreenKey) {
    setRequest({ selectedScreenKey: wanted, baseProvenance: provenance.current });
  }
  const onHold = useCallback(() => { simLog('[bar] feed hold'); holdFeedTab(); }, []);
  const now = useRef({ onTab, onCreate });
  now.current = { onTab, onCreate };
  const onSelected = useCallback((e: NativeSyntheticEvent<TabSelectedEvent>) => {
    const { selectedScreenKey: key, provenance: p, actionOrigin } = e.nativeEvent;
    provenance.current = Math.max(provenance.current, p);
    simLog(`[bar] apple selected ${key} (${actionOrigin})`);
    // Only a finger on the bar opens a tab; the bar following the app is the app's own doing.
    if (actionOrigin !== 'user') return;
    picked.current = { key, at: Date.now() };
    // A tap on the tab already on show too: back to the top, as today.
    now.current.onTab(key);
  }, []);
  // A tap on the catcher: the Feed tab tapped again (back to the top, or the windows closed), as Apple's bar says it.
  const onFeedTap = useCallback(() => { simLog('[bar] feed tap (catcher)'); now.current.onTab('index'); }, []);
  const onPrevented = useCallback((e: NativeSyntheticEvent<TabSelectionPreventedEvent>) => {
    provenance.current = Math.max(provenance.current, e.nativeEvent.provenance);
    if (e.nativeEvent.preventedScreenKey === CREATE_KEY) now.current.onCreate();
  }, []);
  const onRejected = useCallback((e: NativeSyntheticEvent<TabSelectionRejectedEvent>) => {
    provenance.current = Math.max(provenance.current, e.nativeEvent.provenance);
  }, []);

  // The tuck as you scroll down: the whole bar, 6 points (the new bar's), landed on whole pixels.
  const tuck = useAnimatedStyle(() => ({ transform: [{ translateY: Math.round(interpolate(barCompact.value, [0, 1], [0, NEW_BAR.tuck]) * PX) / PX }] }));
  const room = nativeBarRoom(inset);
  const badge = profileAlerts > 0 ? (profileAlerts > 9 ? '9+' : String(profileAlerts)) : undefined;
  const noEffects = { repeatedTabSelection: { popToRoot: false, scrollToTop: false } };
  const screens: React.ReactElement[] = [];
  items.forEach((item, index) => {
    if (index === 2) {
      screens.push(
        <Tabs.Screen key={CREATE_KEY} screenKey={CREATE_KEY} preventNativeSelection tabBarItemAccessibilityLabel="Create a post"
          specialEffects={noEffects} ios={{ standardAppearance: appearance, scrollEdgeAppearance: appearance }} />,
      );
    }
    const icon = icons?.[item.route];
    screens.push(
      <Tabs.Screen
        key={item.route}
        screenKey={item.route}
        title={item.label}
        badgeValue={item.route === 'profile' ? badge : undefined}
        tabBarItemAccessibilityLabel={item.label}
        specialEffects={noEffects}
        ios={{ icon: icon?.icon, selectedIcon: icon?.selected, standardAppearance: appearance, scrollEdgeAppearance: appearance }}
      />,
    );
  });
  const capsule = NATIVE_BAR.capsule;
  return (
    <Animated.View
      pointerEvents="box-none"
      importantForAccessibility={hideFromReader}
      accessibilityElementsHidden={hideFromReader === 'no-hide-descendants'}
      style={[styles.float, { height: room }, outerStyle]}
    >
      <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, tuck]}>
        {/* A court theme: the court's colour under Apple's glass, which shows it through as today's bar's glass is tinted
            with it (Apple's glass itself is only light or dark). Not over a clip, nor in Clean or Night (unchanged). */}
        {courtUnder ? (
          <View pointerEvents="none" style={[styles.courtUnder, { height: capsule, borderRadius: capsule / 2, backgroundColor: withAlpha(c.bg, COURT_UNDER_ALPHA) }]} />
        ) : null}
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <Tabs.Host
          navStateRequest={request}
          onTabSelected={onSelected}
          onTabSelectionPrevented={onPrevented}
          onTabSelectionRejected={onRejected}
          colorScheme={dark ? 'dark' : 'light'}
          nativeContainerStyle={{ backgroundColor: 'transparent' }}
          ios={{ tabBarTintColor: lit, tabBarMinimizeBehavior: 'never', tabBarControllerMode: 'tabBar' }}
        >
          {screens}
        </Tabs.Host>
        </View>
        {/* While on the Feed: our catcher over Apple's Feed place (see the top). A screen reader still reads and opens
            Apple's own Feed tab under it. */}
        {onFeedHold ? (
          <FeedHold onHold={onHold}>
            <Pressable
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
              onPress={onFeedTap}
              onLongPress={noHold}
              delayLongPress={HOLD_MS}
              style={[styles.feedCatch, { left: placeX(1) - FEED_CATCH_W / 2, height: capsule }]}
            />
          </FeedHold>
        ) : null}
        {/* What the tutorial lights: each tab's place on Apple's capsule (where Apple's bar puts it), never touched. */}
        <View pointerEvents="none" style={[styles.places, { height: capsule }]}>
          {items.map((item, index) => (
            <View key={item.route} ref={tourRef(item.route)} style={[styles.placeMark, { left: placeX(index < 2 ? index : index + 1) - PLACE_MARK_W / 2, top: (capsule - 44) / 2 }]} />
          ))}
        </View>
        {/* While the Create box is up, a veil of the bar's own ground steps the tabs back and catches a tap to
            close the box, as today's (laid over Apple's glass, never holding it; only it fades). */}
        <Animated.View pointerEvents={veilBlocks ? 'auto' : 'none'} style={[styles.veil, { height: capsule, borderRadius: capsule / 2, backgroundColor: withAlpha(ground, BAR_RECEDE) }, veilStyle]}>
          <Pressable accessible={false} importantForAccessibility="no" onPress={onVeil} style={StyleSheet.absoluteFill} />
        </Animated.View>
        {/* Our solid round +, over the middle of Apple's capsule (its place there is a tab that never opens). A screen reader
            reads that place of Apple's bar as "Create a post" (and opening it opens the Create box, onPrevented), so this one is
            left out of what it reads: otherwise VoiceOver said "Create a post" twice in a row. */}
        <View pointerEvents="box-none" style={[styles.plusRow, { top: (capsule - NEW_BAR.plus) / 2 }]}>
          <Pressable accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden onPress={onCreate} hitSlop={6}>
            <View ref={tourCreate} style={[styles.plus, { backgroundColor: c.brand }]}>
              <BrandWash radius={NEW_BAR.plus / 2} />
              <Ionicons name="add" size={NEW_BAR.plusIcon} color={c.brandInk} />
            </View>
          </Pressable>
        </View>
      </Animated.View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  // At the screen's bottom edge, as tall as the phone's bar takes (nativeBarRoom), over the pages.
  float: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 30 },
  places: { position: 'absolute', top: 0, left: 0, right: 0 },
  // The icon and its word's height, as today's targets.
  placeMark: { position: 'absolute', width: PLACE_MARK_W, height: 44 },
  feedCatch: { position: 'absolute', top: 0, width: FEED_CATCH_W },
  courtUnder: { position: 'absolute', top: 0, left: NATIVE_BAR.side, right: NATIVE_BAR.side },
  veil: { position: 'absolute', top: 0, left: NATIVE_BAR.side, right: NATIVE_BAR.side },
  plusRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  plus: { width: NEW_BAR.plus, height: NEW_BAR.plus, borderRadius: NEW_BAR.plus / 2, alignItems: 'center', justifyContent: 'center', ...brandShadow },
});

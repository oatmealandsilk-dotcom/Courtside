import { brandShadow } from '@/theme/fillMode';
import { remapFor, themes, useThemedStyles, type ThemeName } from '@/theme/ThemeProvider';
import { activeFade, FadeCopy, FadeSpot, type FadeLayer } from '@/theme/ThemeFade';
import { BrandMark } from './BrandMark';
import React from 'react';
import { PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { interpolate, runOnJS, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
import { Animated as RNAnimated } from 'react-native';
import { BAR_TUCK, barCompact, DUCK } from '@/features/navigation/barShrink';
import { useCurtainDown, useCurtainReady } from '@/features/feed/warmup';
import { isStartTab } from '@/features/navigation/startTab';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';
import { router, usePathname } from 'expo-router';
import { closeCreateMenu, markCreateOpening, useCreateMenuState } from '@/features/compose/createMenu';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BrandWash } from '@/components/ui/BrandWash';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LAYOUT, useResponsive } from '@/lib/useResponsive';
import { Glass } from '@/components/ui/Glass';
import { TAB_BAR_H } from '@/features/navigation/barInset';
import { useApp } from '@/store/AppContext';
import { openJoinSheet } from '@/features/guest/joinAsk';
import { useWelcomeNote } from '@/features/welcome/welcomeNote';
import { unreadChatCount } from '@/features/messages/groupRules';
import { unseenCount } from '@/features/activity/found';
import { useInstantsOn, withoutInstantRows } from '@/features/stories/instantsSwitch';
import { TextScale, colors, pageIsDark, radius, spacing, typography, font, withAlpha, wordmarkFont } from '@/theme';
import { useTourOpen, useTourTarget } from '@/features/tour/tourStore';
import { TAB_BAR_LOOK } from '@/features/navigation/tabBarLook';
import { LookBar } from './TabBarLooks';

/** The screen's pixels per point, read once: the bar's moves are rounded to whole pixels. */
const PX = PixelRatio.get();

/**
 * The bar's rise on a fresh open, kept for the whole run of the app rather
 * than per copy of the bar: once it has come up it never waits below the
 * edge again, and the longest it ever waits is counted from the first time
 * it was drawn. (Kept per copy, every time the bar was taken away and put
 * back while the page was still loading — the logo coming back, a page
 * opening and closing — it went back below the edge and its wait started
 * over, so it could stay out of sight far longer than meant.)
 */
let barUp = false;
let waitUntil = 0;
/** The longest the bar waits for the page under the curtain on a fresh open. */
const BAR_WAIT_MS = 7000;
/** How far below its place the bar waits under the curtain, and how long its rise into place takes. */
const BAR_HELD = 96;
const RISE_MS = 480;
/** If the rise never reports that it has finished, the bar is put in place this long after it set off anyway. */
const RISE_GRACE_MS = 1000;

/**
 * Minimal shape of what react-navigation hands a custom tabBar. Typed locally
 * so the app does not depend on @react-navigation/bottom-tabs directly.
 */
export interface NavBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
  /** Whether the page under the phone's bar is the Feed itself (AppShell): the quiet pill is dark over a clip only there. */
  feedUnder?: boolean;
}

interface NavItem {
  route: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
}

/**
 * In the strip's order, left to right (Community is where the app opens).
 * On the phone the + sits in the middle, between Feed and Coaching. The
 * feed's tab is called Feed, not Home: the app no longer opens on it, and a
 * Home that isn't where you start reads as wrong. A play icon, not a house,
 * because it is the clips.
 */
const ITEMS: NavItem[] = [
  { route: 'discuss', label: 'Community', icon: 'people-outline', activeIcon: 'people' },
  { route: 'index', label: 'Feed', icon: 'play-circle-outline', activeIcon: 'play-circle' },
  { route: 'coaches', label: 'Coaching', icon: 'clipboard-outline', activeIcon: 'clipboard' },
  { route: 'profile', label: 'Profile', icon: 'person-outline', activeIcon: 'person' },
];

export function NavBar({ state, navigation, feedUnder = true }: NavBarProps) {
  const styles = useThemedStyles(styleDefinitions);
  const { isPhone, isCompactSidebar } = useResponsive();
  const { conversations, notifications, detectedActivities, currentUserId, currentUser, blockedIds, isGuest } = useApp();
  // Chats with something new, not messages (Instagram's count); a muted chat never counts.
  const unread = unreadChatCount(conversations, currentUserId, blockedIds);
  // Never anything from someone you blocked (the Notifications page leaves those out too).
  // Several workouts found at once are one row there, so they count once (features/activity/found).
  // Nothing about an Instant while they are hidden, as on the page (features/stories/instantsSwitch).
  const instantsOn = useInstantsOn();
  const alerts = unseenCount(withoutInstantRows(notifications.filter((n) => n.userId === currentUserId && !blockedIds.includes(n.actorId)), instantsOn), detectedActivities);
  // The sidebar's bell counts CourtSide's own welcome too, until Notifications is first opened
  // (welcomeNote). Only the bell: it never adds to Profile's number in the bar, so a new
  // player is not met with a red badge for something nobody did.
  const welcome = useWelcomeNote(currentUser);
  const unseen = alerts + (welcome.unread ? 1 : 0);
  const insets = useSafeAreaInsets();
  // None when the page on show was opened cold from a link and belongs to no tab (index -1).
  const activeRoute: string | undefined = state.routes[state.index]?.name;
  // Everything waiting for you, in one number. The phone bar has no room for
  // separate bell and inbox entries the way the sidebar does, so Profile
  // carries the lot — it is where both of those live.
  const profileAlerts = unread + alerts;
  // The first-run tour points at these; each button puts itself on its list. Nothing here looks any different.
  const tourDiscuss = useTourTarget('tab-discuss');
  const tourHome = useTourTarget('tab-home');
  const tourCoaches = useTourTarget('tab-coaches');
  const tourProfile = useTourTarget('tab-profile');
  const tourCreate = useTourTarget('create');
  const tourMessages = useTourTarget('side-messages');
  const tourRef = (route: string) => (route === 'discuss' ? tourDiscuss : route === 'index' ? tourHome : route === 'coaches' ? tourCoaches : route === 'profile' ? tourProfile : undefined);
  // While the tour is up, a screen reader reads only the tour, not the bar under the dim.
  const touring = useTourOpen();
  const hideFromReader = touring ? 'no-hide-descendants' as const : 'auto' as const;

  // Scrolling down ducks the bar: a touch shorter, everything on it a touch
  // smaller. Scrolling up brings it straight back. Never small enough to miss.
  const bottomPad = Math.max(insets.bottom, spacing.sm);
  // On first open the bar is under the curtain; as the curtain lifts it
  // rises into place with the page rather than already sitting there.
  // Only while the splash curtain is actually up (a fresh open, on the page
  // the app opens on: Community, see startTab) does the bar wait below the
  // edge; anywhere else it is simply there. And it never waits more than a
  // few seconds, whatever that page is doing.
  const warm = useCurtainReady();
  const pathname = usePathname();
  // The sidebar's own pages (not tabs): when on one, its row is the lit one.
  const extra = pathname.startsWith('/search') ? 'search' : pathname.startsWith('/notifications') ? 'notifications' : pathname.startsWith('/messages') ? 'messages' : null;
  // The + is a toggle: a second tap closes the Create box with its own
  // animation. Mid-post (the box already gone) a tap there does nothing.
  const openCreate = () => {
    // A guest (guest mode, Oct 17): posting needs a profile, so the + asks them to join.
    if (isGuest) { openJoinSheet('post'); return; }
    // Said first, so the bar knows the box is coming and stays (owner, Oct 17, see createMenu).
    if (pathname !== '/compose') { markCreateOpening(); router.push('/compose'); return; }
    closeCreateMenu();
  };
  // While the Create box is up, the bar stays where it is, under the same dim
  // as the page: a veil over the pill, in and out on the box's own timing. A
  // tap on the veil closes the box, as a tap anywhere else outside it does;
  // only the + stands above it, lit, and closes the box too.
  const createMenu = useCreateMenuState();
  const boxUp = pathname === '/compose' && (createMenu === 'opening' || createMenu === 'open');
  const veil = useSharedValue(boxUp ? 1 : 0);
  useEffect(() => {
    veil.value = withTiming(boxUp ? 1 : 0, { duration: boxUp ? 220 : 210, easing: Easing.out(Easing.cubic) });
  }, [boxUp, veil]);
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));
  // Still in the way of the tabs while the box fades out, so a tap then does not open a tab under the closing box.
  const veilBlocks = boxUp || (pathname === '/compose' && createMenu === 'leaving');
  const curtainDown = useCurtainDown();
  const behindCurtain = !barUp && !warm && !curtainDown && isStartTab(pathname);
  if (behindCurtain && !waitUntil) waitUntil = Date.now() + BAR_WAIT_MS;
  // Where the bar is on that first rise, and what holds it there (Oct 22, owner's iPhone: Community
  // with no tab bar at all, after an open that left the app busy):
  //   'held'   below the edge under the curtain, by the bar's own plain style; nothing is animating
  //            it, so the animation thread never has a "below the edge" of its own to hand back later;
  //   'rising' on its way up: the animation thread moves it, starting from the same place;
  //   'up'     in place, by the bar's own plain style again (the rise reported done, or ran past its time).
  // An iPhone could lose the rise's end value when the app was busy just after it, and the bar then
  // fell back to where its style last said it was; that is now always "in place". Same view throughout:
  // the bar and its glass are never built again, only its own style changes.
  const [lift, setLift] = useState<'held' | 'rising' | 'up'>(behindCurtain ? 'held' : 'up');
  const entrance = useSharedValue(behindCurtain ? 1 : 0);
  useEffect(() => {
    const rise = () => {
      barUp = true;
      setLift((now) => (now === 'held' ? 'rising' : now));
    };
    if (!behindCurtain) { rise(); return; }
    const t = setTimeout(rise, Math.max(0, waitUntil - Date.now()));
    return () => clearTimeout(t);
  }, [behindCurtain]);
  // Started once the rise's style is on the bar (a child's own update runs before this), so it moves from its first frame.
  useLayoutEffect(() => {
    if (lift !== 'rising') return undefined;
    entrance.value = withTiming(0, { duration: RISE_MS, easing: Easing.out(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(setLift)('up');
    });
    const t = setTimeout(() => setLift('up'), RISE_MS + RISE_GRACE_MS);
    return () => clearTimeout(t);
  }, [lift, entrance]);
  // Ducking tucks the pill a little toward the edge and lets the labels go,
  // leaving the icons centred: the page beneath never moves, because the bar
  // floats over it. Nothing is scaled. A scaled icon on iPhone is a resampled
  // picture of itself and goes soft; moved and faded, it stays sharp.
  const duck = useAnimatedStyle(() => ({ transform: [{ translateY: entrance.value * BAR_HELD }] }));
  // Half of a label's line and its gap, so the icon lands in the middle once the label has gone.
  // Moves land on the screen's real pixels (a third of a point on most
  // iPhones): sharp icons, but three times finer steps than whole points,
  // which made the tuck visibly step and drift against the words above it.
  const settle = useAnimatedStyle(() => ({ transform: [{ translateY: Math.round(interpolate(barCompact.value, [0, 1], [0, 7]) * PX) / PX }] }));
  const labelFade = useAnimatedStyle(() => ({ opacity: interpolate(barCompact.value, [0, 0.6], [1, 0], 'clamp') }));
  const tuck = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.round(interpolate(barCompact.value, [0, 1], [0, BAR_TUCK]) * PX) / PX }],
  }));
  // The quiet pill in place of the glass one (tabBarLook, Oct 25): the same bar, drawn plainer.
  if (isPhone && TAB_BAR_LOOK !== 'now') {
    return (
      <LookBar
        items={ITEMS}
        activeRoute={activeRoute}
        feedUnder={feedUnder}
        profileAlerts={profileAlerts}
        onTab={(route) => navigation.navigate(route)}
        onCreate={openCreate}
        tourRef={tourRef}
        tourCreate={tourCreate}
        bottom={Math.max(insets.bottom, 12)}
        outerStyle={[lift === 'up' ? null : styles.held, lift === 'held' ? null : duck]}
        tuckStyle={tuck}
        hideFromReader={hideFromReader}
        veilStyle={veilStyle}
        veilBlocks={veilBlocks}
        onVeil={() => { closeCreateMenu(); }}
      />
    );
  }
  if (isPhone) {
    return (
      <Animated.View pointerEvents="box-none" importantForAccessibility={hideFromReader} style={[styles.float, { bottom: Math.max(insets.bottom, 12) }, lift === 'up' ? null : styles.held, lift === 'held' ? null : duck]}>
        <Animated.View style={[styles.pillWrap, tuck]}>
          {/* The shadow lives on a rounded layer of its own: on the square wrapper its corners showed past the pill's ends. */}
          <View style={styles.pillShadow}>
          <Glass clear style={styles.pill} radius={TAB_BAR_H / 2} tint={colors.bg}>
            {ITEMS.map((item, index) => {
              const active = item.route === activeRoute;
              return (
                <React.Fragment key={item.route}>
                {index === 2 && <View style={[styles.createSlot, styles.createAbove]}><Animated.View><Pressable ref={tourCreate} accessibilityRole="button" accessibilityLabel="Create a post" onPress={openCreate} style={styles.createButton}><BrandWash /><Ionicons name="add" size={28} color={colors.brandInk} /></Pressable></Animated.View></View>}
                <Pressable
                  ref={tourRef(item.route)}
                  onPress={() => navigation.navigate(item.route)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={item.label}
                  style={styles.bottomItem}
                >
                  <Animated.View style={[styles.bottomInner, settle]}>
                  <View>
                    <Ionicons
                      name={active ? item.activeIcon : item.icon}
                      size={23}
                      color={active ? (item.route === 'coaches' ? colors.info : item.route === 'discuss' ? colors.warning : colors.brand) : colors.textMuted}
                    />
                    {item.route === 'profile' && profileAlerts > 0 ? (
                      <View style={styles.bottomBadge}>
                        <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.bottomBadgeText, { color: colors.onDanger }]}>{profileAlerts > 9 ? '9+' : profileAlerts}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Animated.Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CHROME} style={[styles.bottomLabel, active && { color: item.route === 'coaches' ? colors.info : item.route === 'discuss' ? colors.warning : colors.brand }, labelFade]}>{item.label}</Animated.Text>
                  </Animated.View>
                </Pressable>
                </React.Fragment>
              );
            })}
            <Animated.View pointerEvents={veilBlocks ? 'auto' : 'none'} style={[styles.veil, veilStyle]}>
              <Pressable accessible={false} importantForAccessibility="no" onPress={() => { closeCreateMenu(); }} style={StyleSheet.absoluteFill} />
            </Animated.View>
          </Glass>
          {/* The pill's thin light edge sits outside the glass's inside, where the veil can't reach: the same
              dim laid over just that edge, so it darkens with the rest (Oct 17, owner: "outer edge not brighter"). */}
          <Animated.View pointerEvents="none" style={[styles.veilRim, veilStyle]} />
          {/* A theme picked on the Theme page: the whole pill in the court being left, edge included, laid over
              the live one (beside the glass, never holding it) and fading with the page (ThemeFade). The glass
              re-tints at the tap, under this; nothing that holds the glass ever fades. */}
          <FadeSpot store={activeFade} render={(layers) => layers.map((layer) => (
            <BarCopy key={layer.key} op={layer.op} theme={layer.theme} activeRoute={activeRoute} profileAlerts={profileAlerts} />
          ))} />
          </View>
        </Animated.View>
      </Animated.View>
    );
  }

  const compact = isCompactSidebar;

  return (
    <View
      importantForAccessibility={hideFromReader}
      style={[
        styles.sidebar,
        { width: compact ? LAYOUT.sidebarCompact : LAYOUT.sidebar, paddingTop: insets.top + spacing.xl },
      ]}
    >
      <View style={[styles.brandRow, compact && styles.brandRowCompact]}>
        {compact ? (
          <BrandMark size={34} />
        ) : (
          <View style={{flexDirection:'row',alignItems:'center',gap:8}}><BrandMark size={30}/><Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.wordmark}>CourtSide</Text></View>
        )}
      </View>

      <View style={styles.sidebarItems}>
        {ITEMS.map((item) => {
          // On Search, Notifications or Messages, that row is the lit one, not the tab you came from.
          const active = item.route === activeRoute && !extra;
          return (
            <Pressable
              key={item.route}
              ref={tourRef(item.route)}
              onPress={() => navigation.navigate(item.route)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={item.label}
              style={({ pressed }) => [
                styles.sidebarItem,
                compact && styles.sidebarItemCompact,
                active && styles.sidebarItemActive,
                pressed && { backgroundColor: colors.surfaceAlt },
              ]}
            >
              <Ionicons
                name={active ? item.activeIcon : item.icon}
                size={23}
                color={active ? colors.text : colors.textMuted}
              />
              {compact ? null : (
                <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.sidebarLabel, active && styles.sidebarLabelActive]}>
                  {item.label}
                </Text>
              )}
            </Pressable>
          );
        })}

        <Pressable
          onPress={() => router.push('/search')}
          accessibilityRole="button"
          accessibilityLabel="Search"
          accessibilityState={{ selected: extra === 'search' }}
          style={({ pressed }) => [
            styles.sidebarItem,
            compact && styles.sidebarItemCompact,
            extra === 'search' && styles.sidebarItemActive,
            pressed && { backgroundColor: colors.surfaceAlt },
          ]}
        >
          <Ionicons name={extra === 'search' ? 'search' : 'search-outline'} size={23} color={extra === 'search' ? colors.text : colors.textMuted} />
          {compact ? null : <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.sidebarLabel, extra === 'search' && styles.sidebarLabelActive]}>Search</Text>}
        </Pressable>

        <Pressable
          onPress={() => router.push('/notifications')}
          accessibilityRole="button"
          accessibilityLabel={unseen ? `Notifications, ${unseen} new` : 'Notifications'}
          accessibilityState={{ selected: extra === 'notifications' }}
          style={({ pressed }) => [
            styles.sidebarItem,
            compact && styles.sidebarItemCompact,
            extra === 'notifications' && styles.sidebarItemActive,
            pressed && { backgroundColor: colors.surfaceAlt },
          ]}
        >
          <View>
            <Ionicons name={unseen || extra === 'notifications' ? 'notifications' : 'notifications-outline'} size={23} color={extra === 'notifications' ? colors.text : colors.textMuted} />
            {unseen > 0 ? (
              <View style={styles.sidebarBadge}>
                <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.sidebarBadgeText}>{unseen > 9 ? '9+' : unseen}</Text>
              </View>
            ) : null}
          </View>
          {compact ? null : <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.sidebarLabel, extra === 'notifications' && styles.sidebarLabelActive]}>Notifications</Text>}
        </Pressable>

        <Pressable
          ref={tourMessages}
          onPress={() => router.push('/messages')}
          accessibilityRole="button"
          accessibilityLabel={unread ? `Messages, ${unread} unread` : 'Messages'}
          accessibilityState={{ selected: extra === 'messages' }}
          style={({ pressed }) => [
            styles.sidebarItem,
            compact && styles.sidebarItemCompact,
            extra === 'messages' && styles.sidebarItemActive,
            pressed && { backgroundColor: colors.surfaceAlt },
          ]}
        >
          <View>
            <Ionicons name={extra === 'messages' ? 'paper-plane' : 'paper-plane-outline'} size={23} color={extra === 'messages' ? colors.text : colors.textMuted} />
            {unread > 0 ? (
              <View style={styles.sidebarBadge}>
                <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.sidebarBadgeText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            ) : null}
          </View>
          {compact ? null : <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.sidebarLabel, extra === 'messages' && styles.sidebarLabelActive]}>Messages</Text>}
        </Pressable>

        <Pressable
          ref={tourCreate}
          onPress={openCreate}
          accessibilityRole="button"
          accessibilityLabel="Create a post"
          style={({ pressed }) => [
            styles.sidebarItem,
            compact && styles.sidebarItemCompact,
            pressed && { backgroundColor: colors.surfaceAlt },
          ]}
        >
          <Ionicons name="add-circle-outline" size={23} color={colors.textMuted} />
          {compact ? null : <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.sidebarLabel}>Create</Text>}
        </Pressable>
      </View>

      {compact ? null : (
        <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.sidebarFootnote}>Early access</Text>
      )}
    </View>
  );
}

/**
 * The phone bar in another court (the one a theme pick is leaving),
 * laid over the live bar and fading to nothing with the Theme page's own
 * copies. Its ground is that court's page colour, solid: the live glass under
 * it has already taken the new court's tint, and the old glass over a page in
 * its own colour reads as that colour. The row is laid out exactly as the
 * live one (same padding, same slots), so each icon and word sits on its twin.
 */
const BarCopy = React.memo(function BarCopy({ op, theme, activeRoute, profileAlerts }: {
  op: FadeLayer['op'];
  theme: ThemeName;
  activeRoute: string | undefined;
  profileAlerts: number;
}) {
  const styles = remapFor(theme, styleDefinitions);
  const c = themes[theme];
  // The bar's own duck, read afresh here (the copy is drawn mid-way through the bar's life).
  const settle = useAnimatedStyle(() => ({ transform: [{ translateY: Math.round(interpolate(barCompact.value, [0, 1], [0, 7]) * PX) / PX }] }));
  const labelFade = useAnimatedStyle(() => ({ opacity: interpolate(barCompact.value, [0, 0.6], [1, 0], 'clamp') }));
  const lit = (route: string) => (route === 'coaches' ? c.info : route === 'discuss' ? c.warning : c.brand);
  return (
    <FadeCopy op={op} style={[styles.pillCopy, { backgroundColor: c.bg }]} testID="theme-fade-bar">
      {ITEMS.map((item, index) => {
        const active = item.route === activeRoute;
        return (
          <React.Fragment key={item.route}>
            {index === 2 && <View style={styles.createSlot}><View style={styles.createButton}><BrandWash /><Ionicons name="add" size={28} color={c.brandInk} /></View></View>}
            <View style={styles.bottomItem}>
              <Animated.View style={[styles.bottomInner, settle]}>
                <View>
                  <Ionicons name={active ? item.activeIcon : item.icon} size={23} color={active ? lit(item.route) : c.textMuted} />
                  {item.route === 'profile' && profileAlerts > 0 ? (
                    <View style={styles.bottomBadge}>
                      <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.bottomBadgeText, { color: c.onDanger }]}>{profileAlerts > 9 ? '9+' : profileAlerts}</Text>
                    </View>
                  ) : null}
                </View>
                <Animated.Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CHROME} style={[styles.bottomLabel, active && { color: lit(item.route) }, labelFade]}>{item.label}</Animated.Text>
              </Animated.View>
            </View>
          </React.Fragment>
        );
      })}
    </FadeCopy>
  );
});

const styleDefinitions = StyleSheet.create({
  // BarCopy's box: the pill exactly (its edge too), laid out as the pill is.
  pillCopy: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: TAB_BAR_H / 2, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255, 255, 255, 0.45)' },
  createSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // The + stands above the veil while the Create box is up (zIndex 2 over the veil's 1).
  createAbove: { zIndex: 2 },
  // The Create box's dim, over the pill (its colour is the box's backdrop's, colors.overlay, read where it is drawn).
  veil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1, borderRadius: TAB_BAR_H / 2, backgroundColor: colors.overlay },
  veilRim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: TAB_BAR_H / 2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.overlay },
  createButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', ...brandShadow },
  // On a dark page the button's own colour as a shadow reads as a glow; a plain dark one just lifts it.
  // The bar floats: a glass pill a little above the bottom edge, the page running on beneath it.
  float: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 30 },
  // Below the edge, waiting under the curtain (and the start of the rise): see `lift`.
  held: { transform: [{ translateY: BAR_HELD }] },
  pillWrap: { width: '100%', paddingHorizontal: 14 },
  pillShadow: { borderRadius: TAB_BAR_H / 2, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  pill: { height: TAB_BAR_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255, 255, 255, 0.45)' },
  bottomItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottomInner: { alignItems: 'center', justifyContent: 'center', gap: 3 },
  // Sits off the icon's shoulder rather than on top of it, so it needs no
  // ring to stand apart, and the number has room to breathe.
  bottomBadge: {
    position: 'absolute', top: -5, left: 14,
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center',
  },
  // Its colour is colors.onDanger, given where it is drawn (white, or dark on the two dark courts' lighter red).
  bottomBadgeText: { fontSize: 11, lineHeight: 13, ...font('700'), fontVariant: ['tabular-nums'], includeFontPadding: false, textAlign: 'center' },
  bottomLabel: { ...typography.smallStrong, fontSize: 11, color: colors.textFaint, letterSpacing: 0.15 },

  sidebar: {
    backgroundColor: colors.bg,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  brandRow: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl },
  brandRowCompact: { paddingHorizontal: 0, alignItems: 'center' },
  wordmark: { ...typography.title, ...wordmarkFont('500'), fontSize: 23, color: colors.text, letterSpacing: -0.8 },
  sidebarItems: { flex: 1, gap: spacing.xs },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  sidebarItemCompact: { justifyContent: 'center', paddingHorizontal: 0, gap: 0 },
  sidebarItemActive: { backgroundColor: colors.surface },
  sidebarLabel: { ...typography.body, color: colors.textMuted },
  sidebarLabelActive: { color: colors.text, ...font('700') },
  sidebarBadge: {
    position: 'absolute',
    top: -4,
    right: -7,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarBadgeText: { color: colors.brandInk, fontSize: 9, ...font('700') },
  sidebarFootnote: { ...typography.caption, color: colors.textFaint, paddingHorizontal: spacing.md },
});

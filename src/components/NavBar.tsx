import { useThemedStyles } from '@/theme/ThemeProvider';
import { BrandMark } from './BrandMark';
import React from 'react';
import { PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { interpolate, runOnJS, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
import { Animated as RNAnimated } from 'react-native';
import { BAR_TUCK, barCompact, DUCK } from '@/features/navigation/barShrink';
import { useCurtainDown, useCurtainReady } from '@/features/feed/warmup';
import { isStartTab } from '@/features/navigation/startTab';
import { useCallback, useEffect, useRef } from 'react';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';
import { router, usePathname } from 'expo-router';
import { closeCreateMenu } from '@/features/compose/createMenu';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BrandWash } from '@/components/ui/BrandWash';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LAYOUT, useResponsive } from '@/lib/useResponsive';
import { Glass } from '@/components/ui/Glass';
import { TAB_BAR_H } from '@/features/navigation/barInset';
import { useApp } from '@/store/AppContext';
import { useWelcomeNote } from '@/features/welcome/welcomeNote';
import { unreadChatCount } from '@/features/messages/groupRules';
import { unseenCount } from '@/features/activity/found';
import { useInstantsOn, withoutInstantRows } from '@/features/stories/instantsSwitch';
import { colors, pageIsDark, radius, spacing, typography, font, withAlpha } from '@/theme';
import { useTourOpen, useTourTarget } from '@/features/tour/tourStore';
import { UnreadBadge } from '@/components/InboxButton';
import type { NotificationKind } from '@/data/types';

/**
 * What puts a number on Profile in the bar rather than a dot (Oct 12, owner:
 * "2 is good"): news that waits on you to answer it. Someone asked to follow
 * you, invited you to a hit, tagged you in a session (accept or decline), or
 * booked you; and, for an admin, a report or a review to look at. Chats with
 * something new count too: someone is waiting on a reply. Everything else
 * (likes, follows, comments, a workout found, a hit called off…) is a small
 * dot: worth a look, never a number nagging you.
 */
const ASKS_YOU: ReadonlySet<NotificationKind> = new Set<NotificationKind>(['follow-request', 'hit-invite', 'session-tag', 'booking', 'report', 'review-request']);

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

/**
 * Minimal shape of what react-navigation hands a custom tabBar. Typed locally
 * so the app does not depend on @react-navigation/bottom-tabs directly.
 */
export interface NavBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
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

export function NavBar({ state, navigation }: NavBarProps) {
  const styles = useThemedStyles(styleDefinitions);
  const { isPhone, isCompactSidebar } = useResponsive();
  const { conversations, notifications, detectedActivities, currentUserId, currentUser, blockedIds } = useApp();
  // Chats with something new, not messages (Instagram's count); a muted chat never counts.
  const unread = unreadChatCount(conversations, currentUserId, blockedIds);
  // Never anything from someone you blocked (the Notifications page leaves those out too).
  // Several workouts found at once are one row there, so they count once (features/activity/found).
  // Nothing about an Instant while they are hidden, as on the page (features/stories/instantsSwitch).
  const instantsOn = useInstantsOn();
  const mine = withoutInstantRows(notifications.filter((n) => n.userId === currentUserId && !blockedIds.includes(n.actorId)), instantsOn);
  const alerts = unseenCount(mine, detectedActivities);
  // The sidebar's bell counts CourtSide's own welcome too, until Notifications is first opened
  // (welcomeNote). Only the bell: it never adds to Profile's number in the bar, so a new
  // player is not met with a badge for something nobody did.
  const welcome = useWelcomeNote(currentUser);
  const unseen = alerts + (welcome.unread ? 1 : 0);
  const insets = useSafeAreaInsets();
  const activeRoute = state.routes[state.index]?.name ?? 'index';
  // Everything new for you, on Profile. The phone bar has no room for separate
  // bell and inbox entries the way the sidebar does, so Profile carries the
  // lot (it is where both of those live): a number for what waits on you to
  // answer (ASKS_YOU, and chats), else a small dot for anything else new.
  const asksYou = unread + mine.filter((n) => !n.read && ASKS_YOU.has(n.kind)).length;
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
    if (pathname !== '/compose') { router.push('/compose'); return; }
    closeCreateMenu();
  };
  const curtainDown = useCurtainDown();
  const behindCurtain = !barUp && !warm && !curtainDown && isStartTab(pathname);
  if (behindCurtain && !waitUntil) waitUntil = Date.now() + BAR_WAIT_MS;
  const entrance = useSharedValue(behindCurtain ? 1 : 0);
  useEffect(() => {
    const rise = () => {
      barUp = true;
      entrance.value = withTiming(0, { duration: 480, easing: Easing.out(Easing.cubic) });
    };
    if (!behindCurtain) { rise(); return; }
    const t = setTimeout(rise, Math.max(0, waitUntil - Date.now()));
    return () => clearTimeout(t);
  }, [behindCurtain, entrance]);
  // Ducking tucks the pill a little toward the edge and lets the labels go,
  // leaving the icons centred: the page beneath never moves, because the bar
  // floats over it. Nothing is scaled. A scaled icon on iPhone is a resampled
  // picture of itself and goes soft; moved and faded, it stays sharp.
  const duck = useAnimatedStyle(() => ({ transform: [{ translateY: entrance.value * 96 }] }));
  // Half of a label's line and its gap, so the icon lands in the middle once the label has gone.
  // Moves land on the screen's real pixels (a third of a point on most
  // iPhones): sharp icons, but three times finer steps than whole points,
  // which made the tuck visibly step and drift against the words above it.
  const settle = useAnimatedStyle(() => ({ transform: [{ translateY: Math.round(interpolate(barCompact.value, [0, 1], [0, 7]) * PX) / PX }] }));
  const labelFade = useAnimatedStyle(() => ({ opacity: interpolate(barCompact.value, [0, 0.6], [1, 0], 'clamp') }));
  const tuck = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.round(interpolate(barCompact.value, [0, 1], [0, BAR_TUCK]) * PX) / PX }],
  }));
  if (isPhone) {
    return (
      <Animated.View pointerEvents="box-none" importantForAccessibility={hideFromReader} style={[styles.float, { bottom: Math.max(insets.bottom, 12) }, duck]}>
        <Animated.View style={[styles.pillWrap, tuck]}>
          {/* The shadow lives on a rounded layer of its own: on the square wrapper its corners showed past the pill's ends. */}
          <View style={styles.pillShadow}>
          <Glass clear style={styles.pill} radius={TAB_BAR_H / 2} tint={colors.bg}>
            {ITEMS.map((item, index) => {
              const active = item.route === activeRoute;
              // The tab you are on is always the court's brand colour (Oct 12, owner: "2 is good"): it was
              // mustard on Community and blue on Coaching, so the bar changed colour from tab to tab.
              const tint = active ? colors.brand : colors.textMuted;
              return (
                <React.Fragment key={item.route}>
                {index === 2 && <View style={styles.createSlot}><Animated.View><Pressable ref={tourCreate} accessibilityRole="button" accessibilityLabel="Create a post" onPress={openCreate} style={[styles.createButton, pageIsDark() && styles.createButtonDark]}><BrandWash /><Ionicons name="add" size={28} color={colors.brandInk} /></Pressable></Animated.View></View>}
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
                      color={tint}
                    />
                    {/* The bell's and Messages' own badge, in the brand colour (it was the error red): a number
                        when something waits on you to answer, else a small dot when anything else is new. */}
                    {item.route === 'profile' ? (
                      <View pointerEvents="none" style={asksYou ? styles.bottomBadge : styles.bottomDot}>
                        <UnreadBadge count={asksYou || alerts} dot={!asksYou} style={styles.badgeInPlace} />
                      </View>
                    ) : null}
                  </View>
                  <Animated.Text style={[styles.bottomLabel, active && { color: tint }, labelFade]}>{item.label}</Animated.Text>
                  </Animated.View>
                </Pressable>
                </React.Fragment>
              );
            })}
          </Glass>
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
          <View style={{flexDirection:'row',alignItems:'center',gap:8}}><BrandMark size={30}/><Text style={styles.wordmark}>CourtSide</Text></View>
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
                <Text style={[styles.sidebarLabel, active && styles.sidebarLabelActive]}>
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
          {compact ? null : <Text style={[styles.sidebarLabel, extra === 'search' && styles.sidebarLabelActive]}>Search</Text>}
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
            <UnreadBadge count={unseen} style={styles.sidebarBadge} />
          </View>
          {compact ? null : <Text style={[styles.sidebarLabel, extra === 'notifications' && styles.sidebarLabelActive]}>Notifications</Text>}
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
            <UnreadBadge count={unread} style={styles.sidebarBadge} />
          </View>
          {compact ? null : <Text style={[styles.sidebarLabel, extra === 'messages' && styles.sidebarLabelActive]}>Messages</Text>}
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
          {compact ? null : <Text style={styles.sidebarLabel}>Create</Text>}
        </Pressable>
      </View>

      {compact ? null : (
        <Text style={styles.sidebarFootnote}>Early access</Text>
      )}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  createSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  createButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', shadowColor: colors.brand, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  // On a dark page the button's own colour as a shadow reads as a glow; a plain dark one just lifts it.
  createButtonDark: { shadowColor: '#000000', shadowOpacity: 0.4 },
  // The bar floats: a glass pill a little above the bottom edge, the page running on beneath it.
  float: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 30 },
  pillWrap: { width: '100%', paddingHorizontal: 14 },
  pillShadow: { borderRadius: TAB_BAR_H / 2, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  pill: { height: TAB_BAR_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255, 255, 255, 0.45)' },
  bottomItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottomInner: { alignItems: 'center', justifyContent: 'center', gap: 3 },
  // Profile's badge sits off the icon's shoulder rather than on top of it, so the number has room to
  // breathe: the number from where it always sat, the smaller dot a touch higher and further out.
  bottomBadge: { position: 'absolute', top: -5, left: 14 },
  bottomDot: { position: 'absolute', top: -3, left: 16 },
  // The badge's own corner placement (made for a header icon) handed over to the spot above.
  badgeInPlace: { position: 'relative', top: 0, right: 0 },
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
  wordmark: { ...typography.title, fontSize: 23, color: colors.text, letterSpacing: -0.8 },
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
  // The same badge as the bell's in a page's header (it was the error red here too).
  sidebarBadge: { top: -5, right: -8 },
  sidebarFootnote: { ...typography.caption, color: colors.textFaint, paddingHorizontal: spacing.md },
});

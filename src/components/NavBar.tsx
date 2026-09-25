import { useThemedStyles } from '@/theme/ThemeProvider';
import { BrandMark } from './BrandMark';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { interpolate, runOnJS, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
import { Animated as RNAnimated } from 'react-native';
import { barCompact, DUCK } from '@/features/navigation/barShrink';
import { useFeedWarm } from '@/features/feed/warmup';
import { useCallback, useEffect, useRef } from 'react';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';
import { router, usePathname } from 'expo-router';
import { closeCreateMenu } from '@/features/compose/createMenu';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LAYOUT, useResponsive } from '@/lib/useResponsive';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography, font } from '@/theme';

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

const ITEMS: NavItem[] = [
  { route: 'index', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { route: 'discuss', label: 'Community', icon: 'people-outline', activeIcon: 'people' },
  { route: 'coaches', label: 'Coaching', icon: 'clipboard-outline', activeIcon: 'clipboard' },
  { route: 'profile', label: 'Profile', icon: 'person-outline', activeIcon: 'person' },
];

export function NavBar({ state, navigation }: NavBarProps) {
  const styles = useThemedStyles(styleDefinitions);
  const { isPhone, isCompactSidebar } = useResponsive();
  const { conversations, notifications, currentUserId } = useApp();
  const unread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const unseen = notifications.filter((n) => n.userId === currentUserId && !n.read).length;
  const insets = useSafeAreaInsets();
  const activeRoute = state.routes[state.index]?.name ?? 'index';
  // Everything waiting for you, in one number. The phone bar has no room for
  // separate bell and inbox entries the way the sidebar does, so Profile
  // carries the lot — it is where both of those live.
  const profileAlerts = unread + unseen;

  // Scrolling down ducks the bar: a touch shorter, everything on it a touch
  // smaller. Scrolling up brings it straight back. Never small enough to miss.
  const bottomPad = Math.max(insets.bottom, spacing.sm);
  // On first open the bar is under the curtain; as the curtain lifts it
  // rises into place with the feed rather than already sitting there.
  // Only while the loading curtain is actually up (a fresh open on the feed)
  // does the bar wait below the edge; anywhere else it is simply there. And
  // it never waits more than a few seconds, whatever the feed is doing.
  const warm = useFeedWarm();
  const pathname = usePathname();
  // The + is a toggle: a second tap closes the Create box with its own
  // animation. Mid-post (the box already gone) a tap there does nothing.
  const openCreate = () => {
    if (pathname !== '/compose') { router.push('/compose'); return; }
    closeCreateMenu();
  };
  const behindCurtain = !warm && (pathname === '/' || pathname === '/index');
  const entrance = useSharedValue(behindCurtain ? 1 : 0);
  useEffect(() => {
    if (!behindCurtain) { entrance.value = withTiming(0, { duration: 480, easing: Easing.out(Easing.cubic) }); return; }
    const t = setTimeout(() => { entrance.value = withTiming(0, { duration: 480, easing: Easing.out(Easing.cubic) }); }, 7000);
    return () => clearTimeout(t);
  }, [behindCurtain, entrance]);
  // The bar's own height never changes (the feed's pages are sized against
  // it); ducking moves and shrinks what is on the bar instead.
  // Ducking makes the bar shorter: its top edge drops and the page behind
  // gets the room. The padding is a layout change, which the phone applies
  // reliably only through the plain Animated value below — so the ducking
  // amount is mirrored into one and the paddings follow it.
  const padAmount = useRef(new RNAnimated.Value(0)).current;
  const mirror = useCallback((v: number) => { padAmount.setValue(v); }, [padAmount]);
  // Only a visible change (a couple of hundredths, and always the ends) crosses over — a handful of times per swipe rather than every frame.
  const mirrored = useSharedValue(0);
  useAnimatedReaction(() => barCompact.value, (v) => {
    if (v === mirrored.value) return;
    if (v === 0 || v === 1 || Math.abs(v - mirrored.value) >= 0.04) { mirrored.value = v; runOnJS(mirror)(v); }
  }, [mirror]);
  const duckPad = {
    flexDirection: 'row' as const,
    paddingTop: padAmount.interpolate({ inputRange: [0, 1], outputRange: [spacing.sm + DUCK, spacing.sm + DUCK - DUCK * 1.5] }),
    paddingBottom: padAmount.interpolate({ inputRange: [0, 1], outputRange: [bottomPad + DUCK, bottomPad] }),
  };
  const duck = useAnimatedStyle(() => ({ transform: [{ translateY: entrance.value * 96 }] }));
  const shrink = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(barCompact.value, [0, 1], [1, 0.86]) }],
  }));
  const rowShrink = useAnimatedStyle(() => ({ minHeight: 48 }));

  if (isPhone) {
    return (
      <Animated.View style={[styles.bottomBar, duck]}>
       <RNAnimated.View style={duckPad}>
        <View pointerEvents="none" style={styles.topLine} />
        {ITEMS.map((item, index) => {
          const active = item.route === activeRoute;
          return (
            <React.Fragment key={item.route}>
            {index === 2 && <View style={styles.createSlot}><Animated.View style={shrink}><Pressable accessibilityRole="button" accessibilityLabel="Create a post" onPress={openCreate} style={styles.createButton}><Ionicons name="add" size={30} color={colors.brandInk} /></Pressable></Animated.View></View>}
            <Pressable
              onPress={() => navigation.navigate(item.route)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={item.label}
              style={styles.bottomItem}
            >
              <Animated.View style={[styles.bottomInner, rowShrink, shrink]}>
              <View>
                <Ionicons
                  name={active ? item.activeIcon : item.icon}
                  size={23}
                  color={active ? (item.route === 'coaches' ? colors.info : item.route === 'discuss' ? colors.warning : colors.brand) : colors.textFaint}
                />
                {item.route === 'profile' && profileAlerts > 0 ? (
                  <View style={styles.bottomBadge}>
                    <Text style={styles.bottomBadgeText}>{profileAlerts > 9 ? '9+' : profileAlerts}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.bottomLabel, active && { color: item.route === 'coaches' ? colors.info : item.route === 'discuss' ? colors.warning : colors.brand }]}>{item.label}</Text>
              </Animated.View>
            </Pressable>
            </React.Fragment>
          );
        })}
       </RNAnimated.View>
      </Animated.View>
    );
  }

  const compact = isCompactSidebar;

  return (
    <View
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
          const active = item.route === activeRoute;
          return (
            <Pressable
              key={item.route}
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
          style={({ pressed }) => [
            styles.sidebarItem,
            compact && styles.sidebarItemCompact,
            pressed && { backgroundColor: colors.surfaceAlt },
          ]}
        >
          <Ionicons name="search-outline" size={23} color={colors.textMuted} />
          {compact ? null : <Text style={styles.sidebarLabel}>Search</Text>}
        </Pressable>

        <Pressable
          onPress={() => router.push('/notifications')}
          accessibilityRole="button"
          accessibilityLabel={unseen ? `Notifications, ${unseen} new` : 'Notifications'}
          style={({ pressed }) => [
            styles.sidebarItem,
            compact && styles.sidebarItemCompact,
            pressed && { backgroundColor: colors.surfaceAlt },
          ]}
        >
          <View>
            <Ionicons name={unseen ? 'notifications' : 'notifications-outline'} size={23} color={colors.textMuted} />
            {unseen > 0 ? (
              <View style={styles.sidebarBadge}>
                <Text style={styles.sidebarBadgeText}>{unseen > 9 ? '9+' : unseen}</Text>
              </View>
            ) : null}
          </View>
          {compact ? null : <Text style={styles.sidebarLabel}>Notifications</Text>}
        </Pressable>

        <Pressable
          onPress={() => router.push('/messages')}
          accessibilityRole="button"
          accessibilityLabel={unread ? `Messages, ${unread} unread` : 'Messages'}
          style={({ pressed }) => [
            styles.sidebarItem,
            compact && styles.sidebarItemCompact,
            pressed && { backgroundColor: colors.surfaceAlt },
          ]}
        >
          <View>
            <Ionicons name="paper-plane-outline" size={23} color={colors.textMuted} />
            {unread > 0 ? (
              <View style={styles.sidebarBadge}>
                <Text style={styles.sidebarBadgeText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            ) : null}
          </View>
          {compact ? null : <Text style={styles.sidebarLabel}>Messages</Text>}
        </Pressable>

        <Pressable
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
  createButton: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', shadowColor: colors.brand, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  // No padding of its own: the padded row inside is the whole bar, so the
  // bar's top edge and its line are the same edge.
  bottomBar: {
    backgroundColor: colors.bg,
  },
  topLine: { position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  bottomItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottomInner: { alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 48 },
  bottomBadge: {
    position: 'absolute', top: -4, right: -8,
    minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center',
    // Ringed in the bar colour so it stays legible over the active icon.
    borderWidth: 2, borderColor: colors.bg,
  },
  bottomBadgeText: { color: 'white', fontSize: 9, ...font('700') },
  bottomLabel: { ...typography.smallStrong, fontSize: 10.5, color: colors.textFaint, letterSpacing: 0 },

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

import { useThemedStyles } from '@/theme/ThemeProvider';
import { BrandMark } from './BrandMark';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LAYOUT, useResponsive } from '@/lib/useResponsive';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

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

  if (isPhone) {
    return (
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        {ITEMS.map((item, index) => {
          const active = item.route === activeRoute;
          return (
            <React.Fragment key={item.route}>
            {index === 2 && <View style={styles.createSlot}><Pressable accessibilityRole="button" accessibilityLabel="Create a post" onPress={() => router.push('/compose')} style={styles.createButton}><Ionicons name="add" size={30} color={colors.brandInk} /></Pressable></View>}
            <Pressable
              onPress={() => navigation.navigate(item.route)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={item.label}
              style={styles.bottomItem}
            >
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
            </Pressable>
            </React.Fragment>
          );
        })}
      </View>
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
          onPress={() => router.push('/compose')}
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
        <Text style={styles.sidebarFootnote}>Demo build · mock data only</Text>
      )}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  createSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  createButton: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: colors.bgElevated,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  bottomItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 48 },
  bottomBadge: {
    position: 'absolute', top: -4, right: -8,
    minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center',
    // Ringed in the bar colour so it stays legible over the active icon.
    borderWidth: 2, borderColor: colors.bgElevated,
  },
  bottomBadgeText: { color: 'white', fontSize: 9, fontWeight: '800' },
  bottomLabel: { ...typography.caption, fontSize: 10, color: colors.textFaint, letterSpacing: 0 },

  sidebar: {
    backgroundColor: colors.bg,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  brandRow: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl },
  brandRowCompact: { paddingHorizontal: 0, alignItems: 'center' },
  wordmark: { fontSize: 23, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
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
  sidebarLabelActive: { color: colors.text, fontWeight: '700' },
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
  sidebarBadgeText: { color: colors.brandInk, fontSize: 9, fontWeight: '700' },
  sidebarFootnote: { ...typography.caption, color: colors.textFaint, paddingHorizontal: spacing.md },
});

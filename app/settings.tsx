import { PlayerName } from '@/components/PlayerName';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar, Screen, Toggle } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { useTheme, themeList, themes, type ThemeName } from '@/theme/ThemeProvider';
import { Wash } from '@/components/Wash';
import { colors, radius, spacing, typography, lift } from '@/theme';
import { leaveGently } from '@/components/SignOutCurtain';
import { confirm } from '@/lib/confirm';
import { replayTour } from '@/features/tour/tourStore';
import { TOUR_ON } from '@/features/tour/tourSeen';

interface Row {
  icon: keyof typeof Ionicons.glyphMap;
  /** Drawn in place of the icon when a row has something better to show (the theme's own colours). */
  leading?: React.ReactNode;
  label: string;
  /** A line under the label, for the few rows that need explaining. */
  detail?: string;
  /** A short current value at the right end, the way the phone's own Settings shows one. */
  value?: string;
  onPress?: () => void;
  /** Renders a switch instead of a chevron. */
  toggle?: { value: boolean; onChange: (next: boolean) => void };
}

/**
 * Settings, the way the phone's own reads: you at the top on the page's
 * wash, then short grouped lists — borderless, hairlines inset past the
 * icons, current values on the right — and Log out on its own at the end.
 */
export default function Settings() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, locationEnabled, detectedLocation, actions, prefs } = useApp();
  const [locationNote, setLocationNote] = useState('');
  const toggleLocation = async (next: boolean) => {
    setLocationNote(next ? 'Asking…' : '');
    const problem = await actions.setLocationEnabled(next);
    setLocationNote(problem ?? '');
  };
  const { theme } = useTheme();

  const sections: { title: string; rows: Row[] }[] = [
    {
      title: 'Account',
      rows: [
        { icon: 'person-circle-outline', label: 'Account center', detail: 'Password, sign-in, payments and your data', onPress: () => router.push('/account') },
        { icon: 'shield-checkmark-outline', label: 'Privacy center', detail: currentUser?.isPrivate ? 'Private account · blocked, muted and read receipts' : 'Private account, blocked, muted and read receipts', onPress: () => router.push('/privacy') },
      ],
    },
    // Phone alerts only exist in the app on a phone; a browser can't receive them, so it doesn't offer switches for them.
    ...(Platform.OS === 'web' ? [] : [{
      title: 'Notifications',
      rows: [
        // Every chat, groups included; a single chat is muted from its own details page instead.
        { icon: 'paper-plane-outline' as const, label: 'Messages', detail: 'To quiet just one chat, mute it from its details', toggle: { value: prefs.pushMessages, onChange: (v: boolean) => actions.setPref('pushMessages', v) } },
        { icon: 'heart-outline' as const, label: 'Likes and comments', toggle: { value: prefs.pushLikes, onChange: (v: boolean) => actions.setPref('pushLikes', v) } },
        { icon: 'chatbubble-ellipses-outline' as const, label: 'Coach replies', toggle: { value: prefs.pushCoach, onChange: (v: boolean) => actions.setPref('pushCoach', v) } },
      ],
    }]),
    {
      title: 'App',
      rows: [
        { icon: 'color-palette-outline', label: 'Theme', leading: <ThemeTile name={theme} />, value: themeList.find((t) => t.name === theme)?.label, onPress: () => router.push('/theme') },
        { icon: 'archive-outline', label: 'Archive', onPress: () => router.push('/archive') },
      ],
    },
    {
      title: 'Your tennis',
      rows: [
        { icon: 'pulse-outline', label: 'Health and nutrition', onPress: () => router.push('/health') },
        { icon: 'location-outline', label: 'Location', detail: locationNote || (locationEnabled ? (detectedLocation ? `Showing players near ${detectedLocation.split(',')[0]}` : 'On') : 'Off. Turn on to see who is near you'), toggle: { value: locationEnabled, onChange: (next) => { void toggleLocation(next); } } },
        { icon: 'shield-half-outline', label: 'Permissions', onPress: () => router.push('/permissions') },
      ],
    },
    // Only admins see this group (and only admins can read what is behind it).
    ...(currentUser?.isAdmin ? [{
      title: 'Admin',
      rows: [
        { icon: 'hand-left-outline' as const, label: 'Welcome new players', onPress: () => router.push('/admin-welcome') },
        { icon: 'flag-outline' as const, label: 'Reports', onPress: () => router.push('/admin-reports') },
        { icon: 'mail-outline' as const, label: 'Waitlist', onPress: () => router.push('/admin-waitlist') },
        { icon: 'school-outline' as const, label: 'Coaches and payments', onPress: () => router.push('/admin-coaches') },
      ],
    }] : []),
    {
      title: 'Support',
      rows: [
        // Back to Community on the map, where the app opens and the first-run tutorial plays again from the start.
        // Until the tour is switched on for everyone, only admins see this (to review it).
        ...(TOUR_ON || currentUser?.isAdmin ? [{ icon: 'compass-outline' as const, label: 'Show the tutorial', onPress: replayTour }] : []),
        { icon: 'help-circle-outline', label: 'Help', onPress: () => router.push('/help') },
        { icon: 'information-circle-outline', label: 'About', onPress: () => router.push('/about') },
      ],
    },
  ];


  return (
    <Screen title="Settings" compactTitle onBack={() => goBack()}>
      {currentUser ? (
        <View style={styles.me}>
          <Avatar name={currentUser.name} seed={currentUser.avatarSeed} size={64} />
          <View style={styles.meWords}>
            <PlayerName userId={currentUser.id} style={styles.meName}>{currentUser.name}</PlayerName>
            <Text style={styles.meHandle}>@{currentUser.handle}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Edit profile" onPress={() => router.push('/edit-profile')} style={({ pressed }) => [styles.edit, pressed && { opacity: 0.7 }]}>
            <Text style={styles.editText}>Edit</Text>
          </Pressable>
        </View>
      ) : null}


      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.card}>
            {section.rows.map((row, index) => (
              <Pressable
                key={row.label}
                accessibilityRole={row.toggle ? 'switch' : 'button'}
                accessibilityLabel={row.value ? `${row.label}, ${row.value}` : row.label}
                accessibilityState={row.toggle ? { checked: row.toggle.value } : undefined}
                disabled={!row.onPress && !row.toggle}
                onPress={row.toggle ? () => row.toggle?.onChange(!row.toggle.value) : row.onPress}
                style={({ pressed }) => [styles.row, pressed && (row.onPress || row.toggle) ? styles.rowPressed : null]}
              >
                <View style={styles.lead}>{row.leading ?? <Ionicons name={row.icon} size={20} color={colors.textMuted} />}</View>
                <View style={[styles.rowBody, index > 0 && styles.rowLine]}>
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel} numberOfLines={1}>{row.label}</Text>
                    {row.detail ? <Text style={styles.rowDetail}>{row.detail}</Text> : null}
                  </View>
                  {row.value ? <Text style={styles.rowValue} numberOfLines={1}>{row.value}</Text> : null}
                  {row.toggle ? (
                    <Toggle value={row.toggle.value} onChange={row.toggle.onChange} accessibilityLabel={row.label} />
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      {/* Signing out leaves this page too: it sits above the tabs, so nothing else would send you to sign in. */}
      <Pressable accessibilityRole="button" accessibilityLabel="Log out" onPress={() => confirm({ title: 'Log out?', message: 'You can log back in any time.', confirmLabel: 'Log out', destructive: true, onConfirm: () => leaveGently(() => { actions.signOut(); router.replace('/sign-in'); }) })} style={({ pressed }) => [styles.card, styles.logout, pressed && styles.rowPressed]}>
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
      <Text style={styles.version}>CourtSide · early access</Text>
    </Screen>
  );
}

/**
 * The Theme row's icon: the chosen court as a tiny page — its ground with its
 * wash faintly on it — the same picture the Theme page shows for each court.
 */
function ThemeTile({ name }: { name: ThemeName }) {
  const p = themes[name];
  return (
    <View style={[tile.box, { backgroundColor: p.bg, borderColor: p.borderStrong }]}>
      <Wash theme={name} height={26} strength={0.9} fade={p.bg} />
    </View>
  );
}
const tile = StyleSheet.create({
  box: { width: 26, height: 24, borderRadius: 7, borderWidth: 1, overflow: 'hidden' },
});

const styleDefinitions = StyleSheet.create({
  // You, at the top, on the page's own wash: no card around it.
  me: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.lg },
  meWords: { flex: 1, gap: 2 },
  meName: { ...typography.heading, color: colors.text },
  meHandle: { ...typography.small, color: colors.textMuted },
  edit: { height: 34, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  editText: { ...typography.smallStrong, color: colors.text },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 42, paddingHorizontal: 14, marginBottom: spacing.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.borderStrong}55` },
  searchInput: { flex: 1, ...typography.body, color: colors.text, paddingVertical: 0 },
  section: { gap: spacing.sm, paddingBottom: spacing.xl },
  sectionTitle: { ...typography.smallStrong, color: colors.textMuted, paddingHorizontal: spacing.sm },
  // Borderless grouped list: the list is a shade off the page, rows are separated by hairlines that start past the icons.
  card: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'stretch', paddingLeft: spacing.lg },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  lead: { width: 26, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 50, paddingVertical: 11, paddingRight: spacing.lg },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowText: { flex: 1, gap: 1 },
  rowLabel: { ...typography.body, color: colors.text },
  rowDetail: { ...typography.small, color: colors.textFaint },
  rowValue: { ...typography.body, color: colors.textMuted, maxWidth: 140 },
  logout: { alignItems: 'center', justifyContent: 'center', minHeight: 50 },
  logoutText: { ...typography.body, color: colors.danger },
  empty: { ...typography.small, color: colors.textFaint, paddingVertical: spacing.lg },
  version: { ...typography.caption, letterSpacing: 0.2, color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.xl },
});

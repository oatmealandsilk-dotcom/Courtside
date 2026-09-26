import { PlayerName } from '@/components/PlayerName';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, Screen, Toggle } from '@/components/ui';
import { Glass } from '@/components/ui/Glass';
import { useApp } from '@/store/AppContext';
import { useTheme, themeList, themes, type ThemeName } from '@/theme/ThemeProvider';
import { Wash } from '@/components/Wash';
import { colors, radius, spacing, typography } from '@/theme';

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
  const { currentUser, saved, blockedIds, locationEnabled, detectedLocation, actions, prefs } = useApp();
  const [locationNote, setLocationNote] = useState('');
  const toggleLocation = async (next: boolean) => {
    setLocationNote(next ? 'Asking…' : '');
    const problem = await actions.setLocationEnabled(next);
    setLocationNote(problem ?? '');
  };
  const { theme } = useTheme();
  const [search, setSearch] = useState('');
  const savedCount = saved.postIds.length + saved.questionIds.length;

  const sections: { title: string; rows: Row[] }[] = [
    {
      title: 'Account',
      rows: [
        { icon: 'person-circle-outline', label: 'Account center', detail: 'Password, sign-in and your data', onPress: () => router.push('/account') },
        { icon: 'swap-horizontal-outline', label: 'Switch account', onPress: () => router.push('/accounts') },
      ],
    },
    {
      title: 'Notifications',
      rows: [
        { icon: 'heart-outline', label: 'Likes and comments', toggle: { value: prefs.pushLikes, onChange: (v: boolean) => actions.setPref('pushLikes', v) } },
        { icon: 'chatbubble-ellipses-outline', label: 'Coach replies', toggle: { value: prefs.pushCoach, onChange: (v: boolean) => actions.setPref('pushCoach', v) } },
      ],
    },
    {
      title: 'App',
      rows: [
        { icon: 'color-palette-outline', label: 'Theme', leading: <ThemeTile name={theme} />, value: themeList.find((t) => t.name === theme)?.label, onPress: () => router.push('/theme') },
        { icon: 'bookmark-outline', label: 'Saved', value: savedCount ? String(savedCount) : undefined, onPress: () => router.push('/saved') },
        { icon: 'archive-outline', label: 'Archive', onPress: () => router.push('/archive') },
        { icon: 'time-outline', label: 'Your activity', onPress: () => router.push('/activity') },
      ],
    },
    {
      title: 'Privacy',
      rows: [
        { icon: 'lock-closed-outline', label: 'Private account', toggle: { value: !!currentUser?.isPrivate, onChange: actions.setPrivateAccount } },
        { icon: 'checkmark-done-outline', label: 'Read receipts', toggle: { value: currentUser?.readReceiptsEnabled !== false, onChange: actions.setReadReceiptsEnabled } },
        { icon: 'radio-button-on-outline', label: 'Show activity status', toggle: { value: prefs.showActivity, onChange: (v: boolean) => actions.setPref('showActivity', v) } },
        { icon: 'remove-circle-outline', label: 'Blocked', value: blockedIds.length ? String(blockedIds.length) : undefined, onPress: () => router.push('/blocked') },
      ],
    },
    {
      title: 'Your tennis',
      rows: [
        { icon: 'tennisball-outline', label: 'Game details and achievements', onPress: () => router.push('/profile-details') },
        { icon: 'pulse-outline', label: 'Health and nutrition', onPress: () => router.push('/health') },
        { icon: 'location-outline', label: 'Location', value: locationEnabled ? detectedLocation?.split(',')[0] ?? 'On' : locationNote || undefined, toggle: { value: locationEnabled, onChange: (next) => { void toggleLocation(next); } } },
        { icon: 'shield-half-outline', label: 'Permissions', onPress: () => router.push('/permissions') },
        { icon: 'ribbon-outline', label: 'Apply to be a coach', onPress: () => router.push('/coach-apply') },
      ],
    },
    // Only admins see this group (and only admins can read what is behind it).
    ...(currentUser?.isAdmin ? [{
      title: 'Admin',
      rows: [
        { icon: 'flag-outline' as const, label: 'Reports', onPress: () => router.push('/admin-reports') },
        { icon: 'mail-outline' as const, label: 'Waitlist', onPress: () => router.push('/admin-waitlist') },
      ],
    }] : []),
    {
      title: 'Support',
      rows: [
        { icon: 'help-circle-outline', label: 'Help', onPress: () => router.push('/help') },
        { icon: 'shield-checkmark-outline', label: 'Privacy center', onPress: () => router.push('/privacy') },
        { icon: 'information-circle-outline', label: 'About', onPress: () => router.push('/about') },
      ],
    },
  ];

  const term = search.trim().toLowerCase();
  const filtered = sections
    .map((section) => ({ ...section, rows: term ? section.rows.filter((r) => r.label.toLowerCase().includes(term)) : section.rows }))
    .filter((section) => section.rows.length > 0);

  return (
    <Screen title="Settings" compactTitle onBack={() => goBack()}>
      {currentUser && !term ? (
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

      <Glass radius={999} tint={colors.surface} style={styles.search}>
        <Ionicons name="search" size={16} color={colors.textFaint} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search settings"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search settings"
          style={styles.searchInput}
        />
        {search ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </Glass>

      {filtered.map((section) => (
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
                    {row.detail ? <Text style={styles.rowDetail} numberOfLines={1}>{row.detail}</Text> : null}
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

      {!filtered.length ? <Text style={styles.empty}>Nothing matches “{search}”.</Text> : null}

      {!term ? (
        // Signing out leaves this page too: it sits above the tabs, so nothing else would send you to sign in.
        <Pressable accessibilityRole="button" accessibilityLabel="Log out" onPress={() => { actions.signOut(); router.replace('/sign-in'); }} style={({ pressed }) => [styles.card, styles.logout, pressed && styles.rowPressed]}>
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      ) : null}
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
  card: { borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
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

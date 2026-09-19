import { PlayerName } from '@/components/PlayerName';
import { ThemeCourt } from '@/components/ThemeCourt';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, Field, Screen, Toggle } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { useTheme, themeList, themes, type ThemeName } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';

interface Row {
  icon: keyof typeof Ionicons.glyphMap;
  /** Drawn in place of the icon when a row has something better to show (the theme's own colours). */
  leading?: React.ReactNode;
  label: string;
  detail?: string;
  onPress?: () => void;
  /** Renders a switch instead of a chevron. */
  toggle?: { value: boolean; onChange: (next: boolean) => void };
  danger?: boolean;
}

/**
 * Settings, arranged the way Instagram does it: search at the top, then
 * grouped sections of single-line rows, account actions last.
 */
export default function Settings() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, saved, blockedIds, paymentMethods, defaultPaymentId, locationEnabled, detectedLocation, actions, prefs } = useApp();
  const defaultPayment = paymentMethods.find((m) => m.id === defaultPaymentId);
  const [locationNote, setLocationNote] = useState('');
  const toggleLocation = async (next: boolean) => {
    setLocationNote(next ? 'Asking your device…' : '');
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
        {
          icon: 'person-circle-outline',
          label: 'Account center',
          detail: 'Sign-in, password and your data',
          onPress: () => router.push('/account'),
        },
      ],
    },
    {
      title: 'Your app and media',
      rows: [
        {
          icon: 'color-palette-outline',
          label: 'Theme',
          leading: <ThemeTile name={theme} />,
          detail: themeList.find((t) => t.name === theme)?.label,
          onPress: () => router.push('/theme'),
        },
        {
          icon: 'bookmark-outline',
          label: 'Saved',
          detail: savedCount ? String(savedCount) : undefined,
          onPress: () => router.push('/saved'),
        },
        { icon: 'archive-outline', label: 'Archive', onPress: () => router.push('/archive') },
        { icon: 'time-outline', label: 'Your activity', onPress: () => router.push('/activity') },
        {
          icon: 'notifications-outline',
          label: 'Likes and comments',
          toggle: { value: prefs.pushLikes, onChange: (v: boolean) => actions.setPref('pushLikes', v) },
        },
        {
          icon: 'megaphone-outline',
          label: 'Coach replies',
          toggle: { value: prefs.pushCoach, onChange: (v: boolean) => actions.setPref('pushCoach', v) },
        },
      ],
    },
    {
      title: 'Who can see your content',
      rows: [
        { icon: 'checkmark-done-outline', label: 'Read receipts', detail: 'Let people see when you read their messages', toggle: { value: currentUser?.readReceiptsEnabled !== false, onChange: actions.setReadReceiptsEnabled } },
        {
          icon: 'lock-closed-outline',
          label: 'Private account',
          toggle: { value: !!currentUser?.isPrivate, onChange: actions.setPrivateAccount },
        },
        {
          icon: 'ellipse-outline',
          label: 'Show activity status',
          toggle: { value: prefs.showActivity, onChange: (v: boolean) => actions.setPref('showActivity', v) },
        },
        {
          icon: 'close-circle-outline',
          label: 'Blocked',
          detail: blockedIds.length ? String(blockedIds.length) : undefined,
          onPress: () => router.push('/blocked'),
        },
        // Only admins see this row (and only admins can read the reports behind it).
        ...(currentUser?.isAdmin ? [{ icon: 'flag-outline' as const, label: 'Reports', detail: 'Review what people reported', onPress: () => router.push('/admin-reports') }] : []),
      ],
    },
    {
      title: 'Your tennis',
      rows: [
        { icon: 'person-outline', label: 'Edit profile', onPress: () => router.push('/edit-profile') },
        {
          icon: 'tennisball-outline',
          label: 'Game details and achievements',
          onPress: () => router.push('/profile-details'),
        },
        { icon: 'flash-outline', label: 'Health and nutrition', onPress: () => router.push('/health') },
        { icon: 'shield-half-outline', label: 'Permissions', detail: 'Camera, photos, microphone', onPress: () => router.push('/permissions') },
        {
          icon: 'location-outline',
          label: 'Location',
          detail: locationEnabled ? detectedLocation ?? 'On' : locationNote || 'Off',
          toggle: { value: locationEnabled, onChange: (next) => { void toggleLocation(next); } },
        },
        {
          icon: 'ribbon-outline',
          label: 'Apply to be a coach',
          onPress: () => router.push('/coach-apply'),
        },
      ],
    },
    {
      title: 'Payments',
      rows: [
        {
          icon: 'card-outline',
          label: 'Payment methods',
          detail: defaultPayment ? `${defaultPayment.label} · default` : undefined,
          onPress: () => router.push('/payments'),
        },
      ],
    },
    {
      title: 'More info and support',
      rows: [
        { icon: 'help-circle-outline', label: 'Help', onPress: () => router.push('/help') },
        { icon: 'shield-checkmark-outline', label: 'Privacy center', onPress: () => router.push('/privacy') },
        { icon: 'information-circle-outline', label: 'About', onPress: () => router.push('/about') },
      ],
    },
    {
      title: 'Login',
      rows: [
        // Signing out from here also has to leave this page: it sits above the
        // tabs, so nothing else would send you to the sign-in screen.
        { icon: 'swap-horizontal-outline', label: 'Switch account', detail: 'Pick another login saved on this phone', onPress: () => router.push('/accounts') },
        { icon: 'log-out-outline', label: 'Log out', onPress: () => { actions.signOut(); router.replace('/sign-in'); }, danger: true },
      ],
    },
  ];

  const term = search.trim().toLowerCase();
  const filtered = sections
    .map((section) => ({
      ...section,
      rows: term ? section.rows.filter((r) => r.label.toLowerCase().includes(term)) : section.rows,
    }))
    .filter((section) => section.rows.length > 0);

  return (
    <Screen title="Settings" compactTitle onBack={() => goBack()}>
      <View style={styles.searchWrap}>
        <Field value={search} onChangeText={setSearch} placeholder="Search settings" autoCapitalize="none" />
      </View>

      {currentUser ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/edit-profile')}
          style={styles.accountCard}
        >
          <Avatar name={currentUser.name} seed={currentUser.avatarSeed} size={52} />
          <View style={{ flex: 1 }}>
            <PlayerName userId={currentUser.id} style={styles.accountName}>{currentUser.name}</PlayerName>
            <PlayerName userId={currentUser.id} style={styles.accountHandle}>@{currentUser.handle}</PlayerName>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Pressable>
      ) : null}

      {filtered.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.card}>
            {section.rows.map((row, index) => (
              <Pressable
                key={row.label}
                accessibilityRole={row.toggle ? 'switch' : 'button'}
                accessibilityLabel={row.label}
                accessibilityState={row.toggle ? { checked: row.toggle.value } : undefined}
                disabled={!row.onPress && !row.toggle}
                onPress={row.toggle ? () => row.toggle?.onChange(!row.toggle.value) : row.onPress}
                style={({ pressed }) => [
                  styles.row,
                  index > 0 && styles.rowBorder,
                  pressed && (row.onPress || row.toggle) ? { backgroundColor: colors.surfaceAlt } : null,
                ]}
              >
                {row.leading ?? (
                  <Ionicons
                    name={row.icon}
                    size={21}
                    color={row.danger ? colors.danger : colors.text}
                  />
                )}
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, row.danger && { color: colors.danger }]}>
                    {row.label}
                  </Text>
                  {row.detail ? <Text style={styles.rowDetail}>{row.detail}</Text> : null}
                </View>
                {row.toggle ? (
                  <Toggle value={row.toggle.value} onChange={row.toggle.onChange} accessibilityLabel={row.label} />
                ) : (
                  <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
                )}
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      {!filtered.length ? <Text style={styles.empty}>Nothing matches “{search}”.</Text> : null}
      <Text style={styles.version}>CourtSide · early access</Text>
    </Screen>
  );
}

/** The Theme row's icon: the chosen theme's court, seen from above, the same badge the Theme page shows. */
function ThemeTile({ name }: { name: ThemeName }) {
  return <ThemeCourt name={name} size={28} />;
}

const styleDefinitions = StyleSheet.create({
  searchWrap: { paddingBottom: spacing.lg },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.xl,
  },
  accountName: { ...typography.bodyStrong, color: colors.text },
  accountHandle: { ...typography.small, color: colors.textFaint },
  section: { gap: spacing.sm, paddingBottom: spacing.xl },
  // Plain sentence-case headings, the way Instagram's settings read: no spaced-out letters.
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.textMuted, letterSpacing: 0, paddingHorizontal: 4 },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 52,
  },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { ...typography.body, color: colors.text },
  rowDetail: { ...typography.small, color: colors.textFaint },
  empty: { ...typography.small, color: colors.textFaint, paddingVertical: spacing.lg },
  version: { ...typography.caption, color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.xl },
});

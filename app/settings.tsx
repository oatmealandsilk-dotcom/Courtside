import React, { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, Field, Screen } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

interface Row {
  icon: keyof typeof Ionicons.glyphMap;
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
  const { currentUser, saved, actions } = useApp();
  const [search, setSearch] = useState('');
  const [privateAccount, setPrivateAccount] = useState(false);
  const [activityStatus, setActivityStatus] = useState(true);
  const [pushLikes, setPushLikes] = useState(true);
  const [pushCoach, setPushCoach] = useState(true);

  const savedCount = saved.postIds.length + saved.questionIds.length;

  const sections: { title: string; rows: Row[] }[] = [
    {
      title: 'Your app and media',
      rows: [
        {
          icon: 'bookmark-outline',
          label: 'Saved',
          detail: savedCount ? String(savedCount) : undefined,
          onPress: () => router.push('/saved'),
        },
        { icon: 'archive-outline', label: 'Archive' },
        { icon: 'time-outline', label: 'Your activity' },
        {
          icon: 'notifications-outline',
          label: 'Likes and comments',
          toggle: { value: pushLikes, onChange: setPushLikes },
        },
        {
          icon: 'megaphone-outline',
          label: 'Coach replies',
          toggle: { value: pushCoach, onChange: setPushCoach },
        },
      ],
    },
    {
      title: 'Who can see your content',
      rows: [
        {
          icon: 'lock-closed-outline',
          label: 'Private account',
          toggle: { value: privateAccount, onChange: setPrivateAccount },
        },
        {
          icon: 'ellipse-outline',
          label: 'Show activity status',
          toggle: { value: activityStatus, onChange: setActivityStatus },
        },
        { icon: 'close-circle-outline', label: 'Blocked' },
        { icon: 'eye-off-outline', label: 'Hidden words' },
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
        {
          icon: 'ribbon-outline',
          label: 'Apply to be a coach',
          onPress: () => router.push('/coach-apply'),
        },
      ],
    },
    {
      title: 'More info and support',
      rows: [
        { icon: 'help-circle-outline', label: 'Help' },
        { icon: 'shield-checkmark-outline', label: 'Privacy centre' },
        { icon: 'information-circle-outline', label: 'About' },
      ],
    },
    {
      title: 'Login',
      rows: [
        { icon: 'swap-horizontal-outline', label: 'Switch account', onPress: actions.signOut },
        { icon: 'log-out-outline', label: 'Log out', onPress: actions.signOut, danger: true },
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
    <Screen title="Settings" compactTitle onBack={() => router.back()}>
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
            <Text style={styles.accountName}>{currentUser.name}</Text>
            <Text style={styles.accountHandle}>@{currentUser.handle}</Text>
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
                disabled={!row.onPress && !row.toggle}
                onPress={row.toggle ? () => row.toggle?.onChange(!row.toggle.value) : row.onPress}
                style={({ pressed }) => [
                  styles.row,
                  index > 0 && styles.rowBorder,
                  pressed && row.onPress ? { backgroundColor: colors.surfaceAlt } : null,
                ]}
              >
                <Ionicons
                  name={row.icon}
                  size={21}
                  color={row.danger ? colors.danger : colors.text}
                />
                <Text style={[styles.rowLabel, row.danger && { color: colors.danger }]}>
                  {row.label}
                </Text>
                {row.detail ? <Text style={styles.rowDetail}>{row.detail}</Text> : null}
                {row.toggle ? (
                  <Switch
                    value={row.toggle.value}
                    onValueChange={row.toggle.onChange}
                    trackColor={{ true: colors.brand, false: colors.borderStrong }}
                    thumbColor={colors.bg}
                  />
                ) : (
                  <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
                )}
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      {!filtered.length ? <Text style={styles.empty}>Nothing matches “{search}”.</Text> : null}
      <Text style={styles.version}>CourtSide · demo build · mock data only</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  sectionTitle: { ...typography.caption, color: colors.textMuted, letterSpacing: 1.1 },
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
  rowLabel: { ...typography.body, color: colors.text, flex: 1 },
  rowDetail: { ...typography.small, color: colors.textFaint },
  empty: { ...typography.small, color: colors.textFaint, paddingVertical: spacing.lg },
  version: { ...typography.caption, color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.xl },
});

import { PlayerName } from '@/components/PlayerName';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, Field, Screen } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { useTheme, themeList, themes } from '@/theme/ThemeProvider';
import { Tappable } from '@/components/Tappable';
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
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, saved, defaultReaction, actions } = useApp();
  const { theme, setTheme } = useTheme();
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
        { icon: 'checkmark-done-outline', label: 'Read receipts', detail: 'Let people see when you read their messages', toggle: { value: currentUser?.readReceiptsEnabled !== false, onChange: actions.setReadReceiptsEnabled } },
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
            <PlayerName userId={currentUser.id} style={styles.accountName}>{currentUser.name}</PlayerName>
            <PlayerName userId={currentUser.id} style={styles.accountHandle}>@{currentUser.handle}</PlayerName>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Pressable>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Court</Text>
        <View style={styles.themeGrid}>
          {themeList.map((option) => {
            const palette = themes[option.name];
            const active = theme === option.name;
            return (
              <Pressable
                key={option.name}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${option.label} theme`}
                onPress={() => setTheme(option.name)}
                style={[styles.themeCard, active && styles.themeCardActive]}
              >
                <View style={[styles.swatch, { backgroundColor: palette.bg, borderColor: palette.border }]}>
                  <View style={[styles.swatchBar, { backgroundColor: palette.brand }]} />
                  <View style={[styles.swatchDot, { backgroundColor: palette.court }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.themeName}>{option.label}</Text>
                  <Text style={styles.themeBlurb}>{option.blurb}</Text>
                </View>
                {active ? <Ionicons name="checkmark-circle" size={19} color={colors.brand} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Double tap</Text>
        <View style={styles.card}>
          <View style={styles.reactionRow}>
            <Text style={styles.reactionHint}>Left on a message when you double tap it.</Text>
            <View style={styles.reactionKeys}>
              {['❤️', '😂', '🔥', '👏', '😮', '👍', '🎾'].map((emoji) => (
                <Tappable
                  key={emoji}
                  accessibilityLabel={`Use ${emoji} for double tap`}
                  accessibilityState={{ selected: defaultReaction === emoji }}
                  onPress={() => actions.setDefaultReaction(emoji)}
                  style={[styles.reactionKey, defaultReaction === emoji && styles.reactionKeyOn]}
                >
                  <Text style={{ fontSize: 21 }}>{emoji}</Text>
                </Tappable>
              ))}
            </View>
          </View>
        </View>
      </View>

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

const styleDefinitions = StyleSheet.create({
  reactionRow: { padding: spacing.md, gap: spacing.md },
  reactionHint: { ...typography.small, color: colors.textMuted },
  reactionKeys: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  reactionKey: {
    padding: 7,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceAlt,
  },
  reactionKeyOn: { borderColor: colors.brand, backgroundColor: colors.brandDim },
  themeGrid: { gap: 2 },
  themeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radius.md,
  },
  themeCardActive: { borderColor: colors.brand },
  swatch: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: 6,
    justifyContent: 'space-between',
  },
  swatchBar: { height: 5, borderRadius: 3 },
  swatchDot: { width: 11, height: 11, borderRadius: 6 },
  themeName: { ...typography.smallStrong, color: colors.text },
  themeBlurb: { ...typography.caption, color: colors.textFaint, letterSpacing: 0 },
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

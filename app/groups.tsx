import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Button, Screen } from '@/components/ui';
import { GroupTile } from '@/features/groups/GroupTile';
import { goBack } from '@/lib/goBack';
import { useApp } from '@/store/AppContext';
import { GROUPS_AGE_LINE, MAX_GROUPS, groupsOpenTo } from '@/store/feedGroups';
import { colors, font, lift, radius, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/*
 * Groups (migration 67): the ones you are in, the ones you asked to join,
 * and a button that opens a short sheet to start one (group-form). Reached
 * from the "+" at the end of the Feed's top row, and from Profile. Someone
 * not known to be an adult sees one calm line instead of Start (groups are
 * adults-only for now; the server holds the same rule).
 */

export default function Groups() {
  const styles = useThemedStyles(styleDefinitions);
  const { feedGroups, feedGroupsAsked, feedGroupsOn, currentUserId, currentUser, actions } = useApp();
  const open = groupsOpenTo(currentUser);
  useEffect(() => { if (currentUserId) void actions.loadFeedGroups(); }, [currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = feedGroups.length;
  const full = count >= MAX_GROUPS;
  const off = feedGroupsOn === false;

  return (
    <Screen title="Groups" compactTitle onBack={() => goBack()}>
      <Text style={styles.intro}>A feed of your own, only the group sees it.</Text>

      {off ? <Text style={styles.notice}>Groups aren’t switched on yet. Check back soon.</Text> : null}

      {!open ? (
        <View style={[styles.card, styles.ageCard]}>
          <View style={styles.ageIcon}><Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} /></View>
          <Text style={styles.ageLine}>{GROUPS_AGE_LINE}</Text>
        </View>
      ) : null}

      {open || count ? (
        <>
          <View style={styles.sectionRow}>
            <Text style={styles.section}>Your groups</Text>
          </View>
          {count === 0 ? (
            <View style={[styles.card, styles.emptyCard]}>
              <Ionicons name="people-outline" size={22} color={colors.textFaint} />
              <Text style={styles.emptyTitle}>You’re not in a group yet</Text>
              <Text style={styles.emptyBody}>Start one below, or open a group’s invite link.</Text>
            </View>
          ) : (
            <View style={styles.card}>
              {feedGroups.map((g, i) => {
                const admin = g.members.some((m) => m.id === currentUserId && m.admin);
                const asking = admin ? g.requests.length : 0;
                const members = `${g.members.length} ${g.members.length === 1 ? 'member' : 'members'}`;
                return (
                  <Pressable
                    key={g.id}
                    accessibilityRole="link"
                    accessibilityLabel={`${g.name}, ${members}${admin ? ', you’re the admin' : ''}${asking ? `, ${asking} asking to join` : ''}`}
                    onPress={() => router.push({ pathname: '/g/[id]', params: { id: g.id } })}
                    style={({ pressed }) => [styles.row, i > 0 && styles.line, pressed && styles.pressed]}
                  >
                    <GroupTile name={g.name} size={48} />
                    <View style={styles.words}>
                      <View style={styles.nameRow}>
                        <Text style={styles.name} numberOfLines={1}>{g.name}</Text>
                        {admin ? <View style={styles.chip}><Text style={styles.chipText}>Admin</Text></View> : null}
                      </View>
                      <Text style={styles.meta} numberOfLines={1}>
                        {members}
                        {asking ? <Text style={styles.metaOn}>{` · ${asking} asking to join`}</Text> : g.description ? ` · ${g.description}` : null}
                      </Text>
                    </View>
                    {asking ? <View style={styles.dot} /> : null}
                    <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                  </Pressable>
                );
              })}
            </View>
          )}
          {open ? <Text style={styles.footnote}>You can be in up to {MAX_GROUPS} groups · {count} of {MAX_GROUPS}</Text> : null}
        </>
      ) : null}

      {feedGroupsAsked.length ? (
        <>
          <Text style={[styles.section, styles.sectionAlone]}>Waiting for a yes</Text>
          <View style={styles.card}>
            {feedGroupsAsked.map((a, i) => (
              <View key={a.id} style={[styles.row, i > 0 && styles.line]}>
                <GroupTile name={a.name} size={40} />
                <View style={styles.words}>
                  <Text style={styles.name} numberOfLines={1}>{a.name}</Text>
                  <Text style={styles.meta}>Asked to join</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Cancel your request to join ${a.name}`}
                  hitSlop={8}
                  onPress={() => { void actions.leaveFeedGroup(a.id).catch(() => undefined); }}
                  style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
                >
                  <Text style={styles.pillText}>Cancel</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {open ? (
        <View style={styles.start}>
          <Button
            label="Start a group"
            onPress={() => router.push('/group-form')}
            disabled={full || off}
            full
          />
          {full ? <Text style={styles.startWhy}>You’re in {MAX_GROUPS} groups, the most anyone can be in. Leave one to start another.</Text> : null}
        </View>
      ) : null}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  intro: { ...typography.body, color: colors.textMuted, paddingHorizontal: spacing.xs },
  notice: { ...typography.small, color: colors.textMuted, lineHeight: 19, paddingHorizontal: spacing.xs, paddingTop: spacing.md },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: spacing.xs, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  section: { ...typography.smallStrong, color: colors.textMuted },
  sectionAlone: { paddingHorizontal: spacing.xs, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  // The grouped list of Settings: a shade off the page, rows on hairlines.
  card: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, minHeight: 72 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { backgroundColor: colors.surfaceAlt },
  words: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...typography.body, ...font('600'), color: colors.text, flexShrink: 1 },
  meta: { ...typography.small, color: colors.textMuted },
  metaOn: { color: colors.brand, ...font('600') },
  chip: { paddingHorizontal: 7, height: 20, borderRadius: radius.pill, backgroundColor: colors.brandDim, justifyContent: 'center' },
  chipText: { ...typography.caption, letterSpacing: 0.2, color: colors.brand },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  footnote: { ...typography.small, color: colors.textFaint, paddingHorizontal: spacing.xs, paddingTop: spacing.sm },
  emptyCard: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  emptyTitle: { ...typography.bodyStrong, color: colors.text, marginTop: spacing.xs },
  emptyBody: { ...typography.small, color: colors.textMuted, textAlign: 'center' },
  ageCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, marginTop: spacing.lg },
  ageIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  ageLine: { ...typography.body, color: colors.text, flex: 1 },
  // Cancel, beside a request: plain words in a soft pill, the way Remove is on a chat group.
  pill: { paddingHorizontal: 12, height: 30, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  pillPressed: { opacity: 0.6 },
  pillText: { ...typography.smallStrong, color: colors.text },
  start: { marginTop: spacing.xl, gap: spacing.sm },
  startWhy: { ...typography.small, color: colors.textMuted, textAlign: 'center', lineHeight: 19, paddingHorizontal: spacing.lg },
});

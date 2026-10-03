import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Tappable } from '@/components/Tappable';
import type { FeedGroupCard, ID } from '@/data/types';
import { GroupTile } from '@/features/groups/GroupTile';
import { useApp } from '@/store/AppContext';
import { colors, font, radius, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/*
 * A group invite in a chat (Start a group's last step sends one to each
 * person picked; it is a plain message with the group's link, see
 * inviteMessage): the group's face, its name, how many are in it and how it
 * is joined, and a button-like line. The whole card always opens the group's
 * page (/g/<id>), which says itself if the group has gone. What a group
 * looks like is asked once per group while the app is open
 * (feed_group_card), so a chat full of invites asks once; a group that isn't
 * there is remembered, a request that didn't go through (no connection) is
 * not, so the next showing asks again. Until it comes the card says what the
 * message's own words say.
 */

const known = new Map<ID, FeedGroupCard | null>();

export function GroupInviteCard({ groupId, name: named, sentAt, onLongPress }: { groupId: ID; name: string; sentAt: string; onLongPress?: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const { feedGroups, actions } = useApp();
  const mine = feedGroups.find((g) => g.id === groupId);
  const [card, setCard] = useState<FeedGroupCard | null | undefined>(() => known.get(groupId));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (mine || known.has(groupId)) return undefined;
    let live = true;
    actions.feedGroupCard(groupId).then(
      (c) => { known.set(groupId, c); if (live) { setCard(c); setFailed(false); } },
      () => { if (live) setFailed(true); },
    );
    return () => { live = false; };
  }, [groupId, mine]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = mine?.name ?? card?.name ?? named;
  const look = mine?.look ?? card?.look;
  const count = mine ? mine.members.length : card?.memberCount;
  const gone = card === null && !mine;
  const meta = gone ? 'This group isn’t here any more'
    : count === undefined ? (failed ? 'Group · tap to open' : 'Group')
    : `${count} ${count === 1 ? 'member' : 'members'} · ${(mine?.ask ?? card?.ask) ? 'Ask to join' : 'Open'}`;
  const cta = mine ? 'Open group' : card?.requested ? 'Asked to join' : 'View group';
  return (
    <Tappable
      accessibilityRole="link"
      accessibilityLabel={`Group invite: ${name}, ${meta}, sent ${sentAt}`}
      scaleTo={0.97}
      onLongPress={onLongPress}
      onPress={() => router.push({ pathname: '/g/[id]', params: { id: groupId } })}
      style={styles.card}
    >
      <Text style={styles.kind}>GROUP INVITE</Text>
      <View style={styles.row}>
        <View style={gone && styles.dim}><GroupTile name={name} look={look} size={44} /></View>
        <View style={styles.words}>
          <Text style={styles.name} numberOfLines={2}>{name}</Text>
          <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
        </View>
      </View>
      {gone ? null : (
        <View style={styles.cta}>
          <Text style={styles.ctaText}>{cta}</Text>
        </View>
      )}
    </Tappable>
  );
}

const styleDefinitions = StyleSheet.create({
  card: {
    width: 248,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  kind: { ...typography.caption, color: colors.brand },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  words: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.small, color: colors.textMuted },
  cta: { height: 34, borderRadius: radius.pill, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  ctaText: { ...typography.smallStrong, ...font('600'), color: colors.brand },
  dim: { opacity: 0.5 },
});

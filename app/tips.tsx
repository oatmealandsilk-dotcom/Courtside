import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { goBack } from '@/lib/goBack';

import { Avatar, EmptyState, Screen } from '@/components/ui';
import { VoteControls } from '@/components/VoteControls';
import { RichText } from '@/components/RichText';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/** Every tip from early users, most wanted first. Votes only, no replies. */
export default function Tips() {
  const styles = useThemedStyles(styleDefinitions);
  const { tips, users, currentUserId, actions } = useApp();
  const list = [...tips].sort((a, b) => (b.votes - a.votes) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return (
    <Screen title="Tips" subtitle="What early users want. Vote up the ones you agree with." compactTitle onBack={() => goBack()}>
      {list.length === 0 ? (
        <EmptyState icon="bulb-outline" title="No tips yet" body="The first one is on the Home feed, a few swipes in." />
      ) : list.map((tip) => {
        const author = users.find((u) => u.id === tip.authorId);
        return (
          <View key={tip.id} style={styles.card}>
            <View style={styles.head}>
              <Avatar name={author?.name ?? '?'} seed={author?.avatarSeed ?? tip.id} uri={author?.avatarUrl} size={30} />
              <PlayerName userId={author?.id} style={styles.name}>{author?.name ?? 'Player'}</PlayerName>
              <Text style={styles.time}>{relativeTime(tip.createdAt)}</Text>
            </View>
            <RichText style={styles.body}>{tip.body}</RichText>
            <VoteControls item={tip} userId={currentUserId} onVote={(d) => actions.voteTip(tip.id, d)} />
          </View>
        );
      })}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...typography.smallStrong, color: colors.text, flex: 1 },
  time: { ...typography.caption, color: colors.textFaint },
  body: { ...typography.body, color: colors.text, lineHeight: 22 },
});

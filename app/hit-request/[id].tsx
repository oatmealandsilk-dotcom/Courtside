import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { HitCard } from '@/components/HitCard';
import { HitGlyph } from '@/components/HitGlyph';
import { LevelPill } from '@/components/LevelPill';
import { Avatar, EmptyState, Screen } from '@/components/ui';
import type { HitRequest } from '@/data/types';
import { joinedCount } from '@/features/hits/audience';
import { goBack } from '@/lib/goBack';
import { useStillLoading } from '@/lib/useStillLoading';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography } from '@/theme';
import { publicRoute } from '@/features/share/publicRoute';

/**
 * One hit on its own page, for a notification ("Mira is in for your hit") to
 * land on. Opened cold (a push for a hit this phone hasn't loaded yet), it
 * waits for the account's data before saying the hit is over. Under the card,
 * who's in by name (Oct 7, audit item 12): whoever posted it, then everyone
 * who joined, each opening their profile.
 */
function HitRequestPage() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { hitRequests } = useApp();
  const loading = useStillLoading();
  const hit = hitRequests.find((h) => h.id === id);
  return (
    <Screen title="Hit" compactTitle onBack={() => goBack('/discuss')}>
      {hit ? (
        <View style={{ paddingTop: 4, gap: spacing.xl }}>
          <HitCard hit={hit} linked={false} />
          <WhosIn hit={hit} />
        </View>
      ) : loading ? <View style={{ paddingVertical: 60, alignItems: 'center' }}><CourtSpinner size={28} /></View> : <EmptyState glyph={<HitGlyph size={28} color={colors.textFaint} />} title="This hit is over" body="It has been played, or called off." />}
    </Screen>
  );
}

/**
 * Who's in, as rows on hairlines: the poster, then each player in it. Only
 * the people this account is shown (joinedIds); anyone else in it (a teen
 * who joined, to someone they do not follow: hiddenJoins) is counted, never
 * named. Spots still open close the list.
 */
function WhosIn({ hit }: { hit: HitRequest }) {
  const styles = useThemedStyles(styleDefinitions);
  const { users, currentUserId } = useApp();
  const author = users.find((u) => u.id === hit.authorId);
  const joined = hit.joinedIds.map((uid) => users.find((u) => u.id === uid)).filter((u): u is NonNullable<typeof u> => !!u);
  const total = joinedCount(hit);
  const unnamed = Math.max(0, total - joined.length);
  const left = Math.max(0, hit.spots - total);
  const rows = [...(author ? [{ user: author, role: 'Posted the hit' }] : []), ...joined.map((user) => ({ user, role: 'In' }))];
  if (!rows.length) return null;
  return (
    <View>
      <Text accessibilityRole="header" style={styles.title}>Who’s in</Text>
      {rows.map(({ user, role }, index) => {
        const you = user.id === currentUserId;
        return (
          <Pressable key={user.id} accessibilityRole={you ? undefined : 'link'} accessibilityLabel={you ? undefined : `${user.name}. Open profile`} disabled={you} onPress={() => router.push(`/user/${user.id}`)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
            <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={40} />
            <View style={[styles.rowBody, index > 0 && styles.rowLine]}>
              <View style={styles.rowWords}>
                {/* The name with its level, the way Near you lists players: tennis context with the person. */}
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>{you ? 'You' : user.name}</Text>
                  <LevelPill profile={user.profile} small />
                </View>
                {/* Every row two lines, so they line up: the poster's role, a player's handle, or that you're in. */}
                <Text style={styles.meta} numberOfLines={1}>{role !== 'In' ? role : you ? 'You’re in' : `@${user.handle}`}</Text>
              </View>
              {you ? null : <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />}
            </View>
          </Pressable>
        );
      })}
      {unnamed || left ? (
        <Text style={styles.foot}>
          {[unnamed ? `and ${unnamed} more ${unnamed === 1 ? 'player' : 'players'}` : null, left ? `${left} ${left === 1 ? 'spot' : 'spots'} still open` : null].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  title: { ...typography.heading, color: colors.text, marginBottom: spacing.xs },
  // Rows on hairlines, the line starting at the words.
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowPressed: { opacity: 0.6 },
  rowBody: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 14 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowWords: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { ...typography.body, ...font('500'), fontSize: 16, color: colors.text, flexShrink: 1 },
  meta: { ...typography.small, color: colors.textMuted },
  foot: { ...typography.small, color: colors.textMuted, paddingTop: spacing.sm },
});

// A link shared outside the app opens here for anyone; signed out, it shows the public look (see SharedPage).
export default publicRoute('hit-request', HitRequestPage);

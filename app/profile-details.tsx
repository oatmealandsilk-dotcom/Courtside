import { PlayerName } from '@/components/PlayerName';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { AchievementGrid } from '@/components/AchievementGrid';
import { LevelPill } from '@/components/LevelPill';
import { Avatar, Button, Card, Meter, Screen, StatTile } from '@/components/ui';
import { evaluateAchievements, fitnessLabel, levelBadge, playStyleLabel, surfaceLabel, winRate } from '@/lib/badges';
import { formatDate } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * The tennis side of a player — yours, or anyone's from their profile: rating
 * ladder, the numbers, how they play, goals, what the coach works around,
 * tournaments, achievements. Their posts live on the profile grid, not here.
 */
export default function Profile() {
  const styles = useThemedStyles(styleDefinitions);
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const { currentUser, users, actions } = useApp();
  const user = userId ? users.find((u) => u.id === userId) ?? null : currentUser;
  const isMe = !!user && user.id === currentUser?.id;

  if (!user) {
    return (
      <Screen title="Game" compactTitle onBack={() => goBack()}>
        <ActivityIndicator color={colors.brand} />
      </Screen>
    );
  }

  const profile = user.profile;
  const badge = levelBadge(profile);
  const achievements = evaluateAchievements(user);
  const unlocked = achievements.filter((a) => a.unlocked);
  const first = user.name.split(' ')[0];

  return (
    <Screen
      title={isMe ? 'Your game' : `${first}'s game`}
      compactTitle
      onBack={() => goBack()}
      right={isMe ? <Button label="Sign out" variant="ghost" onPress={() => { actions.signOut(); router.replace('/sign-in'); }} /> : undefined}
    >
      <Card style={styles.identity}>
        <View style={styles.identityRow}>
          <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={56} ring={user.isCoach} />
          <View style={styles.identityText}>
            <PlayerName userId={user.id} style={styles.name}>{user.name}</PlayerName>
            <Text style={styles.handle}>@{user.handle}{user.location ? ` · ${user.location}` : ''} · joined {formatDate(user.joinedAt)}</Text>
          </View>
          <LevelPill profile={profile} />
        </View>
        <Meter
          label="Rating ladder"
          value={badge.progress}
          caption={badge.label}
          tint={badge.tint}
        />
      </Card>

      <View style={styles.tileRow}>
        <View style={styles.tileHalf}><StatTile label="Sessions" value={String(user.stats.sessionsLogged)} /></View>
        <View style={styles.tileHalf}><StatTile label="Hours" value={String(user.stats.hoursOnCourt)} hint="on court" /></View>
        <View style={styles.tileHalf}><StatTile label="Win rate" value={`${winRate(user.stats)}%`} hint={`${user.stats.matchesWon}/${user.stats.matchesPlayed}`} /></View>
        <View style={styles.tileHalf}><StatTile label="Streak" value={`${user.stats.currentStreakDays}d`} hint={`best ${user.stats.longestStreakDays}d`} tint={colors.brand} /></View>
      </View>

      <Section title="HOW THEY PLAY" me={isMe} mine="HOW YOU PLAY">
        <Card style={styles.gameCard}>
          <Detail label="Play style" value={playStyleLabel[profile.playStyle]} />
          <Detail label="Fitness" value={fitnessLabel[profile.fitnessLevel]} />
          <Detail
            label="Hands"
            value={`${profile.handedness === 'right' ? 'Right' : 'Left'}-handed · ${profile.backhand === 'one-handed' ? 'one' : 'two'}-handed backhand`}
          />
          <Detail label="Surface" value={surfaceLabel[profile.preferredSurface]} />
          <Detail label="Availability" value={`${profile.sessionsPerWeek} sessions a week`} />
          <Detail label="Experience" value={`${profile.yearsPlaying} years playing`} />
        </Card>
      </Section>

      <Section title="GOALS">
        <Card style={styles.listCard}>
          {profile.goals.length === 0 ? (
            <Text style={styles.muted}>No goals set yet.</Text>
          ) : (
            profile.goals.map((goal) => (
              <View key={goal.id} style={styles.goalRow}>
                <Ionicons
                  name={goal.done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={17}
                  color={goal.done ? colors.court : colors.textFaint}
                />
                <Text style={styles.goalText}>{goal.label}</Text>
                {goal.targetDate ? (
                  <Text style={styles.goalDate}>{formatDate(goal.targetDate)}</Text>
                ) : null}
              </View>
            ))
          )}
        </Card>
      </Section>

      {profile.constraints.length > 0 ? (
        <Section title="THE COACH WORKS AROUND">
          <Card style={styles.listCard}>
            {profile.constraints.map((c) => (
              <View key={c.id} style={styles.constraintRow}>
                <View style={styles.constraintHead}>
                  <Ionicons
                    name={c.kind === 'injury' ? 'medkit-outline' : 'calendar-outline'}
                    size={15}
                    color={c.kind === 'injury' ? colors.danger : colors.hard}
                  />
                  <Text style={styles.constraintLabel}>{c.label}</Text>
                </View>
                {c.note ? <Text style={styles.constraintNote}>{c.note}</Text> : null}
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      {profile.tournaments.length > 0 ? (
        <Section title="TOURNAMENTS">
          <Card style={styles.listCard}>
            {profile.tournaments.map((t) => (
              <View key={t.id} style={styles.tournamentRow}>
                <View style={styles.tournamentText}>
                  <Text style={styles.tournamentName}>{t.name}</Text>
                  <Text style={styles.tournamentMeta}>
                    {formatDate(t.startsAt)} · {t.surface} · {t.location}
                  </Text>
                </View>
                <View style={[styles.regBadge, t.registered && { borderColor: colors.court }]}>
                  <Text style={[styles.regText, t.registered && { color: colors.court }]}>
                    {t.registered ? 'ENTERED' : 'WATCHING'}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      <Section title={`ACHIEVEMENTS · ${unlocked.length}/${achievements.length}`}>
        <AchievementGrid items={achievements} />
      </Section>
    </Screen>
  );
}

function Section({ title, mine, me, children }: { title: string; mine?: string; me?: boolean; children: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{me && mine ? mine : title}</Text>
      {children}
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  identity: { gap: spacing.md },
  identityRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  identityText: { flex: 1, gap: 3 },
  name: { ...typography.heading, color: colors.text },
  handle: { ...typography.small, color: colors.textFaint },
  pillRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', paddingTop: 2 },
  bio: { ...typography.small, color: colors.textMuted, lineHeight: 20 },
  followRow: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
  followText: { ...typography.small, color: colors.textFaint },
  followCount: { color: colors.text, fontWeight: '700' },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingVertical: spacing.lg },
  tileHalf: { width: '48%', flexGrow: 1 },
  section: { gap: spacing.sm, paddingBottom: spacing.xl },
  // Quiet eyebrow titles, the way the profile's own cards are labelled.
  sectionTitle: { ...typography.caption, color: colors.textMuted, letterSpacing: 1.2, paddingLeft: 2 },
  gameCard: { gap: 0, paddingVertical: spacing.xs },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  detailLabel: { ...typography.small, color: colors.textMuted },
  detailValue: { ...typography.smallStrong, color: colors.text, flexShrink: 1, textAlign: 'right' },
  listCard: { gap: spacing.md },
  muted: { ...typography.small, color: colors.textFaint },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  goalText: { ...typography.small, color: colors.text, flex: 1, lineHeight: 20 },
  goalDate: { ...typography.caption, color: colors.textFaint },
  constraintRow: { gap: 3 },
  constraintHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  constraintLabel: { ...typography.smallStrong, color: colors.text },
  constraintNote: { ...typography.small, color: colors.textMuted, lineHeight: 19, paddingLeft: 21 },
  tournamentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tournamentText: { flex: 1, gap: 2 },
  tournamentName: { ...typography.smallStrong, color: colors.text },
  tournamentMeta: { ...typography.small, color: colors.textFaint },
  regBadge: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  regText: { ...typography.caption, color: colors.textFaint },
});

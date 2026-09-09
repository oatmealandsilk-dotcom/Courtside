import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AchievementGrid } from '@/components/AchievementGrid';
import { LevelPill } from '@/components/LevelPill';
import { PostCard } from '@/components/PostCard';
import { Avatar, Button, Card, Chip, Meter, Screen, StatTile } from '@/components/ui';
import { evaluateAchievements, fitnessLabel, levelBadge, playStyleLabel, surfaceLabel, winRate } from '@/lib/badges';
import { compactNumber, formatDate } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

export default function Profile() {
  const { currentUser, posts, currentUserId, actions } = useApp();

  if (!currentUser) {
    return (
      <Screen title="Profile">
        <ActivityIndicator color={colors.brand} />
      </Screen>
    );
  }

  const profile = currentUser.profile;
  const badge = levelBadge(profile);
  const achievements = evaluateAchievements(currentUser);
  const unlocked = achievements.filter((a) => a.unlocked);
  const myPosts = posts
    .filter((p) => p.authorId === currentUser.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <Screen
      title="Profile"
      right={<Button label="Sign out" variant="ghost" onPress={actions.signOut} />}
    >
      <Card style={styles.identity}>
        <View style={styles.identityRow}>
          <Avatar name={currentUser.name} seed={currentUser.avatarSeed} size={64} ring />
          <View style={styles.identityText}>
            <Text style={styles.name}>{currentUser.name}</Text>
            <Text style={styles.handle}>@{currentUser.handle} · {currentUser.location}</Text>
            <View style={styles.pillRow}>
              <LevelPill profile={profile} />
              <Chip label={playStyleLabel[profile.playStyle]} small />
            </View>
          </View>
        </View>
        <Text style={styles.bio}>{currentUser.bio}</Text>
        <View style={styles.followRow}>
          <Text style={styles.followText}>
            <Text style={styles.followCount}>{compactNumber(currentUser.followers)}</Text> followers
          </Text>
          <Text style={styles.followText}>
            <Text style={styles.followCount}>{compactNumber(currentUser.following)}</Text> following
          </Text>
          <Text style={styles.followText}>Joined {formatDate(currentUser.joinedAt)}</Text>
        </View>
        <Meter
          label="Rating ladder"
          value={badge.progress}
          caption={badge.label}
          tint={badge.tint}
        />
      </Card>

      <View style={styles.tileRow}>
        <StatTile label="Sessions" value={String(currentUser.stats.sessionsLogged)} />
        <StatTile label="Hours" value={String(currentUser.stats.hoursOnCourt)} hint="on court" />
        <StatTile
          label="Win rate"
          value={`${winRate(currentUser.stats)}%`}
          hint={`${currentUser.stats.matchesWon}/${currentUser.stats.matchesPlayed}`}
        />
        <StatTile
          label="Streak"
          value={`${currentUser.stats.currentStreakDays}d`}
          hint={`best ${currentUser.stats.longestStreakDays}d`}
          tint={colors.brand}
        />
      </View>

      <Section title="Your game">
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

      <Section title="Goals">
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
        <Section title="Constraints the coach respects">
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
        <Section title="Tournament calendar">
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

      <Section title={`Achievements · ${unlocked.length}/${achievements.length}`}>
        <AchievementGrid items={achievements} />
      </Section>

      <Section title="Your posts">
        {myPosts.length === 0 ? (
          <Text style={styles.muted}>Nothing posted yet.</Text>
        ) : (
          <View style={styles.postList}>
            {myPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                author={currentUser}
                liked={Boolean(currentUserId && post.likedBy.includes(currentUserId))}
                onToggleLike={() => actions.toggleLike(post.id)}
                onPress={() => router.push(`/post/${post.id}`)}
              />
            ))}
          </View>
        )}
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  identity: { gap: spacing.md },
  identityRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  identityText: { flex: 1, gap: 4 },
  name: { ...typography.title, color: colors.text },
  handle: { ...typography.small, color: colors.textFaint },
  pillRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', paddingTop: 2 },
  bio: { ...typography.small, color: colors.textMuted, lineHeight: 20 },
  followRow: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
  followText: { ...typography.small, color: colors.textFaint },
  followCount: { color: colors.text, fontWeight: '700' },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingVertical: spacing.lg },
  section: { gap: spacing.md, paddingBottom: spacing.xl },
  sectionTitle: { ...typography.heading, color: colors.text },
  gameCard: { gap: spacing.sm },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  detailLabel: { ...typography.small, color: colors.textFaint },
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
  postList: { gap: spacing.lg },
});

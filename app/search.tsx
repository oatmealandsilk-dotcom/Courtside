import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { LevelPill } from '@/components/LevelPill';
import { QuestionCard } from '@/components/QuestionCard';
import { Avatar, EmptyState, Field, Screen, SegmentedControl } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';

type Scope = 'all' | 'threads' | 'players' | 'coaches';

/** One search box across discussions, players, and coaches. */
export default function Search() {
  const { questions, users, coaches, currentUserId, saved, actions } = useApp();
  const [term, setTerm] = useState('');
  const [scope, setScope] = useState<Scope>('all');

  const q = term.trim().toLowerCase();

  const matchedQuestions = useMemo(
    () =>
      !q
        ? []
        : questions.filter((question) =>
            `${question.title} ${question.body} ${question.topic} ${question.tags.join(' ')}`
              .toLowerCase()
              .includes(q),
          ),
    [questions, q],
  );

  const matchedPlayers = useMemo(
    () =>
      !q
        ? []
        : users.filter(
            (user) =>
              user.id !== currentUserId &&
              `${user.name} ${user.handle} ${user.location} ${user.bio}`.toLowerCase().includes(q),
          ),
    [users, currentUserId, q],
  );

  const matchedCoaches = useMemo(
    () =>
      !q
        ? []
        : coaches.filter((coach) => {
            const user = users.find((u) => u.id === coach.userId);
            return `${user?.name ?? ''} ${coach.headline} ${coach.specialties.join(' ')} ${coach.credentials.join(' ')}`
              .toLowerCase()
              .includes(q);
          }),
    [coaches, users, q],
  );

  const showThreads = scope === 'all' || scope === 'threads';
  const showPlayers = scope === 'all' || scope === 'players';
  const showCoaches = scope === 'all' || scope === 'coaches';
  const total =
    (showThreads ? matchedQuestions.length : 0) +
    (showPlayers ? matchedPlayers.length : 0) +
    (showCoaches ? matchedCoaches.length : 0);

  return (
    <Screen title="Search" compactTitle onBack={() => router.back()}>
      <View style={styles.top}>
        <Field
          value={term}
          onChangeText={setTerm}
          placeholder="Threads, players, coaches, gear…"
          autoCapitalize="none"
        />
        <SegmentedControl
          segments={[
            { value: 'all', label: 'All' },
            { value: 'threads', label: 'Threads' },
            { value: 'players', label: 'Players' },
            { value: 'coaches', label: 'Coaches' },
          ]}
          value={scope}
          onChange={setScope}
        />
      </View>

      {!q ? (
        <EmptyState
          icon="search-outline"
          title="Search CourtSide"
          body="Find a thread about strings, a player near you, or a coach who fixes serves."
        />
      ) : total === 0 ? (
        <EmptyState icon="search-outline" title={`No results for “${term}”`} body="Try a different word." />
      ) : (
        <View style={{ gap: spacing.xl }}>
          {showPlayers && matchedPlayers.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>PLAYERS</Text>
              {matchedPlayers.map((user) => (
                <Pressable
                  key={user.id}
                  accessibilityRole="link"
                  onPress={() => router.push(`/user/${user.id}`)}
                  style={styles.person}
                >
                  <Avatar name={user.name} seed={user.avatarSeed} size={44} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.name}>{user.name}</Text>
                    <Text style={styles.meta}>
                      @{user.handle} · {user.location}
                    </Text>
                  </View>
                  <LevelPill profile={user.profile} small />
                </Pressable>
              ))}
            </View>
          ) : null}

          {showCoaches && matchedCoaches.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>COACHES</Text>
              {matchedCoaches.map((coach) => {
                const user = users.find((u) => u.id === coach.userId);
                return (
                  <Pressable
                    key={coach.id}
                    accessibilityRole="link"
                    onPress={() => router.push(`/coach/${coach.id}`)}
                    style={styles.person}
                  >
                    <Avatar
                      name={user?.name ?? 'Coach'}
                      seed={coach.id}
                      size={44}
                      style={{ backgroundColor: colors.borderStrong }}
                    />
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={styles.nameRow}>
                        <Text style={styles.name}>{user?.name}</Text>
                        <Ionicons name="shield-checkmark" size={14} color={colors.brand} />
                      </View>
                      <Text style={styles.meta} numberOfLines={1}>
                        {coach.headline}
                      </Text>
                    </View>
                    <Text style={styles.rating}>★ {coach.ratingAvg.toFixed(1)}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {showThreads && matchedQuestions.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>DISCUSSIONS</Text>
              {matchedQuestions.map((question) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  author={users.find((u) => u.id === question.authorId)}
                  answered={Boolean(question.acceptedAnswerId)}
                  saved={saved.questionIds.includes(question.id)}
                  onToggleSave={() => actions.toggleSaveQuestion(question.id)}
                  onShare={() => router.push(`/share?kind=question&id=${question.id}`)}
                  onPress={() => router.push(`/question/${question.id}`)}
                />
              ))}
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: spacing.md, paddingBottom: spacing.lg },
  section: { gap: spacing.xs },
  sectionTitle: { ...typography.caption, color: colors.textMuted, letterSpacing: 1.3, paddingBottom: spacing.sm },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.small, color: colors.textFaint },
  rating: { ...typography.smallStrong, color: colors.warning },
});

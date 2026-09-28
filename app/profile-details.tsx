import { PlayerName } from '@/components/PlayerName';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CourtSpinner } from '@/components/CourtSpinner';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AchievementGrid } from '@/components/AchievementGrid';
import { LevelPill } from '@/components/LevelPill';
import { Avatar, EmptyState, Meter, Screen } from '@/components/ui';
import { evaluateAchievements, fitnessLabel, levelBadge, playStyleLabel, surfaceLabel, winRate } from '@/lib/badges';
import { formatDate } from '@/lib/format';
import { confirmAction } from '@/lib/confirm';
import { localDay } from '@/features/practice/stats';
import { CourtGlyph } from '@/components/map/MapChrome';
import { useStillLoading } from '@/lib/useStillLoading';
import { useApp } from '@/store/AppContext';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

/**
 * The tennis side of a player, yours or anyone's: where they sit on the
 * rating ladder, how they play, goals, what the coach works around,
 * tournaments. Numbers and badges appear once there is something real to
 * show; a row of zeros reads as broken, not as new. Calm grouped lists,
 * the way Settings reads.
 */
export default function Profile() {
  const styles = useThemedStyles(styleDefinitions);
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const { currentUser, users, sessions, actions } = useApp();
  const loading = useStillLoading();
  const user = userId ? users.find((u) => u.id === userId) ?? null : currentUser;
  const isMe = !!user && user.id === currentUser?.id;

  if (!user) {
    return (
      <Screen title="Game" compactTitle onBack={() => goBack()}>
        {loading ? <View style={styles.wait}><CourtSpinner size={28} /></View> : <EmptyState icon="person-outline" title="No such player" />}
      </Screen>
    );
  }

  const profile = user.profile;
  const gear = profile?.gear;
  const gearRows = ([
    gear?.racket ? ['Racket', gear.racket] : null,
    gear?.strings ? ['Strings', gear.strings] : null,
    gear?.tension ? ['Tension', gear.tension] : null,
    gear?.shoes ? ['Shoes', gear.shoes] : null,
  ].filter(Boolean) as [string, string][]);
  const badge = levelBadge(profile);
  const achievements = evaluateAchievements(user);
  const unlocked = achievements.filter((a) => a.unlocked);
  const first = user.name.split(' ')[0];
  const s = user.stats;
  const recent = isMe ? [...sessions].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : b.createdAt.localeCompare(a.createdAt))).slice(0, 5) : [];
  const hasStats = s.sessionsLogged > 0 || s.hoursOnCourt > 0 || s.matchesPlayed > 0 || s.currentStreakDays > 0;

  return (
    <Screen title={isMe ? 'Your game' : `${first}’s game`} compactTitle onBack={() => goBack()}
      right={isMe ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Edit your game" hitSlop={10} onPress={() => router.push({ pathname: '/onboarding', params: { from: 'edit', step: '0' } })} style={styles.edit}>
          <Text style={styles.editText}>Edit</Text>
        </Pressable>
      ) : undefined}>
      <View style={styles.identityRow}>
        <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={56} ring={user.isCoach} />
        <View style={styles.identityText}>
          <PlayerName userId={user.id} style={styles.name}>{user.name}</PlayerName>
          <Text style={styles.handle}>@{user.handle}{user.location ? ` · ${user.location}` : ''} · joined {formatDate(user.joinedAt)}</Text>
        </View>
        <LevelPill profile={profile} />
      </View>

      <View style={[styles.group, styles.ladder]}>
        <Meter label="Rating ladder" value={badge.progress} caption={badge.label} tint={badge.tint} />
      </View>

      {/* Your own log: two taps to add today's session; it is what the numbers below are made of. */}
      {isMe ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/log-session')} style={({ pressed }) => [styles.logButton, pressed && { opacity: 0.85 }]}>
          <Ionicons name="add-circle" size={20} color={colors.brandInk} />
          <Text style={styles.logText}>Log a session</Text>
        </Pressable>
      ) : null}

      {hasStats ? (
        <View style={[styles.group, styles.stats]}>
          <Stat label="Sessions" value={String(s.sessionsLogged)} />
          <Stat label="Hours" value={String(s.hoursOnCourt)} />
          <Stat label="Win rate" value={s.matchesPlayed ? `${winRate(s)}%` : '—'} />
          <Stat label="Streak" value={`${s.currentStreakDays}d`} tint={colors.brand} />
        </View>
      ) : null}

      {isMe && recent.length ? (
        <>
          <Text style={styles.sectionTitle}>Recent sessions</Text>
          <View style={styles.group}>
            {recent.map((s, index) => (
              <View key={s.id} style={[styles.row, index > 0 && styles.line]}>
                {s.kind === 'match' ? <Ionicons name="trophy-outline" size={17} color={colors.textMuted} /> : s.kind === 'fitness' ? <Ionicons name="barbell-outline" size={17} color={colors.textMuted} /> : <CourtGlyph size={14} color={colors.textMuted} />}
                <Text style={styles.rowText}>{SESSION_KIND[s.kind]}{s.kind === 'match' && s.won !== undefined ? (s.won ? ' · won' : ' · lost') : ''}{s.opponent ? ` vs ${s.opponent}` : ''} · {s.minutes < 60 ? `${s.minutes} min` : `${Math.round(s.minutes / 6) / 10} hr`}</Text>
                <Text style={styles.rowMeta}>{dayLabel(s.day)}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Remove this session" hitSlop={8} onPress={() => confirmAction('Remove this session?', 'It comes off your streak and totals.', 'Remove', () => actions.deleteSession(s.id))}>
                  <Ionicons name="close" size={16} color={colors.textFaint} />
                </Pressable>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <Text style={styles.sectionTitle}>{isMe ? 'How you play' : 'How they play'}</Text>
      <View style={styles.group}>
        <Detail label="Play style" value={playStyleLabel[profile.playStyle]} />
        <Detail line label="Fitness" value={fitnessLabel[profile.fitnessLevel]} />
        <Detail line label="Hands" value={`${profile.handedness === 'right' ? 'Right' : 'Left'}-handed · ${profile.backhand === 'one-handed' ? 'one' : 'two'}-handed backhand`} />
        <Detail line label="Surface" value={surfaceLabel[profile.preferredSurface]} />
        {profile.sessionsPerWeek !== undefined ? <Detail line label="Plays" value={`${profile.sessionsPerWeek} times a week`} /> : null}
        {profile.yearsPlaying !== undefined ? <Detail line label="Experience" value={`${profile.yearsPlaying} years`} /> : null}
      </View>

      {/* The gear bag: what they play with, one of the first things players ask each other. */}
      {gearRows.length || isMe ? (
        <>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { flex: 1 }]}>Gear bag</Text>
            {isMe && gearRows.length ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Edit your gear" hitSlop={10} onPress={() => router.push('/edit-gear')}>
                <Text style={styles.sectionLink}>Edit</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.group}>
            {gearRows.length ? gearRows.map(([label, value], i) => <Detail key={label} line={i > 0} label={label} value={value} />) : (
              <Pressable accessibilityRole="button" onPress={() => router.push('/edit-gear')} style={({ pressed }) => [styles.row, styles.addGear, pressed && { opacity: 0.7 }]}>
                <Ionicons name="add-circle-outline" size={18} color={colors.brand} />
                <Text style={styles.addGearText}>Add your racket, strings and shoes</Text>
              </Pressable>
            )}
          </View>
        </>
      ) : null}

      <Text style={styles.sectionTitle}>Goals</Text>
      <View style={styles.group}>
        {profile.goals.length === 0 ? (
          <Text style={styles.muted}>{isMe ? 'No goals yet. Tap Edit to add one.' : 'No goals shared.'}</Text>
        ) : (
          profile.goals.map((goal, index) => (
            <View key={goal.id} style={[styles.row, index > 0 && styles.line]}>
              <Ionicons name={goal.done ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={goal.done ? colors.brand : colors.textFaint} />
              <Text style={styles.rowText}>{goal.label}</Text>
              {goal.targetDate ? <Text style={styles.rowMeta}>{formatDate(goal.targetDate)}</Text> : null}
            </View>
          ))
        )}
      </View>

      {/* Injuries, schedule and gear notes are private: only their owner ever sees this section. */}
      {isMe && profile.constraints.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>The coach works around</Text>
          <View style={styles.group}>
            {profile.constraints.map((c, index) => (
              <View key={c.id} style={[styles.rowTall, index > 0 && styles.line]}>
                <View style={styles.rowHead}>
                  <Ionicons name={c.kind === 'injury' ? 'medkit-outline' : 'calendar-outline'} size={16} color={c.kind === 'injury' ? colors.danger : colors.textMuted} />
                  <Text style={styles.rowStrong}>{c.label}</Text>
                </View>
                {c.note ? <Text style={styles.note}>{c.note}</Text> : null}
              </View>
            ))}
          </View>
          <Text style={styles.fine}>Only you see this.</Text>
        </>
      ) : null}

      {profile.tournaments.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Tournaments</Text>
          <View style={styles.group}>
            {profile.tournaments.map((t, index) => (
              <View key={t.id} style={[styles.row, index > 0 && styles.line]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.rowStrong}>{t.name}</Text>
                  <Text style={styles.rowMeta}>{formatDate(t.startsAt)} · {t.surface.charAt(0).toUpperCase() + t.surface.slice(1)} court{t.location ? ` · ${t.location}` : ''}</Text>
                </View>
                <View style={[styles.tag, t.registered && styles.tagOn]}>
                  <Text style={[styles.tagText, t.registered && styles.tagTextOn]}>{t.registered ? 'Entered' : 'Watching'}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {unlocked.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Achievements · {unlocked.length} of {achievements.length}</Text>
          <AchievementGrid items={achievements} />
        </>
      ) : null}
    </Screen>
  );
}

const SESSION_KIND = { practice: 'Practice', match: 'Match', drills: 'Drills', fitness: 'Fitness' } as const;
function dayLabel(day: string) {
  if (day === localDay(new Date())) return 'Today';
  if (day === localDay(Date.now() - 86_400_000)) return 'Yesterday';
  return formatDate(`${day}T12:00:00`);
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tint ? { color: tint } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Detail({ label, value, line }: { label: string; value: string; line?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={[styles.row, line && styles.line]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wait: { paddingVertical: 60, alignItems: 'center' },
  logButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: radius.pill, backgroundColor: colors.brand, marginTop: spacing.md },
  logText: { ...typography.bodyStrong, color: colors.brandInk },
  edit: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.surface, ...lift },
  editText: { ...typography.smallStrong, color: colors.text },
  identityRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', paddingBottom: spacing.lg },
  identityText: { flex: 1, gap: 3, minWidth: 0 },
  name: { ...typography.heading, color: colors.text },
  handle: { ...typography.small, color: colors.textMuted },
  group: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden', paddingHorizontal: spacing.lg },
  ladder: { paddingVertical: spacing.lg },
  stats: { flexDirection: 'row', marginTop: spacing.md, paddingVertical: spacing.lg },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { ...typography.title, color: colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { ...typography.small, color: colors.textMuted },
  sectionTitle: { ...typography.smallStrong, color: colors.textMuted, paddingHorizontal: spacing.sm, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end' },
  sectionLink: { ...typography.smallStrong, color: colors.brand, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  addGear: { gap: spacing.sm, justifyContent: 'flex-start' },
  addGearText: { ...typography.smallStrong, color: colors.brand },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 50, paddingVertical: 11 },
  rowTall: { gap: 4, paddingVertical: spacing.md },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowText: { flex: 1, ...typography.body, color: colors.text },
  rowStrong: { ...typography.body, ...font('600'), color: colors.text },
  rowMeta: { ...typography.small, color: colors.textMuted },
  note: { ...typography.small, color: colors.textMuted, lineHeight: 19, paddingLeft: 24 },
  detailLabel: { flex: 1, ...typography.body, color: colors.textMuted },
  detailValue: { ...typography.body, ...font('500'), color: colors.text, flexShrink: 1, textAlign: 'right' },
  muted: { ...typography.small, color: colors.textMuted, paddingVertical: spacing.lg },
  fine: { ...typography.caption, color: colors.textFaint, letterSpacing: 0, paddingHorizontal: spacing.sm, paddingTop: spacing.sm },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.bgElevated },
  tagOn: { backgroundColor: colors.brand },
  tagText: { ...typography.caption, ...font('600'), letterSpacing: 0, color: colors.textMuted },
  tagTextOn: { color: colors.brandInk },
});

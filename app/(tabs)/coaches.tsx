import { asTabRoute } from '@/features/navigation/tabFocus';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, Screen } from '@/components/ui';
import { money, relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import * as toast from '@/lib/toast';
import { colors, radius, spacing, typography } from '@/theme';

function Coaching() {
  const styles = useThemedStyles(styleDefinitions);
  const { coaches, users, coachingRequests, coachQuestions, currentUserId, currentUser } = useApp();
  const recentQuestions = [...coachQuestions]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 3);
  const unanswered = coachQuestions.filter((q) => q.replyIds.length === 0).length;
  const myRequests = coachingRequests.filter((r) => r.userId === currentUserId).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return (
    <Screen memoryKey="coaches" title="Coaching">
      <View style={styles.ai}>
        {/* Built and wired, held back until launch: the card says so instead of opening. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Courtside AI Coach, coming soon"
          onPress={() => toast.show({ title: 'AI coach is coming soon', body: 'A weekly plan and a coach to ask, coming soon', icon: 'sparkles' })}
          style={{ gap: 18 }}
        >
          <View style={styles.row}>
            <View style={styles.aiBadge}>
              <Text style={styles.aiText}>AI</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Courtside AI Coach</Text>
              <Text style={styles.available}>Coming soon</Text>
            </View>
            <View style={styles.soon}><Text style={styles.soonText}>SOON</Text></View>
          </View>
          <Text style={styles.description}>
            A weekly plan built from your game, goals, and body, and a coach you can ask before your next session.
          </Text>
        </Pressable>
      </View>

      <View style={styles.heading}>
        <Text style={styles.eyebrow}>CERTIFIED COACHES</Text>
      </View>

      {coaches.map((coach) => {
        const user = users.find((u) => u.id === coach.userId);
        const price = Math.min(...coach.services.map((s) => s.priceCents));
        return (
          <Pressable
            key={coach.id}
            accessibilityRole="link"
            onPress={() => router.push(`/coach/${coach.id}`)}
            style={styles.coach}
          >
            <Avatar
              name={user?.name ?? 'Coach'}
              seed={coach.id}
              size={48}
              style={{ backgroundColor: colors.borderStrong }}
            />
            <View style={{ flex: 1, gap: 7 }}>
              <PlayerName userId={user?.id} style={styles.name}>{user?.name}</PlayerName>
              <Text style={styles.credential}>{coach.credentials[0]}</Text>
              <Text style={styles.muted}>
                {coach.specialties
                  .slice(0, 2)
                  .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
                  .join(' & ')}
              </Text>
              <Text style={styles.rating}>
                ★ {coach.ratingAvg.toFixed(1)} <Text style={styles.muted}>{coach.ratingCount} reviews</Text>
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={styles.price}>from {money(price)}</Text>
              <Text style={styles.small}>/service</Text>
            </View>
          </Pressable>
        );
      })}

      {/* ------------------------------ Ask a coach ----------------------------- */}
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>ASK A COACH</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ask a coach a question"
        onPress={() => router.push('/ask-coach')}
        style={styles.askBox}
      >
        <View style={styles.askIcon}>
          <Ionicons name="help-buoy-outline" size={22} color={colors.brand} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.askTitle}>What are you stuck on?</Text>
          <Text style={styles.small}>Free and public. A verified coach answers, usually within a day.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>

      {recentQuestions.map((question) => {
        const author = users.find((u) => u.id === question.authorId);
        return (
          <Pressable
            key={question.id}
            accessibilityRole="link"
            onPress={() => router.push(`/coach-question/${question.id}`)}
            style={styles.question}
          >
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.questionTitle} numberOfLines={2}>
                {question.title}
              </Text>
              <PlayerName userId={author?.id} style={styles.small}>
                @{author?.handle ?? 'player'} · {relativeTime(question.createdAt)} ·{' '}
                {question.replyIds.length
                  ? `${question.replyIds.length} ${question.replyIds.length === 1 ? 'reply' : 'replies'}`
                  : 'awaiting a coach'}
              </PlayerName>
            </View>
            {question.resolved ? (
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            ) : null}
          </Pressable>
        );
      })}

      {/* ------------------------------ Your requests ---------------------------- */}
      {myRequests.length ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.eyebrow}>YOUR REQUESTS</Text>
          {myRequests.map((r) => {
            const coach = coaches.find((c) => c.id === r.coachId);
            const coachUser = users.find((u) => u.id === coach?.userId);
            const service = coach?.services.find((s) => s.id === r.serviceId);
            return (
              <Pressable key={r.id} accessibilityRole="link" onPress={() => coach && router.push(`/coach/${coach.id}`)} style={styles.request}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Avatar name={coachUser?.name ?? '?'} seed={coachUser?.avatarSeed ?? r.coachId} uri={coachUser?.avatarUrl} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{service?.title ?? 'Coaching'} · {coachUser?.name ?? 'Coach'}</Text>
                    <Text style={styles.small}>{r.status === 'answered' ? 'Answered' : r.status === 'in-review' ? 'Being looked at' : 'Sent'} · {relativeTime(r.createdAt)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                </View>
                {r.question ? <Text style={styles.small} numberOfLines={2}>{r.question}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {/* --------------------------- Apply to be a coach ------------------------ */}
      {currentUser?.isCoach ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/coach-inbox')}
          style={styles.applyBox}
        >
          <Ionicons name="chatbubbles-outline" size={24} color={colors.brand} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.applyTitle}>
              {unanswered} {unanswered === 1 ? 'question needs' : 'questions need'} an answer
            </Text>
            <Text style={styles.small}>Answering publicly is how players find you.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Apply to be a coach"
          onPress={() => router.push('/coach-apply')}
          style={styles.applyBox}
        >
          <Ionicons name="ribbon-outline" size={24} color={colors.brand} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.applyTitle}>Coach on CourtSide</Text>
            <Text style={styles.small}>Set your prices, keep 80%. Verified by hand.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  ai: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 16,
    marginTop: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  aiBadge: {
    width: 42,
    height: 42,
    borderRadius: 30,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiText: { color: colors.info, fontSize: 18, fontWeight: '700' },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  available: { color: colors.textMuted, marginTop: 5, fontSize: 13 },
  soon: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.brandDim },
  soonText: { ...typography.caption, color: colors.brand },
  description: {
    borderLeftWidth: 2,
    borderLeftColor: colors.info,
    paddingLeft: 12,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  heading: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 24, paddingTop: 18, gap: 8 },
  eyebrow: { letterSpacing: 1.6, fontWeight: '700', fontSize: 11, color: colors.textMuted },
  coach: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  name: { fontWeight: '600', color: colors.text, fontSize: 16 },
  credential: { color: colors.textMuted, fontSize: 10, letterSpacing: 0.4 },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  rating: { color: colors.warning, fontSize: 14 },
  price: { fontWeight: '700', color: colors.text, fontSize: 13 },
  small: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  request: { borderBottomWidth: 1, borderBottomColor: colors.border, padding: 12, gap: 8 },

  askBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    marginTop: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  askIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askTitle: { ...typography.bodyStrong, color: colors.text },
  question: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  questionTitle: { ...typography.body, color: colors.text, lineHeight: 21 },

  applyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgElevated,
  },
  applyTitle: { ...typography.bodyStrong, color: colors.text },
});

export default asTabRoute(Coaching);

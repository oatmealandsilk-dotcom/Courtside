import { asTabRoute } from '@/features/navigation/tabFocus';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, Button, Screen } from '@/components/ui';
import { LiveDot } from '@/components/LiveDot';
import { money, relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography, font } from '@/theme';

function Coaching() {
  const styles = useThemedStyles(styleDefinitions);
  const { coaches, users, coachingRequests, coachQuestions, currentUserId, currentUser } = useApp();
  const recentQuestions = [...coachQuestions]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 3);
  const unanswered = coachQuestions.filter((q) => q.replyIds.length === 0).length;
  const myRequests = coachingRequests.filter((r) => r.userId === currentUserId).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return (
    <Screen memoryKey="coaches" title="Coaching" subtitle="Real coaches, approved one by one." wash>
      {/* ------------------------------ Ask a coach ----------------------------- */}
      <View style={styles.lead}>
        <Text style={styles.leadTitle}>Ask a coach.</Text>
        <Text style={styles.leadBody}>Free and public. A verified coach answers, usually within a day.</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ask a coach a question"
        onPress={() => router.push('/ask-coach')}
        style={({ pressed }) => [styles.askField, pressed && styles.askFieldPressed]}
      >
        <Text style={styles.askPlaceholder}>What are you stuck on?</Text>
        <View style={styles.askGo}><Ionicons name="arrow-forward" size={16} color={colors.brandInk} /></View>
      </Pressable>
      {recentQuestions.length ? (
        <View style={styles.list}>
          {recentQuestions.map((question, index) => {
            const author = users.find((u) => u.id === question.authorId);
            const waiting = question.replyIds.length === 0;
            return (
              <Pressable
                key={question.id}
                accessibilityRole="link"
                onPress={() => router.push(`/coach-question/${question.id}`)}
                style={({ pressed }) => [styles.row, index > 0 && styles.rowLine, pressed && styles.pressed]}
              >
                <View style={styles.rowWords}>
                  <Text style={styles.rowTitle} numberOfLines={2}>{question.title}</Text>
                  <View style={styles.metaRow}>
                    {waiting ? <LiveDot size={7} /> : <Ionicons name="checkmark-circle" size={13} color={colors.success} />}
                    <PlayerName userId={author?.id} style={styles.meta}>
                      {waiting ? 'Awaiting a coach' : question.resolved ? 'Answered' : `${question.replyIds.length} ${question.replyIds.length === 1 ? 'reply' : 'replies'}`} · @{author?.handle ?? 'player'} · {relativeTime(question.createdAt)}
                    </PlayerName>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {/* ------------------------------ Coaches ---------------------------------- */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Coaches</Text>
        <Text style={styles.sectionBody}>Every name here was checked by hand.</Text>
      </View>
      {coaches.length === 0 ? (
        <View style={styles.none}>
          <Text style={styles.noneTitle}>No coaches on CourtSide yet</Text>
          <Text style={styles.noneBody}>This is the set being played right now. Ask a question above in the meantime — it stays up until a coach answers it.</Text>
          {currentUser?.isCoach ? null : (
            <Button label="Apply to coach" variant="secondary" onPress={() => router.push('/coach-apply')} />
          )}
        </View>
      ) : (
        <View style={styles.list}>
          {coaches.map((coach, index) => {
            const user = users.find((u) => u.id === coach.userId);
            const price = Math.min(...coach.services.map((s) => s.priceCents));
            return (
              <Pressable
                key={coach.id}
                accessibilityRole="link"
                onPress={() => router.push(`/coach/${coach.id}`)}
                style={({ pressed }) => [styles.coach, index > 0 && styles.rowLine, pressed && styles.pressed]}
              >
                <Avatar name={user?.name ?? 'Coach'} seed={coach.id} size={48} style={{ backgroundColor: colors.borderStrong }} />
                <View style={styles.rowWords}>
                  <PlayerName userId={user?.id} style={styles.name}>{user?.name}</PlayerName>
                  <Text style={styles.meta} numberOfLines={1}>
                    {coach.credentials[0]} · {coach.specialties.slice(0, 2).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' & ')}
                  </Text>
                  <Text style={styles.meta}>
                    <Text style={styles.rating}>★ {coach.ratingAvg.toFixed(1)}</Text> · {coach.ratingCount} reviews
                  </Text>
                </View>
                <View style={styles.priceCol}>
                  <Text style={styles.price}>{money(price)}</Text>
                  <Text style={styles.meta}>from</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* ------------------------------ Your requests ---------------------------- */}
      {myRequests.length ? (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your requests</Text>
          </View>
          <View style={styles.list}>
            {myRequests.map((r, index) => {
              const coach = coaches.find((c) => c.id === r.coachId);
              const coachUser = users.find((u) => u.id === coach?.userId);
              const service = coach?.services.find((s) => s.id === r.serviceId);
              return (
                <Pressable key={r.id} accessibilityRole="link" onPress={() => coach && router.push(`/coach/${coach.id}`)} style={({ pressed }) => [styles.coach, index > 0 && styles.rowLine, pressed && styles.pressed]}>
                  <Avatar name={coachUser?.name ?? '?'} seed={coachUser?.avatarSeed ?? r.coachId} uri={coachUser?.avatarUrl} size={36} />
                  <View style={styles.rowWords}>
                    <Text style={styles.name}>{service?.title ?? 'Coaching'} · {coachUser?.name ?? 'Coach'}</Text>
                    <Text style={styles.meta}>{r.status === 'answered' ? 'Answered' : r.status === 'in-review' ? 'Being looked at' : 'Sent'} · {relativeTime(r.createdAt)}</Text>
                    {r.question ? <Text style={styles.meta} numberOfLines={2}>{r.question}</Text> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {/* --------------------------- Coach on CourtSide -------------------------- */}
      {currentUser?.isCoach ? (
        <Pressable accessibilityRole="link" onPress={() => router.push('/coach-inbox')} style={({ pressed }) => [styles.foot, pressed && styles.pressed]}>
          <View style={styles.rowWords}>
            <Text style={styles.footTitle}>{unanswered} {unanswered === 1 ? 'question needs' : 'questions need'} an answer</Text>
            <Text style={styles.meta}>Answering publicly is how players find you.</Text>
          </View>
          <Ionicons name="arrow-forward" size={18} color={colors.text} />
        </Pressable>
      ) : coaches.length === 0 ? null : (
        <Pressable accessibilityRole="link" accessibilityLabel="Apply to be a coach" onPress={() => router.push('/coach-apply')} style={({ pressed }) => [styles.foot, pressed && styles.pressed]}>
          <View style={styles.rowWords}>
            <Text style={styles.footTitle}>Coach on CourtSide</Text>
            <Text style={styles.meta}>A badge and a listing, verified by hand.</Text>
          </View>
          <Ionicons name="arrow-forward" size={18} color={colors.text} />
        </Pressable>
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  pressed: { opacity: 0.72 },
  lead: { gap: 4, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  leadTitle: { ...typography.title, fontSize: 24, color: colors.text },
  leadBody: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  // The way in is a question you could start typing, not a card about asking.
  askField: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingLeft: spacing.lg, paddingRight: 6, paddingVertical: 6, minHeight: 52,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  askFieldPressed: { borderColor: colors.borderStrong },
  askPlaceholder: { ...typography.body, fontSize: 16, color: colors.textFaint, flex: 1 },
  askGo: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', shadowColor: colors.brand, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  // Everything else is rows on hairlines, not boxes.
  list: { marginTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 15 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowWords: { flex: 1, gap: 5, minWidth: 0 },
  rowTitle: { ...typography.body, ...font('500'), color: colors.text, lineHeight: 21 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  meta: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  section: { gap: 4, paddingTop: spacing.xxl, paddingBottom: spacing.sm },
  sectionTitle: { ...typography.title, color: colors.text },
  sectionBody: { ...typography.small, color: colors.textMuted },
  none: { gap: spacing.sm, paddingVertical: spacing.lg, alignItems: 'flex-start' },
  noneTitle: { ...typography.heading, color: colors.text },
  noneBody: { ...typography.small, color: colors.textMuted, lineHeight: 19, marginBottom: spacing.sm },
  coach: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  name: { ...typography.body, ...font('500'), fontSize: 16, color: colors.text },
  rating: { ...typography.smallStrong, color: colors.text },
  priceCol: { alignItems: 'flex-end', gap: 2 },
  price: { ...typography.bodyStrong, color: colors.text, fontVariant: ['tabular-nums'] },
  foot: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl, marginTop: spacing.xl, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  footTitle: { ...typography.body, ...font('500'), fontSize: 16, color: colors.text },
});

export default asTabRoute(Coaching);

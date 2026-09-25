import { asTabRoute } from '@/features/navigation/tabFocus';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, Button, Screen } from '@/components/ui';
import { MarkDraw } from '@/components/MarkDraw';
import { money, relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
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
    <Screen memoryKey="coaches" title="Coaching" subtitle="Real coaches, approved one by one." wash>
      {/* ------------------------------ Ask a coach ----------------------------- */}
      <View style={styles.ask}>
        <View style={styles.askTop}>
          <View style={styles.tile}><MarkDraw size={30} play={false} /></View>
          <View style={styles.askWords}>
            <Text style={styles.askTitle}>What are you stuck on?</Text>
            <Text style={styles.askBody}>Free and public. A verified coach answers, usually within a day.</Text>
          </View>
        </View>
        <Button label="Ask a coach" onPress={() => router.push('/ask-coach')} />
      </View>
      {recentQuestions.length ? (
        <View style={styles.list}>
          {recentQuestions.map((question, index) => {
            const author = users.find((u) => u.id === question.authorId);
            return (
              <Pressable
                key={question.id}
                accessibilityRole="link"
                onPress={() => router.push(`/coach-question/${question.id}`)}
                style={({ pressed }) => [styles.row, index > 0 && styles.rowLine, pressed && styles.pressed]}
              >
                <View style={styles.rowWords}>
                  <Text style={styles.rowTitle} numberOfLines={2}>{question.title}</Text>
                  <PlayerName userId={author?.id} style={styles.meta}>
                    @{author?.handle ?? 'player'} · {relativeTime(question.createdAt)} ·{' '}
                    {question.replyIds.length
                      ? `${question.replyIds.length} ${question.replyIds.length === 1 ? 'reply' : 'replies'}`
                      : 'awaiting a coach'}
                  </PlayerName>
                </View>
                {question.resolved ? <Ionicons name="checkmark-circle" size={18} color={colors.success} /> : <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {/* ------------------------------ Coaches ---------------------------------- */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Coaches</Text>
        <Text style={styles.sectionBody}>Every name here was checked by hand, so it means something.</Text>
      </View>
      {coaches.length === 0 ? (
        <View style={styles.none}>
          <Text style={styles.noneTitle}>No coaches on CourtSide yet</Text>
          <Text style={styles.noneBody}>
            This is the set being played right now. Ask a question above in the meantime — it stays up until a coach answers it.
          </Text>
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
                <Avatar name={user?.name ?? 'Coach'} seed={coach.id} size={46} style={{ backgroundColor: colors.borderStrong }} />
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

      {/* --------------------------- Apply to be a coach ------------------------ */}
      {currentUser?.isCoach ? (
        <Pressable accessibilityRole="link" onPress={() => router.push('/coach-inbox')} style={({ pressed }) => [styles.apply, pressed && styles.pressed]}>
          <View style={styles.tileSmall}><Ionicons name="chatbubbles-outline" size={20} color={colors.brand} /></View>
          <View style={styles.rowWords}>
            <Text style={styles.applyTitle}>{unanswered} {unanswered === 1 ? 'question needs' : 'questions need'} an answer</Text>
            <Text style={styles.meta}>Answering publicly is how players find you.</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>
      ) : coaches.length === 0 ? null : (
        <Pressable accessibilityRole="link" accessibilityLabel="Apply to be a coach" onPress={() => router.push('/coach-apply')} style={({ pressed }) => [styles.apply, pressed && styles.pressed]}>
          <View style={styles.tileSmall}><Ionicons name="shield-checkmark-outline" size={20} color={colors.brand} /></View>
          <View style={styles.rowWords}>
            <Text style={styles.applyTitle}>Coach on CourtSide</Text>
            <Text style={styles.meta}>A coach badge and a listing. Verified by hand.</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  pressed: { opacity: 0.72 },
  // The one card on the page: the way in, set like the waitlist's success card.
  ask: { gap: spacing.lg, padding: spacing.xl, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginTop: spacing.sm },
  askTop: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  tile: { width: 56, height: 56, borderRadius: radius.lg, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  tileSmall: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  askWords: { flex: 1, gap: 4, minWidth: 0 },
  askTitle: { ...typography.title, fontSize: 20, color: colors.text },
  askBody: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  // Everything else is rows on hairlines, not boxes.
  list: { marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowWords: { flex: 1, gap: 4, minWidth: 0 },
  rowTitle: { ...typography.body, color: colors.text, lineHeight: 21 },
  meta: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  section: { gap: 4, paddingTop: spacing.xxl, paddingBottom: spacing.sm },
  sectionTitle: { ...typography.title, color: colors.text },
  sectionBody: { ...typography.small, color: colors.textMuted },
  none: { gap: spacing.sm, paddingVertical: spacing.lg, alignItems: 'flex-start' },
  noneTitle: { ...typography.heading, color: colors.text },
  noneBody: { ...typography.small, color: colors.textMuted, lineHeight: 19, marginBottom: spacing.sm },
  coach: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  name: { ...typography.bodyStrong, color: colors.text },
  rating: { ...typography.smallStrong, color: colors.text },
  priceCol: { alignItems: 'flex-end', gap: 2 },
  price: { ...typography.bodyStrong, color: colors.text, fontVariant: ['tabular-nums'] },
  apply: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, marginTop: spacing.xxl, marginBottom: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  applyTitle: { ...typography.bodyStrong, color: colors.text },
});

export default asTabRoute(Coaching);

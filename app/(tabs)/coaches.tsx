import { asTabRoute } from '@/features/navigation/tabFocus';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, Button, Screen } from '@/components/ui';
import { LiveDot } from '@/components/LiveDot';
import { lockPageSwipe } from '@/features/navigation/swipeLock';
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
      <View style={[styles.section, styles.sectionFirst]}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Ask a coach</Text>
          <Text style={styles.sectionCount}>free</Text>
        </View>
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
      <Text style={styles.askNote}>Public. A verified coach answers, usually within a day.</Text>
      {/* ------------------------------ Coaches ---------------------------------- */}
      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Coaches</Text>
          <Text style={styles.sectionCount}>{coaches.length}</Text>
        </View>
        <Text style={styles.sectionBody}>Checked by hand, one by one.</Text>
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
        <ScrollView
          horizontal
          nativeID="coach-rail"
          onTouchStart={() => lockPageSwipe(true)}
          onTouchEnd={() => lockPageSwipe(false)}
          onTouchCancel={() => lockPageSwipe(false)}
          showsHorizontalScrollIndicator={false}
          style={styles.rail}
          contentContainerStyle={styles.railRow}
        >
          {coaches.map((coach) => {
            const user = users.find((u) => u.id === coach.userId);
            const price = Math.min(...coach.services.map((s) => s.priceCents));
            return (
              <Pressable key={coach.id} accessibilityRole="link" onPress={() => router.push(`/coach/${coach.id}`)} style={({ pressed }) => [styles.coachCard, pressed && styles.pressed]}>
                <Avatar name={user?.name ?? 'Coach'} seed={coach.id} size={64} style={{ backgroundColor: colors.borderStrong }} />
                <View style={styles.coachWords}>
                  <PlayerName userId={user?.id} style={styles.coachName}>{user?.name}</PlayerName>
                  <Text style={styles.meta} numberOfLines={1}>{coach.credentials[0]}</Text>
                  <Text style={styles.meta} numberOfLines={1}>{coach.specialties.slice(0, 2).map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(' & ')}</Text>
                </View>
                <View style={styles.coachFoot}>
                  <View style={styles.metaRow}>
                    <Ionicons name="star" size={12} color={colors.text} />
                    <Text style={styles.rating}>{coach.ratingAvg.toFixed(1)}</Text>
                    <Text style={styles.meta}>· {coach.ratingCount}</Text>
                  </View>
                  <View style={styles.priceTag}><Text style={styles.priceText}>from {money(price)}</Text></View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* ------------------------------ Questions -------------------------------- */}
      {(recentQuestions.length || myRequests.length) ? (
        <>
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Questions</Text>
              <Text style={styles.sectionCount}>{unanswered ? `${unanswered} waiting` : 'all answered'}</Text>
            </View>
            <Text style={styles.sectionBody}>What players have asked. Yours to one coach are marked private.</Text>
          </View>
          <View style={styles.group}>
            {[
              ...recentQuestions.map((question) => ({ key: `q-${question.id}`, at: question.createdAt, question, request: null as (typeof myRequests)[number] | null })),
              ...myRequests.map((request) => ({ key: `r-${request.id}`, at: request.createdAt, question: null as (typeof recentQuestions)[number] | null, request })),
            ]
              .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
              .map((entry, index) => {
                if (entry.question) {
                  const question = entry.question;
                  const author = users.find((u) => u.id === question.authorId);
                  const waiting = question.replyIds.length === 0;
                  return (
                    <Pressable
                      key={entry.key}
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
                }
                const r = entry.request!;
                const coach = coaches.find((c) => c.id === r.coachId);
                const coachUser = users.find((u) => u.id === coach?.userId);
                const service = coach?.services.find((x) => x.id === r.serviceId);
                const waiting = r.status !== 'answered';
                return (
                  <Pressable key={entry.key} accessibilityRole="link" onPress={() => coach && router.push(`/coach/${coach.id}`)} style={({ pressed }) => [styles.row, index > 0 && styles.rowLine, pressed && styles.pressed]}>
                    <View style={styles.rowWords}>
                      <Text style={styles.rowTitle} numberOfLines={2}>{r.question || service?.title || 'Coaching request'}</Text>
                      <View style={styles.metaRow}>
                        {waiting ? <LiveDot size={7} /> : <Ionicons name="checkmark-circle" size={13} color={colors.success} />}
                        <Text style={styles.meta} numberOfLines={1}>
                          {r.status === 'answered' ? 'Answered' : r.status === 'in-review' ? 'Being looked at' : 'Sent'} · Private, with {coachUser?.name ?? 'a coach'} · {relativeTime(r.createdAt)}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="lock-closed-outline" size={14} color={colors.textFaint} />
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
  askNote: { ...typography.small, color: colors.textMuted, lineHeight: 18, paddingTop: spacing.sm, paddingLeft: 2 },
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14, paddingHorizontal: spacing.lg },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowWords: { flex: 1, gap: 5, minWidth: 0 },
  rowTitle: { ...typography.body, ...font('500'), color: colors.text, lineHeight: 21 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  meta: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  section: { gap: 3, paddingTop: spacing.xxl, paddingBottom: spacing.md },
  sectionFirst: { paddingTop: spacing.sm },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  sectionCount: { ...typography.small, color: colors.textFaint },
  group: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  sectionTitle: { ...typography.heading, color: colors.text },
  sectionBody: { ...typography.small, color: colors.textMuted },
  none: { gap: spacing.sm, paddingVertical: spacing.lg, alignItems: 'flex-start' },
  noneTitle: { ...typography.heading, color: colors.text },
  noneBody: { ...typography.small, color: colors.textMuted, lineHeight: 19, marginBottom: spacing.sm },
  coach: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14, paddingHorizontal: spacing.lg },
  rail: { flexGrow: 0, marginHorizontal: -spacing.lg },
  railRow: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  coachCard: { width: 176, gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  coachWords: { gap: 3 },
  coachName: { ...typography.bodyStrong, color: colors.text },
  coachFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  priceTag: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  priceText: { ...typography.caption, color: colors.brand },
  name: { ...typography.body, ...font('500'), fontSize: 16, color: colors.text },
  rating: { ...typography.smallStrong, color: colors.text },
  priceCol: { alignItems: 'flex-end', gap: 2 },
  price: { ...typography.bodyStrong, color: colors.text, fontVariant: ['tabular-nums'] },
  foot: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, marginTop: spacing.xl, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  footTitle: { ...typography.body, ...font('500'), fontSize: 16, color: colors.text },
});

export default asTabRoute(Coaching);

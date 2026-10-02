import { asTabRoute } from '@/features/navigation/tabFocus';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React, { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar, Button, Screen } from '@/components/ui';
import { LiveDot } from '@/components/LiveDot';
import { lockPageSwipe } from '@/features/navigation/swipeLock';
import { money, relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { useAiCoachOn } from '@/features/aiCoach/switch';
import { statusLabel } from '@/features/coaching/bookings';
import { colors, font, lift, radius, spacing, typography } from '@/theme';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { useTourTarget } from '@/features/tour/tourStore';

function Coaching() {
  const styles = useThemedStyles(styleDefinitions);
  const { coaches, users, coachingRequests, coachQuestions, currentUserId, currentUser, actions } = useApp();
  const aiCoachOn = useAiCoachOn();
  // Where the box sits on screen, so the question page can grow out of it.
  const askPill = useRef<View>(null);
  // The tutorial's Coaching tip lights this box and the line under it, so the two share one box it can find.
  const tourAsk = useTourTarget('coach-ask');
  const openAsk = () => {
    const pill = askPill.current;
    if (!pill) { router.push('/ask-coach'); return; }
    pill.measureInWindow((x, y, w, h) => {
      router.push(w && h ? { pathname: '/ask-coach', params: { from: [x, y, w, h].map(Math.round).join(',') } } : '/ask-coach');
    });
  };
  const recentQuestions = [...coachQuestions]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 3);
  const unanswered = coachQuestions.filter((q) => q.replyIds.length === 0).length;
  // Your bookings; one still at Stripe's pay page is not a booking yet.
  const myRequests = coachingRequests.filter((r) => r.userId === currentUserId && r.status !== 'awaiting-payment').sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const myCoach = coaches.find((c) => c.userId === currentUserId);
  const openBookings = myCoach ? coachingRequests.filter((r) => (r.coachId === myCoach.id || r.coachUserId === currentUserId) && (r.status === 'submitted' || r.status === 'in-review')).length : 0;
  // Everyone sees listed coaches; a coach also sees their own listing before it is listed.
  const shown = coaches.filter((c) => c.listed !== false);

  return (
    <Screen memoryKey="coaches" title="Coaching" wash onRefresh={isDesktopBrowser() ? undefined : actions.refresh}>
      {/* ------------------------------ Ask a coach ----------------------------- */}
      <View style={[styles.section, styles.sectionFirst]}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Ask a coach</Text>
          <Text style={styles.sectionCount}>free</Text>
        </View>
      </View>
      {/* Never folded away by the phone's renderer (a plain box can be), or the tutorial could not measure it. */}
      <View ref={tourAsk} collapsable={false}>
      {/* Tapped, this box grows and lifts into the full question page (see ask-coach), where you type from the start. */}
      <Pressable
        ref={askPill}
        accessibilityRole="button"
        accessibilityLabel="Ask a coach a question"
        onPress={openAsk}
        style={({ pressed }) => [styles.askField, pressed && styles.askFieldPressed]}
      >
        <Text style={styles.askPlaceholder}>Your question</Text>
        <View style={styles.askGo}><Ionicons name="arrow-forward" size={16} color={colors.brandInk} /></View>
      </Pressable>
      {/* No promise nobody can keep: until coaches are on, the note says what really happens.
          This is the one place the tab says asking is public (and, once coaches are on, that
          they are verified), so the header and the Coaches section don't repeat it. */}
      <Text style={styles.askNote}>{shown.length ? 'Public. A verified coach answers, usually within a day.' : 'Public. Your question stays up until a coach answers.'}</Text>
      </View>
      {/* The AI coach shows up here once it is switched on (its key added on the server). */}
      {aiCoachOn ? (
        <Pressable accessibilityRole="link" accessibilityLabel="AI coach" onPress={() => router.push('/ai-coach')} style={({ pressed }) => [styles.ai, pressed && styles.pressed]}>
          <View style={styles.aiMark}><Ionicons name="sparkles" size={16} color={colors.brand} /></View>
          <View style={styles.rowWords}>
            <Text style={styles.footTitle}>AI coach</Text>
            <Text style={styles.meta}>A weekly plan, and answers any time.</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>
      ) : null}
      {/* ------------------------------ Coaches ---------------------------------- */}
      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Coaches</Text>
          <Text style={styles.sectionCount}>{shown.length}</Text>
        </View>
      </View>
      {shown.length === 0 ? (
        <View style={styles.none}>
          <Text style={styles.noneTitle}>No coaches yet</Text>
          <Text style={styles.noneBody}>We’re approving the first ones now.</Text>
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
          {shown.map((coach) => {
            const user = users.find((u) => u.id === coach.userId);
            const price = coach.services.length ? Math.min(...coach.services.map((s) => s.priceCents)) : 0;
            return (
              <Pressable key={coach.id} accessibilityRole="link" onPress={() => router.push(`/coach/${coach.id}`)} style={({ pressed }) => [styles.coachCard, pressed && styles.pressed]}>
                <Avatar name={user?.name ?? 'Coach'} seed={coach.id} uri={user?.avatarUrl} size={64} style={{ backgroundColor: colors.borderStrong }} />
                <View style={styles.coachWords}>
                  {/* The whole card is the coach's page; the name is not a second door. */}
                  <Text style={styles.coachName} numberOfLines={1}>{user?.name}</Text>
                  <Text style={styles.meta} numberOfLines={1}>{coach.credentials[0]}</Text>
                  <Text style={styles.meta} numberOfLines={1}>{coach.specialties.slice(0, 2).map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(' & ')}</Text>
                </View>
                <View style={styles.coachFoot}>
                  {coach.ratingCount ? (
                    <View style={styles.metaRow}>
                      <Ionicons name="star" size={12} color={colors.text} />
                      <Text style={styles.rating}>{coach.ratingAvg.toFixed(1)}</Text>
                      <Text style={styles.meta}>· {coach.ratingCount}</Text>
                    </View>
                  ) : <Text style={styles.meta}>New</Text>}
                  {coach.payoutsReady === false ? <Text style={styles.meta}>Booking soon</Text>
                    : price ? <View style={styles.priceTag}><Text style={styles.priceText}>from {money(price)}</Text></View> : null}
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
            {/* No explainer line: a private booking already says "Private, with <coach>" and carries a lock. */}
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
                const waiting = r.status === 'submitted' || r.status === 'in-review';
                return (
                  <Pressable key={entry.key} accessibilityRole="link" onPress={() => router.push(`/coach-request/${r.id}`)} style={({ pressed }) => [styles.row, index > 0 && styles.rowLine, pressed && styles.pressed]}>
                    <View style={styles.rowWords}>
                      <Text style={styles.rowTitle} numberOfLines={2}>{r.question || service?.title || 'Coaching request'}</Text>
                      <View style={styles.metaRow}>
                        {waiting ? <LiveDot size={7} /> : <Ionicons name="checkmark-circle" size={13} color={colors.success} />}
                        <Text style={styles.meta} numberOfLines={1}>
                          {statusLabel(r)} · Private, with {coachUser?.name ?? 'a coach'} · {relativeTime(r.createdAt)}
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
      {myCoach ? (
        <Pressable accessibilityRole="link" onPress={() => router.push(openBookings ? '/coach-bookings' : '/coach-studio')} style={({ pressed }) => [styles.foot, pressed && styles.pressed]}>
          <View style={styles.rowWords}>
            <Text style={styles.footTitle}>{openBookings ? `${openBookings} ${openBookings === 1 ? 'booking needs' : 'bookings need'} an answer` : 'Your coach studio'}</Text>
            <Text style={styles.meta}>{myCoach.listed ? 'You’re listed.' : 'Finish setting up to get listed.'}</Text>
          </View>
          <Ionicons name="arrow-forward" size={18} color={colors.text} />
        </Pressable>
      ) : null}
      {currentUser?.isCoach ? (
        <Pressable accessibilityRole="link" onPress={() => router.push('/coach-inbox')} style={({ pressed }) => [styles.foot, pressed && styles.pressed]}>
          <View style={styles.rowWords}>
            <Text style={styles.footTitle}>{unanswered} {unanswered === 1 ? 'question needs' : 'questions need'} an answer</Text>
          </View>
          <Ionicons name="arrow-forward" size={18} color={colors.text} />
        </Pressable>
      ) : shown.length === 0 ? null : (
        <Pressable accessibilityRole="link" accessibilityLabel="Apply to be a coach" onPress={() => router.push('/coach-apply')} style={({ pressed }) => [styles.foot, pressed && styles.pressed]}>
          <View style={styles.rowWords}>
            <Text style={styles.footTitle}>Coach on CourtSide</Text>
            <Text style={styles.meta}>Apply to get listed.</Text>
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
    ...lift, borderRadius: radius.pill, backgroundColor: colors.surface,
  },
  askFieldPressed: { transform: [{ scale: 0.99 }] },
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
  group: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  sectionTitle: { ...typography.heading, color: colors.text },
  none: { gap: spacing.sm, paddingVertical: spacing.lg, alignItems: 'flex-start' },
  noneTitle: { ...typography.heading, color: colors.text },
  noneBody: { ...typography.small, color: colors.textMuted, lineHeight: 19, marginBottom: spacing.sm },
  coach: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14, paddingHorizontal: spacing.lg },
  // Room above and below so the cards' shadows are not cut off by the scroller.
  rail: { flexGrow: 0, marginHorizontal: -spacing.lg, marginVertical: -spacing.md },
  railRow: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md + spacing.xs, paddingBottom: spacing.lg + spacing.xs },
  coachCard: { ...lift, width: 176, gap: spacing.md, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.surface },
  coachWords: { gap: 3 },
  coachName: { ...typography.bodyStrong, color: colors.text },
  coachFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  priceTag: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  priceText: { ...typography.caption, color: colors.brand },
  name: { ...typography.body, ...font('500'), fontSize: 16, color: colors.text },
  rating: { ...typography.smallStrong, color: colors.text },
  priceCol: { alignItems: 'flex-end', gap: 2 },
  price: { ...typography.bodyStrong, color: colors.text, fontVariant: ['tabular-nums'] },
  foot: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, marginTop: spacing.xl, ...lift, borderRadius: 20, backgroundColor: colors.surface },
  footTitle: { ...typography.body, ...font('500'), fontSize: 16, color: colors.text },
  ai: { ...lift, flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: 20, backgroundColor: colors.surface },
  aiMark: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
});

export default asTabRoute(Coaching);

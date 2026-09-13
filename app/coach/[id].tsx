import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, Button, Card, Chip, EmptyState, Field, Screen } from '@/components/ui';
import { LevelPill } from '@/components/LevelPill';
import { duration, money, relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

const KIND_LABEL: Record<string, string> = {
  'video-review': 'Video review',
  'written-qa': 'Written Q&A',
  'live-session': 'Live session',
  plan: 'Training plan',
};

export default function CoachDetail() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { coaches, users, coachingRequests, coachResults, coachReviews, currentUserId, paymentMethods, defaultPaymentId, actions } = useApp();
  const defaultPayment = paymentMethods.find((m) => m.id === defaultPaymentId);

  // Results and reviews. The coach adds results to their own page; players
  // who are not the coach can leave one review each.
  const [addingResult, setAddingResult] = useState(false);
  const [resultClient, setResultClient] = useState('');
  const [resultFocus, setResultFocus] = useState('');
  const [resultBefore, setResultBefore] = useState('');
  const [resultAfter, setResultAfter] = useState('');
  const [resultWeeks, setResultWeeks] = useState('');
  const [resultNote, setResultNote] = useState('');
  const [reviewStars, setReviewStars] = useState(0);
  const [reviewBody, setReviewBody] = useState('');

  const coach = coaches.find((c) => c.id === id);
  const user = users.find((u) => u.id === coach?.userId);

  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [attachVideo, setAttachVideo] = useState(false);
  const [sent, setSent] = useState(false);

  if (!coach || !user) {
    return (
      <Screen title="Coach" compactTitle onBack={() => router.back()}>
        <EmptyState icon="alert-circle-outline" title="Coach not found" />
      </Screen>
    );
  }

  const myRequests = coachingRequests.filter(
    (r) => r.coachId === coach.id && r.userId === currentUserId,
  );

  const service = coach.services.find((s) => s.id === selectedService);

  const submit = () => {
    if (!service || question.trim().length === 0) return;
    actions.submitCoachingRequest(
      coach.id,
      service.id,
      question.trim(),
      attachVideo ? 'session-clip.mp4 · 0:58' : undefined,
    );
    setQuestion('');
    setSelectedService(null);
    setAttachVideo(false);
    setSent(true);
  };

  return (
    <Screen title={user.name} compactTitle onBack={() => router.back()}>
      <Card style={styles.hero}>
        <View style={styles.heroRow}>
          <Avatar name={user.name} seed={user.avatarSeed} size={62} ring />
          <View style={styles.heroText}>
            <View style={styles.nameRow}>
              <PlayerName userId={user.id} style={styles.name}>{user.name}</PlayerName>
              {coach.verified ? <Ionicons name="shield-checkmark" size={16} color={colors.brand} /> : null}
            </View>
            <Text style={styles.headline}>{coach.headline}</Text>
            <View style={styles.pillRow}>
              <LevelPill profile={user.profile} small />
              <Chip label={`${coach.yearsCoaching} yrs coaching`} small />
            </View>
          </View>
        </View>
        <Text style={styles.bio}>{user.bio}</Text>
        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Ionicons name="star" size={14} color={colors.warning} />
            <Text style={styles.statText}>
              {coach.ratingAvg.toFixed(1)} from {coach.ratingCount} players
            </Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="time-outline" size={14} color={colors.textFaint} />
            <Text style={styles.statText}>Replies in ~{coach.responseTimeHours}h</Text>
          </View>
        </View>
        <View style={styles.credentials}>
          {coach.credentials.map((c) => (
            <View key={c} style={styles.credRow}>
              <Ionicons name="checkmark" size={13} color={colors.court} />
              <Text style={styles.credText}>{c}</Text>
            </View>
          ))}
        </View>
      </Card>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Services</Text>
        {coach.services.map((s) => {
          const active = selectedService === s.id;
          return (
            <Card
              key={s.id}
              onPress={() => {
                setSelectedService(active ? null : s.id);
                setSent(false);
              }}
              style={[styles.service, active ? { borderColor: colors.brand } : null]}
            >
              <View style={styles.serviceHead}>
                <Text style={styles.serviceTitle}>{s.title}</Text>
                <Text style={styles.servicePrice}>{money(s.priceCents)}</Text>
              </View>
              <Text style={styles.serviceDesc}>{s.description}</Text>
              <View style={styles.serviceMeta}>
                <Chip label={KIND_LABEL[s.kind] ?? s.kind} small />
                <Text style={styles.turnaround}>Turnaround {duration(s.turnaroundHours * 60)}</Text>
              </View>
            </Card>
          );
        })}
      </View>

      {service ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Send your request</Text>
          <Card style={styles.requestForm}>
            <Text style={styles.selected}>
              {service.title} · {money(service.priceCents)}
            </Text>
            <Field
              label="What do you want looked at?"
              value={question}
              onChangeText={setQuestion}
              placeholder="Be specific. What happens, when it happens, and what you have already tried."
              multiline
            />
            <Button
              label={attachVideo ? 'Footage attached ✓' : 'Attach footage'}
              variant="secondary"
              onPress={() => setAttachVideo((v) => !v)}
            />
            <Text style={styles.uploadNote}>
              Uploads are stubbed in this build — attaching adds a placeholder clip so the flow works
              end to end.
            </Text>
            <Button label={`Send request · ${money(service.priceCents)}`} onPress={submit} disabled={question.trim().length === 0} full />
            <Text style={styles.uploadNote}>
              {defaultPayment ? `Pays with ${defaultPayment.label}${defaultPayment.detail ? ` ${defaultPayment.detail.split(' · ')[0]}` : ''} — change it in Settings → Payments. ` : ''}
              No payment is taken in this demo.
            </Text>
          </Card>
        </View>
      ) : null}

      {sent ? (
        <Card style={styles.sentCard}>
          <Ionicons name="checkmark-circle" size={18} color={colors.court} />
          <Text style={styles.sentText}>Request sent. You will see it in the Coaches tab.</Text>
        </Card>
      ) : null}

      {(() => {
        const isOwner = currentUserId === coach.userId;
        const results = coachResults.filter((r) => r.coachId === coach.id);
        const reviews = coachReviews
          .filter((r) => r.coachId === coach.id)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        const myReview = reviews.find((r) => r.authorId === currentUserId);
        const canAddResult = resultClient.trim() && resultFocus.trim() && resultBefore.trim() && resultAfter.trim() && Number(resultWeeks) > 0;
        const saveResult = () => {
          if (!canAddResult) return;
          actions.addCoachResult({
            clientName: resultClient.trim(),
            focus: resultFocus.trim(),
            before: resultBefore.trim(),
            after: resultAfter.trim(),
            weeks: Number(resultWeeks),
            note: resultNote.trim() || undefined,
          });
          setResultClient(''); setResultFocus(''); setResultBefore(''); setResultAfter(''); setResultWeeks(''); setResultNote('');
          setAddingResult(false);
        };
        const stars = (n: number, size = 14) => (
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Ionicons key={i} name={i <= n ? 'star' : 'star-outline'} size={size} color={colors.warning} />
            ))}
          </View>
        );
        return (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Client results</Text>
                {isOwner ? (
                  <Button label={addingResult ? 'Cancel' : 'Add a result'} variant="secondary" onPress={() => setAddingResult((v) => !v)} />
                ) : null}
              </View>
              {isOwner && addingResult ? (
                <Card style={styles.requestForm}>
                  <Field label="Client (first name or handle)" value={resultClient} onChangeText={setResultClient} placeholder="Priya" autoCapitalize="words" />
                  <Field label="What you worked on" value={resultFocus} onChangeText={setResultFocus} placeholder="Second serves in" />
                  <View style={styles.pair}>
                    <View style={{ flex: 1 }}><Field label="Before" value={resultBefore} onChangeText={setResultBefore} placeholder="41%" /></View>
                    <View style={{ flex: 1 }}><Field label="After" value={resultAfter} onChangeText={setResultAfter} placeholder="63%" /></View>
                    <View style={{ width: 90 }}><Field label="Weeks" value={resultWeeks} onChangeText={setResultWeeks} placeholder="6" keyboardType="number-pad" /></View>
                  </View>
                  <Field label="One line on how (optional)" value={resultNote} onChangeText={setResultNote} placeholder="Fixed the toss first; the rest followed." onSubmitEditing={saveResult} />
                  <Button label="Add to my page" onPress={saveResult} disabled={!canAddResult} full />
                </Card>
              ) : null}
              {results.length === 0 ? (
                <Text style={styles.muted}>{isOwner ? 'Show players what changed for the people you coach.' : 'No results shared yet.'}</Text>
              ) : (
                results.map((r) => (
                  <Card key={r.id} style={styles.resultCard}>
                    <View style={styles.resultHead}>
                      <Text style={styles.resultFocus}>{r.focus}</Text>
                      <Text style={styles.resultMeta}>{r.clientName} · {r.weeks} wks</Text>
                    </View>
                    <View style={styles.resultRow}>
                      <View style={styles.resultCell}>
                        <Text style={styles.resultLabel}>BEFORE</Text>
                        <Text style={styles.resultBefore}>{r.before}</Text>
                      </View>
                      <Ionicons name="arrow-forward" size={20} color={colors.textFaint} />
                      <View style={styles.resultCell}>
                        <Text style={styles.resultLabel}>AFTER</Text>
                        <Text style={styles.resultAfter}>{r.after}</Text>
                      </View>
                    </View>
                    {r.note ? <Text style={styles.resultNote}>{r.note}</Text> : null}
                  </Card>
                ))
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Reviews</Text>
                <View style={styles.stat}>
                  <Ionicons name="star" size={14} color={colors.warning} />
                  <Text style={styles.statText}>{coach.ratingAvg.toFixed(1)} · {coach.ratingCount}</Text>
                </View>
              </View>
              {!isOwner && currentUserId && !myReview ? (
                <Card style={styles.requestForm}>
                  <Text style={styles.selected}>Worked with {user.name.split(' ')[0]}? Leave a review</Text>
                  <View style={styles.starPick}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Pressable key={i} accessibilityRole="radio" accessibilityState={{ selected: reviewStars === i }} accessibilityLabel={`${i} star${i > 1 ? 's' : ''}`} onPress={() => setReviewStars(i)} hitSlop={4}>
                        <Ionicons name={i <= reviewStars ? 'star' : 'star-outline'} size={28} color={colors.warning} />
                      </Pressable>
                    ))}
                  </View>
                  <Field value={reviewBody} onChangeText={setReviewBody} placeholder="What changed for you?" multiline minHeight={70}
                    onSubmitEditing={() => { if (reviewStars && reviewBody.trim()) { actions.addCoachReview(coach.id, reviewStars, reviewBody); setReviewBody(''); } }} />
                  <Button label="Post review" disabled={!reviewStars || !reviewBody.trim()} onPress={() => { actions.addCoachReview(coach.id, reviewStars, reviewBody); setReviewBody(''); }} full />
                </Card>
              ) : null}
              {reviews.length === 0 ? (
                <Text style={styles.muted}>No reviews yet.</Text>
              ) : (
                reviews.map((r) => {
                  const author = users.find((u) => u.id === r.authorId);
                  return (
                    <Card key={r.id} style={styles.reviewCard}>
                      <View style={styles.reviewHead}>
                        <Avatar name={author?.name ?? '?'} seed={author?.avatarSeed ?? r.id} size={34} />
                        <View style={{ flex: 1, gap: 2 }}>
                          <PlayerName userId={author?.id} style={styles.reviewName}>{author?.name ?? 'Player'}</PlayerName>
                          <Text style={styles.resultMeta}>{relativeTime(r.createdAt)}{r.authorId === currentUserId ? ' · you' : ''}</Text>
                        </View>
                        {stars(r.rating)}
                      </View>
                      <Text style={styles.reviewBody}>{r.body}</Text>
                    </Card>
                  );
                })
              )}
            </View>
          </>
        );
      })()}

      {myRequests.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your history with {user.name.split(' ')[0]}</Text>
          {myRequests.map((r) => (
            <Card key={r.id} style={styles.historyCard}>
              <Text style={styles.historyQuestion}>{r.question}</Text>
              <Text style={styles.historyMeta}>
                {r.status === 'answered' ? 'Answered' : 'Waiting'} · sent {relativeTime(r.createdAt)} ago
              </Text>
              {r.response ? <Text style={styles.historyResponse}>{r.response}</Text> : null}
            </Card>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  hero: { gap: spacing.md },
  heroRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  heroText: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { ...typography.title, color: colors.text },
  headline: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  pillRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', paddingTop: 2 },
  bio: { ...typography.small, color: colors.textMuted, lineHeight: 20 },
  statRow: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statText: { ...typography.small, color: colors.textFaint },
  credentials: { gap: 4 },
  credRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  credText: { ...typography.small, color: colors.textMuted },
  section: { gap: spacing.md, paddingTop: spacing.xl },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  sectionTitle: { ...typography.heading, color: colors.text },
  muted: { ...typography.small, color: colors.textFaint },
  pair: { flexDirection: 'row', gap: spacing.sm },
  resultCard: { gap: spacing.sm },
  resultHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.md },
  resultFocus: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  resultMeta: { ...typography.caption, color: colors.textFaint, letterSpacing: 0 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  resultCell: { flex: 1, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.bgElevated, gap: 2 },
  resultLabel: { ...typography.caption, fontSize: 9, color: colors.textFaint },
  resultBefore: { fontSize: 20, fontWeight: '700', color: colors.textMuted },
  resultAfter: { fontSize: 20, fontWeight: '800', color: colors.brand },
  resultNote: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  stars: { flexDirection: 'row', gap: 1 },
  starPick: { flexDirection: 'row', gap: spacing.sm },
  reviewCard: { gap: spacing.sm },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reviewName: { ...typography.smallStrong, color: colors.text },
  reviewBody: { ...typography.small, color: colors.text, lineHeight: 20 },
  service: { gap: spacing.sm },
  serviceHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  serviceTitle: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  servicePrice: { ...typography.bodyStrong, color: colors.brand },
  serviceDesc: { ...typography.small, color: colors.textMuted, lineHeight: 20 },
  serviceMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  turnaround: { ...typography.caption, color: colors.textFaint },
  requestForm: { gap: spacing.md },
  selected: { ...typography.smallStrong, color: colors.brand },
  uploadNote: { ...typography.small, color: colors.textFaint, lineHeight: 18 },
  sentCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, borderColor: `${colors.court}66` },
  sentText: { ...typography.small, color: colors.text, flex: 1 },
  historyCard: { gap: spacing.sm },
  historyQuestion: { ...typography.smallStrong, color: colors.text, lineHeight: 20 },
  historyMeta: { ...typography.caption, color: colors.textFaint },
  historyResponse: {
    ...typography.small,
    color: colors.textMuted,
    lineHeight: 21,
    borderLeftWidth: 2,
    borderLeftColor: colors.brand,
    paddingLeft: spacing.md,
    marginTop: spacing.xs,
  },
});

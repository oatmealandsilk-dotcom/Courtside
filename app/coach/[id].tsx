import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar, Button, EmptyState, Field, Screen } from '@/components/ui';
import { pickFromDevice, type PickedMedia } from '@/components/MediaPicker';
import { KIND_LABEL, SPECIALTY_LABEL, statusLabel, turnaround, usePayments } from '@/features/coaching/bookings';
import { money, relativeTime } from '@/lib/format';
import { openLegal } from '@/lib/legal';
import { useApp } from '@/store/AppContext';
import { colors, font, radius, spacing, typography, lift } from '@/theme';

/**
 * A coach's page: who they are, what they offer, and booking one of their
 * services. Booking is a question (and a video, for a video review), then
 * Stripe's pay page; the coach answers inside CourtSide. Calm sections, no
 * boxed cards: the services are one grouped list you pick from.
 */
export default function CoachDetail() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { coaches, users, coachingRequests, coachResults, coachReviews, currentUserId, actions } = useApp();
  const payments = usePayments();

  const coach = coaches.find((c) => c.id === id);
  const user = users.find((u) => u.id === coach?.userId);

  const [selected, setSelected] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [video, setVideo] = useState<PickedMedia | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  // Results (the coach's own) and a review (players the coach has answered).
  const [addingResult, setAddingResult] = useState(false);
  const [result, setResult] = useState({ client: '', focus: '', before: '', after: '', weeks: '', note: '' });
  const [reviewStars, setReviewStars] = useState(0);
  const [reviewBody, setReviewBody] = useState('');

  if (!coach || !user) {
    return (
      <Screen title="Coach" compactTitle onBack={() => goBack()}>
        <EmptyState icon="alert-circle-outline" title="Coach not found" body="They may have paused their listing." />
      </Screen>
    );
  }

  const first = user.name.split(' ')[0] || user.name;
  const isOwner = currentUserId === coach.userId;
  const services = coach.services.filter((s) => isOwner || (s as { active?: boolean }).active !== false);
  const service = services.find((s) => s.id === selected);
  const mine = coachingRequests
    .filter((r) => r.coachId === coach.id && r.userId === currentUserId && r.status !== 'awaiting-payment')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const results = coachResults.filter((r) => r.coachId === coach.id);
  const reviews = coachReviews.filter((r) => r.coachId === coach.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const myReview = reviews.find((r) => r.authorId === currentUserId);
  const canReview = !isOwner && !!currentUserId && !myReview && mine.some((r) => r.status === 'answered');
  const bookable = !isOwner && coach.listed !== false && payments.on !== false && coach.payoutsReady !== false;

  const book = async () => {
    if (!service || question.trim().length < 2 || busy) return;
    setBusy(true);
    setError('');
    setNote('');
    try {
      const { outcome, requestId } = await actions.bookCoach(service.id, question.trim(), video);
      if (outcome === 'left') return; // The page went to Stripe.
      if (outcome === 'cancelled') { setNote('Payment cancelled. Nothing was charged.'); return; }
      // The pay sheet was closed before Stripe took a payment: what they wrote stays, to try again.
      if (outcome === 'closed') { setNote('Payment not finished, so nothing is booked yet. If you did pay, the booking will show under Coaching shortly, so check there before paying again.'); return; }
      // A booking paid, or one Stripe sent you back from but has not confirmed yet (it usually went through), clears the form, so it is never booked twice.
      if (outcome === 'paid' || outcome === 'pending') {
        setQuestion('');
        setVideo(null);
        setSelected(null);
      }
      if (requestId) router.push({ pathname: '/booking-done', params: { request: requestId, paid: outcome === 'paid' ? '1' : '0' } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const attach = async () => {
    try {
      const picked = await pickFromDevice('video');
      if (picked) setVideo(picked);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open your videos.');
    }
  };

  const canAddResult = result.client.trim() && result.focus.trim() && result.before.trim() && result.after.trim() && Number(result.weeks) > 0;
  const saveResult = () => {
    if (!canAddResult) return;
    actions.addCoachResult({ clientName: result.client.trim(), focus: result.focus.trim(), before: result.before.trim(), after: result.after.trim(), weeks: Number(result.weeks), note: result.note.trim() || undefined });
    setResult({ client: '', focus: '', before: '', after: '', weeks: '', note: '' });
    setAddingResult(false);
  };
  const postReview = () => {
    if (!reviewStars || !reviewBody.trim()) return;
    actions.addCoachReview(coach.id, reviewStars, reviewBody);
    setReviewBody('');
  };

  return (
    <Screen title="Coach" compactTitle onBack={() => goBack()}>
      {/* ------------------------------------------------------------ who */}
      <View style={styles.hero}>
        <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={72} />
        <View style={styles.heroWords}>
          <View style={styles.nameRow}>
            <PlayerName userId={user.id} style={styles.name}>{user.name}</PlayerName>
            {coach.verified ? <Ionicons name="shield-checkmark" size={16} color={colors.brand} accessibilityLabel="Verified coach" /> : null}
          </View>
          {coach.headline ? <Text style={styles.headline}>{coach.headline}</Text> : null}
          <Text style={styles.meta}>
            {coach.ratingCount ? `★ ${coach.ratingAvg.toFixed(1)} · ${coach.ratingCount} ${coach.ratingCount === 1 ? 'review' : 'reviews'} · ` : ''}
            Replies in about {turnaround(coach.responseTimeHours)}
          </Text>
        </View>
      </View>
      {isOwner ? (
        <Pressable accessibilityRole="link" onPress={() => router.push('/coach-studio')} style={({ pressed }) => [styles.ownerNote, pressed && { opacity: 0.7 }]}>
          <Ionicons name="eye-outline" size={16} color={colors.textMuted} />
          <Text style={styles.ownerText}>{coach.listed ? 'This is your page, as players see it.' : 'Only you can see this until you list it.'} Edit it in your studio.</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
        </Pressable>
      ) : null}
      {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
      {coach.credentials.length || coach.specialties.length ? (
        <View style={styles.facts}>
          {coach.credentials.map((c) => (
            <View key={c} style={styles.fact}><Ionicons name="checkmark" size={14} color={colors.brand} /><Text style={styles.factText}>{c}</Text></View>
          ))}
          {coach.specialties.length ? (
            <View style={styles.fact}><Ionicons name="clipboard-outline" size={14} color={colors.brand} /><Text style={styles.factText}>{coach.specialties.map((x) => SPECIALTY_LABEL[x] ?? x).join(', ')}{coach.yearsCoaching ? ` · ${coach.yearsCoaching} years coaching` : ''}</Text></View>
          ) : null}
        </View>
      ) : null}

      {/* ----------------------------------------------------------- book */}
      <Text style={styles.sectionTitle}>{isOwner ? 'Your services' : `Book ${first}`}</Text>
      {services.length === 0 ? (
        <Text style={styles.muted}>{isOwner ? 'Add a service in your studio so players can book you.' : 'No services on offer right now.'}</Text>
      ) : (
        <View style={styles.group}>
          {services.map((s, index) => {
            const on = selected === s.id;
            return (
              <Pressable
                key={s.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: !bookable }}
                disabled={!bookable}
                onPress={() => { setSelected(on ? null : s.id); setError(''); setNote(''); }}
                style={({ pressed }) => [styles.service, index > 0 && styles.line, pressed && { backgroundColor: colors.surfaceAlt }]}
              >
                {bookable ? <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View> : null}
                <View style={styles.serviceWords}>
                  <Text style={styles.serviceTitle}>{s.title}</Text>
                  <Text style={styles.meta}>{KIND_LABEL[s.kind]} · answered within {turnaround(s.turnaroundHours)}</Text>
                  {on && s.description ? <Text style={styles.serviceDesc}>{s.description}</Text> : null}
                </View>
                <Text style={styles.price}>{money(s.priceCents)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {!isOwner && (payments.on === false || coach.payoutsReady === false) ? <Text style={styles.muted}>Booking opens soon. Ask {first} a free question on the Coaching tab in the meantime.</Text> : null}

      {service && bookable ? (
        <View style={styles.form}>
          <Field
            label={service.kind === 'live-session' ? 'What do you want to work on? Suggest a few times that suit you.' : 'What do you want looked at?'}
            value={question}
            onChangeText={setQuestion}
            multiline
            minHeight={110}
          />
          {service.kind === 'video-review' || service.kind === 'written-qa' ? (
            video ? (
              <View style={styles.attached}>
                <Ionicons name="videocam" size={18} color={colors.brand} />
                <Text style={styles.attachedText} numberOfLines={1}>{video.label || 'Video'}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Remove video" hitSlop={8} onPress={() => setVideo(null)}>
                  <Ionicons name="close-circle" size={20} color={colors.textFaint} />
                </Pressable>
              </View>
            ) : (
              <Pressable accessibilityRole="button" onPress={attach} style={({ pressed }) => [styles.attach, pressed && { opacity: 0.7 }]}>
                <Ionicons name="videocam-outline" size={18} color={colors.text} />
                <Text style={styles.attachText}>{service.kind === 'video-review' ? 'Add your video' : 'Add a video (optional)'}</Text>
              </Pressable>
            )
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {note ? <Text style={styles.muted}>{note}</Text> : null}
          <Button
            label={busy ? (video ? 'Uploading your video…' : 'Opening payment…') : `Continue to payment · ${money(service.priceCents)}`}
            onPress={book}
            loading={busy}
            disabled={question.trim().length < 2 || (service.kind === 'video-review' && !video)}
            full
          />
          <Text style={styles.fine}>
            You pay through Stripe; CourtSide never sees your card. If {first} has not answered within {turnaround(service.turnaroundHours)}, you can have your money back. Once {first} answers, the booking is complete; for any problem after that, write to support@courtsidebase.com. By paying you agree to the{' '}
            <Text accessibilityRole="link" onPress={() => openLegal('terms')} style={styles.fineLink}>Terms of Use</Text>.
          </Text>
        </View>
      ) : null}

      {/* ------------------------------------------------------ your bookings */}
      {mine.length ? (
        <>
          <Text style={styles.sectionTitle}>Your bookings with {first}</Text>
          <View style={styles.group}>
            {mine.map((r, index) => {
              const s = coach.services.find((x) => x.id === r.serviceId);
              return (
                <Pressable key={r.id} accessibilityRole="link" onPress={() => router.push(`/coach-request/${r.id}`)} style={({ pressed }) => [styles.row, index > 0 && styles.line, pressed && { backgroundColor: colors.surfaceAlt }]}>
                  <View style={styles.rowWords}>
                    <Text style={styles.rowTitle} numberOfLines={2}>{r.question}</Text>
                    <Text style={styles.meta}>{s?.title ?? 'Booking'} · {statusLabel(r)} · {relativeTime(r.createdAt)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {/* ------------------------------------------------------------ results */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Results</Text>
        {isOwner ? (
          <Pressable accessibilityRole="button" onPress={() => setAddingResult((v) => !v)} hitSlop={8}>
            <Text style={styles.link}>{addingResult ? 'Cancel' : 'Add a result'}</Text>
          </Pressable>
        ) : null}
      </View>
      {isOwner && addingResult ? (
        <View style={styles.form}>
          <Field label="Player (first name or handle)" value={result.client} onChangeText={(v) => setResult((r) => ({ ...r, client: v }))} autoCapitalize="words" />
          <Field label="What you worked on" value={result.focus} onChangeText={(v) => setResult((r) => ({ ...r, focus: v }))} />
          <View style={styles.pair}>
            <View style={{ flex: 1 }}><Field label="Before" value={result.before} onChangeText={(v) => setResult((r) => ({ ...r, before: v }))} /></View>
            <View style={{ flex: 1 }}><Field label="After" value={result.after} onChangeText={(v) => setResult((r) => ({ ...r, after: v }))} /></View>
            <View style={{ width: 84 }}><Field label="Weeks" value={result.weeks} onChangeText={(v) => setResult((r) => ({ ...r, weeks: v }))} keyboardType="number-pad" /></View>
          </View>
          <Field label="One line on how (optional)" value={result.note} onChangeText={(v) => setResult((r) => ({ ...r, note: v }))} />
          <Button label="Add to my page" onPress={saveResult} disabled={!canAddResult} full />
        </View>
      ) : null}
      {results.length === 0 ? (
        <Text style={styles.muted}>{isOwner ? 'Show players what changed for the people you coach.' : 'None shared yet.'}</Text>
      ) : (
        <View style={styles.group}>
          {results.map((r, index) => (
            <View key={r.id} style={[styles.row, index > 0 && styles.line]}>
              <View style={styles.rowWords}>
                <Text style={styles.rowTitle}>{r.focus}</Text>
                <Text style={styles.meta}>{r.clientName} · {r.weeks} {r.weeks === 1 ? 'week' : 'weeks'}{r.note ? ` · ${r.note}` : ''}</Text>
              </View>
              <Text style={styles.change}>{r.before} <Text style={styles.changeArrow}>→</Text> <Text style={styles.changeAfter}>{r.after}</Text></Text>
            </View>
          ))}
        </View>
      )}

      {/* ------------------------------------------------------------ reviews */}
      <Text style={styles.sectionTitle}>Reviews</Text>
      {canReview ? (
        <View style={styles.form}>
          <Text style={styles.formLead}>{first} answered you. How did it go?</Text>
          <View style={styles.starPick}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Pressable key={i} accessibilityRole="radio" accessibilityState={{ selected: reviewStars === i }} accessibilityLabel={`${i} star${i > 1 ? 's' : ''}`} onPress={() => setReviewStars(i)} hitSlop={4}>
                <Ionicons name={i <= reviewStars ? 'star' : 'star-outline'} size={28} color={colors.warning} />
              </Pressable>
            ))}
          </View>
          <Field value={reviewBody} onChangeText={setReviewBody} placeholder="Your review" multiline minHeight={70} />
          <Button label="Post review" disabled={!reviewStars || !reviewBody.trim()} onPress={postReview} full />
        </View>
      ) : null}
      {reviews.length === 0 ? (
        <Text style={styles.muted}>No reviews yet. Only players {first} has answered can leave one.</Text>
      ) : (
        <View style={styles.group}>
          {reviews.map((r, index) => {
            const author = users.find((u) => u.id === r.authorId);
            return (
              <View key={r.id} style={[styles.review, index > 0 && styles.line]}>
                <View style={styles.reviewHead}>
                  <Avatar name={author?.name ?? '?'} seed={author?.avatarSeed ?? r.id} uri={author?.avatarUrl} size={30} />
                  <View style={{ flex: 1, gap: 1 }}>
                    <PlayerName userId={author?.id} style={styles.reviewName}>{author?.name ?? 'Player'}</PlayerName>
                    <Text style={styles.meta}>{relativeTime(r.createdAt)}{r.authorId === currentUserId ? ' · you' : ''}</Text>
                  </View>
                  <Text style={styles.stars} accessibilityLabel={`${r.rating} stars`}>{'★'.repeat(r.rating)}<Text style={styles.starsOff}>{'★'.repeat(5 - r.rating)}</Text></Text>
                </View>
                {r.body ? <Text style={styles.reviewBody}>{r.body}</Text> : null}
              </View>
            );
          })}
        </View>
      )}
      {busy ? <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.textFaint} /> : null}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingTop: spacing.sm },
  heroWords: { flex: 1, gap: 4, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { ...typography.title, color: colors.text },
  headline: { ...typography.body, color: colors.text, lineHeight: 21 },
  meta: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  ownerNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, padding: spacing.md, borderRadius: 16, backgroundColor: colors.surfaceAlt },
  ownerText: { flex: 1, ...typography.small, color: colors.text, lineHeight: 18 },
  bio: { ...typography.body, color: colors.text, lineHeight: 22, marginTop: spacing.lg },
  facts: { gap: 6, marginTop: spacing.lg },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  factText: { flex: 1, ...typography.small, color: colors.textMuted, lineHeight: 19 },
  sectionTitle: { ...typography.heading, color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.md },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  link: { ...typography.smallStrong, color: colors.brand },
  muted: { ...typography.small, color: colors.textMuted, lineHeight: 19, marginTop: spacing.sm },
  // One grouped list: a shade off the page, hairlines between, no outline.
  group: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  service: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  radioOn: { borderColor: colors.brand },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },
  serviceWords: { flex: 1, gap: 3, minWidth: 0 },
  serviceTitle: { ...typography.bodyStrong, color: colors.text },
  serviceDesc: { ...typography.small, color: colors.text, lineHeight: 19, marginTop: 4 },
  price: { ...typography.bodyStrong, color: colors.text, fontVariant: ['tabular-nums'] },
  form: { gap: spacing.md, marginTop: spacing.lg },
  formLead: { ...typography.body, color: colors.text },
  attach: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, height: 46, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, borderStyle: 'dashed' },
  attachText: { ...typography.smallStrong, color: colors.text },
  attached: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 46, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  attachedText: { flex: 1, ...typography.smallStrong, color: colors.text },
  error: { ...typography.small, color: colors.danger },
  fine: { ...typography.caption, color: colors.textFaint, lineHeight: 17, letterSpacing: 0 },
  fineLink: { color: colors.textMuted, textDecorationLine: 'underline' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  rowWords: { flex: 1, gap: 3, minWidth: 0 },
  rowTitle: { ...typography.body, ...font('500'), color: colors.text, lineHeight: 21 },
  change: { ...typography.small, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  changeArrow: { color: colors.textFaint },
  changeAfter: { ...typography.smallStrong, color: colors.brand },
  pair: { flexDirection: 'row', gap: spacing.sm },
  starPick: { flexDirection: 'row', gap: 6 },
  review: { gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reviewName: { ...typography.smallStrong, color: colors.text },
  stars: { fontSize: 13, color: colors.warning, letterSpacing: 1 },
  starsOff: { color: colors.border },
  reviewBody: { ...typography.small, color: colors.text, lineHeight: 20 },
});

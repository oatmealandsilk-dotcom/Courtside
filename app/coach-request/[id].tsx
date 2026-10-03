import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { TipComposer } from '@/components/TipComposer';
import { Avatar, Button, EmptyState, Screen } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { goBack } from '@/lib/goBack';
import { money, relativeTime } from '@/lib/format';
import { dueText, isOpen, isOverdue, KIND_LABEL, statusLabel } from '@/features/coaching/bookings';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, typography } from '@/theme';

/**
 * One booking, seen by both sides. The player sees their question, where it
 * stands, and the answer when it comes (or a refund, if it comes too late).
 * The coach sees the same question, the video, and writes the answer here.
 */
export default function Booking() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { coachingRequests, coaches, users, currentUserId, currentUser, ready, actions } = useApp();
  const [looked, setLooked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const request = coachingRequests.find((r) => r.id === id);
  // Opened from a notification before the app had it: fetch once.
  useEffect(() => {
    if (!ready || request || looked) return;
    void actions.refreshCoaching().finally(() => setLooked(true));
  }, [ready, request, looked, actions]);

  const coach = coaches.find((c) => c.id === request?.coachId);
  const asCoach = !!request && (request.coachUserId === currentUserId || coach?.userId === currentUserId);
  // The coach opening a new booking marks it as being looked at.
  const started = useRef(false);
  useEffect(() => {
    if (!request || !asCoach || started.current || request.status !== 'submitted') return;
    started.current = true;
    actions.startBooking(request.id);
  }, [request, asCoach, actions]);

  if (!request) {
    return (
      <Screen title="Booking" compactTitle onBack={() => goBack('/coaches')}>
        {!looked ? <View style={styles.wait}><CourtSpinner size={28} /></View> : <EmptyState icon="alert-circle-outline" title="Booking not found" body="It may have been cancelled before it was paid for." />}
      </Screen>
    );
  }

  const service = coach?.services.find((s) => s.id === request.serviceId);
  const other = users.find((u) => u.id === (asCoach ? request.userId : coach?.userId));
  const otherFirst = other?.name.split(' ')[0] ?? (asCoach ? 'The player' : 'Your coach');
  const overdue = isOverdue(request);
  const open = isOpen(request);
  // Support: an admin (not the coach or the player) can refund any paid booking, answered ones included.
  const asSupport = !!currentUser?.isAdmin && !asCoach && request.userId !== currentUserId && !!request.paidAt && !request.refundedAt;

  const refund = () => {
    confirm({
      title: asSupport ? 'Refund this booking?' : asCoach ? 'Decline and refund?' : 'Get your money back?',
      message: asSupport ? 'The player gets the full price back, the coach’s share is taken back from them, and the booking closes. This can’t be undone.'
        : asCoach ? `${otherFirst} gets the full price back and the booking closes.` : 'The full price goes back to your card and the booking closes.',
      confirmLabel: asCoach ? 'Decline' : 'Refund',
      // The coach turning a booking down is red; a player getting their money back is not.
      destructive: asCoach || asSupport,
      onConfirm: async () => {
        setBusy(true);
        setError('');
        try { await actions.refundBooking(request.id); } catch (e) { setError(e instanceof Error ? e.message : 'That did not go through.'); } finally { setBusy(false); }
      },
    });
  };
  const watch = () => {
    if (!request.videoUrl) return;
    if (Platform.OS === 'web') window.open(request.videoUrl, '_blank', 'noopener');
    else void WebBrowser.openBrowserAsync(request.videoUrl);
  };

  return (
    <Screen title={service?.title ?? 'Booking'} compactTitle onBack={() => goBack(asCoach ? '/coach-bookings' : '/coaches')}>
      <Pressable accessibilityRole="link" disabled={!other} onPress={() => other && router.push(asCoach ? `/user/${other.id}` : `/coach/${coach?.id}`)} style={styles.who}>
        <Avatar name={other?.name ?? '?'} seed={other?.avatarSeed ?? request.id} uri={other?.avatarUrl} size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.whoName}>{asCoach ? `From ${other?.name ?? 'a player'}` : `With ${other?.name ?? 'your coach'}`}</Text>
          <Text style={styles.meta}>
            {service ? `${KIND_LABEL[service.kind]} · ` : ''}{request.priceCents ? `${money(request.priceCents)} · ` : ''}booked {relativeTime(request.paidAt ?? request.createdAt)}
          </Text>
        </View>
        <View style={[styles.pill, request.status === 'answered' && styles.pillDone, overdue && styles.pillLate]}>
          <Text style={[styles.pillText, request.status === 'answered' && styles.pillTextDone]}>{overdue ? 'Late' : statusLabel(request, asCoach)}</Text>
        </View>
      </Pressable>
      {open && request.dueAt ? <Text style={[styles.due, overdue && { color: colors.danger }]}>{overdue ? `Was due ${dueText(request.dueAt)}` : `Answer due ${dueText(request.dueAt)}`}</Text> : null}

      <Text style={styles.label}>{asCoach ? 'Their question' : 'Your question'}</Text>
      <View style={styles.card}>
        <Text style={styles.body}>{request.question}</Text>
        {request.videoUrl ? (
          <Pressable accessibilityRole="button" onPress={watch} style={({ pressed }) => [styles.video, pressed && { opacity: 0.7 }]}>
            <Ionicons name="play-circle" size={22} color={colors.brand} />
            <Text style={styles.videoText}>Watch the video</Text>
          </Pressable>
        ) : request.videoLabel ? <Text style={styles.meta}>{request.videoLabel}</Text> : null}
      </View>

      <Text style={styles.label}>{asCoach ? 'Your answer' : 'The answer'}</Text>
      {request.response ? (
        <View style={[styles.card, styles.answer]}>
          <Text style={styles.body}>{request.response}</Text>
          {request.respondedAt ? <Text style={styles.meta}>{relativeTime(request.respondedAt)}</Text> : null}
        </View>
      ) : request.status === 'declined' || request.status === 'refunded' ? (
        <Text style={styles.note}>{request.status === 'declined' ? `${asCoach ? 'You' : otherFirst} declined this one. ` : 'This one was not answered in time. '}The full price went back{asCoach ? ' to the player' : ' to your card'}.</Text>
      ) : asCoach ? (
        <View style={{ gap: spacing.md }}>
          {/* "Your answer" sits right above, so the box starts empty (an empty string, not left out, which would bring back the tips wording). */}
          <TipComposer
            placeholder=""
            accessibilityLabel="Your answer"
            onSubmit={(text) => actions.answerBooking(request.id, text)}
          />
          <Pressable accessibilityRole="button" onPress={refund} disabled={busy} hitSlop={6} style={styles.quiet}>
            <Text style={styles.quietText}>Cannot take this one? Decline and refund</Text>
          </Pressable>
        </View>
      ) : request.status === 'awaiting-payment' ? (
        <Text style={styles.note}>This booking was never paid for, so it has not gone to {otherFirst}.</Text>
      ) : (
        <View style={{ gap: spacing.md }}>
          <Text style={styles.note}>
            {request.status === 'in-review' ? `${otherFirst} has opened it and is working on it.` : `Waiting for ${otherFirst} to open it.`} You will get a notification when the answer is in.
          </Text>
          {overdue ? <Button label="Get your money back" variant="secondary" onPress={refund} loading={busy} full /> : null}
        </View>
      )}
      {asSupport ? (
        <Pressable accessibilityRole="button" onPress={refund} disabled={busy} hitSlop={6} style={styles.quiet}>
          <Text style={styles.quietText}>Admin: refund this booking</Text>
        </Pressable>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!asCoach && request.status === 'answered' && coach ? (
        <Button label={`Review ${otherFirst}`} variant="secondary" onPress={() => router.push(`/coach/${coach.id}`)} full />
      ) : null}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  wait: { paddingVertical: 60, alignItems: 'center' },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  whoName: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  pillDone: { backgroundColor: colors.brandDim },
  pillLate: { backgroundColor: `${colors.danger}22` },
  pillText: { ...typography.caption, ...font('600'), color: colors.textMuted, letterSpacing: 0 },
  pillTextDone: { color: colors.brand },
  due: { ...typography.small, color: colors.textMuted, marginTop: spacing.md },
  label: { ...typography.smallStrong, color: colors.textMuted, marginTop: spacing.xl, marginBottom: spacing.sm, paddingHorizontal: spacing.xs },
  card: { gap: spacing.md, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.surface },
  // The answer reads as the answer by a stripe of the court's colour down its edge, not a tinted box (which went olive on dark courts).
  answer: { borderLeftWidth: 3, borderLeftColor: colors.brand, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
  body: { ...typography.body, color: colors.text, lineHeight: 23 },
  video: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.bg },
  videoText: { ...typography.smallStrong, color: colors.text },
  note: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  quiet: { alignSelf: 'center', paddingVertical: spacing.sm },
  quietText: { ...typography.small, color: colors.textMuted, textDecorationLine: 'underline' },
  error: { ...typography.small, color: colors.danger, marginTop: spacing.md },
});

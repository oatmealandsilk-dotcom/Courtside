import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { Button, Screen } from '@/components/ui';
import { goBack } from '@/lib/goBack';
import { goToTab } from '@/features/navigation/startTab';
import { money } from '@/lib/format';
import { dueText, turnaround } from '@/features/coaching/bookings';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';
import { InkButton, PlainActions, TextAction, plainText } from '@/components/plain/Plain';
import { noBoxes } from '@/features/noBoxes/noBoxes';

/** No boxes (demo only, features/noBoxes): the result in plain words at the left, no round mark, one ink button. */
const PLAIN = noBoxes();

/**
 * Where Stripe sends a player back after paying (and where the app goes
 * after a booking). It asks Stripe itself whether the payment went through,
 * a few times if Stripe is slow to say, then shows what happens next.
 */
export default function BookingDone() {
  const styles = useThemedStyles(styleDefinitions);
  const { request: requestId, paid, cancelled } = useLocalSearchParams<{ request?: string; paid?: string; cancelled?: string }>();
  const { coachingRequests, coaches, users, ready, actions } = useApp();
  // With no booking id to ask about, there is nothing to wait for.
  const [state, setState] = useState<'checking' | 'paid' | 'unpaid' | 'cancelled'>(cancelled === '1' ? 'cancelled' : paid === '1' ? 'paid' : requestId ? 'checking' : 'unpaid');
  const asked = useRef(false);

  useEffect(() => {
    if (!ready || asked.current || !requestId || cancelled === '1') return;
    asked.current = true;
    (async () => {
      // Stripe can take a moment to confirm; ask up to four times.
      for (let i = 0; i < 4; i++) {
        if (await actions.confirmBooking(String(requestId))) { setState('paid'); return; }
        await new Promise((r) => setTimeout(r, 1500));
      }
      setState(paid === '1' ? 'paid' : 'unpaid');
    })();
  }, [ready, requestId, cancelled, paid, actions]);

  const request = coachingRequests.find((r) => r.id === requestId);
  const coach = coaches.find((c) => c.id === request?.coachId);
  const coachUser = users.find((u) => u.id === coach?.userId);
  const service = coach?.services.find((s) => s.id === request?.serviceId);
  const first = coachUser?.name.split(' ')[0] ?? 'Your coach';
  // Back to a page already underneath, rather than stacking a second copy
  // of it (or of the whole tabs) on top.
  const toCoach = () => {
    if (!coach) return;
    if (router.canDismiss()) router.dismissTo(`/coach/${coach.id}`);
    else router.replace(`/coach/${coach.id}`);
  };
  const toCoaching = () => goToTab('/coaches');

  return (
    <Screen title="Booking" compactTitle onBack={() => (coach ? toCoach() : goBack('/coaches'))}>
      <View style={[styles.body, PLAIN && styles.plainBody]}>
        {state === 'checking' ? (
          <>
            <CourtSpinner size={32} />
            <Text style={styles.title}>Checking your payment</Text>
            <Text style={styles.lead}>This takes a second or two.</Text>
          </>
        ) : state === 'paid' ? (
          <>
            {PLAIN ? null : <View style={styles.mark}><Ionicons name="checkmark" size={30} color={colors.brandInk} /></View>}
            <Text style={[styles.title, PLAIN && styles.plainTitle]}>Booked</Text>
            <Text style={[styles.lead, PLAIN && styles.plainLead]}>
              {first} has your request{request?.dueAt ? ` and will answer by ${dueText(request.dueAt)}` : service ? ` and will answer within ${turnaround(service.turnaroundHours)}` : ''}. You will get a notification when it is in.
            </Text>
            {service ? <Text style={[styles.service, PLAIN && styles.plainLeft]}>{service.title}</Text> : null}
            {request?.priceCents ? <Text style={[styles.fine, PLAIN && styles.plainLeft]}>Paid {money(request.priceCents)}. If {first} has not answered in time, you can have it back.</Text> : null}
            {PLAIN ? (
              <PlainActions align="start" style={styles.plainActions}>
                {request ? <InkButton label="See your booking" onPress={() => router.replace(`/coach-request/${request.id}`)} /> : null}
                {request ? <TextAction label="Back to Coaching" onPress={toCoaching} /> : <InkButton label="Back to Coaching" onPress={toCoaching} />}
              </PlainActions>
            ) : (
            <View style={styles.actions}>
              {request ? <Button label="See your booking" onPress={() => router.replace(`/coach-request/${request.id}`)} full /> : null}
              <Button label="Back to Coaching" variant="secondary" onPress={toCoaching} full />
            </View>
            )}
          </>
        ) : (
          <>
            {PLAIN ? null : <View style={[styles.mark, styles.markQuiet]}><Ionicons name="close" size={28} color={colors.textMuted} /></View>}
            <Text style={[styles.title, PLAIN && styles.plainTitle]}>{state === 'cancelled' ? 'Payment cancelled' : 'Not paid yet'}</Text>
            <Text style={[styles.lead, PLAIN && styles.plainLead]}>
              {state === 'cancelled'
                ? 'Nothing was charged. You can book again whenever you like.'
                : 'Stripe has not confirmed a payment for this booking. If your card was charged, the booking will show up under Coaching within a few minutes. If it doesn’t, write to support@courtsidebase.com.'}
            </Text>
            {PLAIN ? (
              <PlainActions align="start" style={styles.plainActions}>
                {coach ? <InkButton label={`Back to ${first}`} onPress={toCoach} /> : null}
                {coach ? <TextAction label="Back to Coaching" onPress={toCoaching} /> : <InkButton label="Back to Coaching" onPress={toCoaching} />}
              </PlainActions>
            ) : (
            <View style={styles.actions}>
              {coach ? <Button label={`Back to ${first}`} onPress={toCoach} full /> : null}
              <Button label="Back to Coaching" variant="secondary" onPress={toCoaching} full />
            </View>
            )}
          </>
        )}
      </View>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  body: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xxl, paddingHorizontal: spacing.md },
  mark: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  markQuiet: { backgroundColor: colors.surfaceAlt },
  title: { ...typography.display, color: colors.text, textAlign: 'center' },
  lead: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22, maxWidth: 380 },
  service: { ...typography.smallStrong, color: colors.text, textAlign: 'center' },
  fine: { ...typography.small, color: colors.textFaint, textAlign: 'center', lineHeight: 19, maxWidth: 360 },
  plainBody: { alignItems: 'flex-start', gap: spacing.sm, paddingHorizontal: 0 },
  plainTitle: { ...plainText.titleLg, fontSize: 28, lineHeight: 34, textAlign: 'left' },
  plainLead: { textAlign: 'left', maxWidth: 520 },
  plainLeft: { textAlign: 'left' },
  plainActions: { marginTop: spacing.md },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg, maxWidth: 420, width: '100%', marginHorizontal: 'auto' },
});

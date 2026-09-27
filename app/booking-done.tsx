import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { Button, Screen } from '@/components/ui';
import { goBack } from '@/lib/goBack';
import { money } from '@/lib/format';
import { dueText, turnaround } from '@/features/coaching/bookings';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

/**
 * Where Stripe sends a player back after paying (and where the app goes
 * after a booking). It asks Stripe itself whether the payment went through,
 * a few times if Stripe is slow to say, then shows what happens next.
 */
export default function BookingDone() {
  const styles = useThemedStyles(styleDefinitions);
  const { request: requestId, paid, cancelled } = useLocalSearchParams<{ request?: string; paid?: string; cancelled?: string }>();
  const { coachingRequests, coaches, users, ready, actions } = useApp();
  const [state, setState] = useState<'checking' | 'paid' | 'unpaid' | 'cancelled'>(cancelled === '1' ? 'cancelled' : paid === '1' ? 'paid' : 'checking');
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

  return (
    <Screen title="Booking" compactTitle onBack={() => (coach ? router.replace(`/coach/${coach.id}`) : goBack('/coaches'))}>
      <View style={styles.body}>
        {state === 'checking' ? (
          <>
            <CourtSpinner size={32} />
            <Text style={styles.title}>Checking your payment</Text>
            <Text style={styles.lead}>This takes a second or two.</Text>
          </>
        ) : state === 'paid' ? (
          <>
            <View style={styles.mark}><Ionicons name="checkmark" size={30} color={colors.brandInk} /></View>
            <Text style={styles.title}>Booked</Text>
            <Text style={styles.lead}>
              {first} has your request{request?.dueAt ? ` and will answer by ${dueText(request.dueAt)}` : service ? ` and will answer within ${turnaround(service.turnaroundHours)}` : ''}. You will get a notification when it is in.
            </Text>
            {service ? <Text style={styles.service}>{service.title}</Text> : null}
            {request?.priceCents ? <Text style={styles.fine}>Paid {money(request.priceCents)}. If {first} has not answered in time, you can have it back.</Text> : null}
            <View style={styles.actions}>
              {request ? <Button label="See your booking" onPress={() => router.replace(`/coach-request/${request.id}`)} full /> : null}
              <Button label="Back to Coaching" variant="secondary" onPress={() => router.replace('/coaches')} full />
            </View>
          </>
        ) : (
          <>
            <View style={[styles.mark, styles.markQuiet]}><Ionicons name="close" size={28} color={colors.textMuted} /></View>
            <Text style={styles.title}>{state === 'cancelled' ? 'Payment cancelled' : 'Not paid yet'}</Text>
            <Text style={styles.lead}>
              {state === 'cancelled'
                ? 'Nothing was charged. You can book again whenever you like.'
                : 'Stripe has not confirmed a payment for this booking. If money left your account, it will show up here within a minute, or write to support@courtsidebase.com.'}
            </Text>
            <View style={styles.actions}>
              {coach ? <Button label={`Back to ${first}`} onPress={() => router.replace(`/coach/${coach.id}`)} full /> : null}
              <Button label="Back to Coaching" variant="secondary" onPress={() => router.replace('/coaches')} full />
            </View>
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
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg, maxWidth: 420, width: '100%', marginHorizontal: 'auto' },
});

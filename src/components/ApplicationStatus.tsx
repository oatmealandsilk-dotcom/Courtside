import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Reanimated, { Easing, FadeInDown } from 'react-native-reanimated';

import { LiveDot } from '@/components/LiveDot';
import { Avatar, Button, Screen } from '@/components/ui';
import type { CoachApplication, User } from '@/data/types';
import { usePaidBooking } from '@/features/coaching/bookings';
import { goBack } from '@/lib/goBack';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

type Status = CoachApplication['status'];

/**
 * What the page says, in the voice of someone at the club who is on it.
 * `paid`: paid booking is open to this person (usePaidBooking). Until then
 * coaching is free, so nothing here speaks of payouts or booking (App Review, Oct 6).
 */
const WORDS: Record<Status, { title: string; lead: (first: string, paid: boolean) => string; pill: string }> = {
  submitted: { title: 'It’s in.', lead: (f) => `Thanks, ${f}. Every coach on CourtSide is checked by a person, so this takes a couple of days. We’ll tell you here the moment anything moves.`, pill: 'Received' },
  'in-review': { title: 'We’re on it.', lead: (f) => `${f}, someone is going through your application right now. If we need anything, we’ll call or email.`, pill: 'In review' },
  approved: { title: 'You’re in.', lead: (f, paid) => (paid
    ? `Welcome to CourtSide coaching, ${f}. Your studio is open: set your page, your services and your payouts, and players can book you.`
    : `Welcome to CourtSide coaching, ${f}. Your studio is open: set your page and your services, and players can find you.`), pill: 'Approved' },
  rejected: { title: 'Not this time.', lead: (f) => `Thanks for applying, ${f}. The notification we sent says why. Most people who reapply do it with a rating link or one more reference.`, pill: 'Not approved' },
};

const stepsFor = (paid: boolean) => [
  { title: 'Application filed', note: 'Your details, ratings and references' },
  { title: 'Credentials and rating checked', note: 'We open your UTR or USTA page ourselves' },
  { title: 'A quick reference call', note: 'Ten minutes with someone you coach' },
  { title: 'Listed on CourtSide', note: paid ? 'Your studio opens and players can book you' : 'Your studio opens and players can find you' },
];

const enter = (i: number) => FadeInDown.delay(60 + i * 70).duration(420).easing(Easing.out(Easing.cubic));

/**
 * Where a coach application stands, after it is sent. A tracker rather than
 * a notice: the steps it goes through, done ones ticked, the current one
 * pulsing, with what was sent beside it and something useful to do while
 * waiting. The one button is whatever the next step really is.
 */
export function ApplicationStatus({ application, me, onApplyAgain }: { application?: CoachApplication; me?: User | null; onApplyAgain: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const status: Status = application?.status ?? 'submitted';
  const words = WORDS[status];
  const paid = usePaidBooking();
  const STEPS = stepsFor(paid);
  const first = (me?.name ?? application?.fullName ?? 'there').split(' ')[0];
  // Steps ticked off, and the one happening now (none once it is decided).
  const doneUpTo = ({ submitted: 1, 'in-review': 2, approved: 4, rejected: 1 } as const)[status];
  const nowAt = status === 'submitted' ? 2 : status === 'in-review' ? 3 : 0;
  const filed = application?.createdAt ? new Date(application.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Today';
  const facts = [application?.utr ? `UTR ${application.utr}` : null, application?.ntrp ? `NTRP ${application.ntrp}` : null, application?.yearsCoaching ? `${application.yearsCoaching} yrs coaching` : null].filter(Boolean).join(' · ');

  return (
    <Screen title="Coach application" compactTitle onBack={() => goBack('/coaches')}>
      <View style={styles.page}>
        <Reanimated.View entering={enter(0)} style={styles.head}>
          <Text style={styles.title}>{words.title}</Text>
          <Text style={styles.lead}>{words.lead(first, paid)}</Text>
        </Reanimated.View>

        <Reanimated.View entering={enter(1)} style={styles.card}>
          <View style={styles.who}>
            <Avatar name={me?.name ?? application?.fullName ?? '?'} seed={me?.avatarSeed ?? 'me'} uri={me?.avatarUrl} size={44} />
            <View style={styles.whoWords}>
              <Text style={styles.whoName} numberOfLines={1}>{application?.fullName ?? me?.name ?? 'Your application'}</Text>
              <Text style={styles.meta} numberOfLines={1}>Filed {filed}{facts ? ` · ${facts}` : ''}</Text>
            </View>
            <View style={[styles.pill, status === 'approved' && styles.pillGood, status === 'rejected' && styles.pillQuiet]}>
              <Text style={[styles.pillText, status === 'approved' && styles.pillTextGood]}>{words.pill}</Text>
            </View>
          </View>

          <View style={styles.track}>
            {STEPS.map((step, index) => {
              const n = index + 1;
              const done = n <= doneUpTo;
              const now = n === nowAt;
              const stopped = status === 'rejected' && n > 1;
              return (
                <View key={step.title} style={styles.step}>
                  <View style={styles.rail}>
                    <View style={[styles.node, done && styles.nodeDone, now && styles.nodeNow, stopped && styles.nodeStopped]}>
                      {done ? <Ionicons name="checkmark" size={13} color={colors.brandInk} /> : now ? <LiveDot size={8} /> : null}
                    </View>
                    {index < STEPS.length - 1 ? <View style={[styles.line, done && styles.lineDone]} /> : null}
                  </View>
                  <View style={styles.stepWords}>
                    <View style={styles.stepTop}>
                      <Text style={[styles.stepTitle, !done && !now && styles.stepTitleLater]}>{step.title}</Text>
                      {now ? <Text style={styles.nowTag}>Now</Text> : null}
                    </View>
                    <Text style={styles.stepNote}>{index === 0 ? `${step.note} · ${filed}` : step.note}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Reanimated.View>

        {status !== 'approved' ? (
          <Reanimated.View entering={enter(2)}>
            <Pressable accessibilityRole="link" onPress={() => router.push('/(tabs)/coaches')} style={({ pressed }) => [styles.meanwhile, pressed && { opacity: 0.8 }]}>
              <View style={styles.meanwhileMark}><Ionicons name="chatbubbles-outline" size={18} color={colors.brand} /></View>
              <View style={styles.whoWords}>
                <Text style={styles.meanwhileTitle}>While you wait</Text>
                <Text style={styles.meta}>Players are asking questions on the Coaching tab. Once you’re approved, coaches who answer early are the ones players find first.</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </Pressable>
          </Reanimated.View>
        ) : null}

        <Reanimated.View entering={enter(3)} style={styles.actions}>
          {status === 'approved' ? (
            <Button label="Open your studio" onPress={() => router.replace('/coach-studio')} full />
          ) : status === 'rejected' ? (
            <Button label="Apply again" onPress={onApplyAgain} full />
          ) : (
            <Button label="Back to coaching" variant="secondary" onPress={() => router.replace('/(tabs)/coaches')} full />
          )}
        </Reanimated.View>
      </View>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  page: { gap: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, maxWidth: 560, width: '100%', alignSelf: 'center' },
  head: { gap: spacing.sm },
  title: { ...typography.display, color: colors.text },
  lead: { ...typography.body, color: colors.textMuted, lineHeight: 23 },
  card: { ...lift, borderRadius: 20, backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.lg },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  whoWords: { flex: 1, minWidth: 0, gap: 2 },
  whoName: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.bgElevated },
  pillGood: { backgroundColor: colors.brand },
  pillQuiet: { backgroundColor: colors.surfaceAlt },
  pillText: { ...typography.caption, ...font('600'), letterSpacing: 0, color: colors.textMuted },
  pillTextGood: { color: colors.brandInk },
  track: { gap: 0 },
  step: { flexDirection: 'row', gap: spacing.md },
  rail: { width: 24, alignItems: 'center' },
  node: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  nodeDone: { backgroundColor: colors.brand, borderColor: colors.brand },
  nodeNow: { borderColor: colors.brand },
  nodeStopped: { opacity: 0.4 },
  line: { flex: 1, width: 2, minHeight: 22, marginVertical: 3, borderRadius: 1, backgroundColor: colors.border },
  lineDone: { backgroundColor: colors.brand },
  stepWords: { flex: 1, gap: 2, paddingBottom: spacing.lg },
  stepTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepTitle: { ...typography.body, ...font('600'), color: colors.text },
  stepTitleLater: { color: colors.textMuted, ...font('500') },
  nowTag: { ...typography.caption, ...font('700'), letterSpacing: 0.3, color: colors.brand },
  stepNote: { ...typography.small, color: colors.textFaint, lineHeight: 18 },
  meanwhile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  meanwhileMark: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  meanwhileTitle: { ...typography.bodyStrong, color: colors.text },
  actions: { marginTop: spacing.sm },
});

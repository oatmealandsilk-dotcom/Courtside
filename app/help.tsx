import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Screen } from '@/components/ui';
import { isSupabaseConfigured } from '@/lib/supabase';
import { replayTour } from '@/features/tour/tourStore';
import { TOUR_ON } from '@/features/tour/tourSeen';
import { useApp } from '@/store/AppContext';
import { useAiCoachOn } from '@/features/aiCoach/switch';
import { usePaidBooking } from '@/features/coaching/bookings';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * The answers, as things stand for this person: the payment answer only once
 * paid booking is open to them, and the AI coach's only once it is switched
 * on, so Help never describes something they cannot find (App Review 2.1).
 */
function topicsFor({ aiCoachOn, paidBooking }: { aiCoachOn: boolean; paidBooking: boolean }): { title: string; body: string }[] {
  return [
  {
    title: 'How does the feed decide what I see?',
    body: 'Home mixes clips, Instants and Community threads, leaning toward newer ones, and deals them in a fresh order each time you open it. Things you have not seen come before things you have, and new players’ first posts appear near the top so they get a welcome. Muting someone removes their posts without unfollowing.',
  },
  {
    title: 'What is my NTRP or UTR badge?',
    body: 'It is the rating you chose when you joined. To change it: Profile → Edit Profile → Rating. NTRP runs 1.0–7.0, UTR 1–16. It only changes when you change it; nothing here rates you automatically.',
  },
  {
    title: 'How do I ask a coach?',
    body: 'Coaching → Ask a coach. Describe what you are stuck on and add a clip if you have one. Questions are public, so other players learn from the answer too. Asking is free. You can also message a coach from their page.',
  },
  ...(paidBooking ? [{
    title: 'How does paying for coaching work?',
    body: 'Pick a lesson on a coach\'s page and pay on Stripe\'s page. CourtSide never sees your card. Settings → Account center → Payments lists everything you have paid for.',
  }] : []),
  {
    title: 'How do I change my handle?',
    body: 'Edit profile → Handle. You can change it once every 30 days. Your old handle is held for 14 days so nobody can take it, and invite links with it keep working.',
  },
  ...(aiCoachOn ? [{
    title: 'Is the AI coach medical advice?',
    body: 'No. It builds training weeks from your profile, calendar, and any injury notes you add, and it will cap volume around those notes — but it is general training information, not a diagnosis. See a professional for pain.',
  }] : []),
  {
    title: 'How do I block or report someone?',
    body: 'Open their profile and tap the ••• button in the top right. Blocking stops one-to-one messages between you and hides each of your posts, hits, threads and replies from the other. Your chat with them leaves your inbox. In a group chat you are both in, their messages are folded away for you. To report a post, use its ••• menu; to report a thread, the flag at the top of it; to report a comment, a reply or a chat message, press and hold it. A person reviews every report.',
  },
  {
    title: 'Where do my videos go?',
    body: isSupabaseConfigured ? 'Videos you post are uploaded to your account and shown only where you post them. Anything you delete is removed.' : 'In this demo build, nothing is uploaded — videos stay on your device and disappear when you close the app.',
  },
  {
    title: 'How do I change the look?',
    body: 'Settings → Theme. Pick a city court (Melbourne, Paris, London or New York), Night, or Clean; it applies everywhere straight away.',
  },
  ];
}

export default function Help() {
  const { currentUser } = useApp();
  const styles = useThemedStyles(styleDefinitions);
  const [open, setOpen] = useState<number | null>(null);
  const aiCoachOn = useAiCoachOn() === true;
  const paidBooking = usePaidBooking();
  const TOPICS = topicsFor({ aiCoachOn, paidBooking });

  return (
    <Screen title="Help" compactTitle onBack={() => goBack()}>
      <Text style={styles.lead}>Quick answers first. If yours is not here, the About page has a way to reach us.</Text>
      <View style={styles.card}>
        {TOPICS.map((topic, index) => {
          const expanded = open === index;
          return (
            <View key={topic.title} style={[index > 0 && styles.rowBorder]}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => setOpen(expanded ? null : index)}
                style={styles.row}
              >
                <Text style={styles.question}>{topic.title}</Text>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={colors.textFaint} />
              </Pressable>
              {expanded ? <Text style={styles.answer}>{topic.body}</Text> : null}
            </View>
          );
        })}
      </View>
      <View style={styles.links}>
        {/* The first-run tutorial again, from Community on the map, where the app opens (admins only until it is switched on for everyone). */}
        {TOUR_ON || currentUser?.isAdmin ? (
          <Pressable accessibilityRole="button" onPress={replayTour} style={styles.link}>
            <Ionicons name="compass-outline" size={19} color={colors.text} />
            <Text style={styles.linkText}>Show the tutorial</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="link" onPress={() => router.push('/guidelines')} style={styles.link}>
          <Ionicons name="book-outline" size={19} color={colors.text} />
          <Text style={styles.linkText}>Community Guidelines</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => router.push('/privacy')} style={styles.link}>
          <Ionicons name="shield-checkmark-outline" size={19} color={colors.text} />
          <Text style={styles.linkText}>Privacy center</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => router.push('/about')} style={styles.link}>
          <Ionicons name="information-circle-outline" size={19} color={colors.text} />
          <Text style={styles.linkText}>About CourtSide</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>
      </View>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  lead: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingBottom: spacing.lg },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 52 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  question: { ...typography.body, color: colors.text, flex: 1 },
  answer: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  links: { paddingTop: spacing.xl, gap: spacing.xs },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  linkText: { ...typography.body, color: colors.text, flex: 1 },
});

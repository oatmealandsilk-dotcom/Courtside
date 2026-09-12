import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

const TOPICS: { title: string; body: string }[] = [
  {
    title: 'How does the feed decide what I see?',
    body: 'Newest moments from people you follow come first, then popular reels and unanswered discussions from your level. Muting someone removes their posts without unfollowing.',
  },
  {
    title: 'What is my NTRP or UTR badge?',
    body: 'It is the rating you set in Edit profile. NTRP runs 1.0–7.0, UTR 1–16. It only changes when you change it — nothing here rates you automatically.',
  },
  {
    title: 'How do I ask a coach?',
    body: 'Coaching → Ask a coach. Describe what you are stuck on and add a clip if you have one. Questions are public, so other players learn from the answer too. Paid one-to-one reviews are booked from a coach\'s own page.',
  },
  {
    title: 'Is the AI coach medical advice?',
    body: 'No. It builds training weeks from your profile, calendar, and any injury notes you add, and it will cap volume around those notes — but it is general training information, not a diagnosis. See a professional for pain.',
  },
  {
    title: 'How do I block or report someone?',
    body: 'Open their profile and tap the ••• button in the top right. Blocking hides you from each other and removes the conversation. Reports are reviewed by a person.',
  },
  {
    title: 'Where do my videos go?',
    body: 'In this demo build, nothing is uploaded — videos stay on your device and disappear when you close the app. A real build stores them privately and only shares what you post.',
  },
  {
    title: 'How do I change the look?',
    body: 'Settings → Theme. Pick a Grand Slam court or the night theme; it applies everywhere straight away.',
  },
];

export default function Help() {
  const styles = useThemedStyles(styleDefinitions);
  const [open, setOpen] = useState<number | null>(null);

  return (
    <Screen title="Help" compactTitle onBack={() => router.back()}>
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
        <Pressable accessibilityRole="link" onPress={() => router.push('/privacy')} style={styles.link}>
          <Ionicons name="shield-checkmark-outline" size={19} color={colors.text} />
          <Text style={styles.linkText}>Privacy centre</Text>
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

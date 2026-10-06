import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { HitGlyph } from '@/components/HitGlyph';
import { RecapCard, RecapHighlights } from '@/components/recap/RecapCard';
import { RecapStoryArt } from '@/components/recap/RecapStoryArt';
import { Button, Screen } from '@/components/ui';
import { requestSection } from '@/features/navigation/swipeOrder';
import { goToTab } from '@/features/navigation/startTab';
import { lastWeekStart, weekRange, weekRecap } from '@/features/recap/recap';
import { weekStart } from '@/features/records/records';
import { canCopyStory, canSaveStory, exportStory, stageSize, warmStory, type StoryAction } from '@/features/share/storyImage';
import { duration } from '@/lib/format';
import { goBack } from '@/lib/goBack';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

const ACTIONS: { key: StoryAction; label: string; spoken: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'instagram', label: 'Stories', spoken: 'Share to Instagram Stories', icon: 'logo-instagram' },
  { key: 'copy', label: 'Copy', spoken: 'Copy the picture', icon: 'copy-outline' },
  { key: 'save', label: 'Save', spoken: 'Save the picture', icon: 'download-outline' },
  { key: 'more', label: 'More', spoken: 'More ways to share', icon: 'share-outline' },
];

/**
 * Your week on court (owner, Oct 5: "weekly [recap] is good too"): the
 * Monday recap's card, opened from its alert or its row in Notifications
 * (?week=, the week's Monday), or from "Your week" at the top of Your
 * sessions. Worked out on this phone from your own log, by the same rules as
 * the alert (features/recap/recap.ts), so the two always agree. Under it,
 * what stood out (best streak yet, a record), then the same share row as a
 * session: the card as an Instagram story picture. Only you see it until you
 * share it. A rest week (nothing played, something the week before) is a
 * small card of its own instead: what you played the week before and "Find
 * a hit", never a big zero, and nothing to share. An empty week (nothing in
 * it or the week before) is the same card, saying how the recap comes.
 */
export default function WeeklyRecap() {
  const styles = useThemedStyles(styleDefinitions);
  const { week: weekParam } = useLocalSearchParams<{ week?: string }>();
  const { currentUserId, sessions, posts, stories, ready } = useApp();
  const week = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekStart(weekParam) : lastWeekStart();
  const recap = useMemo(() => (currentUserId ? weekRecap(currentUserId, sessions, posts, stories, week) : null), [currentUserId, sessions, posts, stories, week]);

  // The out-of-sight copy that is photographed, at 1080 × 1920 pixels (storyImage.ts).
  const stage = useRef<View>(null);
  const size = stageSize();
  useEffect(() => { warmStory(); }, []);
  const [busy, setBusy] = useState<StoryAction | null>(null);
  const [note, setNote] = useState('');
  const run = async (action: StoryAction) => {
    if (busy) return;
    setBusy(action);
    setNote('');
    try {
      const said = await exportStory(stage.current, action, 'My week on CourtSide', { sticker: false, top: colors.brand.slice(0, 7), bottom: colors.bg.slice(0, 7) });
      if (said) setNote(said);
      else haptics.commit();
    } catch (error) {
      setNote(error instanceof Error && error.message ? error.message : 'The picture could not be made. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const title = 'Your week';
  const label = week === lastWeekStart() ? 'LAST WEEK' : weekRange(week).toUpperCase();
  // A week with nothing to show: the hit mark, what it was, and one way back on court ("Find a hit").
  // The same card for a rest week and an empty one. Never "Log a session" here: that logs today, not the week on screen.
  const restCard = (heading: string, words: string) => (
    <View style={styles.body}>
      {/* The page's own title already says which week: the card is the mark, the words and one way back on court. */}
      <View style={styles.rest}>
        <View style={styles.restDisc}><HitGlyph size={26} color={colors.brand} /></View>
        <Text accessibilityRole="header" style={styles.restTitle}>{heading}</Text>
        <Text style={styles.restLine}>{words}</Text>
        <View style={styles.restButton}><Button label="Find a hit" onPress={() => { requestSection('/discuss', 'players'); goToTab('/discuss'); }} full /></View>
      </View>
    </View>
  );
  if (!recap || (!recap.sessions && !recap.prevSessions)) {
    return (
      <Screen title={title} subtitle={weekRange(week)} compactTitle onBack={() => goBack('/your-sessions')} bar={false}>
        {!ready ? <View style={styles.wait}><CourtSpinner size={28} /></View> : restCard('Nothing logged that week', 'Log what you play, and every Monday brings your week on court.')}
      </Screen>
    );
  }

  // A rest week: the week before, and a way back on court.
  if (!recap.sessions) {
    return (
      <Screen title={title} subtitle={weekRange(week)} compactTitle onBack={() => goBack('/your-sessions')} bar={false}>
        {restCard('A quiet week', `You played ${duration(recap.prevMinutes)} the week before.`)}
      </Screen>
    );
  }

  const save = canSaveStory();
  return (
    <View style={styles.root}>
      <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.stage, size]}>
        <View ref={stage} collapsable={false} style={size}>
          <RecapStoryArt recap={recap} width={size.width} />
        </View>
      </View>
      <View style={styles.page}>
        <Screen title={title} subtitle={weekRange(week)} compactTitle onBack={() => goBack('/your-sessions')} bar={false}>
          <View style={styles.body}>
            <RecapCard recap={recap} label={label} />
            <RecapHighlights recap={recap} sessions={sessions} />
            {/* The same round buttons as sharing a session: Stories leads, the rest follow. */}
            <View style={styles.actions}>
              {ACTIONS.filter((a) => (a.key !== 'save' || save) && (a.key !== 'copy' || canCopyStory())).map((a) => {
                const lead = a.key === 'instagram';
                return (
                  <Pressable key={a.key} accessibilityRole="button" accessibilityLabel={a.spoken} disabled={!!busy} onPress={() => { void run(a.key); }} style={({ pressed }) => [styles.action, pressed && styles.pressed, !!busy && busy !== a.key && styles.dimmed]}>
                    <View style={[styles.actionCircle, lead && styles.actionLead]}>
                      {busy === a.key ? <CourtSpinner size={22} ink={lead ? colors.brandInk : colors.text} /> : <Ionicons name={a.icon} size={24} color={lead ? colors.brandInk : colors.text} />}
                    </View>
                    <Text style={styles.actionLabel} numberOfLines={1}>{a.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {note ? <Text style={styles.note}>{note}</Text> : null}
            <View style={styles.only}>
              <Ionicons name="eye-off-outline" size={13} color={colors.textMuted} />
              <Text style={styles.onlyText}>Only you see this until you share it.</Text>
            </View>
          </View>
        </Screen>
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  stage: { position: 'absolute', left: 0, top: 0 },
  page: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.bg },
  wait: { paddingTop: spacing.xxl, alignItems: 'center' },
  body: { gap: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.xxl },
  // A rest week's card.
  rest: { ...lift, borderRadius: 24, backgroundColor: colors.surface, padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
  restDisc: { width: 56, height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandDim },
  restTitle: { ...font('600'), fontSize: 22, letterSpacing: -0.5, color: colors.text, marginTop: spacing.xs },
  restLine: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  restButton: { marginTop: spacing.md, alignSelf: 'stretch' },
  pressed: { opacity: 0.7 },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  action: { alignItems: 'center', gap: 6, width: 64 },
  actionCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  actionLead: { backgroundColor: colors.brand, borderColor: colors.brand },
  actionLabel: { ...font('500'), fontSize: 12.5, color: colors.text },
  dimmed: { opacity: 0.45 },
  note: { ...typography.small, color: colors.text, textAlign: 'center' },
  only: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  onlyText: { ...typography.small, color: colors.textMuted },
});

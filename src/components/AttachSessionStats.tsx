import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { FormRow } from '@/components/FormRow';
import { SessionStats } from '@/components/SessionStats';
import { Toggle } from '@/components/ui';
import type { DetectedActivity } from '@/data/types';
import { fromWho, sessionFromActivity } from '@/features/activity/format';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

/**
 * The top of a new post made from a tracker's tennis session: the stats
 * exactly as the post will show them, an × to post without them, and for
 * confirmed adults whose tracker read a heart rate, a "Show heart rate"
 * switch. Heart rate starts off; a teen account, or one with no age on
 * file, never gets the switch (the server enforces the same, migration 58).
 */
export function AttachSessionStats({ activity, attached, onAttach, adult, showHr, onShowHr, posted, loggedMinutes }: {
  activity: DetectedActivity;
  attached: boolean;
  onAttach: (on: boolean) => void;
  adult: boolean;
  showHr: boolean;
  onShowHr: (on: boolean) => void;
  /** This session is already on one of your posts. */
  posted: boolean;
  /** The length you logged it as, when you logged it. */
  loggedMinutes?: number;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const canShowHr = adult && !!activity.maxHr;
  const hint = canShowHr
    ? showHr ? 'Time on court and heart rate show on the post.' : 'Time on court shows on the post. Heart rate stays private unless you switch it on.'
    : activity.maxHr ? 'Time on court shows on the post. Heart rate stays private.' : 'Time on court shows on the post.';

  return (
    <View style={styles.wrap}>
      {attached ? (
        <>
          <View style={styles.head}>
            <Ionicons name="tennisball-outline" size={16} color={colors.court} />
            <Text style={styles.headText}>Session stats</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Post without your session stats" hitSlop={12} onPress={() => onAttach(false)} style={({ pressed }) => [styles.remove, pressed && styles.pressed]}>
              <Ionicons name="close-circle" size={20} color={colors.textFaint} />
            </Pressable>
          </View>
          <SessionStats session={sessionFromActivity(activity, showHr, adult)} />
          {canShowHr ? (
            <FormRow
              icon="heart-outline"
              label="Show heart rate"
              accessibilityRole="switch"
              accessibilityState={{ checked: showHr }}
              accessibilityLabel="Show heart rate on this post"
              onPress={() => onShowHr(!showHr)}
              // The row is the switch: the toggle only shows its state, so one tap flips it once.
              accessory={<View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Toggle value={showHr} onChange={onShowHr} /></View>}
            />
          ) : null}
          <Text style={styles.note}>{hint}</Text>
          {/* The post always carries the tracker's own time (the server rebuilds it, migration 58), so a length changed on the log sheet is called out rather than quietly replaced. */}
          {loggedMinutes != null && loggedMinutes !== activity.minutes ? (
            <Text style={styles.note}>{`The post shows ${fromWho(activity)}’s time, not the length you logged.`}</Text>
          ) : null}
        </>
      ) : (
        <FormRow icon="add-circle-outline" label="Add your session stats" onPress={() => onAttach(true)} />
      )}
      {posted ? <Text style={styles.note}>You already posted this session.</Text> : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.sm, marginTop: spacing.xs, marginBottom: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headText: { ...typography.smallStrong, color: colors.textMuted, flex: 1 },
  remove: { padding: 2 },
  pressed: { opacity: 0.6 },
  note: { ...typography.small, color: colors.textFaint, lineHeight: 18 },
});

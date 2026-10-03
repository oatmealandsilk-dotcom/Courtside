import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Toggle } from '@/components/ui';
import type { DetectedActivity } from '@/data/types';
import { availableShare, chosenShare, choiceFromTicks, shareHint, shareSummary, type HealthChoice } from '@/features/activity/healthShare';
import { openHealthShare } from '@/features/activity/healthSharePicker';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography } from '@/theme';

/**
 * "Share health data" (owner, Oct 3), one row in the composer of a tracker
 * session's post, the same for every age: a switch, and "Choose" for a sheet
 * with a tick per number the tracker has (heart rate, zones, Strain,
 * calories). Switched on, every number is shared; ticking some off keeps it
 * on and says "2 of 4". A line under it says what goes on the post. Nothing
 * is drawn for a session whose tracker read none of them. Laid out as a
 * FormRow, with the link and the switch beside the row's own tap area (a
 * button inside a button is not allowed in a browser).
 */
export function HealthShareRow({ activity, choice, onChoice, line = false }: {
  activity: DetectedActivity;
  choice: HealthChoice;
  onChoice: (next: HealthChoice) => void;
  /** The thin line above it, as on every row but the first. */
  line?: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const available = availableShare(activity);
  if (!available.length) return null;
  const chosen = chosenShare(choice, available);
  const on = chosen.length > 0;
  const summary = shareSummary(chosen, available);
  // Switched on, all of them; off, none.
  const flip = (next: boolean) => onChoice({ on: next, off: [] });
  const choose = () => openHealthShare({ activity, available, ticked: chosen, onChange: (ticked) => onChoice(choiceFromTicks(ticked, available)) });
  return (
    <View>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: on }}
          aria-checked={on}
          accessibilityLabel={summary ? `Share health data, ${summary}` : 'Share health data'}
          onPress={() => flip(!on)}
          style={({ pressed }) => [styles.main, pressed && styles.pressed]}
        >
          <View style={styles.lead}><Ionicons name="heart-outline" size={20} color={colors.textMuted} /></View>
          <View style={[styles.body, line && styles.line]}>
            <Text style={styles.label} numberOfLines={2}>Share health data</Text>
            {summary ? <Text style={styles.value} numberOfLines={1}>{summary}</Text> : null}
          </View>
        </Pressable>
        <View style={[styles.side, line && styles.line]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose which health numbers to share" hitSlop={10} onPress={choose} style={({ pressed }) => [styles.choose, pressed && styles.pressed]}>
            <Text style={styles.chooseText}>Choose</Text>
          </Pressable>
          {/* The row is the switch for a screen reader; the knob still flips it to a finger. */}
          <Pressable accessible={false} importantForAccessibility="no-hide-descendants" onPress={() => flip(!on)} hitSlop={6}>
            <View pointerEvents="none" aria-hidden accessibilityElementsHidden><Toggle value={on} onChange={flip} /></View>
          </Pressable>
        </View>
      </View>
      <Text style={styles.hint}>{shareHint(chosen)}</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch' },
  main: { flex: 1, flexDirection: 'row', alignItems: 'stretch' },
  pressed: { opacity: 0.6 },
  // FormRow's measures, so it lines up with the rows either side.
  lead: { width: 26, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 50, paddingVertical: 11 },
  side: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingLeft: spacing.sm },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  label: { ...typography.body, color: colors.text, flexShrink: 1 },
  value: { ...typography.body, color: colors.textMuted },
  choose: { paddingVertical: 4 },
  chooseText: { ...font('600'), fontSize: 15, color: colors.brand },
  // Under the words, where they start.
  hint: { ...typography.small, color: colors.textFaint, lineHeight: 18, marginLeft: 26 + spacing.md, marginTop: -4, marginBottom: spacing.xs },
});

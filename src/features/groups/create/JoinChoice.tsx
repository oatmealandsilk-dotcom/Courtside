import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Toggle } from '@/components/ui';
import * as haptics from '@/lib/haptics';
import { colors, font, lift, radius, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/*
 * "Who can join" as two big cards you tap, the way Strava asks whether a
 * club is open or approval-only: an icon, the choice in a word or two, and
 * one line on what it means. The chosen one is outlined in green with a
 * filled round tick. Under them, "Show in Find groups" as its own card with
 * a switch and a line that changes with it; a tap anywhere on the card
 * flips it. Open is said the same way everywhere a group is: "Open", anyone
 * can join straight away (from Find groups too, not only its link).
 */

export function JoinChoice({ ask, onChange }: { ask: boolean; onChange: (ask: boolean) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const options = [
    { ask: false, icon: 'lock-open-outline' as const, title: 'Open', line: 'Anyone can join straight away.' },
    { ask: true, icon: 'hand-left-outline' as const, title: 'Ask to join', line: 'You approve each person before they’re in.' },
  ];
  return (
    <View style={styles.list} accessibilityRole="radiogroup" accessibilityLabel="Who can join">
      {options.map((o) => {
        const on = o.ask === ask;
        return (
          <Pressable
            key={o.title}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${o.title}. ${o.line}`}
            onPress={() => { if (!on) { haptics.tap(); onChange(o.ask); } }}
            style={({ pressed }) => [styles.card, on && styles.cardOn, pressed && !on && styles.pressed]}
          >
            <View style={[styles.icon, on && styles.iconOn]}>
              <Ionicons name={o.icon} size={20} color={on ? colors.brandInk : colors.textMuted} />
            </View>
            <View style={styles.words}>
              <Text style={styles.title}>{o.title}</Text>
              <Text style={styles.line}>{o.line}</Text>
            </View>
            <View style={[styles.radio, on && styles.radioOn]}>
              {on ? <Ionicons name="checkmark" size={14} color={colors.brandInk} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ListedCard({ listed, onChange }: { listed: boolean; onChange: (listed: boolean) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: listed }}
      accessibilityLabel="Show in Find groups"
      accessibilityHint={listed ? 'People can find it from the + on the Feed.' : 'Hidden. Only people with your invite link can find it.'}
      onPress={() => { (listed ? haptics.untap : haptics.tap)(); onChange(!listed); }}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.icon}>
        <Ionicons name={listed ? 'search-outline' : 'eye-off-outline'} size={19} color={colors.textMuted} />
      </View>
      <View style={styles.words}>
        <Text style={styles.title}>Show in Find groups</Text>
        <Text style={styles.line}>{listed ? 'People can find it from the + on the Feed.' : 'Hidden. Only people with your invite link can find it.'}</Text>
      </View>
      {/* The card is the switch: this one only shows where it is. */}
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Toggle value={listed} onChange={onChange} />
      </View>
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  list: { gap: spacing.sm },
  card: {
    ...lift, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 76,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: 20,
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.surface,
  },
  cardOn: { borderColor: colors.brand },
  pressed: { opacity: 0.8 },
  icon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  iconOn: { backgroundColor: colors.brand },
  words: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...typography.body, ...font('600'), color: colors.text },
  line: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  radio: { width: 24, height: 24, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: colors.brand, borderColor: colors.brand },
});

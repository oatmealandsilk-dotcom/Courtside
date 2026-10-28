import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { goBack } from '@/lib/goBack';

import { Screen } from '@/components/ui';
import type { AutoLogAudience } from '@/data/types';
import { AUDIENCES, AUDIENCE_LABEL, AUDIENCE_LINE, friendsAtMost } from '@/features/activity/autoLogSharing';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';
import { corner } from '@/theme/look';

/**
 * Settings → "Sessions that log themselves" (migration 193; owner, Oct 27:
 * "mutuals can see, no private, its just mutual or public", then "mutuals
 * default"). Who sees the tennis your tracker logs for you: Friends (people
 * you follow who follow you back; the default), Public (whoever can see your
 * posts) or Only me. Under 18, or with no birthday given: Friends or Only me.
 *
 * A tap saves at once, for the sessions already logged too. It is also the
 * clear yes Apple Health's sessions wait for (Apple's 5.1.3): until a choice
 * is made here (or on a connect screen that says who sees them), sessions
 * from Apple Health stay with you only.
 */
export default function AutoLogSharing() {
  const styles = useThemedStyles(styleDefinitions);
  const { actions, autoLogSharing, currentUser } = useApp();
  const friendsOnly = friendsAtMost(currentUser);
  const choices = AUDIENCES.filter((a) => !(friendsOnly && a === 'public'));
  const now: AutoLogAudience = autoLogSharing === 'public' && friendsOnly ? 'mutuals' : autoLogSharing ?? 'mutuals';
  const [busy, setBusy] = useState<AutoLogAudience | null>(null);
  const [error, setError] = useState('');

  const save = async (v: AutoLogAudience) => {
    if (busy) return;
    setError('');
    // Already this, and chosen (never chosen: the tap is the choice, so it is saved).
    if (autoLogSharing === v) return;
    setBusy(v);
    const ok = await actions.setAutoLogSharing(v);
    setBusy(null);
    if (!ok) setError('Couldn’t save that. Try again.');
  };

  return (
    <Screen title="Sessions that log themselves" compactTitle onBack={() => goBack()}>
      <Text style={styles.lead}>Who sees the tennis your Apple Watch, WHOOP, Fitbit or other tracker logs for you.</Text>
      <View style={styles.card} accessibilityRole="radiogroup">
        {choices.map((c, i) => {
          const on = now === c;
          return (
            <Pressable
              key={c}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, busy: busy === c }}
              accessibilityLabel={`${AUDIENCE_LABEL[c]}. ${AUDIENCE_LINE[c]}`}
              onPress={() => { void save(c); }}
              style={({ pressed }) => [styles.row, i > 0 && styles.rowBorder, pressed && { backgroundColor: colors.surfaceAlt }]}
            >
              <Ionicons name={ICON[c]} size={19} color={colors.textMuted} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={styles.rowLabel}>{AUDIENCE_LABEL[c]}</Text>
                <Text style={styles.rowDetail}>{AUDIENCE_LINE[c]}</Text>
              </View>
              {busy === c ? <ActivityIndicator size="small" color={colors.textMuted} /> : (
                <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
              )}
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {/* Never chosen: Friends applies, except to Apple Health's, which wait for a tap here. */}
      {autoLogSharing === null ? <Text style={[styles.note, styles.after]}>You haven’t chosen yet. Until you do, Friends applies, except to sessions from Apple Health, which only you see.</Text> : null}
      {friendsOnly ? <Text style={[styles.note, styles.after]}>Under 18, or with no birthday given, only people you follow who follow you back can see them.</Text> : null}
      <View style={styles.facts}>
        {FACTS.map((text) => <Text key={text} style={styles.note}>{text}</Text>)}
      </View>
    </Screen>
  );
}

const ICON: Record<AutoLogAudience, keyof typeof Ionicons.glyphMap> = { mutuals: 'swap-horizontal-outline', public: 'globe-outline', private: 'lock-closed-outline' };

/** What is shown, said plainly before it is chosen. */
const FACTS = [
  'Tennis of 20 minutes or more logs itself. It shows in Activities and on your profile as a session: when, how long, and your heart rate. Never where you played.',
  'Post it from “Tennis logged” to add the score, a photo or the court. That post goes to everyone who can see your posts.',
  'Sessions from Apple Health are shown to others only after you choose here.',
];

const styleDefinitions = StyleSheet.create({
  // Quiet, the way Settings and Privacy read: short labels, flat grouped lists with a hairline edge.
  lead: { ...typography.small, color: colors.textMuted, paddingHorizontal: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.sm, lineHeight: 19 },
  card: { borderRadius: corner(16), backgroundColor: colors.surface, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 10, minHeight: 56 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowLabel: { ...typography.body, fontSize: 15, color: colors.text },
  rowDetail: { ...typography.small, fontSize: 13, color: colors.textFaint },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.brand },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.brand },
  error: { ...typography.small, color: colors.danger, paddingHorizontal: spacing.sm, paddingTop: spacing.sm },
  facts: { gap: spacing.sm, paddingTop: spacing.md },
  note: { ...typography.small, color: colors.textFaint, paddingHorizontal: spacing.sm, lineHeight: 19 },
  after: { paddingTop: spacing.sm },
});

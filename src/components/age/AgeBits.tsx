import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { groupFor, toBirthDate, yearsOld } from '@/features/age/ageCheck';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, pageIsDark, radius, spacing, typography, withAlpha } from '@/theme';

/**
 * The small pieces the birthday page and the "Are you 13 or older?" step
 * share (Oct 17, owner: "Make the UI of the what's your birthday and are
 * you 13 years or older ... a lot better").
 */

/** Fades a block up into place a beat after the one above it. Reduce Motion: it is just there. */
export function Rise({ delay = 0, children, style }: { delay?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const still = useReducedMotion();
  const shown = useSharedValue(still ? 1 : 0);
  useEffect(() => {
    if (still) { shown.value = 1; return; }
    shown.value = withDelay(delay, withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) }));
  }, [delay, still, shown]);
  const look = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateY: (1 - shown.value) * 12 }] }));
  return <Animated.View style={[style, look]}>{children}</Animated.View>;
}

/** A soft edge on top of the pinned buttons, so the page scrolls away under them instead of being cut off. */
export function FooterFade() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: -20, height: 20 }}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="ageFooterFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.bg} stopOpacity={0} />
            <Stop offset="1" stopColor={colors.bg} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#ageFooterFade)" />
      </Svg>
    </View>
  );
}

/** "Private — never on your profile", with a lock. */
export function PrivacyLine() {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.privacy} accessible accessibilityLabel="Private. Your birthday never shows on your profile.">
      <Ionicons name="lock-closed" size={13} color={colors.textMuted} />
      <Text style={styles.privacyText}>Private — never on your profile</Text>
    </View>
  );
}

/** What a birthday opens up at 18, and that skipping changes nothing else. */
export function UnlockCard() {
  const styles = useThemedStyles(styleDefinitions);
  const rows: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }[] = [
    { icon: 'location-outline', text: 'Players nearby can find you on the map' },
    { icon: 'chatbubble-ellipses-outline', text: "Players you don't follow yet can message you" },
  ];
  return (
    <View style={styles.card}>
      <Text style={styles.cardEyebrow}>AT 18 AND OVER, A BIRTHDAY OPENS UP</Text>
      {rows.map((row) => (
        <View key={row.icon} style={styles.row}>
          <View style={[styles.rowIcon, { backgroundColor: withAlpha(colors.brand, pageIsDark() ? 0.22 : 0.1) }]}>
            <Ionicons name={row.icon} size={16} color={colors.brand} />
          </View>
          <Text style={styles.rowText}>{row.text}</Text>
        </View>
      ))}
      <Text style={styles.cardFoot}>Everything else works the same without it.</Text>
    </View>
  );
}

/**
 * What the date says, as it is entered: "17 — teen protections on". Says
 * nothing that would hint at a "right" answer below 13: just the age.
 */
export function AgeReadout({ month, day, year, hint, error }: { month: string; day: string; year: string; hint?: string; error?: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const complete = !!month && !!day && year.length === 4;
  const birthDate = complete ? toBirthDate(month, day, year) : null;
  let text = hint ?? '';
  let tone: 'quiet' | 'good' | 'bad' = 'quiet';
  if (error) { text = error; tone = 'bad'; } else if (complete && !birthDate) {
    const m = Number(month), d = Number(day), y = Number(year);
    const when = new Date(Date.UTC(y, m - 1, d));
    const real = when.getUTCFullYear() === y && when.getUTCMonth() === m - 1 && when.getUTCDate() === d;
    text = !real ? "That date doesn't exist" : when.getTime() > Date.now() ? "That date hasn't happened yet" : 'Check the year';
    tone = 'bad';
  } else if (birthDate) {
    const age = yearsOld(birthDate);
    text = age < 13 ? `You're ${age}` : groupFor(age) === 'teen' ? `${age} — teen protections on` : `${age} — everything's open`;
    tone = 'good';
  }
  return (
    <View style={styles.readout} accessibilityLiveRegion="polite" aria-live="polite">
      {tone === 'good' ? <Ionicons name="checkmark-circle" size={16} color={colors.brand} /> : null}
      {tone === 'bad' ? <Ionicons name="alert-circle" size={16} color={colors.danger} /> : null}
      <Text style={[styles.readoutText, tone === 'good' && styles.readoutGood, tone === 'bad' && styles.readoutBad]}>{text || ' '}</Text>
    </View>
  );
}

/**
 * One answer to "Are you 13 or older?". Both answers are drawn exactly
 * alike, so the question leans neither way; a tap picks, Continue answers.
 */
export function AnswerCard({ badge, title, detail, selected, disabled, onPress }: {
  badge: string; title: string; detail: string; selected: boolean; disabled?: boolean; onPress: () => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      aria-checked={selected}
      accessibilityLabel={title}
      accessibilityHint={detail}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.answer,
        selected && { borderColor: colors.brand, backgroundColor: withAlpha(colors.brand, pageIsDark() ? 0.16 : 0.06) },
        pressed && { transform: [{ scale: 0.985 }] },
      ]}
    >
      <View style={[styles.badge, selected && { backgroundColor: colors.brand }]}>
        <Text style={[styles.badgeText, selected && { color: colors.brandInk }]}>{badge}</Text>
      </View>
      <View style={styles.answerWords}>
        <Text style={styles.answerTitle}>{title}</Text>
        <Text style={styles.answerDetail}>{detail}</Text>
      </View>
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? colors.brand : colors.textFaint} />
    </Pressable>
  );
}

/** What no birthday means, said plainly before they choose. */
export function ProtectionsCard() {
  const styles = useThemedStyles(styleDefinitions);
  const rows = [
    'Your account starts private',
    'Only people you follow can message you',
    'On the map, only friends who follow you back see you',
  ];
  return (
    <View style={styles.card}>
      <Text style={styles.cardEyebrow}>WITHOUT A BIRTHDAY</Text>
      <Text style={styles.cardLead}>You get the same protections as players under 18:</Text>
      {rows.map((text) => (
        <View key={text} style={styles.checkRow}>
          <Ionicons name="checkmark" size={16} color={colors.brand} style={styles.check} />
          <Text style={styles.rowText}>{text}</Text>
        </View>
      ))}
      <Text style={styles.cardFoot}>Add your birthday anytime in Settings → Account center.</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center' },
  privacyText: { ...typography.small, color: colors.textMuted },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  cardEyebrow: { ...typography.caption, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rowText: { ...typography.small, fontSize: 14, lineHeight: 19, color: colors.text, flex: 1 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  check: { marginTop: 1 },
  cardLead: { ...typography.small, fontSize: 14, lineHeight: 19, color: colors.textMuted, marginTop: -spacing.xs },
  cardFoot: { ...typography.small, color: colors.textMuted },
  readout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 20 },
  readoutText: { ...typography.small, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  readoutGood: { ...typography.smallStrong, color: colors.text },
  readoutBad: { ...typography.smallStrong, color: colors.danger },
  answer: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.lg, paddingHorizontal: spacing.lg,
    borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface,
  },
  badge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  badgeText: { ...typography.bodyStrong, color: colors.text, fontVariant: ['tabular-nums'] },
  answerWords: { flex: 1, gap: 2 },
  answerTitle: { ...typography.heading, color: colors.text },
  answerDetail: { ...typography.small, color: colors.textMuted },
});

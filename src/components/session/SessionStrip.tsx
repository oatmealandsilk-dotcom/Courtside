import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { Avatar } from '@/components/ui';
import type { ID, SessionDetail } from '@/data/types';
import { kindWord, resultWord, sourceLabel, spokenDuration } from '@/features/activity/format';
import { sessionPeople } from '@/features/activity/sessionTags';
import { colors, font } from '@/theme';
import { Duration, Figure } from './Duration';

/**
 * A photo post's session, straight under the picture (the picture stays
 * clean), as one tidy row: the time ("2h 08m", units on the figures'
 * baseline), a small chip saying what it was ("Practice", "Match · Won"),
 * and on the right where the numbers came from ("Data by WHOOP", WHOOP's own
 * attribution wording, never a logo) beside a chevron that says there is
 * more. The health numbers the author shared (heart rate, Strain, calories;
 * migration 72) and who it was against sit on a quiet second line, the
 * player on a line of their own when two or more numbers are shared. `scale` draws it smaller, for the composer's preview. A tap anywhere
 * on it opens the stats.
 */
export function SessionStrip({ session, hidden = [], play = false, scale = 1, onPress }: {
  session: SessionDetail;
  hidden?: ID[];
  play?: boolean;
  scale?: number;
  onPress?: () => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const k = scale;
  const hr = session.maxHr != null;
  const strain = session.strain != null ? session.strain : null;
  const kcal = session.kcal ? session.kcal : null;
  const shared = [hr, strain != null, kcal != null].filter(Boolean).length;
  const result = resultWord(session);
  const what = [kindWord(session), result].filter(Boolean).join(' · ');
  const { opponents, partners } = sessionPeople(session, hidden);
  const all = [...opponents, ...partners];
  const lead = all[0];
  const vs = lead ? (opponents.length ? 'vs' : 'with') : '';
  const tracker = !!session.activityId;
  const source = tracker ? sourceLabel(session.source ?? 'apple-health') : null;
  const spoken = [`${spokenDuration(session.minutes)}, ${what.toLowerCase()}`, hr && session.avgHr ? `average heart rate ${session.avgHr}` : null, hr ? `max ${session.maxHr}` : null, kcal ? `${kcal} calories` : null, lead ? `${vs} @${lead.handle}` : null, source].filter(Boolean).join(', ');
  const small = { fontSize: 13 * k, lineHeight: Math.round(17 * k) };
  // Who it was against: beside a single shared number, or on its own line.
  const who = lead ? (
    <View style={[styles.who, { gap: 6 * k }]}>
      <Avatar name={lead.name} seed={lead.id} size={Math.round(18 * k)} />
      <Text style={[styles.whoText, small]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
        {vs}{' '}
        <Text
          accessibilityRole="link"
          suppressHighlighting
          onPress={(e) => { e?.stopPropagation?.(); router.push(`/user/${lead.id}`); }}
          style={styles.handle}
        >@{lead.handle}</Text>
        {all.length > 1 ? ` +${all.length - 1}` : ''}
      </Text>
    </View>
  ) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Session stats: ${spoken}`}
      accessibilityHint="Opens the stats"
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [{ gap: 6 * k }, pressed && onPress ? styles.pressed : null]}
    >
      {/* What it was and where the numbers came from, one quiet line. */}
      <View style={[styles.row, { gap: 8 * k }]}>
        <View style={[styles.chip, { paddingHorizontal: 8 * k, paddingVertical: 3 * k, borderRadius: 999 }]}>
          <Text style={[styles.chipText, { fontSize: 12 * k }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>{what}</Text>
        </View>
        <View style={styles.flex} />
        {source ? <Text style={[styles.source, { fontSize: 11 * k }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>{source}</Text> : null}
        {onPress ? <Ionicons name="chevron-up" size={15 * k} color={colors.textFaint} /> : null}
      </View>
      {/* Strava's row: label over number. Only what every tracker gives (time, calories, heart rate),
          so a WHOOP post and an Apple Watch post read the same (Oct 3, owner). Strain stays in the stats sheet. */}
      <View style={[styles.row, { gap: 26 * k, alignItems: 'flex-start' }]}>
        <View style={{ gap: 2 * k }}>
          <Text style={[styles.label, { fontSize: 11 * k }]} maxFontSizeMultiplier={1.2}>Time</Text>
          <Duration minutes={session.minutes} size={19 * k} unitScale={0.64} color={colors.text} unitColor={colors.textMuted} play={play} delay={120} duration={600} />
        </View>
        {kcal != null ? (
          <View style={{ gap: 2 * k }}>
            <Text style={[styles.label, { fontSize: 11 * k }]} maxFontSizeMultiplier={1.2}>Calories</Text>
            <Figure value={kcal} baseline size={19 * k} color={colors.text} unitColor={colors.textMuted} play={play} delay={200} duration={600} />
          </View>
        ) : null}
        {hr && session.avgHr ? (
          <View style={{ gap: 2 * k }}>
            <Text style={[styles.label, { fontSize: 11 * k }]} maxFontSizeMultiplier={1.2}>Avg HR</Text>
            <Figure value={session.avgHr} unit="bpm" baseline unitScale={0.7} size={19 * k} color={colors.text} unitColor={colors.textMuted} play={play} delay={200} duration={600} />
          </View>
        ) : null}
        {hr ? (
          <View style={{ gap: 2 * k }}>
            <Text style={[styles.label, { fontSize: 11 * k }]} maxFontSizeMultiplier={1.2}>Max HR</Text>
            <Figure value={session.maxHr!} unit="bpm" baseline unitScale={0.7} size={19 * k} color={colors.text} unitColor={colors.textMuted} play={play} delay={200} duration={600} />
          </View>
        ) : null}
      </View>
      {who ? <View style={styles.row}>{who}</View> : null}
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  pressed: { opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexWrap: 'wrap' },
  // What it was: a small quiet chip, the page's raised ground, never louder than the time.
  chip: { backgroundColor: colors.bgElevated, flexShrink: 1, minWidth: 0 },
  chipText: { ...font('600'), color: colors.textMuted },
  // Where the numbers came from: always shown, in the faintest ink, and never cut short.
  source: { ...font('600'), color: colors.textFaint, letterSpacing: 0.1, flexShrink: 0 },
  flex: { flex: 1 },
  label: { ...font('500'), color: colors.textMuted, letterSpacing: 0.1 },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  whoText: { ...font('500'), color: colors.textMuted, flexShrink: 1 },
  handle: { ...font('600'), color: colors.text },
});

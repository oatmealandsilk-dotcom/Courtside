import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import type { ID, SessionDetail } from '@/data/types';
import { kindWord, resultWord, sourceLabel, spokenDuration } from '@/features/activity/format';
import { sessionPeople } from '@/features/activity/sessionTags';
import { colors, font, withAlpha } from '@/theme';
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
  const stats = [
    kcal != null ? { key: 'kcal', label: 'Calories', node: <Figure value={kcal} baseline size={19 * k} color={colors.text} unitColor={colors.textMuted} play={play} delay={200} duration={600} /> } : null,
    hr && session.avgHr ? { key: 'avg', label: 'Avg HR', node: <Figure value={session.avgHr} unit="bpm" baseline unitScale={0.62} size={19 * k} color={colors.text} unitColor={colors.textMuted} play={play} delay={200} duration={600} /> } : null,
    hr ? { key: 'max', label: 'Max HR', node: <Figure value={session.maxHr!} unit="bpm" baseline unitScale={0.62} size={19 * k} color={colors.text} unitColor={colors.textMuted} play={play} delay={200} duration={600} /> } : null,
  ].filter((x): x is { key: string; label: string; node: React.ReactElement } => !!x);
  const time = <Duration minutes={session.minutes} size={19 * k} unitScale={0.62} color={colors.text} unitColor={colors.textMuted} play={play} delay={120} duration={600} />;
  // One panel, Strava's activity block in the theme's colour (Oct 4, owner: "needs big UI work"):
  // what it was and who with, then the numbers in even columns; with only the time shared, one line.
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Session stats: ${spoken}`}
      accessibilityHint="Opens the stats"
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.panel, { borderRadius: 16 * k, paddingHorizontal: 14 * k, paddingVertical: 12 * k, gap: 12 * k }, pressed && onPress ? styles.pressed : null]}
    >
      <View style={[styles.row, { gap: 8 * k }]}>
        <View style={[styles.badge, { width: 26 * k, height: 26 * k, borderRadius: 13 * k }]}>
          <Ionicons name="tennisball" size={14 * k} color={colors.brand} />
        </View>
        <View style={[styles.flex, { gap: 1 * k }]}>
          <Text style={[styles.title, { fontSize: 14.5 * k, lineHeight: Math.round(19 * k) }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>{what}</Text>
          {lead || source ? (
            <Text style={[styles.sub, small]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {lead ? (
                <>
                  {vs}{' '}
                  <Text accessibilityRole="link" suppressHighlighting onPress={(e) => { e?.stopPropagation?.(); router.push(`/user/${lead.id}`); }} style={styles.handle}>@{lead.handle}</Text>
                  {all.length > 1 ? ` +${all.length - 1}` : ''}
                  {source ? ' · ' : ''}
                </>
              ) : null}
              {source ? source.replace(/^Data by /, '') : ''}
            </Text>
          ) : null}
        </View>
        {stats.length ? null : time}
        {onPress ? <Ionicons name="chevron-forward" size={15 * k} color={colors.textFaint} /> : null}
      </View>
      {stats.length ? (
        <View style={[styles.row, styles.columns, { paddingTop: 10 * k }]}>
          {[{ key: 'time', label: 'Time', node: time }, ...stats].map((st, i) => (
            <View key={st.key} style={[styles.col, i > 0 && styles.colRule, { gap: 2 * k, paddingLeft: i > 0 ? 12 * k : 0 }]}>
              <Text style={[styles.label, { fontSize: 11 * k }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>{st.label}</Text>
              {st.node}
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  pressed: { opacity: 0.7 },
  panel: { backgroundColor: withAlpha(colors.brand, 0.06), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(colors.brand, 0.16) },
  badge: { alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(colors.brand, 0.12) },
  title: { ...font('700'), color: colors.text, letterSpacing: -0.2 },
  sub: { ...font('500'), color: colors.textMuted },
  columns: { alignItems: 'flex-start', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(colors.brand, 0.16) },
  col: { flex: 1, minWidth: 0 },
  colRule: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: withAlpha(colors.brand, 0.16) },
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

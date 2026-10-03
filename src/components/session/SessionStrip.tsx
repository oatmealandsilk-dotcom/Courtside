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
 * clean): the time with what it was under it, then average and max heart
 * rate when shared, parted by thin rules, and a chevron that says there is
 * more. Under that, who it was against and where the numbers came from.
 * `scale` draws it smaller, for the composer's preview. A tap opens the stats.
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
  const result = resultWord(session);
  const under = [kindWord(session), result].filter(Boolean).join(' · ').toUpperCase();
  const { opponents, partners } = sessionPeople(session, hidden);
  const all = [...opponents, ...partners];
  const lead = all[0];
  const vs = lead ? (opponents.length ? 'vs' : 'with') : '';
  const tracker = !!session.activityId;
  const label = { ...font('600'), fontSize: 10.5 * k, letterSpacing: 0.8 * k, color: colors.textMuted, marginTop: 2 * k };
  const spoken = [`${spokenDuration(session.minutes)}, ${under.toLowerCase()}`, hr && session.avgHr ? `average heart rate ${session.avgHr}` : null, hr ? `max ${session.maxHr}` : null, lead ? `${vs} @${lead.handle}` : null, tracker ? sourceLabel(session.source ?? 'apple-health') : null].filter(Boolean).join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Session stats: ${spoken}`}
      accessibilityHint="Opens the stats"
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, { gap: 8 * k }, pressed && onPress ? styles.pressed : null]}
    >
      <View style={styles.figures}>
        <View style={styles.cell}>
          <Duration minutes={session.minutes} size={30 * k} color={colors.text} unitColor={colors.textMuted} play={play} delay={120} duration={600} />
          <Text style={label} numberOfLines={1} maxFontSizeMultiplier={1.2}>{under}</Text>
        </View>
        {hr && session.avgHr ? (
          <>
            <View style={[styles.rule, { marginHorizontal: 14 * k }]} />
            <View style={styles.cell}>
              <Figure value={session.avgHr} size={30 * k} color={colors.text} unitColor={colors.textMuted} play={play} delay={200} duration={600} />
              <Text style={label} maxFontSizeMultiplier={1.2}>AVG BPM</Text>
            </View>
          </>
        ) : null}
        {hr ? (
          <>
            <View style={[styles.rule, { marginHorizontal: 14 * k }]} />
            <View style={styles.cell}>
              <Figure value={session.maxHr!} size={30 * k} color={colors.text} unitColor={colors.textMuted} play={play} delay={200} duration={600} />
              <Text style={label} maxFontSizeMultiplier={1.2}>MAX BPM</Text>
            </View>
          </>
        ) : null}
        <View style={styles.flex} />
        {onPress ? <Ionicons name="chevron-up" size={16 * k} color={colors.textMuted} /> : null}
      </View>
      {lead || tracker ? (
        <View style={styles.people}>
          {lead ? (
            <View style={styles.who}>
              <Avatar name={lead.name} seed={lead.id} size={Math.round(20 * k)} />
              <Text style={{ ...font('500'), fontSize: 14 * k, color: colors.textMuted, flexShrink: 1 }} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                {vs}{' '}
                <Text
                  accessibilityRole="link"
                  suppressHighlighting
                  onPress={(e) => { e?.stopPropagation?.(); router.push(`/user/${lead.id}`); }}
                  style={{ ...font('600'), color: colors.text }}
                >@{lead.handle}</Text>
                {all.length > 1 ? ` +${all.length - 1}` : ''}
              </Text>
            </View>
          ) : <View style={styles.flex} />}
          {tracker ? <Text style={{ ...font('600'), fontSize: 11 * k, color: colors.textFaint }} maxFontSizeMultiplier={1.2}>{sourceLabel(session.source ?? 'apple-health')}</Text> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { paddingHorizontal: 2 },
  pressed: { opacity: 0.7 },
  figures: { flexDirection: 'row', alignItems: 'center' },
  cell: { justifyContent: 'flex-end' },
  rule: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
  flex: { flex: 1 },
  people: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 0 },
});

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { SessionDetail } from '@/data/types';
import { KIND_LABEL, hasSessionStats, sourceLabel, statsLine } from '@/features/activity/format';
import { duration } from '@/lib/format';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';

/** Larger text sizes grow these words only so far, so three tiles still fit side by side. */
const MAX_GROW = 1.3;

/**
 * A session's numbers on a post: time on court, and heart rate when its
 * author chose to show it, with where the numbers came from written
 * underneath ("Data by WHOOP"), in words and never a logo. A session from
 * the author's own log shows its time and what it was (a match with its
 * result), and no source line: the words are the player's own. A post with
 * neither (a plain "minutes on court") shows nothing here.
 *
 * The full form is a row of tiles, the Health page's stat style. The
 * compact form is one line, for under a photo or over a clip, where the
 * picture has the room.
 */
export function SessionStats({ session, compact = false }: { session: SessionDetail; compact?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  if (!hasSessionStats(session)) return null;
  const tracker = !!session.activityId;
  const source = tracker ? sourceLabel(session.source ?? 'apple-health') : null;
  const kind = session.kind ?? 'practice';
  // One sentence for a screen reader, rather than a tile at a time.
  const spoken = (tracker
    ? [`${duration(session.minutes)} on court`, session.maxHr ? `max heart rate ${session.maxHr} bpm` : null, session.avgHr ? `average ${session.avgHr} bpm` : null, source]
    : [statsLine(session)]
  ).filter(Boolean).join(', ');

  if (compact) {
    return (
      <View style={styles.line} accessible accessibilityLabel={spoken}>
        <Ionicons name="tennisball-outline" size={14} color={colors.court} />
        {/* Two lines at most, so a narrow phone wraps rather than cutting off where the numbers came from. */}
        <Text style={styles.lineText} numberOfLines={2} maxFontSizeMultiplier={MAX_GROW}>{statsLine(session)}</Text>
      </View>
    );
  }

  const tiles = (tracker
    ? [
        { label: 'Time on court', value: duration(session.minutes) },
        session.maxHr ? { label: 'Max bpm', value: String(session.maxHr) } : null,
        session.avgHr ? { label: 'Avg bpm', value: String(session.avgHr) } : null,
      ]
    : [
        // A gym session is not time on court.
        { label: kind === 'fitness' ? 'Time' : 'Time on court', value: duration(session.minutes) },
        kind === 'match'
          ? { label: 'Match', value: session.won === true ? 'Won' : session.won === false ? 'Lost' : 'Played' }
          : { label: 'Session', value: KIND_LABEL[kind] },
      ]
  ).filter((t): t is { label: string; value: string } => !!t);
  return (
    <View style={styles.wrap} accessible accessibilityLabel={spoken}>
      <View style={styles.tiles}>
        {tiles.map((t) => (
          <View key={t.label} style={styles.tile}>
            <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={MAX_GROW}>{t.value}</Text>
            {/* Three tiles on a narrow phone leave "Time on court" too little room: it wraps, never cut short. */}
            <Text style={styles.label} numberOfLines={2} maxFontSizeMultiplier={MAX_GROW}>{t.label}</Text>
          </View>
        ))}
      </View>
      {source ? <Text style={styles.source} maxFontSizeMultiplier={MAX_GROW}>{source}</Text> : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.xs },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: { flex: 1, gap: 2, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  value: { ...typography.heading, color: colors.text, fontVariant: ['tabular-nums'] },
  label: { ...typography.caption, color: colors.textMuted, letterSpacing: 0.2 },
  source: { ...typography.caption, color: colors.textFaint, letterSpacing: 0.2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lineText: { ...typography.smallStrong, color: colors.textMuted, fontVariant: ['tabular-nums'], flexShrink: 1 },
});

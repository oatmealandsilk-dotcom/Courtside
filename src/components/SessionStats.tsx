import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { SessionDetail } from '@/data/types';
import { KIND_LABEL, hasSessionStats, peopleBits, sourceLabel, statsChunks, statsLine, type StatsBit } from '@/features/activity/format';
import { formatDistance, workoutName } from '@/features/activity/workouts';
import { duration } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, typography } from '@/theme';

/** Larger text sizes grow these words only so far, so three tiles still fit side by side. */
const MAX_GROW = 1.3;

/**
 * Pieces of a stats line, parted by " · " (or `separator`), with each
 * player's @handle a link to their profile (a tap on a handle never opens
 * the post around it), and "+2" a link to everyone who played (`onMore`).
 * Shared with the words over a clip, which pass their own ink.
 */
export function StatsWords({ chunks, style, handleStyle, numberOfLines, maxFontSizeMultiplier, separator = ' · ', onMore, moreLabel }: {
  chunks: StatsBit[][];
  style: StyleProp<TextStyle>;
  handleStyle: StyleProp<TextStyle>;
  numberOfLines?: number;
  maxFontSizeMultiplier?: number;
  separator?: string;
  onMore?: () => void;
  moreLabel?: string;
}) {
  return (
    <Text style={style} numberOfLines={numberOfLines} maxFontSizeMultiplier={maxFontSizeMultiplier}>
      {chunks.map((chunk, i) => (
        <React.Fragment key={i}>
          {i > 0 ? separator : null}
          {chunk.map((b, j) => (b.userId || (b.more && onMore) ? (
            <Text
              key={j}
              accessibilityRole="link"
              accessibilityLabel={b.userId ? `${b.text}, open profile` : moreLabel ?? 'Everyone who played'}
              suppressHighlighting
              onPress={(e) => { e?.stopPropagation?.(); if (b.userId) router.push(`/user/${b.userId}`); else onMore?.(); }}
              style={handleStyle}
            >
              {b.text}
            </Text>
          ) : b.text))}
        </React.Fragment>
      ))}
    </Text>
  );
}

/**
 * A session's numbers on a post: time on court, and heart rate when its
 * author chose to show it, with where the numbers came from written
 * underneath ("Data by WHOOP"), in words and never a logo. A session from
 * the author's own log shows its time and what it was (a match with its
 * result), and no source line: the words are the player's own. A post with
 * neither (a plain "minutes on court") shows nothing here.
 *
 * Who it was played with shows only for players who accepted their tag
 * ("vs @miraplays", "with @devbackhand", each a link to their profile);
 * nobody waiting, and nobody who said no, ever appears (migration 62).
 *
 * The full form is a row of tiles, the Health page's stat style, with who
 * it was played with on a line of its own under them, the card's full width
 * and wrapping, so a doubles match names all three. The compact form is one
 * line (two at most), for under a photo, where the picture has the room.
 */
export function SessionStats({ session, compact = false }: { session: SessionDetail; compact?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const { blockedIds } = useApp();
  if (!hasSessionStats(session)) return null;
  const tracker = !!session.activityId;
  const source = tracker ? sourceLabel(session.source ?? 'apple-health') : null;
  // A workout from a tracker (a run, a lift: migration 107): its time is not time on court, and a run has its distance.
  const workout = tracker && session.workout ? workoutName(session.workout) : null;
  const far = workout ? formatDistance(session.distanceM) : null;
  const timeWords = workout ? `${workout}, ${duration(session.minutes)}` : `${duration(session.minutes)} on court`;
  const kind = session.kind ?? 'practice';
  const people = peopleBits(session, blockedIds);
  const peopleText = [people.vs, people.with].filter(Boolean).map((c) => c!.map((b) => b.text).join('')).join(' · ');
  // One sentence for a screen reader, rather than a tile at a time. The handles stay links of their own.
  const spoken = (tracker
    ? [timeWords, far, peopleText || null, session.maxHr ? `max heart rate ${session.maxHr} bpm` : null, session.avgHr ? `average ${session.avgHr} bpm` : null, session.strain != null ? `Strain ${session.strain.toFixed(1)}` : null, session.kcal ? `${session.kcal} calories` : null, source]
    : [statsLine(session, blockedIds)]
  ).filter(Boolean).join(', ');
  // The tiles alone (the people line under them is read on its own, each handle a link).
  const tilesSpoken = tracker
    ? [timeWords, far, session.maxHr ? `max heart rate ${session.maxHr} bpm` : null, session.avgHr ? `average ${session.avgHr} bpm` : null, session.strain != null ? `Strain ${session.strain.toFixed(1)}` : null, session.kcal ? `${session.kcal} calories` : null].filter(Boolean).join(', ')
    : statsLine({ ...session, with: undefined });

  if (compact) {
    return (
      <View style={styles.line} accessibilityLabel={spoken}>
        <Ionicons name="stopwatch-outline" size={14} color={colors.court} />
        {/* Two lines at most (three with players named, so a doubles match never loses its time), wrapping rather than cutting off where the numbers came from. */}
        <StatsWords chunks={statsChunks(session, blockedIds)} style={styles.lineText} handleStyle={styles.handle} numberOfLines={people.vs || people.with ? 3 : 2} maxFontSizeMultiplier={MAX_GROW} />
      </View>
    );
  }

  const who = [people.vs, people.with].filter((c): c is StatsBit[] => !!c);
  type Tile = { label: string; value: string };
  const tiles = ((tracker
    ? [
        { label: workout ?? 'Time on court', value: duration(session.minutes) },
        far ? { label: 'Distance', value: far } : null,
        session.maxHr ? { label: 'Max bpm', value: String(session.maxHr) } : null,
        session.avgHr ? { label: 'Avg bpm', value: String(session.avgHr) } : null,
        // Shared on the post (migration 72): Strain is WHOOP's own score, always called Strain.
        session.strain != null ? { label: 'Strain', value: session.strain.toFixed(1) } : null,
        session.kcal ? { label: 'Calories', value: String(session.kcal) } : null,
      ]
    : [
        // A gym session is not time on court.
        { label: kind === 'fitness' ? 'Time' : 'Time on court', value: duration(session.minutes) },
        kind === 'match'
          ? { label: 'Match', value: session.won === true ? 'Won' : session.won === false ? 'Lost' : 'Played' }
          : { label: 'Session', value: KIND_LABEL[kind] },
      ]
  ) as (Tile | null)[]).filter((t): t is Tile => !!t);
  return (
    <View style={styles.wrap}>
      {/* One sentence for a screen reader, rather than a tile at a time. */}
      <View style={styles.tiles} accessible accessibilityLabel={who.length ? tilesSpoken : spoken}>
        {tiles.map((t) => (
          <View key={t.label} style={styles.tile}>
            <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={MAX_GROW}>{t.value}</Text>
            {/* Three tiles on a narrow phone leave "Time on court" too little room: it wraps, never cut short. */}
            <Text style={styles.label} numberOfLines={2} maxFontSizeMultiplier={MAX_GROW}>{t.label}</Text>
          </View>
        ))}
      </View>
      {/* Who played, on a line of its own the full width of the card, wrapping as it needs: in doubles every name shows. */}
      {who.length ? (
        <View style={styles.who}>
          <Ionicons name="people-outline" size={14} color={colors.textMuted} style={styles.whoIcon} />
          <StatsWords chunks={who} style={styles.whoText} handleStyle={styles.handle} maxFontSizeMultiplier={MAX_GROW} />
        </View>
      ) : null}
      {source ? <Text style={styles.source} maxFontSizeMultiplier={MAX_GROW}>{source}</Text> : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.xs },
  // Up to three a row; Strain and calories, when shared, start a second.
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: '30%', gap: 2, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  value: { ...typography.heading, color: colors.text, fontVariant: ['tabular-nums'] },
  label: { ...typography.caption, color: colors.textMuted, letterSpacing: 0.2 },
  source: { ...typography.caption, color: colors.textFaint, letterSpacing: 0.2 },
  who: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingTop: 2 },
  whoIcon: { marginTop: 2 },
  whoText: { ...typography.small, color: colors.textMuted, flex: 1, minWidth: 0 },
  // A player's handle: the text's own colour, a step bolder, so it reads as a name you can tap.
  handle: { ...font('600'), color: colors.text },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lineText: { ...typography.smallStrong, color: colors.textMuted, fontVariant: ['tabular-nums'], flexShrink: 1 },
});

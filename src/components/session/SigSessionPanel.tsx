import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { Avatar } from '@/components/ui';
import { StatStrip, type StatItem } from '@/components/ui/StatStrip';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import type { SessionDetail } from '@/data/types';
import { dayWords, whatWord } from '@/features/activity/format';
import type { CardPerson } from './SessionCard';
import { ScoreBoard } from './ScoreBoard';
import { useTheme } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';

/*
 * The session box in one fixed order (design preview, Oct 22, ?sig=1 on the
 * web only), the way a training log reads top to bottom every time: what and
 * when, then the score as a ScoreBoard (a match) or a small court plate (a
 * practice), then up to three numbers on a StatStrip, then who was on it.
 * A plain surface panel, radius 12, a hairline edge: no shirt wash, no pill,
 * no shadow. Theme colours only, so every court keeps its own palette.
 */

/** "1h 30m" as parts for the strip. */
const timeParts = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? [{ value: String(h), unit: 'h' }, ...(m ? [{ value: String(m).padStart(2, '0'), unit: 'm' }] : [])] : [{ value: String(m), unit: 'm' }];
};

/** A court from above, lying across: outline, net, service lines, centre line, in the theme's hairline ink. */
export function CourtPlate({ height = 72 }: { height?: number }) {
  useTheme();
  return (
    <View style={{ height, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="88%" height="76%" viewBox="0 0 160 60" preserveAspectRatio="none">
        <Rect x={1} y={1} width={158} height={58} stroke={colors.borderStrong} strokeWidth={1.2} fill="none" vectorEffect="non-scaling-stroke" />
        <Line x1={1} y1={8} x2={159} y2={8} stroke={colors.borderStrong} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <Line x1={1} y1={52} x2={159} y2={52} stroke={colors.borderStrong} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <Line x1={38} y1={8} x2={38} y2={52} stroke={colors.borderStrong} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <Line x1={122} y1={8} x2={122} y2={52} stroke={colors.borderStrong} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <Line x1={38} y1={30} x2={122} y2={30} stroke={colors.borderStrong} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <Line x1={80} y1={0} x2={80} y2={60} stroke={colors.brand} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      </Svg>
    </View>
  );
}

export function SigSessionPanel({ session, author, people, onPress, spoken }: {
  session: SessionDetail;
  author: string;
  people: CardPerson[];
  onPress?: () => void;
  spoken: string;
}) {
  useTheme();
  const lead = people[0];
  const kind = whatWord(session);
  const when = session.day ? dayWords(session.day) : '';
  const meta = [kind, when].filter(Boolean).join(' · ');
  const isMatch = session.kind === 'match';
  const sets = session.sets ?? [];
  const games = sets.length ? sets.reduce((acc, s, i) => (i === sets.length - 1 && sets.length >= 2 && Math.max(s[0], s[1]) >= 10 ? acc : [acc[0] + s[0], acc[1] + s[1]]), [0, 0]) : null;
  const items: StatItem[] = [
    { label: 'Time', parts: timeParts(session.minutes) },
    isMatch && games ? { label: 'Games', parts: [{ value: `${games[0]}-${games[1]}` }] } : !isMatch && lead ? { label: 'With', parts: [{ value: lead.name.split(' ')[0] }] } : { label: 'x', parts: [] },
    session.avgHr ? { label: 'Avg HR', parts: [{ value: String(session.avgHr), unit: ' bpm' }] }
      : session.maxHr ? { label: 'Max HR', parts: [{ value: String(session.maxHr), unit: ' bpm' }] }
      : session.kcal ? { label: 'Energy', parts: [{ value: String(session.kcal), unit: ' cal' }] }
      : { label: 'y', parts: [] },
  ];
  const vs = lead ? (isMatch && lead.role === 'opponent' ? 'vs' : 'with') : '';
  const body = (
    <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.meta}>
        {session.kind === 'fitness' || session.workout ? null : <CourtGlyph size={10} color={colors.textMuted} />}
        <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={[typography.small, { color: colors.textMuted, flex: 1 }]}>{meta}</Text>
        {isMatch && session.won !== undefined ? (
          <Text maxFontSizeMultiplier={TextScale.CARD} style={[typography.smallStrong, { color: session.won ? colors.brand : colors.textMuted }]}>{session.won ? 'Won' : 'Lost'}</Text>
        ) : null}
      </View>
      <View style={{ marginTop: spacing.md }}>
        {sets.length ? (
          <ScoreBoard sets={sets} you={author} them={lead ? lead.name : 'Opponent'} youWon={isMatch ? session.won : undefined} />
        ) : session.kind === 'fitness' || session.workout ? null : <CourtPlate />}
      </View>
      <StatStrip items={items} />
      {lead ? (
        <View style={styles.who}>
          <View style={[styles.ring, { borderColor: colors.surface }]}><Avatar name={lead.name} seed={lead.id} size={20} /></View>
          <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={[typography.small, { color: colors.textMuted, flexShrink: 1 }]}>
            {vs} <Text style={{ color: colors.text }}>@{lead.handle}</Text>{people.length > 1 ? ` and ${people.length - 1} more` : ''}
          </Text>
        </View>
      ) : null}
    </View>
  );
  if (!onPress) return <View accessible accessibilityRole="summary" accessibilityLabel={spoken}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={spoken} accessibilityHint="Opens the stats" onPress={onPress} style={({ pressed }) => [pressed && { transform: [{ scale: 0.99 }] }]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: spacing.lg },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ring: { borderWidth: 1.5, borderRadius: 12 },
});

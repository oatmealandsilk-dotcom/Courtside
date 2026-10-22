import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

import { Avatar } from '@/components/ui';
import type { SessionDetail } from '@/data/types';
import { dayWords, whatWord } from '@/features/activity/format';
import type { CardPerson } from './SessionCard';
import { ScoreBoard, isMatchTiebreak } from './ScoreBoard';
import { useTheme } from '@/theme/ThemeProvider';
import { colors, spacing, typography, withAlpha } from '@/theme';
import { TextScale } from '@/theme/textScale';

/*
 * The session box in one fixed order (design preview, Oct 22, ?sig=1 on the
 * web only). The post's own words sit above it as its title (PostCard), then:
 *   1. what and when, and the result word ("Match · Tue 20 Oct", "Won");
 *   2. the score as a ScoreBoard (any scored session), or for a practice the
 *      court with the part of it that was worked on shaded; nothing at all
 *      when there is nothing to say (never the same picture on every card);
 *   3. one quiet line of tennis facts: time on court, a deciding tiebreak,
 *      the drills ("1h 02m · Serve · Volley"), never heart rate (that stays
 *      on the session's own page);
 *   4. who else was on it, as overlapping faces: "with Mira and 3 others".
 * No panel, border, fill, pill or shadow: the ScoreBoard's own hairlines
 * are the frame. Theme colours only, so every court keeps its own palette.
 */

/** "1h 30m", "45m". */
const timeWords = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? ` ${String(m).padStart(2, '0')}m` : ''}` : `${m}m`;
};

const firstOf = (name: string) => name.trim().split(/\s+/)[0] || name;

type Zone = 'serve' | 'net' | 'back';

/** Which part of the court a practice worked on, from its drills and focus: serve boxes, the net, the back of the court. */
function zonesOf(session: SessionDetail): Zone[] {
  const words = [...(session.drills ?? []), session.focus ?? ''].join(' ').toLowerCase();
  const out: Zone[] = [];
  if (/serv|return/.test(words)) out.push('serve');
  if (/volley|net|overhead|smash/.test(words)) out.push('net');
  if (/baseline|rally|cross|groundstroke|forehand|backhand|depth|consisten/.test(words)) out.push('back');
  return out;
}

// A doubles court from above, lying across, in decimetres: 237.7 long, 109.7 wide (about 2.17 : 1).
const L = 237.7;
const W = 109.7;
const ALLEY = 13.7;
const NET = L / 2;
const SVC = 64;

/**
 * A practice's court, drawn at a real court's proportions, centred, in the
 * theme's hairline ink, with the part of the court that was worked on shaded
 * in the court's own colour: the service boxes for serving, the front of the
 * court for volleys, the back for rallies.
 */
export function CourtPlate({ zones, width = 168 }: { zones: Zone[]; width?: number }) {
  useTheme();
  const height = Math.round((width * W) / L);
  const ink = colors.borderStrong;
  const shade = withAlpha(colors.brand, 0.18);
  const sw = 1;
  return (
    <View style={styles.plate} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height + 6} viewBox={`-2 -5 ${L + 4} ${W + 10}`}>
        {zones.includes('serve') ? <Rect x={NET} y={ALLEY} width={SVC} height={W - 2 * ALLEY} fill={shade} /> : null}
        {zones.includes('net') ? <Rect x={NET - 34} y={ALLEY} width={34} height={W - 2 * ALLEY} fill={shade} /> : null}
        {zones.includes('back') ? <Rect x={0} y={ALLEY} width={NET - SVC} height={W - 2 * ALLEY} fill={shade} /> : null}
        <Rect x={0} y={0} width={L} height={W} stroke={ink} strokeWidth={sw * 1.4} fill="none" vectorEffect="non-scaling-stroke" />
        <Line x1={0} y1={ALLEY} x2={L} y2={ALLEY} stroke={ink} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
        <Line x1={0} y1={W - ALLEY} x2={L} y2={W - ALLEY} stroke={ink} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
        <Line x1={NET - SVC} y1={ALLEY} x2={NET - SVC} y2={W - ALLEY} stroke={ink} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
        <Line x1={NET + SVC} y1={ALLEY} x2={NET + SVC} y2={W - ALLEY} stroke={ink} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
        <Line x1={NET - SVC} y1={W / 2} x2={NET + SVC} y2={W / 2} stroke={ink} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
        <Line x1={0} y1={W / 2} x2={4} y2={W / 2} stroke={ink} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
        <Line x1={L - 4} y1={W / 2} x2={L} y2={W / 2} stroke={ink} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
        <Line x1={NET} y1={-3} x2={NET} y2={W + 3} stroke={colors.textMuted} strokeWidth={sw * 1.6} vectorEffect="non-scaling-stroke" />
        <Circle cx={NET} cy={-3.5} r={2.6} fill={colors.textMuted} />
        <Circle cx={NET} cy={W + 3.5} r={2.6} fill={colors.textMuted} />
      </Svg>
    </View>
  );
}

/** Up to three faces, each over the last's edge, ringed in the page colour. */
function Faces({ people }: { people: CardPerson[] }) {
  return (
    <View style={styles.faces}>
      {people.slice(0, 3).map((p, i) => (
        <View key={p.id} style={[styles.ring, { borderColor: colors.bg, marginLeft: i ? -7 : 0, zIndex: 3 - i }]}>
          <Avatar name={p.name} seed={p.id} size={20} />
        </View>
      ))}
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
  const isMatch = session.kind === 'match';
  const sets = session.sets ?? [];
  const meta = [whatWord(session), session.day ? dayWords(session.day) : ''].filter(Boolean).join(' · ');
  // A match's other side goes on the ScoreBoard; whoever is left (a doubles partner) goes on the faces line.
  const opponents = isMatch ? people.filter((p) => p.role === 'opponent') : [];
  const others = people.filter((p) => !opponents.includes(p));
  const them = opponents.length === 1 ? opponents[0].name : opponents.length > 1 ? opponents.map((p) => firstOf(p.name)).join(' / ') : '';
  const zones = !sets.length && session.kind !== 'fitness' && !session.workout ? zonesOf(session) : [];
  const facts = [
    timeWords(session.minutes),
    sets.some((s, i) => isMatchTiebreak(s, i, sets)) ? 'Match tiebreak' : null,
    ...(session.drills ?? []).slice(0, 2),
  ].filter(Boolean).join(' · ');
  // With nothing but the time to say (no score, no court, nobody else), the time joins the top line rather than sitting alone under it.
  const lone = !sets.length && !zones.length && !others.length && !facts.includes(' · ');
  const top = lone ? `${meta} · ${facts}` : meta;
  const whoWords = others.length === 1 ? others[0].name : others.length === 2 ? `${firstOf(others[0].name)} and ${firstOf(others[1].name)}` : others.length ? `${firstOf(others[0].name)} and ${others.length - 1} others` : '';

  const body = (
    <View style={styles.box}>
      <View style={styles.meta}>
        <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={[typography.small, { color: colors.textMuted, flex: 1 }]}>{top}</Text>
        {isMatch && session.won !== undefined ? (
          <Text maxFontSizeMultiplier={TextScale.CARD} style={[typography.smallStrong, { color: session.won ? colors.text : colors.textMuted }]}>{session.won ? 'Won' : 'Lost'}</Text>
        ) : null}
      </View>
      {sets.length ? (
        <ScoreBoard sets={sets} you={author} them={them} youWon={isMatch ? session.won : undefined} />
      ) : zones.length ? <CourtPlate zones={zones} /> : null}
      {lone ? null : <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={[typography.small, { color: colors.textMuted }]}>{facts}</Text>}
      {others.length ? (
        <View style={styles.who}>
          <Faces people={others} />
          <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={[typography.small, { color: colors.textMuted, flexShrink: 1 }]}>
            with <Text style={{ color: colors.text }}>{whoWords}</Text>
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
  box: { gap: spacing.sm, paddingVertical: spacing.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  plate: { alignItems: 'center', paddingVertical: spacing.sm },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  faces: { flexDirection: 'row' },
  ring: { borderWidth: 1.5, borderRadius: 12 },
});

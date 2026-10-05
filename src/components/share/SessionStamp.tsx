import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BrandMark } from '@/components/BrandMark';
import { Avatar, BrandWash } from '@/components/ui';
import { cardLook } from '@/components/session/SessionCard';
import { Duration, Figure } from '@/components/session/Duration';
import type { ID, SessionDetail } from '@/data/types';
import { resultWord } from '@/features/activity/format';
import { sessionPeople } from '@/features/activity/sessionTags';
import { distanceFigure } from '@/features/activity/workouts';
import { font } from '@/theme';

/*
 * The session as a stamp for a story (Oct 4, owner: "make it our own"): the
 * card shrunk for a corner, so it hugs what it says instead of keeping the
 * post card's 4:5 and its empty middle. What it was and when, the time on
 * court as the headline, where, then the numbers as label-over-number columns
 * (as the post's own stats row reads), and the CourtSide mark with who it was
 * with along the bottom. No address and no tracker line: at this size they
 * only came out as specks. Everything scales with `width` (300 is the base).
 */
export function SessionStamp({ session, width, eyebrow, place, hidden = [], score }: {
  /** A match's score, typed on the Share page. */
  score?: string;
  session: SessionDetail;
  width: number;
  eyebrow: string;
  place?: string;
  hidden?: ID[];
}) {
  const look = cardLook();
  const u = width / 300;
  const result = resultWord(session);
  // A workout's distance first (migration 107); tennis never has one.
  const far = session.workout ? distanceFigure(session.distanceM) : null;
  const stats = [
    far ? { label: 'Distance', value: far.value, unit: far.unit, dec: far.value < 10 } : null,
    session.kcal ? { label: 'Calories', value: session.kcal, unit: 'cal' } : null,
    session.maxHr != null && session.avgHr ? { label: 'Avg HR', value: session.avgHr, unit: 'bpm' } : null,
    session.maxHr != null ? { label: 'Max HR', value: session.maxHr, unit: 'bpm' } : null,
  ].filter((x): x is { label: string; value: number; unit: string; dec?: boolean } => !!x);
  const { opponents, partners } = sessionPeople(session, hidden);
  const lead = [...opponents, ...partners][0];
  const others = opponents.length + partners.length - 1;
  const rule = { height: StyleSheet.hairlineWidth * 2, backgroundColor: look.lines, marginVertical: 14 * u };
  return (
    <View style={[styles.card, { width, borderRadius: 20 * u, padding: 18 * u, backgroundColor: look.fill }]}>
      {look.dark ? null : <BrandWash radius={20 * u} />}
      <View style={styles.row}>
        <Text numberOfLines={1} style={[styles.eyebrow, { fontSize: 10.5 * u, letterSpacing: 1.2 * u, color: look.eyebrow }]}>{eyebrow}</Text>
        {result ? (
          <View style={[styles.pill, { height: 20 * u, borderRadius: 10 * u, paddingHorizontal: 8 * u, backgroundColor: look.pillFill }]}>
            <Text style={{ ...font('700'), fontSize: 10.5 * u, color: look.pillInk }}>{result}</Text>
          </View>
        ) : null}
      </View>
      <Duration minutes={session.minutes} size={68 * u} color={look.figure} unitColor={look.muted} style={{ marginTop: 6 * u }} />
      {score ? <Text numberOfLines={1} style={{ ...font('700'), fontSize: 24 * u, letterSpacing: -0.4 * u, color: look.figure, fontVariant: ['tabular-nums'], marginTop: 2 * u }}>{score}</Text> : null}
      {place ? (
        <View style={[styles.row, { gap: 4 * u, marginTop: 2 * u }]}>
          <Ionicons name="location-outline" size={12 * u} color={look.muted} />
          <Text numberOfLines={1} style={{ ...font('500'), fontSize: 12.5 * u, color: look.muted, flexShrink: 1 }}>{place}</Text>
        </View>
      ) : null}
      {stats.length ? (
        <>
          <View style={rule} />
          <View style={[styles.row, { gap: 18 * u }]}>
            {stats.map((st) => (
              <View key={st.label} style={{ gap: 2 * u }}>
                <Text style={{ ...font('500'), fontSize: 10.5 * u, color: look.muted }}>{st.label}</Text>
                <Figure value={st.value} part={st.dec ? 'dec1' : 'int'} unit={st.unit} baseline size={21 * u} unitScale={0.5} color={look.figure} unitColor={look.muted} />
              </View>
            ))}
          </View>
        </>
      ) : null}
      <View style={rule} />
      <View style={[styles.row, { gap: 6 * u }]}>
        <BrandMark size={15 * u} color={look.figure} />
        <Text style={{ ...font('700'), fontSize: 13.5 * u, letterSpacing: -0.3 * u, color: look.ink }}>CourtSide</Text>
        <View style={styles.grow} />
        {lead ? (
          <View style={[styles.row, { gap: 5 * u, flexShrink: 1 }]}>
            <Avatar name={lead.name} seed={lead.id} size={Math.round(18 * u)} />
            <Text numberOfLines={1} style={{ ...font('600'), fontSize: 12 * u, color: look.ink, flexShrink: 1 }}>
              {opponents.length ? 'vs' : 'with'} @{lead.handle}{others > 0 ? ` +${others}` : ''}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center' },
  eyebrow: { ...font('600'), flex: 1 },
  pill: { alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1 },
});

import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { CoachGlyph, CourtDraw } from '@/components/CourtDraw';
import { CourtSpinner } from '@/components/CourtSpinner';
import { EmptyState, Screen } from '@/components/ui';
import { ScoreBoard } from '@/components/session/ScoreBoard';
import { SigSessionPanel } from '@/components/session/SigSessionPanel';
import type { CardPerson } from '@/components/session/SessionCard';
import type { SessionDetail } from '@/data/types';
import { SIG } from '@/features/signature/look';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

/*
 * Design preview only (Oct 22, ?sig=1 on the web): the signature pieces a
 * demo account never reaches on its own, laid out for the design board.
 * The draw-in held at three moments, the empty pages (an empty inbox, an
 * empty session log), the loading court, the AI coach's whistle, and session
 * boxes the demo feed has no post for (straight sets, long names, five
 * people). `?part=` picks one group. Without the preview it is not a page.
 */

const today = new Date().toISOString().slice(0, 10);
const P = (id: string, name: string, role: CardPerson['role']): CardPerson => ({ id, handle: name.toLowerCase().replace(/[^a-z]/g, ''), name, role });

const STRAIGHT: SessionDetail = { focus: 'Match · Won', minutes: 74, drills: [], kind: 'match', won: true, day: today, sets: [[6, 4], [6, 2]] };
const LONG: SessionDetail = { focus: 'Match · Lost', minutes: 128, drills: [], kind: 'match', won: false, day: today, sets: [[6, 7, 5], [7, 5], [4, 6]] };
const PRACTICE: SessionDetail = { focus: 'Practice', minutes: 95, drills: ['Crosscourt rally', 'Serve'], kind: 'practice', day: today };

function Specimen({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View testID="sig-spec" style={styles.block}>
      <Text style={styles.label}>{title}</Text>
      {children}
    </View>
  );
}

function Post({ words, session, author, people }: { words: string; session: SessionDetail; author: string; people: CardPerson[] }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.words} numberOfLines={3}>{words}</Text>
      <SigSessionPanel session={session} author={author} people={people} spoken="" />
    </View>
  );
}

export default function SigSpecimens() {
  const styles = useThemedStyles(styleDefinitions);
  const { part } = useLocalSearchParams<{ part?: string }>();
  if (!SIG) return <Redirect href="/" />;
  const show = (p: string) => !part || part === p;
  return (
    <Screen title="Signature pieces" compactTitle>
      {show('draw') ? (
        <Specimen title="The court drawing itself in (0.3 s, 0.6 s, done)">
          <View style={styles.frames}>
            {[0.3, 0.62, 1].map((f) => <CourtDraw key={f} frame={f} />)}
          </View>
        </Specimen>
      ) : null}
      {show('empty') ? (
        <>
          <Specimen title="Messages, nothing yet">
            <EmptyState title="Quiet court" body="Message a player you'd like to hit with." />
          </Specimen>
          <Specimen title="Your sessions, nothing yet">
            <EmptyState icon="stopwatch-outline" title="Nothing on the scoresheet yet" body="Log a hit and your season starts here." action={{ label: 'Log a session', onPress: () => undefined }} />
          </Specimen>
        </>
      ) : null}
      {show('marks') ? (
        <Specimen title="Loading, and the AI coach's mark">
          <View style={styles.marks}>
            <CourtSpinner size={40} />
            <View style={styles.coachRow}><CoachGlyph size={20} /><Text style={styles.words}>AI coach</Text></View>
            <CoachGlyph size={30} color={colors.textFaint} />
          </View>
        </Specimen>
      ) : null}
      {show('cards') ? (
        <>
          <Specimen title="Straight sets, a win">
            <Post words="Short and sharp. Serve held all night." session={STRAIGHT} author="Alex Rivera" people={[P('s1', 'Mira Okafor', 'opponent')]} />
          </Specimen>
          <Specimen title="Long names, three sets, a loss">
            <Post words="Three hours of the best tennis I've played this season, and I still lost it in the third. Next time." session={LONG} author="Alexandra Montgomery-Rivera" people={[P('s2', 'Bartholomew Okonkwo-Fitzgerald', 'opponent'), P('s3', 'June Park', 'partner')]} />
          </Specimen>
        </>
      ) : null}
      {show('more') ? (
        <>
          <Specimen title="Practice with five people">
            <Post words="Club drills night." session={PRACTICE} author="Alex Rivera" people={[P('s4', 'Mira Okafor', 'partner'), P('s5', 'Dev Sharma', 'partner'), P('s6', 'Sam Ortiz', 'partner'), P('s7', 'June Park', 'partner')]} />
          </Specimen>
          <Specimen title="The post page's ScoreBoard, with headers">
            <ScoreBoard size="page" headers sets={[[7, 6, 5], [3, 6], [10, 7]]} you="Alex Rivera" them="Dev Sharma" youWon />
          </Specimen>
        </>
      ) : null}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  block: { gap: spacing.md, paddingVertical: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  label: { ...typography.caption, color: colors.textFaint, textTransform: 'uppercase' },
  words: { ...typography.body, color: colors.text, lineHeight: 22 },
  frames: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingVertical: spacing.md },
  marks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: spacing.md },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});

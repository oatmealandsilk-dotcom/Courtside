import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { VOTED_SURFACES, surfaceLabel, type VotedSurface } from '@/features/places/courtSurface';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, typography } from '@/theme';
import { PRESS_SHRINK } from '@/theme/press';
import { TextScale } from '@/theme/textScale';

/** A surface's colour, the same dot as the surface tag in Courts near you. */
const tint = (s: VotedSurface) => (s === 'hard' ? colors.surfaceHard : s === 'clay' ? colors.surfaceClay : colors.surfaceGrass);

/**
 * "What surface?" at a court whose map data says nothing about it (the
 * owner, Oct 24: "Once a court gets 5 taps of the same surface in a row then
 * it registers"). One row: the question, then Hard · Clay · Grass. A tap
 * marks your answer and says "Thanks"; tapping another changes it. When
 * five players in a row have said the same, the court registers it
 * (vote_court_surface, migration 186) and `onRegistered` hands it to the
 * page, whose facts then show it; the row stays as it is for this visit (no
 * jump) and is not asked again once the court has a surface.
 *
 * Self-contained, so it can move anywhere on the court's page: it reads
 * your own answer when it opens, and keeps out of sight where the database
 * cannot answer (signed out, or before migration 186).
 */
export function SurfaceAsk({ courtId, onRegistered }: { courtId: string; onRegistered?: (surface: VotedSurface) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const { actions } = useApp();
  const [mine, setMine] = useState<VotedSurface | null>(null);
  const [said, setSaid] = useState<'ask' | 'thanks' | 'failed'>('ask');
  const [gone, setGone] = useState(false);
  const registered = useRef(onRegistered);
  registered.current = onRegistered;
  // Only the newest tap's answer counts, when two are on their way.
  const taps = useRef(0);

  // Your own answer, when you gave one before.
  useEffect(() => {
    let on = true;
    setMine(null); setSaid('ask'); setGone(false);
    void actions.courtSurface(courtId).then((got) => {
      if (!on) return;
      if (!got) { setGone(true); return; }
      setMine((tapped) => tapped ?? got.surface);
      if (got.registered) registered.current?.(got.registered);
    });
    return () => { on = false; };
  }, [courtId, actions]);

  if (gone) return null;

  const pick = (surface: VotedSurface) => {
    if (surface === mine && said === 'thanks') return;
    haptics.tap();
    const was = mine;
    const n = ++taps.current;
    setMine(surface);
    setSaid('thanks');
    actions.voteCourtSurface(courtId, surface)
      .then((got) => { if (got.registered) registered.current?.(got.registered); })
      .catch(() => { if (taps.current === n) { setMine(was); setSaid('failed'); } });
  };

  const question = said === 'thanks' ? 'Thanks' : said === 'failed' ? 'Didn’t save, try later' : 'What surface?';
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="What surface is this court?">
      <Text maxFontSizeMultiplier={TextScale.TITLE} style={[styles.question, said === 'thanks' && styles.thanks]} numberOfLines={1} accessibilityLiveRegion="polite">{question}</Text>
      <View style={styles.choices}>
        {VOTED_SURFACES.map((s) => {
          const on = mine === s;
          return (
            <Pressable
              key={s}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${surfaceLabel[s]} court`}
              hitSlop={{ top: 8, bottom: 8, left: 3, right: 3 }}
              onPress={() => pick(s)}
              style={({ pressed }) => [styles.choice, on && styles.choiceOn, pressed && styles.pressed]}
            >
              <View style={[styles.dot, { backgroundColor: tint(s) }]} />
              <Text maxFontSizeMultiplier={TextScale.TITLE} style={[styles.choiceText, on && styles.choiceTextOn]} numberOfLines={1}>{surfaceLabel[s]}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  // Under the facts strip, inside the page's margins; at a large text size the choices move under the question.
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: spacing.md, rowGap: spacing.sm, marginHorizontal: spacing.lg, paddingTop: 12, minHeight: 44 },
  question: { ...typography.small, color: colors.textMuted },
  thanks: { ...font('600'), color: colors.text },
  choices: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' },
  // The surface tag's look (Courts near you): an outlined pill, its dot, its word.
  choice: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingLeft: 9, paddingRight: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  choiceOn: { borderColor: colors.brand, backgroundColor: colors.brandDim },
  pressed: { transform: [{ scale: PRESS_SHRINK }] },
  dot: { width: 7, height: 7, borderRadius: 4 },
  choiceText: { ...typography.small, color: colors.text },
  choiceTextOn: { ...font('600') },
});

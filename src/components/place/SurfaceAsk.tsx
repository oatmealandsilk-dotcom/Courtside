import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { surfaceTint } from '@/components/place/SurfaceTag';
import { Collapse } from '@/components/ui/Collapse';
import { VOTED_SURFACES, surfaceLabel, type VotedSurface } from '@/features/places/courtSurface';
import * as haptics from '@/lib/haptics';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, inkOn, radius, spacing, typography } from '@/theme';
import { PRESS_SHRINK } from '@/theme/press';
import { TextScale } from '@/theme/textScale';

/** How many in a row register a surface (vote_court_surface, migration 186). */
const RUN = 5;
/** The dots fill one by one, this far apart, once the line has opened. */
const DOT_STEP = 90;
const DOT_START = 200;
/** The chosen choice's pop: up quickly, then a crisp spring home (it starts and ends at rest, 1). */
const POP_UP = { duration: 100, easing: Easing.out(Easing.quad) };
const SPRING_HOME = { damping: 12, stiffness: 420, mass: 0.6 };

/** What this visit's newest answer did: how many of the newest answers in a row agree, and whether it registered. */
type Run = { surface: VotedSurface; agree: number; registered: boolean };

/**
 * "What surface?" at a court whose map data says nothing about it (the
 * owner, Oct 24: "Once a court gets 5 taps of the same surface in a row then
 * it registers"). One row: the question, then Hard · Clay · Grass.
 *
 * A tap should feel like it counted (Oct 25, owner: "There's some sort of
 * submitting thing where it feels better and satisfying to contribute?
 * Right now it seems like there is no rewarding feeling. Even if slightly"):
 * a soft tap under the finger, the choice pops and fills with its surface's
 * colour with a check, the question says "Thanks", and a line opens under
 * the row with five dots that fill one by one to how many players in a row
 * now agree ("3 of 5 agree"; a new run is "1 of 5 so far"). The fifth in a
 * row registers it for everyone: the dots pulse once, the line says "Hard —
 * added for everyone", and the page's facts show it. Tapping another
 * choice changes your answer. Short words, no confetti; every motion starts
 * and ends at rest, and Reduce Motion shows the same without it.
 *
 * Self-contained, so it can move anywhere on the court's page: it reads
 * your own answer when it opens, and keeps out of sight where the database
 * cannot answer (signed out, or before migration 186). The row stays as it
 * is for this visit once the court registers (no jump), and is not asked
 * again on the next.
 */
export function SurfaceAsk({ courtId, onRegistered, ruled = false }: {
  courtId: string;
  onRegistered?: (surface: VotedSurface) => void;
  /** A row of the court page's list (hairlines above and below, in the page's margins) rather than a line of its own. */
  ruled?: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { actions } = useApp();
  const reduced = useReducedMotion();
  const [mine, setMine] = useState<VotedSurface | null>(null);
  const [said, setSaid] = useState<'ask' | 'thanks' | 'failed'>('ask');
  const [gone, setGone] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  // The tap that should pop its choice (a count, so the same choice can pop again).
  const [pop, setPop] = useState<{ surface: VotedSurface; n: number } | null>(null);
  const registered = useRef(onRegistered);
  registered.current = onRegistered;
  // Only the newest tap's answer counts, when two are on their way.
  const taps = useRef(0);
  // Your answer as the server holds it: the same answer again changes nothing there (it keeps its place in the order).
  const held = useRef<VotedSurface | null>(null);

  // Your own answer, when you gave one before.
  useEffect(() => {
    let on = true;
    setMine(null); setSaid('ask'); setGone(false); setRun(null); setPop(null);
    held.current = null;
    void actions.courtSurface(courtId).then((got) => {
      if (!on) return;
      if (!got) { setGone(true); return; }
      held.current = got.surface;
      setMine((tapped) => tapped ?? got.surface);
      if (got.registered) registered.current?.(got.registered);
    });
    return () => { on = false; };
  }, [courtId, actions]);

  if (gone) return null;

  const pick = (surface: VotedSurface) => {
    if (surface === mine && said === 'thanks') return;
    haptics.reward();
    const was = mine;
    const repeat = surface === held.current;
    const n = ++taps.current;
    setMine(surface);
    setSaid('thanks');
    setPop({ surface, n });
    actions.voteCourtSurface(courtId, surface)
      .then((got) => {
        held.current = got.surface;
        const fresh = taps.current === n;
        const agree = typeof got.agree === 'number' ? Math.min(RUN, Math.max(0, got.agree)) : 0;
        const won = got.registered === surface && agree >= RUN;
        // The page shows a registered surface once the dots have filled (or at once, when nothing is shown).
        if (got.registered && !(won && fresh)) registered.current?.(got.registered);
        if (!fresh) return;
        // The same answer again keeps its old place in the order, so the run said is not yours: just "Thanks".
        setRun(!repeat && agree > 0 ? { surface, agree, registered: won } : null);
      })
      .catch(() => { if (taps.current === n) { setMine(was); setSaid('failed'); setRun(null); } });
  };

  const question = said === 'thanks' ? 'Thanks' : said === 'failed' ? 'Didn’t save' : 'What surface?';
  return (
    <View style={ruled ? styles.ruled : styles.plain}>
      <View style={[styles.row, ruled && styles.rowRuled]} accessibilityRole="radiogroup" accessibilityLabel="What surface is this court?">
        <Text maxFontSizeMultiplier={TextScale.TITLE} style={[ruled ? styles.questionRuled : styles.question, said === 'thanks' && styles.thanks]} numberOfLines={1} accessibilityLiveRegion="polite">{question}</Text>
        <View style={styles.choices}>
          {VOTED_SURFACES.map((s) => (
            <Choice key={s} surface={s} on={mine === s} pop={pop?.surface === s ? pop.n : 0} reduced={reduced} onPress={() => pick(s)} />
          ))}
        </View>
      </View>
      <Collapse open={!!run}>
        {run ? <RunLine run={run} reduced={reduced} onWon={() => registered.current?.(run.surface)} /> : null}
      </Collapse>
    </View>
  );
}

/** One choice: an outlined tag (its dot and word); chosen, it fills with its surface's colour and carries a check. A tap pops it. */
function Choice({ surface, on, pop, reduced, onPress }: { surface: VotedSurface; on: boolean; pop: number; reduced: boolean; onPress: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!pop || reduced) return;
    scale.value = withSequence(withTiming(1.12, POP_UP), withSpring(1, SPRING_HOME));
  }, [pop, reduced, scale]);
  const popped = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const tint = surfaceTint(surface);
  const ink = inkOn(tint);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${surfaceLabel[surface]} court`}
      hitSlop={{ top: 8, bottom: 8, left: 3, right: 3 }}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Animated.View style={[styles.choice, on && { backgroundColor: tint, borderColor: tint }, popped]}>
        {on ? <Ionicons name="checkmark" size={13} color={ink} style={styles.check} /> : <View style={[styles.dot, { backgroundColor: tint }]} />}
        <Text maxFontSizeMultiplier={TextScale.TITLE} style={[styles.choiceText, on && { ...font('600'), color: ink }]} numberOfLines={1}>{surfaceLabel[surface]}</Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * The line under the row after a tap: five dots filling one by one to how
 * many in a row agree, and the words. The fifth registers it: the dots
 * pulse once, a soft thud, "Hard — added for everyone".
 */
function RunLine({ run, reduced, onWon }: { run: Run; reduced: boolean; onWon: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const [lit, setLit] = useState(reduced ? run.agree : 0);
  const [beat, setBeat] = useState(0);
  const won = useRef(onWon);
  won.current = onWon;
  useEffect(() => {
    if (reduced) {
      setLit(run.agree);
      if (run.registered) { haptics.commit(); won.current(); }
      return undefined;
    }
    setLit(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= run.agree; i++) timers.push(setTimeout(() => setLit(i), DOT_START + (i - 1) * DOT_STEP));
    if (run.registered) {
      timers.push(setTimeout(() => { setBeat((b) => b + 1); haptics.commit(); won.current(); }, DOT_START + RUN * DOT_STEP + 60));
    }
    return () => { timers.forEach(clearTimeout); };
  }, [run, reduced]);
  const tint = surfaceTint(run.surface);
  const words = run.registered ? `${surfaceLabel[run.surface]} — added for everyone` : run.agree > 1 ? `${run.agree} of ${RUN} agree` : `1 of ${RUN} so far`;
  return (
    <View style={styles.runLine} accessible accessibilityLabel={run.registered ? `${surfaceLabel[run.surface]} added for everyone` : `${run.agree} of ${RUN} players in a row agree`}>
      <View style={styles.dots}>
        {Array.from({ length: RUN }, (_, i) => <RunDot key={i} on={i < lit} color={tint} index={i} beat={beat} reduced={reduced} />)}
      </View>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.runText, run.registered && styles.runWon]} numberOfLines={1} accessibilityLiveRegion="polite">{words}</Text>
      {run.registered ? <Ionicons name="checkmark-circle" size={15} color={colors.brand} /> : null}
    </View>
  );
}

/** One dot: grey, then its surface's colour, with a small pop as it fills; on a registering tap, one pulse in a quick wave. */
function RunDot({ on, color, index, beat, reduced }: { on: boolean; color: string; index: number; beat: number; reduced: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!on || reduced) return;
    scale.value = withSequence(withTiming(1.45, { duration: 90, easing: Easing.out(Easing.quad) }), withSpring(1, SPRING_HOME));
  }, [on, reduced, scale]);
  useEffect(() => {
    if (!beat || reduced) return;
    scale.value = withDelay(index * 45, withSequence(withTiming(1.6, { duration: 120, easing: Easing.out(Easing.quad) }), withSpring(1, SPRING_HOME)));
  }, [beat, index, reduced, scale]);
  const popped = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={[styles.runDot, { backgroundColor: on ? color : colors.border }, popped]} />;
}

const styleDefinitions = StyleSheet.create({
  // Today's page: under the facts strip, inside the page's margins.
  plain: { marginHorizontal: spacing.lg, paddingTop: 12 },
  // The court page's list: a row between hairlines.
  ruled: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  // At a large text size the choices move under the question.
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: spacing.md, rowGap: spacing.sm, minHeight: 44 },
  rowRuled: { paddingVertical: 8 },
  question: { ...typography.small, color: colors.textMuted },
  questionRuled: { ...typography.body, color: colors.textMuted },
  thanks: { ...font('600'), color: colors.text },
  choices: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' },
  // The surface tag's look (Courts near you): an outlined tag, its dot, its word.
  choice: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingLeft: 9, paddingRight: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  pressed: { transform: [{ scale: PRESS_SHRINK }] },
  dot: { width: 7, height: 7, borderRadius: 4 },
  // The check takes the dot's place, a little wider, and pulls in so the word stays put.
  check: { marginHorizontal: -3 },
  choiceText: { ...typography.small, color: colors.text },
  // The line after a tap.
  runLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: 12, paddingTop: 2 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  runDot: { width: 7, height: 7, borderRadius: 4 },
  runText: { ...typography.small, color: colors.textMuted, flexShrink: 1 },
  runWon: { ...font('600'), color: colors.text },
});

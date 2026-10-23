import { PRESS_DIM } from '@/theme/press';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SwipePressable } from '@/components/SwipePressable';
import Ionicons from '@expo/vector-icons/Ionicons';
import Reanimated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';

import type { Question } from '@/data/types';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, typography } from '@/theme';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { CountUp } from '@/components/session/CountUp';

/** How long a number counts and a bar grows: the sessions' numbers' 700ms. */
const COUNT_MS = 700;
/** Each row starts a moment after the one above it. */
const STAGGER_MS = 45;
/** How long the results stay up after you take your vote back, so the bars and numbers can fall to 0 first. */
const CLOSE_MS = COUNT_MS + 3 * STAGGER_MS;

/**
 * A thread's poll. Before you vote: the options as plain rows to tap. After:
 * each row fills to its share, with the percentage, and yours has a tick.
 * Tap another to change your mind; tap yours again to take your vote back
 * and pick afresh (owner, Oct 20: "On poll, clicking your selected
 * deselects it"). Nobody sees who voted for what.
 *
 * When you vote, switch or take it back, each percentage counts to its new
 * number with the sessions' CountUp, each bar grows or shrinks to its new
 * share from the left, top row first, and your tick lands with a small
 * spring (owner, Oct 20: "make the animation look better when you tap the
 * polls let's have the counting number thing like our sessions thing").
 * The bars move by a transform (scaleX), so the row is never re-laid out
 * while they move. The same file serves the phone and the browser:
 * Reanimated runs on both, and CountUp picks its own browser version.
 */
export function PollView({ question, compact = false }: { question: Question; compact?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const { actions, currentUserId } = useApp();
  const poll = question.poll;
  const voted = poll?.myVote !== undefined;
  // Just took your vote back: the results stay up a moment, falling to 0, before the plain rows return.
  // A layout effect, so the plain rows never flash for a frame before the fall starts.
  const [closing, setClosing] = useState(false);
  const wasVoted = useRef(voted);
  useLayoutEffect(() => {
    const was = wasVoted.current;
    wasVoted.current = voted;
    if (voted) { setClosing(false); return undefined; }
    if (!was) return undefined;
    setClosing(true);
    const t = setTimeout(() => setClosing(false), CLOSE_MS);
    return () => clearTimeout(t);
  }, [voted]);
  // The first look at a poll you had already voted on is still; only a tap moves it.
  const settled = useRef(false);
  useEffect(() => { settled.current = true; }, []);
  if (!poll) return null;
  const total = poll.counts.reduce((a, b) => a + b, 0);
  const results = voted || closing;
  return (
    <View style={styles.wrap}>
      {poll.options.map((option, i) => {
        const share = total ? Math.round((poll.counts[i] ?? 0) / total * 100) : 0;
        const mine = poll.myVote === i;
        return (
          <SwipePressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={voted ? `${option}, ${share} percent${mine ? ', your vote' : ''}` : `Vote for ${option}`}
            disabled={!currentUserId}
            onPress={(e) => { e.stopPropagation?.(); actions.votePoll(question.id, i); }}
            style={({ pressed }) => [styles.option, compact && styles.optionCompact, pressed && { opacity: PRESS_DIM }]}
          >
            <Bar share={voted ? share : 0} mine={mine} index={i} />
            <Text style={[styles.label, mine && styles.labelMine]} numberOfLines={2}>{option}</Text>
            {mine ? <Tick pop={settled.current} /> : null}
            {results ? <Share share={voted ? share : 0} mine={mine} index={i} still={!settled.current} /> : null}
          </SwipePressable>
        );
      })}
      <Text style={styles.meta}>{total === 1 ? '1 vote' : `${total} votes`}{voted ? ' · tap another to change' : ''}</Text>
    </View>
  );
}

/** A row's fill: one full-width bar, scaled from its left edge to the share. At 0 (not voted yet) it is not seen. */
function Bar({ share, mine, index }: { share: number; mine: boolean; index: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const reduced = useReducedMotion();
  const scale = useSharedValue(share / 100);
  useEffect(() => {
    cancelAnimation(scale);
    if (reduced) { scale.value = share / 100; return; }
    scale.value = withDelay(index * STAGGER_MS, withTiming(share / 100, { duration: COUNT_MS, easing: Easing.out(Easing.cubic) }));
  }, [share, index, reduced, scale]);
  const look = useAnimatedStyle(() => ({ transform: [{ scaleX: scale.value }] }));
  return <Reanimated.View pointerEvents="none" style={[styles.fill, mine && styles.fillMine, look]} />;
}

/**
 * The percentage, counting from the number it showed before to its new one,
 * like a session's numbers: up from 0 when the results first appear, up or
 * down when you switch, down to 0 when you take your vote back.
 */
function Share({ share, mine, index, still }: { share: number; mine: boolean; index: number; still: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const last = useRef(still ? share : 0);
  const from = useRef(last.current);
  if (last.current !== share) { from.current = last.current; last.current = share; }
  return (
    <View style={styles.shareWrap}>
      <CountUp value={share} from={from.current} delay={index * STAGGER_MS} duration={COUNT_MS} maxFontSizeMultiplier={1.3} style={[styles.share, mine && styles.labelMine]} />
      <Text style={[styles.share, mine && styles.labelMine]} maxFontSizeMultiplier={1.3}>%</Text>
    </View>
  );
}

/** Your pick's tick, landing with a small spring when you tap (still when the poll first shows). */
function Tick({ pop }: { pop: boolean }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(pop && !reduced ? 0.4 : 1);
  useEffect(() => {
    if (scale.value !== 1) scale.value = withSpring(1, { damping: 11, stiffness: 260, mass: 0.6 });
  }, [scale]);
  const look = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Reanimated.View style={look}>
      <Ionicons name="checkmark-circle" size={16} color={colors.brand} />
    </Reanimated.View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: 8 },
  option: { minHeight: 44, borderRadius: radius.md, backgroundColor: colors.bgElevated, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 14, overflow: 'hidden' },
  optionCompact: { minHeight: 40 },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%', transformOrigin: 'left', backgroundColor: colors.surfaceAlt },
  fillMine: { backgroundColor: colors.brandDim },
  label: { flex: 1, ...typography.body, fontSize: 15, color: colors.text, paddingVertical: 10 },
  labelMine: { ...font('600'), color: colors.text },
  shareWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', minWidth: 36 },
  share: { ...typography.smallStrong, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  meta: { ...typography.small, color: colors.textFaint },
});

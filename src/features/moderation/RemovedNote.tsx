import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { ID, Removed, ReviewRequest, TakedownKind, TakedownReason } from '@/data/types';
import { asRuleThing, removedLine, reviewFor, thingWord } from '@/features/moderation/reasons';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

/** What a removed thing is, for the author's "Why?" and "Ask for a review". */
export interface RemovedRef {
  kind: TakedownKind;
  id: ID;
  /** Who posted it (a coach reply's coach); the two links show only to them. */
  authorId?: ID;
  /** A post that is a clip, so the words say "clip". */
  clip?: boolean;
}

/**
 * The Community Guidelines at this reason's own part (app/guidelines.tsx).
 * "Something else" opens at the top, where the page says what a plain
 * "Removed for breaking CourtSide's rules" means.
 */
export function openRules(reason: TakedownReason, thing?: string) {
  const what = asRuleThing(thing);
  router.push({ pathname: '/guidelines', params: { rule: reason, ...(what ? { what } : {}) } });
}

/** The small sheet that asks for a review (app/review-request.tsx). */
export function openReviewAsk(kind: TakedownKind, id: ID) {
  router.push({ pathname: '/review-request', params: { kind, id } });
}

/**
 * Whether this is yours, and where your ask for a review of this take-down
 * stands: undefined while not asked (or not known yet). Your asks are read
 * once, the first time something removed of yours shows.
 */
export function useReviewOf(item: RemovedRef | undefined, removed: Removed | undefined): { mine: boolean; review?: ReviewRequest; known: boolean } {
  const { currentUserId, reviewRequests, actions } = useApp();
  const mine = !!item && !!removed && !!currentUserId && item.authorId === currentUserId;
  useEffect(() => {
    if (mine && reviewRequests === null) void actions.loadReviewRequests();
  }, [mine, reviewRequests, actions]);
  if (!mine || !item || !removed) return { mine: false, known: false };
  return { mine, review: reviewFor(reviewRequests, item.kind, item.id, removed.at), known: reviewRequests !== null };
}

/**
 * "Removed: Violence or weapons", on something an admin took down
 * (migration 108). Only its author and the admins ever have it, so this is
 * what they see where it sits: a red pill over a post's or Instant's page,
 * or a quiet line under a comment or reply (`quiet`). Never says who.
 *
 * Given `item`, its author also gets the way on (Oct 5, owner: "why was
 * this removed. what rules"): the pill opens the Community Guidelines at
 * that rule, and under it sits "Why? See the rules · Ask for a review"
 * (RemovedActions). `actions={false}` leaves that line for the caller to
 * place (a comment, where it must not sit inside the words' own button).
 */
export function RemovedNote({ removed, quiet = false, style, item, actions = true, align = 'center', onMedia = false }: {
  removed: Removed;
  quiet?: boolean;
  style?: StyleProp<ViewStyle>;
  item?: RemovedRef;
  actions?: boolean;
  /** Where the pill and its line sit: centred over a page (the default), or at the start of a column. */
  align?: 'center' | 'start';
  /** Over a photo or clip: the author's line on a small card of its own, so it reads on any picture. */
  onMedia?: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const words = removedLine(removed);
  const { mine } = useReviewOf(item, removed);
  if (quiet) {
    return (
      <View style={[styles.quietWrap, style]}>
        <View style={styles.line} accessibilityRole="text" accessibilityLabel={words}>
          <Ionicons name="eye-off-outline" size={13} color={colors.danger} />
          <Text style={styles.lineText}>{words}</Text>
        </View>
        {mine && actions && item ? <RemovedActions removed={removed} item={item} /> : null}
      </View>
    );
  }
  const pillLook = [styles.pill, { backgroundColor: colors.danger }, align === 'start' && styles.pillStart];
  const pillWords = (
    <>
      <Ionicons name="eye-off-outline" size={15} color={colors.onDanger} />
      <Text style={[styles.pillText, { color: colors.onDanger }]} numberOfLines={2}>{words}</Text>
    </>
  );
  // Somebody else's (an admin looking): the pill only, which lets taps through.
  if (!mine || !item) {
    return (
      <View pointerEvents="none" style={[...pillLook, style]} accessibilityRole="text" accessibilityLabel={`${words}. Only its author and CourtSide’s admins can see it.`}>
        {pillWords}
      </View>
    );
  }
  return (
    <View pointerEvents="box-none" style={[styles.stack, align === 'start' && styles.stackStart, style]}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${words}. Only you and CourtSide’s admins can see it.`}
        accessibilityHint="Opens the Community Guidelines"
        onPress={() => openRules(removed.reason, thingWord(item.kind, item.clip))}
        style={({ pressed }) => [...pillLook, pressed && styles.pressed]}
      >
        {pillWords}
      </Pressable>
      {actions ? <RemovedActions removed={removed} item={item} card={onMedia} align={align} /> : null}
    </View>
  );
}

/**
 * The author's way on from something taken down: "Why? See the rules"
 * (the Community Guidelines at that rule) and "Ask for a review" (once per
 * take-down), which then reads "Review asked · we'll let you know", or
 * "Reviewed · it stays removed" once an admin has looked again. Shows to
 * the author only; nothing for anyone else. `card`: on a small card of its
 * own, for under the pill over a photo or clip, where a bare line would be
 * lost.
 */
export function RemovedActions({ removed, item, card = false, align = 'start', style }: {
  removed: Removed;
  item: RemovedRef;
  card?: boolean;
  align?: 'center' | 'start';
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { mine, review, known } = useReviewOf(item, removed);
  if (!mine) return null;
  const thing = thingWord(item.kind, item.clip);
  const status = review?.status === 'open'
    ? { icon: 'time-outline' as const, words: 'Review asked · we’ll let you know' }
    : review?.status === 'kept' ? { icon: 'checkmark-done-outline' as const, words: 'Reviewed · it stays removed' } : null;
  return (
    <View style={[styles.actions, card && styles.card, align === 'center' && styles.actionsCenter, style]}>
      <View style={styles.part}>
        <Text style={styles.muted}>Why? </Text>
        <Pressable accessibilityRole="link" accessibilityLabel={`Why? See the rules your ${thing} broke`} hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }} onPress={() => openRules(removed.reason, thing)} style={({ pressed }) => pressed && styles.pressed}>
          <Text style={styles.link}>See the rules</Text>
        </Pressable>
      </View>
      <Text style={styles.dot} accessibilityElementsHidden importantForAccessibility="no">·</Text>
      {status ? (
        <View style={styles.part} accessibilityRole="text" accessibilityLabel={status.words}>
          <Ionicons name={status.icon} size={12} color={colors.textMuted} style={styles.statusIcon} />
          <Text style={styles.muted}>{status.words}</Text>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask for a review"
          accessibilityHint={`Asks CourtSide to look at your ${thing} again`}
          accessibilityState={{ disabled: !known }}
          // Waits until your earlier asks are known, so a second ask is never offered by mistake.
          disabled={!known}
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          onPress={() => openReviewAsk(item.kind, item.id)}
          style={({ pressed }) => [!known && styles.waiting, pressed && styles.pressed]}
        >
          <Text style={styles.link}>Ask for a review</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * The same, over a profile grid tile: the picture dimmed, with the mark and
 * "Removed" in the middle. It lets taps through to the tile.
 */
export function TileRemoved() {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.tile]} accessibilityRole="image" accessibilityLabel="Removed">
      <Ionicons name="eye-off" size={20} color={colors.onMedia} />
      <Text style={[styles.tileText, { color: colors.onMedia }]}>Removed</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 6, maxWidth: '86%', paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill },
  pillStart: { alignSelf: 'flex-start' },
  pillText: { ...typography.smallStrong, flexShrink: 1 },
  // The pill and its line as one piece: the pill on top, the quieter card under it.
  stack: { alignItems: 'center', alignSelf: 'stretch', gap: 8 },
  stackStart: { alignItems: 'flex-start' },
  quietWrap: { gap: 3 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 2 },
  lineText: { ...typography.caption, color: colors.danger, letterSpacing: 0 },
  // Words and links on one line, wrapping as a sentence would on a narrow phone.
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 0, rowGap: 2 },
  actionsCenter: { justifyContent: 'center', alignSelf: 'center' },
  // Over a photo or clip: the page's own card, small and lifted, so the line reads on any picture.
  card: { ...lift, maxWidth: '92%', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  part: { flexDirection: 'row', alignItems: 'center' },
  muted: { ...typography.small, fontSize: 12.5, color: colors.textMuted },
  link: { ...typography.small, fontSize: 12.5, ...font('600'), color: colors.text },
  dot: { ...typography.small, fontSize: 12.5, color: colors.textFaint, paddingHorizontal: 6 },
  statusIcon: { marginRight: 4 },
  waiting: { opacity: 0.5 },
  pressed: { opacity: 0.6 },
  tile: { alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: colors.overlay },
  tileText: { ...typography.smallStrong },
});

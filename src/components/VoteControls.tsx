import { PRESS_DIM } from '@/theme/press';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, font, withAlpha } from '@/theme';
import { TextScale } from '@/theme/textScale';
import { LESS_AI_DISCUSS } from '@/theme/look';

export function voteCounts(item: { votes: number; votedBy: Record<string, 1 | -1> }) {
  const votes = Object.values(item.votedBy);
  const up = votes.filter(v => v === 1).length;
  const down = votes.filter(v => v === -1).length;
  // Fixtures retain an anonymous score; preserve it alongside recorded votes.
  const anonymous = item.votes - up + down;
  return { up: up + Math.max(0, anonymous), down: down + Math.max(0, -anonymous) };
}
export function VoteControls({ item, userId, onVote }: {
  item: { votes: number; votedBy: Record<string, 1 | -1> };
  userId?: string | null;
  onVote: (direction: 1 | -1) => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const counts = voteCounts(item);
  return <View style={styles.row}>{([1, -1] as const).map(direction => {
    const active = !!userId && item.votedBy[userId] === direction;
    const label = direction === 1 ? 'Upvote' : 'Downvote';
    const count = direction === 1 ? counts.up : counts.down;
    return <Pressable key={direction} accessibilityRole="button" accessibilityLabel={`${label}, ${count}`}
      accessibilityState={{ selected: active }} onPress={event => { event.stopPropagation(); onVote(direction); }}
      style={({ pressed }) => [styles.button, active && (direction === 1 ? styles.active : styles.activeDown), pressed && { opacity: PRESS_DIM }]}>
      {/* A downvote reads red, an upvote green (Oct 30, owner: "Down voting should be red"). */}
      <Ionicons name={direction === 1 ? 'arrow-up-outline' : 'arrow-down-outline'} size={18} color={active ? (direction === 1 ? colors.brand : colors.danger) : colors.textMuted}/>
      {LESS_AI_DISCUSS && !count ? null : <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.count, active && { color: direction === 1 ? colors.brand : colors.danger }]}>{count}</Text>}
    </Pressable>;
  })}</View>;
}
const styleDefinitions = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  // The hand-made look (Oct 24): no grey pill behind the votes, a pale brand tint only once you vote.
  // A zero count is hidden there, so each button keeps room for a one-digit count (52): the first vote's number
  // fills that room instead of widening the button and pushing what sits beside it.
  button: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, minHeight: 36, borderRadius: 20, backgroundColor: LESS_AI_DISCUSS ? 'transparent' : colors.bgElevated, ...(LESS_AI_DISCUSS ? { minWidth: 52 } : null) },
  active: { backgroundColor: colors.brandDim },
  activeDown: { backgroundColor: withAlpha(colors.danger, 0.12) },
  count: { color: colors.textMuted, fontSize: 12, ...font('600') },
});

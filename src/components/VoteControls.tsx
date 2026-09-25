import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, font } from '@/theme';

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
      style={({ pressed }) => [styles.button, active && styles.active, pressed && { opacity: 0.65 }]}>
      <Ionicons name={direction === 1 ? 'arrow-up-outline' : 'arrow-down-outline'} size={18} color={active ? colors.brand : colors.textMuted}/>
      <Text style={[styles.count, active && { color: colors.brand }]}>{count}</Text>
    </Pressable>;
  })}</View>;
}
const styleDefinitions = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  button: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, minHeight: 36, borderRadius: 20, backgroundColor: colors.bgElevated },
  active: { backgroundColor: colors.brandDim },
  count: { color: colors.textMuted, fontSize: 12, ...font('600') },
});

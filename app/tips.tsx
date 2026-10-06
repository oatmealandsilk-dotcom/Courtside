import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React, { useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { goBack } from '@/lib/goBack';

import { Screen } from '@/components/ui';
import { TipComposer } from '@/components/TipComposer';
import { voteCounts } from '@/components/VoteControls';
import { RichText } from '@/components/RichText';
import { relativeTime } from '@/lib/format';
import { confirmDelete, confirmReport } from '@/lib/confirm';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import type { Tip } from '@/data/types';
import { colors, font, spacing, typography, lift } from '@/theme';

/** A tip sent in the last few minutes is yours to see at the top, whatever its votes. */
const FRESH_MS = 10 * 60 * 1000;
const score = (tip: Tip) => { const c = voteCounts(tip); return c.up - c.down; };

/**
 * The board: every tip from early users, most wanted first. A box to add
 * one at the top, then one quiet list — a shade off the page, hairlines
 * between — with each tip's score in a narrow rail on its left, the way
 * idea boards read. The order is set when the page opens, so a vote never
 * makes the row under your thumb jump away.
 */
export default function Tips() {
  const styles = useThemedStyles(styleDefinitions);
  const { tips, users, currentUserId, actions } = useApp();
  const opened = useRef(Date.now()).current;
  // Re-sorted when a tip arrives or leaves, not on every vote.
  const order = useMemo(() => {
    const fresh = (t: Tip) => t.authorId === currentUserId && opened - Date.parse(t.createdAt) < FRESH_MS;
    return [...tips]
      .sort((a, b) => Number(fresh(b)) - Number(fresh(a)) || score(b) - score(a) || Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((t) => t.id);
  }, [tips.length, currentUserId]);
  const byId = new Map(tips.map((t) => [t.id, t]));
  const list = order.map((id) => byId.get(id)).filter((t): t is Tip => !!t);

  return (
    <Screen title="Tips" compactTitle onBack={() => goBack()}>
      <Text style={styles.lead}>Ideas for CourtSide from the people using it. Vote for the ones you want, and the top of this list gets built first.</Text>
      <TipComposer onSubmit={actions.submitTip} />

      {list.length === 0 ? (
        <Text style={styles.empty}>No tips yet. Yours would be the first.</Text>
      ) : (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Most wanted</Text>
          <View style={styles.card}>
            {list.map((tip, index) => {
              const author = users.find((u) => u.id === tip.authorId);
              const mine = !!currentUserId && tip.authorId === currentUserId;
              const my = currentUserId ? tip.votedBy[currentUserId] : undefined;
              const net = score(tip);
              return (
                <View key={tip.id} style={[styles.row, index > 0 && styles.rowLine]}>
                  <View style={styles.rail}>
                    <VoteArrow direction={1} on={my === 1} onPress={() => actions.voteTip(tip.id, 1)} />
                    <Text style={[styles.score, my === 1 && styles.scoreUp, my === -1 && styles.scoreDown]} accessibilityLabel={`${net} votes`}>{net}</Text>
                    <VoteArrow direction={-1} on={my === -1} onPress={() => actions.voteTip(tip.id, -1)} />
                  </View>
                  <View style={styles.words}>
                    <RichText style={styles.body}>{tip.body}</RichText>
                    <View style={styles.meta}>
                      <PlayerName userId={author?.id} style={styles.name}>{mine ? 'You' : author?.name ?? 'Player'}</PlayerName>
                      <Text style={styles.time}>· {relativeTime(tip.createdAt)}</Text>
                      {/* Your own tip can be deleted; anyone else's reported (App Review 1.2), the way a coach's reply is. */}
                      {mine ? (
                        <Pressable accessibilityRole="button" accessibilityLabel="Delete your tip" onPress={() => confirmDelete(() => actions.deleteTip(tip.id), 'your tip')} hitSlop={8} style={styles.action}>
                          <Ionicons name="trash-outline" size={14} color={colors.textFaint} />
                          <Text style={styles.time}>Delete</Text>
                        </Pressable>
                      ) : currentUserId ? (
                        <Pressable accessibilityRole="button" accessibilityLabel="Report this tip" onPress={() => confirmReport('tip', () => {
                          actions.reportUser(tip.authorId, `tip:${tip.id}`);
                          showToast({ title: 'Thanks — a person will review this', icon: 'flag-outline' });
                        })} hitSlop={8} style={styles.action}>
                          <Ionicons name="flag-outline" size={14} color={colors.textFaint} />
                          <Text style={styles.time}>Report</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
          <Text style={styles.foot}>{list.length === 1 ? '1 tip' : `${list.length} tips`} so far</Text>
        </View>
      )}
    </Screen>
  );
}

function VoteArrow({ direction, on, onPress }: { direction: 1 | -1; on: boolean; onPress: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const up = direction === 1;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={up ? 'Vote for this' : 'Vote against this'}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      hitSlop={{ left: 10, right: 10, top: 2, bottom: 2 }}
      style={({ pressed }) => [styles.arrow, on && (up ? styles.arrowUp : styles.arrowDown), pressed && { opacity: 0.6 }]}
    >
      <Ionicons name={up ? 'chevron-up' : 'chevron-down'} size={18} color={on ? (up ? colors.brand : colors.text) : colors.textFaint} />
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  lead: { ...typography.body, color: colors.textMuted, lineHeight: 22, marginBottom: spacing.lg },
  empty: { ...typography.small, color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.xxl },
  section: { gap: spacing.sm, paddingTop: spacing.xl },
  sectionTitle: { ...typography.smallStrong, color: colors.textMuted, paddingHorizontal: spacing.sm },
  // One list, the way Settings reads: a shade off the page, hairlines between rows.
  card: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.md, paddingLeft: spacing.sm, paddingRight: spacing.lg },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rail: { width: 40, alignItems: 'center', gap: 1 },
  arrow: { width: 32, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  arrowUp: { backgroundColor: colors.brandDim },
  arrowDown: { backgroundColor: colors.surfaceAlt },
  score: { fontSize: 15, ...font('600'), color: colors.text, fontVariant: ['tabular-nums'] },
  scoreUp: { color: colors.brand },
  scoreDown: { color: colors.textMuted },
  words: { flex: 1, minWidth: 0, gap: 6, paddingTop: 4 },
  body: { ...typography.body, color: colors.text, lineHeight: 22 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { ...typography.small, color: colors.textMuted, ...font('600') },
  time: { ...typography.small, color: colors.textFaint },
  // Delete or Report, at the far end of the line.
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  foot: { ...typography.caption, color: colors.textFaint, textAlign: 'center', paddingTop: spacing.md },
});

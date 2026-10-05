import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { HeadToHead, ID } from '@/data/types';
import { dayWords } from '@/features/activity/format';
import { recordLine, scoreText, spokenScore } from '@/features/activity/score';
import { startRematch } from '@/features/hits/rematch';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

/**
 * Your record against this player, on their profile (Oct 4, owner;
 * head_to_head, migration 91): "You lead 3–2", the last result with its
 * score, and "Rematch?" (the hit form as an invite for them only, the last
 * score in its note). Only scored matches across the net that you are both
 * confirmed on count; with none, nothing shows. Asked again whenever your
 * tags change (a tag accepted, a score edited).
 */
export function HeadToHeadCard({ userId, name }: { userId: ID; name: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const { actions, sessionTags, sessions, currentUserId } = useApp();
  const [record, setRecord] = useState<HeadToHead | null>(null);
  useEffect(() => {
    let on = true;
    void actions.headToHead(userId).then((h) => { if (on) setRecord(h); }).catch(() => undefined);
    return () => { on = false; };
  }, [userId, currentUserId, sessionTags, sessions, actions]);

  const first = name.trim().split(/\s+/)[0] || name;
  const line = recordLine(record, first);
  if (!record || !line) return null;
  const last = record.last;
  const lastWords = last ? `Last: ${last.won ? 'Won' : 'Lost'} ${scoreText(last.sets)} · ${dayWords(last.day)}` : null;
  // Only someone you may message, as "Ask to hit" on the map (an adult, or a teen who follows you):
  // otherwise the form would open with nobody to invite (Oct 5, review).
  const canAsk = actions.canMessage(userId);
  return (
    <View style={styles.card} accessible={false}>
      <View accessible accessibilityLabel={`Head to head with ${first}: ${line}.${last ? ` Last match, you ${last.won ? 'won' : 'lost'} ${spokenScore(last.sets)}, ${dayWords(last.day)}.` : ''}`} style={styles.words}>
        <Text style={styles.eyebrow}>Head to head</Text>
        <Text style={styles.record} numberOfLines={1}>{line}</Text>
        {lastWords ? <Text style={styles.last} numberOfLines={1}>{lastWords}</Text> : null}
      </View>
      {canAsk ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Rematch with ${first}: invite them to hit`}
          hitSlop={6}
          onPress={() => startRematch(userId, last?.sets)}
          style={({ pressed }) => [styles.rematch, pressed && styles.pressed]}
        >
          <Ionicons name="repeat-outline" size={16} color={colors.brandInk} />
          <Text style={styles.rematchText}>Rematch?</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  card: { ...lift, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: 16, borderRadius: 20, backgroundColor: colors.surface, marginBottom: spacing.md },
  words: { flex: 1, minWidth: 0, gap: 2 },
  eyebrow: { ...typography.smallStrong, color: colors.textMuted },
  record: { ...font('700'), fontSize: 20, letterSpacing: -0.4, color: colors.text, fontVariant: ['tabular-nums'] },
  last: { ...typography.small, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  rematch: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.brand },
  rematchText: { ...font('700'), fontSize: 14, color: colors.brandInk },
  pressed: { opacity: 0.7 },
});

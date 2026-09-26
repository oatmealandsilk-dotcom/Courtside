import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { TipComposer } from '@/components/TipComposer';
import { voteCounts } from '@/components/VoteControls';
import { Wash } from '@/components/Wash';
import { useApp } from '@/store/AppContext';
import { colors, font, spacing, typography } from '@/theme';

/**
 * A page in the feed while the app is young: early people say what they
 * would change, and the best of it gets built. No card around it — the
 * page's own wash, a headline, the box, and underneath, the tip everyone
 * wants most right now, so the board feels alive before you open it.
 */
export function TipPage({ onSubmit }: { onSubmit: (body: string) => Promise<void> | void }) {
  const styles = useThemedStyles(styleDefinitions);
  const { tips } = useApp();
  const [sent, setSent] = useState(false);
  const net = (t: (typeof tips)[number]) => { const c = voteCounts(t); return c.up - c.down; };
  const top = tips.length ? [...tips].sort((a, b) => net(b) - net(a) || Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] : undefined;
  return (
    <View style={styles.page}>
      <Wash height={460} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>
        <View style={styles.column}>
          <View style={styles.head}>
            <Text style={styles.title}>Submit a tip</Text>
            <Text style={styles.lead}>You’re one of the first people on CourtSide, so what you say now counts more than it ever will again. Tell us what you’d add or change.</Text>
          </View>
          <TipComposer onSubmit={onSubmit} onSent={() => { setSent(true); router.push('/tips'); }} />
          {sent ? <Text style={styles.thanks} accessibilityLiveRegion="polite">Sent. It’s on the board now.</Text> : null}

          <Pressable
            accessibilityRole="link"
            accessibilityLabel={top ? `See all tips. Most wanted: ${top.body}` : 'See the tips board'}
            onPress={() => router.push('/tips')}
            style={({ pressed }) => [styles.board, pressed && styles.boardPressed]}
          >
            {top ? (
              <>
                <View style={styles.score}>
                  <Ionicons name="chevron-up" size={14} color={colors.brand} />
                  <Text style={styles.scoreText}>{net(top)}</Text>
                </View>
                <View style={styles.boardWords}>
                  <Text style={styles.boardLabel}>Most wanted right now</Text>
                  <Text style={styles.boardTip} numberOfLines={2}>{top.body}</Text>
                </View>
              </>
            ) : (
              <View style={styles.boardWords}>
                <Text style={styles.boardLabel}>The board</Text>
                <Text style={styles.boardTip}>Empty so far. Yours would be the first.</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </Pressable>
          {tips.length > 1 ? <Text style={styles.count}>{tips.length} tips to vote on</Text> : null}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  page: { flex: 1, alignSelf: 'stretch', backgroundColor: colors.bg, overflow: 'hidden' },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  column: { alignSelf: 'center', width: '100%', maxWidth: 460, gap: spacing.lg },
  head: { gap: spacing.sm },
  title: { ...typography.display, color: colors.text },
  lead: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  thanks: { ...typography.smallStrong, color: colors.success, paddingHorizontal: spacing.sm },
  // A quiet row onto the board, carrying its top tip.
  board: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  boardPressed: { backgroundColor: colors.surface },
  score: { width: 34, alignItems: 'center' },
  scoreText: { fontSize: 15, ...font('600'), color: colors.brand, fontVariant: ['tabular-nums'] },
  boardWords: { flex: 1, minWidth: 0, gap: 2 },
  boardLabel: { ...typography.caption, color: colors.textFaint, ...font('600') },
  boardTip: { ...typography.small, color: colors.text, lineHeight: 19 },
  count: { ...typography.caption, color: colors.textFaint, textAlign: 'center', marginTop: -spacing.xs },
});

import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { DragSheet } from '@/components/DragSheet';
import { inviteLink } from '@/features/invite/referral';
import * as haptics from '@/lib/haptics';
import { shareOutside } from '@/lib/shareOutside';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * "Who do you hit with?" — the person's own invite link, offered after
 * their first post and from their profile. A friend who joins through it
 * follows them and is followed back, and lands on the same map.
 */
export default function Invite() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, actions } = useApp();
  const [closeSignal, setCloseSignal] = useState(0);
  const [copied, setCopied] = useState(false);
  const [joined, setJoined] = useState<number | null>(null);
  useEffect(() => { void actions.countReferrals().then(setJoined).catch(() => setJoined(null)); }, [actions]);
  const link = currentUser ? inviteLink(currentUser.handle) : '';
  const share = async () => {
    try { await shareOutside('Hit with me on CourtSide', link); haptics.commit(); } catch { /* the sheet was closed */ }
  };
  const copy = async () => { await Clipboard.setStringAsync(link); haptics.tap(); setCopied(true); setTimeout(() => setCopied(false), 1600); };
  return (
    <DragSheet closeSignal={closeSignal} onDismissed={() => router.back()} peekFraction={0.56} header={
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Who do you hit with?</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={() => setCloseSignal((n) => n + 1)}>
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </Pressable>
      </View>
    }>
      <View style={styles.body}>
        <Text style={styles.lead}>Send them your link. When they join, you follow each other and they show up on your map.</Text>
        <View style={styles.linkBox}>
          <Ionicons name="link-outline" size={16} color={colors.textMuted} />
          <Text style={styles.link} numberOfLines={1}>{link.replace('https://', '')}</Text>
        </View>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Share your invite link" onPress={share} style={styles.primary}>
            <Ionicons name="paper-plane-outline" size={16} color={colors.brandInk} />
            <Text style={styles.primaryText}>Share link</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Copy your invite link" onPress={copy} style={styles.secondary}>
            <Text style={styles.secondaryText}>{copied ? 'Copied' : 'Copy'}</Text>
          </Pressable>
        </View>
        <Text style={styles.count}>{joined === null ? ' ' : joined === 0 ? 'No one has joined through you yet.' : `${joined} ${joined === 1 ? 'player has' : 'players have'} joined through you.`}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Later" onPress={() => setCloseSignal((n) => n + 1)} style={styles.later}>
          <Text style={styles.laterText}>Later</Text>
        </Pressable>
      </View>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  heading: { ...typography.title, color: colors.text },
  body: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xxl },
  lead: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  linkBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  link: { ...typography.small, color: colors.text, flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  primary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: radius.pill, backgroundColor: colors.brand },
  primaryText: { ...typography.bodyStrong, color: colors.brandInk },
  secondary: { height: 46, paddingHorizontal: 20, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...typography.bodyStrong, color: colors.text },
  count: { ...typography.small, color: colors.textFaint, textAlign: 'center' },
  later: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 12 },
  laterText: { ...typography.smallStrong, color: colors.textMuted },
});

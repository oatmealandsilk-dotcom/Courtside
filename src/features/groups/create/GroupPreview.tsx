import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { GroupLook } from '@/data/types';
import { GroupTile } from '@/features/groups/GroupTile';
import { lookWords } from '@/features/groups/look';
import { colors, font, lift, radius, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/*
 * Start a group's live preview: the group exactly where people will meet it,
 * redrawn with every letter, colour and choice. Above, the Feed's top row
 * ("For you · Sunday hitters +", the new name in bold as when it is open);
 * below, its row in Find groups (face, name, "1 member · Ask to join", its
 * line, and the Join or Request button the row would have). A group hidden
 * from Find groups says the row is what its invite link shows instead.
 */

export function GroupPreview({ name, look, ask, listed, about, members = 1 }: {
  name: string; look: GroupLook; ask: boolean; listed: boolean; about?: string; members?: number;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const shown = name.trim() || 'Your group';
  const empty = !name.trim();
  const meta = `${members} ${members === 1 ? 'member' : 'members'} · ${ask ? 'Ask to join' : 'Open'}`;
  return (
    <View
      style={styles.card}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`Preview. ${shown}, ${meta}, with ${lookWords(look)}.${about?.trim() ? ` ${about.trim()}` : ''}`}
    >
      <View style={styles.part}>
        <Text style={styles.caption}>ON YOUR FEED</Text>
        <View style={styles.strip}>
          <Text style={styles.word} numberOfLines={1}>For you</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={[styles.word, styles.wordOn, empty && styles.faint]} numberOfLines={1}>{shown}</Text>
          <Ionicons name="add" size={18} color={colors.textMuted} />
        </View>
      </View>
      <View style={styles.rule} />
      <View style={styles.part}>
        <Text style={styles.caption}>{listed ? 'IN FIND GROUPS' : 'ON ITS INVITE LINK'}</Text>
        <View style={styles.row}>
          <GroupTile name={shown} look={look} size={48} />
          <View style={styles.words}>
            <Text style={[styles.name, empty && styles.faint]} numberOfLines={1}>{shown}</Text>
            <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
            {about?.trim() ? <Text style={styles.about} numberOfLines={2}>{about.trim()}</Text> : null}
          </View>
          <View style={[styles.btn, ask ? styles.btnAsk : styles.btnJoin]}>
            <Text style={[styles.btnText, ask ? styles.btnTextAsk : styles.btnTextJoin]}>{ask ? 'Request' : 'Join'}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  card: { ...lift, borderRadius: 22, backgroundColor: colors.surface, overflow: 'hidden' },
  part: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 8 },
  caption: { ...typography.caption, fontSize: 10, letterSpacing: 0.8, color: colors.textFaint },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  word: { fontSize: 15, lineHeight: 20, ...font('500'), letterSpacing: -0.2, color: colors.text, opacity: 0.62, flexShrink: 0 },
  wordOn: { ...font('700'), opacity: 1, flexShrink: 1 },
  dot: { fontSize: 15, color: colors.text, opacity: 0.45 },
  faint: { color: colors.textFaint },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  words: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...typography.body, ...font('600'), color: colors.text },
  meta: { ...typography.small, color: colors.textMuted },
  about: { ...typography.small, color: colors.textFaint, lineHeight: 18 },
  btn: { height: 30, minWidth: 74, paddingHorizontal: 12, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  btnJoin: { backgroundColor: colors.brand },
  btnAsk: { backgroundColor: colors.brandDim },
  btnText: { ...typography.smallStrong },
  btnTextJoin: { color: colors.brandInk },
  btnTextAsk: { color: colors.brand },
});

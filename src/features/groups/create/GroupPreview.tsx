import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { GroupLook } from '@/data/types';
import { GroupTile } from '@/features/groups/GroupTile';
import { lookWords } from '@/features/groups/look';
import { colors, font, lift, radius, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/*
 * Start a group's live preview: the group's row exactly as people will meet
 * it in Find groups (or, hidden from there, on its invite link): its face,
 * its name, "1 member · Ask to join", its line, and the Join or Request
 * button the row would have. One row, held at the top of the sheet above
 * what scrolls, so it stays in view while you type, the keyboard up
 * included, and every letter, colour and choice shows in it as you make it.
 */

export function GroupPreview({ name, look, ask, listed, about, members = 1 }: {
  name: string; look: GroupLook; ask: boolean; listed: boolean; about?: string; members?: number;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const shown = name.trim() || 'Your group';
  const empty = !name.trim();
  const meta = `${members} ${members === 1 ? 'member' : 'members'} · ${ask ? 'Ask to join' : 'Open'}`;
  const line = about?.replace(/\s+/g, ' ').trim();
  return (
    <View
      style={styles.card}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`Preview, ${listed ? 'in Find groups' : 'on its invite link'}. ${shown}, ${meta}, with ${lookWords(look)}.${line ? ` ${line}` : ''}`}
    >
      <Text style={styles.caption}>{listed ? 'HOW IT SHOWS IN FIND GROUPS' : 'HOW ITS INVITE LINK SHOWS IT'}</Text>
      <View style={styles.row}>
        <GroupTile name={shown} look={look} size={44} />
        <View style={styles.words}>
          <Text style={[styles.name, empty && styles.faint]} numberOfLines={1}>{shown}</Text>
          <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
          {line ? <Text style={styles.about} numberOfLines={1}>{line}</Text> : null}
        </View>
        <View style={[styles.btn, ask ? styles.btnAsk : styles.btnJoin]}>
          <Text style={[styles.btnText, ask ? styles.btnTextAsk : styles.btnTextJoin]}>{ask ? 'Request' : 'Join'}</Text>
        </View>
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  card: { ...lift, borderRadius: 20, backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingTop: 10, paddingBottom: spacing.md, gap: 8 },
  caption: { ...typography.caption, fontSize: 10, letterSpacing: 0.8, color: colors.textFaint },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  words: { flex: 1, minWidth: 0, gap: 1 },
  name: { ...typography.body, ...font('600'), color: colors.text },
  faint: { color: colors.textFaint },
  meta: { ...typography.small, color: colors.textMuted },
  about: { ...typography.small, color: colors.textFaint },
  btn: { height: 30, minWidth: 70, paddingHorizontal: 12, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  btnJoin: { backgroundColor: colors.brand },
  btnAsk: { backgroundColor: colors.brandDim },
  btnText: { ...typography.smallStrong },
  btnTextJoin: { color: colors.brandInk },
  btnTextAsk: { color: colors.brand },
});

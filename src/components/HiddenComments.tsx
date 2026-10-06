import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar } from '@/components/ui/Avatar';
import { RichText } from '@/components/RichText';
import type { ID } from '@/data/types';
import * as haptics from '@/lib/haptics';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';
import { openPlayer } from '@/features/navigation/openPlayer';

/**
 * "Hidden comments (2)" at the end of the comments on something of yours,
 * the way Instagram does it (migration 117): folded away until tapped, then
 * each one with Unhide. Only the owner ever gets this; the person who wrote
 * each one sees theirs as normal, and nobody else sees them at all.
 */
export function HiddenComments({ count, noun = 'comments', children }: {
  count: number;
  /** What they are: comments under a post or Instant, replies in a thread or under a question. */
  noun?: 'comments' | 'replies';
  children: React.ReactNode;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const [open, setOpen] = useState(false);
  if (!count) return null;
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Hidden ${noun}, ${count}`}
        onPress={() => { haptics.tap(); setOpen((o) => !o); }}
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
      >
        <Ionicons name="eye-off-outline" size={15} color={colors.textMuted} />
        <Text style={styles.toggleText}>Hidden {noun} ({count})</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textFaint} />
      </Pressable>
      {open ? (
        <View style={styles.list}>
          <Text style={styles.note}>
            {count === 1
              ? 'Hidden by your Hidden words. Only you and its writer see it. Unhide it to show everyone.'
              : 'Hidden by your Hidden words. Only you and each writer see them. Unhide one to show everyone.'}
          </Text>
          {children}
        </View>
      ) : null}
    </View>
  );
}

/**
 * A hidden thread reply or coach reply: who, when, the words, and Unhide.
 * (A hidden comment uses the ordinary comment row, with Unhide under it.)
 */
export function HiddenReplyRow({ authorId, body, createdAt, onUnhide }: { authorId: ID; body: string; createdAt: string; onUnhide: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const { users, currentUserId } = useApp();
  const who = users.find((u) => u.id === authorId);
  const open = () => { if (who) openPlayer(who.id, currentUserId); };
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="link" accessibilityLabel={who ? `Open ${who.name}'s profile` : undefined} onPress={open}>
        <Avatar name={who?.name ?? '?'} seed={who?.avatarSeed ?? authorId} uri={who?.avatarUrl} size={32} />
      </Pressable>
      <View style={styles.body}>
        <Text style={styles.meta}>
          <Text style={styles.name} onPress={open}>{who?.name ?? 'Unknown'}</Text>
          {'  '}{relativeTime(createdAt)}
        </Text>
        {body.trim() ? <RichText style={styles.text}>{body}</RichText> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={`Unhide ${who?.name ?? 'this'}'s reply`} hitSlop={{ top: 10, bottom: 12, left: 8, right: 16 }} onPress={onUnhide} style={styles.unhide}>
          <Text style={styles.unhideText}>Unhide</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.md },
  // A quiet line at the end of the list, the way "View 2 replies" sits under a comment.
  // 44pt tall, the line itself still quiet.
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'flex-start', minHeight: 44 },
  pressed: { opacity: 0.6 },
  toggleText: { ...typography.smallStrong, color: colors.textMuted },
  list: { gap: spacing.lg },
  note: { ...typography.small, color: colors.textFaint, lineHeight: 19 },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  body: { flex: 1, gap: 3 },
  meta: { ...typography.caption, color: colors.textFaint, letterSpacing: 0 },
  name: { ...typography.smallStrong, color: colors.text },
  text: { ...typography.small, color: colors.text, lineHeight: 20 },
  unhide: { alignSelf: 'flex-start', paddingTop: 6 },
  // A shade stronger than the time beside the name, so it reads as the action here.
  unhideText: { ...typography.smallStrong, color: colors.textMuted },
});

import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SheetBackdrop } from '@/components/SheetBackdrop';
import { useApp } from '@/store/AppContext';
import { shareOutside } from '@/lib/shareOutside';
import { goBack } from '@/lib/goBack';
import { colors, radius, spacing, typography } from '@/theme';

type Row = {
  key: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  note?: string;
  danger?: boolean;
  /** Needs a second tap to go through; the row says so after the first. */
  confirm?: string;
  onPress: () => void | Promise<void>;
};

/**
 * The "…" menu under a post's Save button: a short sheet that slides up from
 * the bottom. Your own post can be pinned, archived or deleted; anyone else's
 * can be reported, and its author muted or blocked. Everything else — save,
 * send, share the link — is there for both.
 */
export default function PostMenu() {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { id = '', kind: rawKind } = useLocalSearchParams<{ id?: string; kind?: string }>();
  const { posts, stories, users, saved, currentUserId, mutedIds, blockedIds, actions } = useApp();
  const isHit = rawKind === 'hit';
  const story = isHit ? stories.find((st) => st.id === id) : undefined;
  const post = isHit ? undefined : posts.find((p) => p.id === id);
  const item = post ?? story;
  const author = users.find((u) => u.id === item?.authorId);
  const mine = !!item && item.authorId === currentUserId;
  const isSaved = saved.postIds.includes(id);
  const [armed, setArmed] = useState('');
  const [done, setDone] = useState('');

  // The same rise and fall as the comments and Send-to sheets.
  const EASE = Easing.bezier(0.22, 0.61, 0.36, 1);
  const rise = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(rise, { toValue: 0, duration: 320, easing: EASE, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rise]);
  const close = () => {
    Animated.timing(rise, { toValue: 1, duration: 220, easing: EASE, useNativeDriver: true }).start(() => goBack('/'));
  };

  if (!item) return <View style={styles.backdrop}><SheetBackdrop /><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => goBack('/')} style={StyleSheet.absoluteFill} /></View>;

  const url = `https://app.courtsidebase.com/post/${item.id}`;
  // A hit is a moment, not a keepsake: nothing to save or send on.
  const rows: Row[] = post ? [
    { key: 'save', icon: isSaved ? 'bookmark' : 'bookmark-outline', label: isSaved ? 'Remove from saved' : 'Save', onPress: () => { actions.toggleSavePost(post.id); close(); } },
    { key: 'send', icon: 'paper-plane-outline', label: 'Send to…', onPress: () => router.replace({ pathname: '/share', params: { kind: 'post', id: post.id } }) },
    { key: 'link', icon: 'link-outline', label: 'Share link', onPress: async () => { try { const note = await shareOutside(post.body || 'A CourtSide post', url); if (note) setDone(note); else close(); } catch { setDone(`Share this link: ${url}`); } } },
  ] : [];
  if (mine && story) {
    rows.push(
      { key: 'archive', icon: 'archive-outline', label: story.archived ? 'Unarchive' : 'Archive', onPress: () => { actions.toggleArchiveStory(story.id); close(); } },
    );
  } else if (mine && post) {
    rows.push(
      { key: 'edit', icon: 'create-outline', label: 'Edit', onPress: () => router.replace({ pathname: '/edit-post', params: { id: post.id, kind: 'post' } }) },
      { key: 'pin', icon: 'pin-outline', label: post.pinned ? 'Unpin from profile' : 'Pin to profile', note: post.pinned ? undefined : 'Shown first on your profile.', onPress: () => { actions.togglePinPost(post.id); close(); } },
      { key: 'archive', icon: 'archive-outline', label: post.archived ? 'Unarchive' : 'Archive', note: post.archived ? undefined : 'Hidden from everyone; kept in your archive.', onPress: () => { actions.toggleArchivePost(post.id); close(); } },
      { key: 'delete', icon: 'trash-outline', label: 'Delete', danger: true, confirm: 'Tap again to delete for good', onPress: () => { actions.deletePost(post.id); close(); } },
    );
  } else if (author) {
    const muted = mutedIds.includes(author.id);
    const blocked = blockedIds.includes(author.id);
    rows.push(
      { key: 'report', icon: 'flag-outline', label: 'Report', note: 'Spam, harassment or something that should not be here.', onPress: () => { actions.reportUser(author.id, `${isHit ? 'hit' : 'post'}:${item.id}`); setDone('Thanks — we will take a look.'); } },
      { key: 'mute', icon: muted ? 'volume-high-outline' : 'volume-mute-outline', label: muted ? `Unmute @${author.handle}` : `Mute @${author.handle}`, note: muted ? undefined : 'Their posts stop showing up for you. They are not told.', onPress: () => { actions.toggleMute(author.id); close(); } },
      { key: 'block', icon: 'ban-outline', label: blocked ? `Unblock @${author.handle}` : `Block @${author.handle}`, danger: !blocked, confirm: blocked ? undefined : 'Tap again to block', onPress: () => { actions.toggleBlock(author.id); close(); } },
    );
  }

  const press = (row: Row) => {
    if (row.confirm && armed !== row.key) { setArmed(row.key); return; }
    void row.onPress();
  };

  return (
    <View style={styles.backdrop}>
      <SheetBackdrop />
      <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={close} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [0, 420] }) }] }]}>
        <View style={styles.grabber} />
        {done ? (
          <View style={styles.doneBox}>
            <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
            <Text style={styles.doneText}>{done}</Text>
            <Pressable accessibilityRole="button" onPress={close} style={styles.doneButton}><Text style={styles.doneButtonText}>Done</Text></Pressable>
          </View>
        ) : rows.map((row) => {
          const waiting = armed === row.key;
          return (
            <Pressable key={row.key} accessibilityRole="button" accessibilityLabel={row.label} onPress={() => press(row)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed, waiting && styles.rowArmed]}>
              <Ionicons name={row.icon} size={22} color={row.danger ? colors.danger : colors.text} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, row.danger && { color: colors.danger }]}>{waiting ? row.confirm : row.label}</Text>
                {row.note && !waiting ? <Text style={styles.note}>{row.note}</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </Animated.View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: 4 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  rowPressed: { backgroundColor: colors.surface },
  rowArmed: { backgroundColor: colors.surface },
  label: { ...typography.body, fontWeight: '600', color: colors.text },
  note: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  doneBox: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  doneText: { ...typography.body, color: colors.text, textAlign: 'center' },
  doneButton: { marginTop: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.brand },
  doneButtonText: { ...typography.smallStrong, color: colors.brandInk },
});

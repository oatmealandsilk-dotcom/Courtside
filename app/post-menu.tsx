import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SheetBackdrop } from '@/components/SheetBackdrop';
import { useApp } from '@/store/AppContext';
import { shareOutside } from '@/lib/shareOutside';
import { downloadMedia } from '@/lib/downloadMedia';
import { goBack } from '@/lib/goBack';
import { colors, radius, spacing, typography } from '@/theme';
import { shareLink } from '@/lib/shareLink';
import { postShareText } from '@/features/share/shareText';
import { confirm, confirmBlock } from '@/lib/confirm';
import { notKnownAdult } from '@/features/players/age';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import type { Post, Story } from '@/data/types';

type Row = {
  key: string;
  /** An Ionicon, or 'court' for the court drawn the app's way. */
  icon: React.ComponentProps<typeof Ionicons>['name'] | 'court';
  label: string;
  note?: string;
  danger?: boolean;
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
  const { posts, stories, users, saved, currentUserId, currentUser, mutedIds, blockedIds, actions } = useApp();
  const isHit = rawKind === 'hit';
  // Reporting takes the post or Instant out of every list at once; the menu
  // holds on to it so its "Thanks" note still shows until you close it.
  const reported = useRef<{ post?: Post; story?: Story } | null>(null);
  const story = (isHit ? stories.find((st) => st.id === id) : undefined) ?? reported.current?.story;
  const post = (isHit ? undefined : posts.find((p) => p.id === id)) ?? reported.current?.post;
  const item = post ?? story;
  const author = users.find((u) => u.id === item?.authorId);
  const mine = !!item && item.authorId === currentUserId;
  const isSaved = saved.postIds.includes(id);
  const [done, setDone] = useState('');

  // The same rise and fall as the comments and Send-to sheets.
  const EASE = Easing.bezier(0.22, 0.61, 0.36, 1);
  const rise = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(rise, { toValue: 0, duration: 320, easing: EASE, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rise]);
  // How far the sheet travels: its own height, so it leaves the screen
  // entirely. A fixed 420 left most of a tall menu on screen until the very
  // end, when it vanished at once, which read as a lag after the tap.
  const [sheetH, setSheetH] = useState(Dimensions.get('window').height);
  const [leaving, setLeaving] = useState(false);
  const closing = useRef(false);
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    // Moves on the tap itself, fastest in its first frames (an easing that
    // starts slowly reads as a delay), with the dim fading alongside.
    setLeaving(true);
    Animated.timing(rise, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => goBack('/'));
  };

  if (!item) return <View style={styles.backdrop}><SheetBackdrop /><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => goBack('/')} style={StyleSheet.absoluteFill} /></View>;

  const url = shareLink('post', item.id, currentUser?.handle);
  // A hit is a moment, not a keepsake: nothing to save or send on.
  const rows: Row[] = post ? [
    { key: 'save', icon: isSaved ? 'bookmark' : 'bookmark-outline', label: isSaved ? 'Remove from saved' : 'Save', onPress: () => { actions.toggleSavePost(post.id); close(); } },
    { key: 'send', icon: 'paper-plane-outline', label: 'Send to…', onPress: () => router.replace({ pathname: '/share', params: { kind: 'post', id: post.id } }) },
    // Your own post with a session on it shares as the session's story picture (share-session), the way Strava does; any other post as its own card.
    mine && post.session
      ? { key: 'story', icon: 'logo-instagram', label: 'Share to Instagram', note: 'Your session as a story picture.', onPress: () => router.replace({ pathname: '/share-session', params: { post: post.id } }) }
      : { key: 'card', icon: 'image-outline', label: 'Share as image', onPress: () => router.replace({ pathname: '/share-card', params: { id: post.id } }) },
    { key: 'link', icon: 'link-outline', label: 'Share link', onPress: async () => { try { const note = await shareOutside(postShareText(post, users.find((u) => u.id === post.authorId), currentUserId), url); if (note) setDone(note); else close(); } catch { setDone(`Share this link: ${url}`); } } },
  ] : [];
  if (mine && story) {
    rows.push(
      { key: 'archive', icon: 'archive-outline', label: story.archived ? 'Unarchive' : 'Archive', onPress: () => { actions.toggleArchiveStory(story.id); close(); } },
    );
  }
  // The original file, for the owner and for CourtSide's own channels (an admin): one tap to the camera roll, then Instagram.
  if (post && (post.videoUrl || post.imageUrl) && (mine || (currentUser?.isAdmin && post.featureOk !== false))) {
    // Android's share sheet has no "Save to gallery" (a real save needs a new build: docs/android-setup.md), so there it says what it does.
    rows.push({ key: 'download', icon: 'download-outline', label: Platform.OS === 'android' ? 'Share original' : 'Download', note: currentUser?.isAdmin && !mine ? 'The author said CourtSide may feature this.' : Platform.OS === 'android' ? 'The original file, to send to another app.' : 'The original, to post elsewhere.', onPress: async () => { try { await downloadMedia(post.videoUrl ?? post.imageUrl!, post.id.slice(0, 8)); close(); } catch (err) { setDone(err instanceof Error ? err.message : 'Could not download.'); } } });
  }
  if (mine && post) {
    rows.push(
      { key: 'edit', icon: 'create-outline', label: 'Edit', onPress: () => router.replace({ pathname: '/edit-post', params: { id: post.id, kind: 'post' } }) },
      // A place only typed, with no court: one tap to pick the court, so the post shows on its page.
      // Known adults only: a court tag says where a minor regularly plays.
      ...(post.location && !post.court && currentUser && !notKnownAdult(currentUser)
        ? [{ key: 'court', icon: 'court' as const, label: 'Add the court', note: 'Shows this post on the court’s page.', onPress: () => router.replace({ pathname: '/edit-post', params: { id: post.id, kind: 'post', pickPlace: '1' } }) }]
        : []),
      { key: 'pin', icon: 'pin-outline', label: post.pinned ? 'Unpin from profile' : 'Pin to profile', note: post.pinned ? undefined : 'Shown first on your profile.', onPress: () => { actions.togglePinPost(post.id); close(); } },
      { key: 'archive', icon: 'archive-outline', label: post.archived ? 'Unarchive' : 'Archive', note: post.archived ? undefined : 'Hidden from everyone; kept in your archive.', onPress: () => { actions.toggleArchivePost(post.id); close(); } },
      // Asked once, the way other apps ask; the menu stays up behind the question, so Cancel leaves you on it.
      { key: 'delete', icon: 'trash-outline', label: 'Delete', danger: true, onPress: () => confirm({ title: 'Delete post?', message: "This can't be undone.", confirmLabel: 'Delete', destructive: true, onConfirm: () => { actions.deletePost(post.id); close(); } }) },
    );
  } else if (author && !mine) {
    const muted = mutedIds.includes(author.id);
    const blocked = blockedIds.includes(author.id);
    rows.push(
      { key: 'report', icon: 'flag-outline', label: 'Report', note: 'Spam, harassment or something that should not be here.', onPress: () => { reported.current = { post, story }; actions.reportUser(author.id, `${isHit ? 'hit' : 'post'}:${item.id}`); setDone('Thanks — we will take a look.'); } },
      { key: 'mute', icon: muted ? 'volume-high-outline' : 'volume-mute-outline', label: muted ? `Unmute @${author.handle}` : `Mute @${author.handle}`, note: muted ? undefined : 'Their posts stop showing up for you. They are not told.', onPress: () => { actions.toggleMute(author.id); close(); } },
      // Unblocking is one tap; blocking asks first and says what it does.
      { key: 'block', icon: 'ban-outline', label: blocked ? `Unblock @${author.handle}` : `Block @${author.handle}`, danger: !blocked, onPress: () => {
        if (blocked) { actions.toggleBlock(author.id); close(); return; }
        confirmBlock(author, () => { actions.toggleBlock(author.id); close(); });
      } },
    );
  }

  return (
    <View style={styles.backdrop}>
      <SheetBackdrop leaving={leaving} />
      <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPressIn={close} style={StyleSheet.absoluteFill} />
      <Animated.View onLayout={(e) => { const h = Math.ceil(e.nativeEvent.layout.height); if (h > 0) setSheetH(h + 24); }} style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [0, sheetH] }) }] }]}>
        <View style={styles.grabber} />
        {done ? (
          <View style={styles.doneBox}>
            <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
            <Text style={styles.doneText}>{done}</Text>
            <Pressable accessibilityRole="button" onPress={close} style={styles.doneButton}><Text style={styles.doneButtonText}>Done</Text></Pressable>
          </View>
        ) : rows.map((row) => (
          <Pressable key={row.key} accessibilityRole="button" accessibilityLabel={row.label} onPress={() => { void row.onPress(); }} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
            {row.icon === 'court'
              ? <View style={styles.glyph}><CourtGlyph size={17} color={row.danger ? colors.danger : colors.text} /></View>
              : <Ionicons name={row.icon} size={22} color={row.danger ? colors.danger : colors.text} />}
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, row.danger && { color: colors.danger }]}>{row.label}</Text>
              {row.note ? <Text style={styles.note}>{row.note}</Text> : null}
            </View>
          </Pressable>
        ))}
      </Animated.View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: 4 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  // The court glyph is narrower than an icon: as wide as one, so the labels line up.
  glyph: { width: 22, alignItems: 'center' },
  rowPressed: { backgroundColor: colors.surface },
  label: { ...typography.body, fontWeight: '600', color: colors.text },
  note: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  doneBox: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  doneText: { ...typography.body, color: colors.text, textAlign: 'center' },
  doneButton: { marginTop: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.brand },
  doneButtonText: { ...typography.smallStrong, color: colors.brandInk },
});

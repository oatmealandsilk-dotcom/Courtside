import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
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
import { confirm, confirmBlock, confirmReport } from '@/lib/confirm';
import { REPORT_THANKS } from '@/features/moderation/reportThanks';
import { notKnownAdult } from '@/features/players/age';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { removedLine } from '@/features/moderation/reasons';
import { canShareMediaStory, shareMediaToStory, type StoryMediaKind } from '@/features/share/mediaStory';
import { stageSize } from '@/features/share/storyImage';
import { StoryOverlayCanvas } from '@/components/share/StoryOverlay';
import { CourtSpinner } from '@/components/CourtSpinner';
import { useOpenOutside } from '@/features/share/openOutside';
import type { Post, Story } from '@/data/types';

type Row = {
  key: string;
  /** An Ionicon, or 'court' for the court drawn the app's way. */
  icon: React.ComponentProps<typeof Ionicons>['name'] | 'court';
  label: string;
  note?: string;
  danger?: boolean;
  /** Shown dimmed and not tappable yet (still asking the server whether it may). */
  waiting?: boolean;
  onPress: () => void | Promise<void>;
};

/**
 * The "…" menu under a post's Save button: a short sheet that slides up from
 * the bottom. Your own post can be pinned, archived or deleted; anyone else's
 * can be reported, and its author muted or blocked. Everything else — save,
 * send, share the link — is there for both. Admins also get "Take down"
 * (or "Restore" once it is down); nobody else ever sees either.
 *
 * A post shared to a group only never leaves the group: no picture of it, no
 * link (the server locks both, share_preview in migration 68). Someone
 * else's post is a picture only when the server would show it to a stranger
 * (useOpenOutside).
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
  // Reported from here: the note thanks you and offers to block them too (Instagram's way).
  const [reportedNow, setReportedNow] = useState(false);
  const navigation = useNavigation();
  // Share to Instagram Story: on its way (the file coming down), and the overlay photographed for it:
  // on a see-through story-sized canvas for a clip's sticker, or drawn onto a photo (`baking`, its address).
  const [working, setWorking] = useState(false);
  const sticker = useRef<View>(null);
  const baked = useRef<View>(null);
  const [baking, setBaking] = useState<string | null>(null);
  const photoDrawn = useRef<((ok: boolean) => void) | null>(null);
  const stage = stageSize();
  // Gone: the menu has left the screen (the back button or a swipe, not only close()), so a share
  // still on its way stops before it opens Instagram. Set false again on mount for React's dev double-mount.
  const gone = useRef(false);
  useEffect(() => {
    gone.current = false;
    return () => { gone.current = true; };
  }, []);
  const openOutside = useOpenOutside(post, currentUserId);
  // A long menu (an admin's own post, bigger text on a small phone) scrolls
  // rather than running off the top of the screen.
  const { height: windowHeight } = useWindowDimensions();

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
    // Reported from the author's own feed of posts (a post's page): that feed would
    // only move on to their next post, so it closes too, back to where you came from.
    const routes = navigation.getState()?.routes ?? [];
    const under = routes[routes.length - 2];
    const leaveTheirFeed = reportedNow && !!author && under?.name === 'posts/[userId]' && (under.params as { userId?: string } | undefined)?.userId === author.id && router.canDismiss();
    Animated.timing(rise, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => (leaveTheirFeed ? router.dismiss(2) : goBack('/')));
  };

  if (!item) return <View style={styles.backdrop}><SheetBackdrop /><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => goBack('/')} style={StyleSheet.absoluteFill} /></View>;

  const url = shareLink('post', item.id, currentUser?.handle);
  // Taken down by an admin (migration 108): only its author and admins see
  // it, so there is nothing to save, send, share or edit; deleting and
  // archiving still work.
  const removed = item.removed;
  const admin = !!currentUser?.isAdmin;
  // Your own clip or photo, straight into Instagram's story editor with a CourtSide sticker (Oct 5;
  // builds with react-native-share only, never in a browser: see mediaStory.ts). A session post with
  // a photo already goes there as the session's picture (its Photo design), so there it is the clip only.
  const storyMedia: { url: string; kind: StoryMediaKind } | null = post && mine && !removed && currentUser && canShareMediaStory()
    ? (post.videoUrl ? { url: post.videoUrl, kind: 'video' } : post.imageUrl && !post.session ? { url: post.imageUrl, kind: 'photo' } : null)
    : null;
  // Closing the menu (a tap above it, Done, the back button) while the file is still coming down
  // cancels the share: Instagram does not open on its own a moment later.
  const cancelled = () => closing.current || gone.current;
  // A photo with the overlay drawn onto it, out of sight: answers with the picture once the photo
  // has drawn (two frames later, so it is on screen), or null if it will not load within 8 seconds.
  const bake = (photo: string) => new Promise<View | null>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      photoDrawn.current = null;
      if (!ok) { resolve(null); return; }
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(baked.current)));
    };
    const timer = setTimeout(() => finish(false), 8000);
    photoDrawn.current = finish;
    setBaking(photo);
  });
  const toStory = async () => {
    if (!post || !storyMedia || working) return;
    setWorking(true);
    try {
      const said = await shareMediaToStory({
        url: storyMedia.url, kind: storyMedia.kind, id: post.id, sticker: sticker.current, cancelled,
        ...(storyMedia.kind === 'photo' ? { bake: () => bake(storyMedia.url) } : {}),
      });
      if (cancelled()) return;
      if (said) setDone(said);
      else close();
    } catch (err) {
      if (cancelled()) return;
      setDone(err instanceof Error && err.message ? err.message : 'Instagram could not be opened. Try again.');
    } finally {
      if (!gone.current) { setWorking(false); setBaking(null); }
    }
  };
  // What Instagram gets is the file as uploaded (mediaStory.ts): "posted without sound" and a trim
  // are applied by CourtSide's player, not cut into it, so the note says so rather than surprise anyone.
  const trimmed = !!post && (post.trimStart != null || post.trimEnd != null);
  const asIs = !!post && storyMedia?.kind === 'video' && (!!post.muted || trimmed);
  const storyNote = !storyMedia ? undefined
    : working ? (storyMedia.kind === 'video' ? 'Getting your clip ready…' : 'Getting your photo ready…')
    : asIs && post?.muted ? (trimmed ? 'The full original clip, with its sound. Trim and mute it in Instagram.' : 'The original clip, with its sound. Mute it in Instagram.')
    : asIs ? 'The full original clip, before your trim. Trim it in Instagram.'
    : storyMedia.kind === 'video' ? 'Your clip in your story, with your @handle.' : 'Your photo in your story, with your @handle.';
  const storyRow: Row | null = post && storyMedia ? {
    key: 'ig-story', icon: 'logo-instagram',
    label: post.session ? 'Share clip to Instagram Story' : 'Share to Instagram Story',
    note: storyNote,
    onPress: toStory,
  } : null;
  // A hit is a moment, not a keepsake: nothing to save or send on.
  const rows: Row[] = post && !removed ? [
    { key: 'save', icon: isSaved ? 'bookmark' : 'bookmark-outline', label: isSaved ? 'Remove from saved' : 'Save', onPress: () => { actions.toggleSavePost(post.id); close(); } },
    // A group-only post goes only to people in that group (the Send sheet lists no one else).
    { key: 'send', icon: 'paper-plane-outline', label: 'Send to…', onPress: () => router.replace({ pathname: '/share', params: { kind: 'post', id: post.id } }) },
    // Your own clip or photo straight into a story leads; on a session post it follows the session's picture.
    ...(storyRow && !post.session ? [storyRow] : []),
    // Your own post with a session on it shares as the session's story picture (share-session), the way Strava does; any other post as its own card.
    ...(mine && post.session
      ? [{ key: 'story', icon: 'logo-instagram' as const, label: 'Share to Instagram', note: 'Your session as a story picture.', onPress: () => router.replace({ pathname: '/share-session', params: { post: post.id } }) }]
      // Still asking (null): the row holds its place dimmed, so the rows below don't jump when the answer comes.
      : openOutside !== false ? [{ key: 'card', icon: 'image-outline' as const, label: 'Share as image', waiting: openOutside === null, onPress: () => router.replace({ pathname: '/share-card', params: { id: post.id } }) }] : []),
    ...(storyRow && post.session ? [storyRow] : []),
    // A group-only post stays in its group: no link to it goes outside.
    ...(post.groupId ? [] : [{ key: 'link', icon: 'link-outline' as const, label: 'Share link', onPress: async () => { try { const note = await shareOutside(postShareText(post, users.find((u) => u.id === post.authorId), currentUserId), url); if (note) setDone(note); else close(); } catch { setDone(`Share this link: ${url}`); } } }]),
  ] : [];
  if (mine && story) {
    rows.push(
      { key: 'archive', icon: 'archive-outline', label: story.archived ? 'Unarchive' : 'Archive', onPress: () => { actions.toggleArchiveStory(story.id); close(); } },
      { key: 'delete', icon: 'trash-outline', label: 'Delete', danger: true, onPress: () => confirm({ title: 'Delete this Instant?', message: "Its likes and comments go with it. This can't be undone.", confirmLabel: 'Delete', destructive: true, onConfirm: () => { void actions.deleteStory(story.id); close(); } }) },
    );
  }
  // The original file, for the owner and for CourtSide's own channels (an admin): one tap to the camera roll, then Instagram.
  if (post && (post.videoUrl || post.imageUrl) && (mine || (currentUser?.isAdmin && post.featureOk !== false && !removed))) {
    // Android's share sheet has no "Save to gallery" (a real save needs a new build: docs/android-setup.md), so there it says what it does.
    rows.push({ key: 'download', icon: 'download-outline', label: Platform.OS === 'android' ? 'Share original' : 'Download', note: currentUser?.isAdmin && !mine ? 'The author said CourtSide may feature this.' : Platform.OS === 'android' ? 'The original file, to send to another app.' : 'The original, to post elsewhere.', onPress: async () => { try { await downloadMedia(post.videoUrl ?? post.imageUrl!, post.id.slice(0, 8)); close(); } catch (err) { setDone(err instanceof Error ? err.message : 'Could not download.'); } } });
  }
  if (mine && post) {
    rows.push(
      ...(removed ? [] : [
        { key: 'edit', icon: 'create-outline' as const, label: 'Edit', onPress: () => router.replace({ pathname: '/edit-post', params: { id: post.id, kind: 'post' } }) },
        // A place only typed, with no court: one tap to pick the court, so the post shows on its page.
        // Known adults only: a court tag says where a minor regularly plays.
        // Never on a group-only post: the server keeps those off every court's page.
        ...(post.location && !post.court && !post.groupId && currentUser && !notKnownAdult(currentUser)
          ? [{ key: 'court', icon: 'court' as const, label: 'Add the court', note: 'Shows this post on the court’s page.', onPress: () => router.replace({ pathname: '/edit-post', params: { id: post.id, kind: 'post', pickPlace: '1' } }) }]
          : []),
        { key: 'pin', icon: 'pin-outline' as const, label: post.pinned ? 'Unpin from profile' : 'Pin to profile', note: post.pinned ? undefined : 'Shown first on your profile.', onPress: () => { actions.togglePinPost(post.id); close(); } },
      ]),
      { key: 'archive', icon: 'archive-outline', label: post.archived ? 'Unarchive' : 'Archive', note: post.archived ? undefined : 'Hidden from everyone; kept in your archive.', onPress: () => { actions.toggleArchivePost(post.id); close(); } },
      // Asked once, the way other apps ask; the menu stays up behind the question, so Cancel leaves you on it.
      { key: 'delete', icon: 'trash-outline', label: 'Delete', danger: true, onPress: () => confirm({ title: 'Delete post?', message: "This can't be undone.", confirmLabel: 'Delete', destructive: true, onConfirm: () => { actions.deletePost(post.id); close(); } }) },
    );
  } else if (author && !mine) {
    const muted = mutedIds.includes(author.id);
    const blocked = blockedIds.includes(author.id);
    rows.push(
      // Asked first, the same question as everywhere else; the menu stays up behind it, so Cancel leaves you on it.
      { key: 'report', icon: 'flag-outline', label: 'Report', note: 'Spam, harassment or something that should not be here.', onPress: () => confirmReport(isHit ? 'Instant' : post?.kind === 'clip' ? 'clip' : 'post', () => {
        reported.current = { post, story };
        actions.reportUser(author.id, `${isHit ? 'hit' : 'post'}:${item.id}`);
        setReportedNow(true);
        setDone(REPORT_THANKS);
      }) },
      { key: 'mute', icon: muted ? 'volume-high-outline' : 'volume-mute-outline', label: muted ? `Unmute @${author.handle}` : `Mute @${author.handle}`, note: muted ? undefined : 'Their posts stop showing up for you. They are not told.', onPress: () => { actions.toggleMute(author.id); close(); } },
      // Unblocking is one tap; blocking asks first and says what it does.
      { key: 'block', icon: 'ban-outline', label: blocked ? `Unblock @${author.handle}` : `Block @${author.handle}`, danger: !blocked, onPress: () => {
        if (blocked) { actions.toggleBlock(author.id); close(); return; }
        confirmBlock(author, () => { actions.toggleBlock(author.id); close(); });
      } },
    );
  }
  // Admins only (the database refuses anyone else): take it down, with a
  // reason, on its own page; or, once down, put it back. Never on your own:
  // Delete and Archive are there for that.
  if (admin && !mine) {
    const what = isHit ? 'hit' as const : 'post' as const;
    rows.push(removed
      ? { key: 'restore', icon: 'eye-outline', label: 'Restore', note: 'Everyone who could see it before sees it again.', onPress: () => { void actions.restoreContent(what, item.id); close(); } }
      : { key: 'takedown', icon: 'eye-off-outline', label: 'Take down', note: 'Breaks CourtSide’s rules. Its author is told why.', danger: true, onPress: () => router.replace({ pathname: '/take-down', params: { kind: what, id: item.id } }) });
  }

  return (
    <View style={styles.backdrop}>
      <SheetBackdrop leaving={leaving} />
      <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPressIn={close} style={StyleSheet.absoluteFill} />
      <Animated.View onLayout={(e) => { const h = Math.ceil(e.nativeEvent.layout.height); if (h > 0) setSheetH(h + 24); }} style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [0, sheetH] }) }] }]}>
        {storyMedia && currentUser ? (
          <>
            {/* The overlay for Share to Instagram Story, drawn story-sized (1080 × 1920 on this screen) out of sight under the
                sheet's own colour and photographed when tapped (mediaStory.ts). Its bottom sits on the sheet's bottom, so the
                overlay itself (in the story's lower part) is on screen under the cover; the sheet clips the rest, so a photo
                being drawn on never shows above the sheet. */}
            <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.stickerClip}>
              <View style={[styles.stickerStage, stage]}>
                <View ref={sticker} collapsable={false} style={stage}>
                  <StoryOverlayCanvas width={stage.width} handle={currentUser.handle} />
                </View>
                {baking ? (
                  <View ref={baked} collapsable={false} style={[StyleSheet.absoluteFill, stage]}>
                    <StoryOverlayCanvas width={stage.width} handle={currentUser.handle} photo={baking} onPhotoLoad={(ok) => photoDrawn.current?.(ok)} />
                  </View>
                ) : null}
              </View>
            </View>
            <View pointerEvents="none" style={styles.stickerCover} />
          </>
        ) : null}
        <View style={styles.grabber} />
        {done ? (
          <View style={styles.doneBox}>
            <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
            <Text style={styles.doneText}>{done}</Text>
            <View style={styles.doneActions}>
              {/* Instagram's next step after a report: block them too (asked first, as blocking always is). */}
              {reportedNow && author && !blockedIds.includes(author.id) ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Block @${author.handle}`} onPress={() => confirmBlock(author, () => { actions.toggleBlock(author.id); close(); })} style={({ pressed }) => [styles.blockButton, pressed && { opacity: 0.7 }]}>
                  <Text style={styles.blockButtonText} numberOfLines={1}>Block @{author.handle}</Text>
                </Pressable>
              ) : null}
              <Pressable accessibilityRole="button" onPress={close} style={({ pressed }) => [styles.doneButton, pressed && { opacity: 0.85 }]}><Text style={styles.doneButtonText}>Done</Text></Pressable>
            </View>
          </View>
        ) : (
          <ScrollView style={{ maxHeight: Math.max(240, windowHeight - insets.top - insets.bottom - 64) }} contentContainerStyle={styles.list} bounces={false} showsVerticalScrollIndicator={false}>
            {removed ? (
              // Why it is down, in the words its author was given; who did it is never shown.
              <View style={styles.removedBox} accessibilityRole="text">
                <Ionicons name="eye-off-outline" size={20} color={colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.removedTitle}>{removedLine(removed)}</Text>
                  <Text style={styles.note}>{mine ? 'Only you and CourtSide’s admins can see it.' : 'Only its author and admins can see it.'}</Text>
                </View>
              </View>
            ) : null}
            {rows.map((row) => (
              <Pressable key={row.key} accessibilityRole="button" accessibilityLabel={row.label} disabled={working || row.waiting} onPress={() => { void row.onPress(); }} style={({ pressed }) => [styles.row, pressed && styles.rowPressed, ((working && row.key !== 'ig-story') || row.waiting) && styles.rowDimmed]}>
                {working && row.key === 'ig-story'
                  ? <View style={styles.glyph}><CourtSpinner size={20} ink={colors.text} /></View>
                  : row.icon === 'court'
                  ? <View style={styles.glyph}><CourtGlyph size={17} color={row.danger ? colors.danger : colors.text} /></View>
                  : <Ionicons name={row.icon} size={22} color={row.danger ? colors.danger : colors.text} />}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, row.danger && { color: colors.danger }]}>{row.label}</Text>
                  {row.note ? <Text style={styles.note}>{row.note}</Text> : null}
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: 4 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.sm },
  // The rows keep the sheet's own gap between them inside the scroll.
  list: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  // The court glyph is narrower than an icon: as wide as one, so the labels line up.
  glyph: { width: 22, alignItems: 'center' },
  rowPressed: { backgroundColor: colors.surface },
  rowDimmed: { opacity: 0.45 },
  // The Instagram overlay's hidden copy, clipped to the sheet, and the sheet-coloured cover over it (the rows draw on top).
  stickerClip: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  stickerStage: { position: 'absolute', left: 0, bottom: 0 },
  stickerCover: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  label: { ...typography.bodyStrong, color: colors.text },
  note: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  removedBox: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: spacing.md, marginBottom: 4, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  removedTitle: { ...typography.bodyStrong, color: colors.danger },
  doneBox: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg, paddingHorizontal: spacing.md },
  doneText: { ...typography.body, color: colors.text, textAlign: 'center' },
  doneActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.sm },
  doneButton: { minHeight: 44, minWidth: 96, paddingHorizontal: spacing.xl, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  doneButtonText: { ...typography.smallStrong, fontSize: 14, color: colors.brandInk },
  blockButton: { minHeight: 44, maxWidth: 220, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  blockButtonText: { ...typography.smallStrong, fontSize: 14, color: colors.danger },
});

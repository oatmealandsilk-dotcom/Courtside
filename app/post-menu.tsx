import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SheetBackdrop } from '@/components/SheetBackdrop';
import { useApp } from '@/store/AppContext';
import { shareOutside } from '@/lib/shareOutside';
import { downloadMedia } from '@/lib/downloadMedia';
import { goBack } from '@/lib/goBack';
import { colors, font, pageIsDark, radius, spacing, typography } from '@/theme';
import { shareLink } from '@/lib/shareLink';
import { postShareText } from '@/features/share/shareText';
import { REPORT_THANKS, blockQuestion, reportQuestion, useScopedConfirm } from '@/lib/confirm';
import { notKnownAdult } from '@/features/players/age';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { removedLine } from '@/features/moderation/reasons';
import { canShareMediaStory, shareMediaToStory, type StoryMediaKind } from '@/features/share/mediaStory';
import { stageSize } from '@/features/share/storyImage';
import { StoryOverlayCanvas } from '@/components/share/StoryOverlay';
import { CourtSpinner } from '@/components/CourtSpinner';
import { useOpenOutside } from '@/features/share/openOutside';
import type { Post, Story } from '@/data/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** One of the round buttons across the top: the ways to share. */
type Tile = {
  key: string;
  icon: IconName;
  /** One short word under the circle. */
  label: string;
  /** What a screen reader says: the whole action. */
  spoken: string;
  /** Still asking the server whether it may (a spinner in the circle, not tappable yet). */
  waiting?: boolean;
  /** Working on it (a spinner in the circle). */
  busy?: boolean;
  onPress: () => void | Promise<void>;
};

/** One line of the list under them. */
type Row = {
  key: string;
  /** An Ionicon, or 'court' for the court drawn the app's way. */
  icon: IconName | 'court';
  label: string;
  /** A few words under the label, only where the label alone would not say what happens. */
  note?: string;
  danger?: boolean;
  onPress: () => void | Promise<void>;
};

/** What the sheet says once something has happened: a tick when it went, a warning (and Try again) when it did not. */
type Done = { text: string; ok: boolean; retry?: () => void };

/** How far down a drag must carry the sheet (or how fast) before letting go closes it. */
const DRAG_CLOSE_PX = 90;
const DRAG_CLOSE_SPEED = 0.9;

/**
 * The "…" menu on a post or an Instant: a short sheet that slides up from the
 * bottom, shaped the way Instagram's is (Oct 5 polish). Across the top, a row
 * of round buttons for the ways to share a post (Send, Story, Link, Image,
 * Download); under them a short list, what can't be undone last, after a
 * hairline. Your own post can be edited, pinned, archived or deleted; anyone
 * else's can be reported, and its author muted or blocked. Admins also get
 * "Take down" (or "Restore" once it is down); nobody else ever sees either.
 * Save is not here: the bookmark sits right beside the ••• everywhere it opens.
 *
 * A post shared to a group only never leaves the group: no picture of it, no
 * link (the server locks both, share_preview in migration 68). Someone
 * else's post is a picture only when the server would show it to a stranger
 * (useOpenOutside, asked ahead as the post comes on screen, so the Image
 * button is settled before the sheet rises).
 */
export default function PostMenu() {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { id = '', kind: rawKind } = useLocalSearchParams<{ id?: string; kind?: string }>();
  const { posts, stories, users, currentUserId, currentUser, mutedIds, blockedIds, actions } = useApp();
  const isHit = rawKind === 'hit';
  const ask = useScopedConfirm();
  // Reporting takes the post or Instant out of every list at once; the menu
  // holds on to it so its "Thanks" note still shows until you close it.
  const reported = useRef<{ post?: Post; story?: Story } | null>(null);
  const story = (isHit ? stories.find((st) => st.id === id) : undefined) ?? reported.current?.story;
  const post = (isHit ? undefined : posts.find((p) => p.id === id)) ?? reported.current?.post;
  const item = post ?? story;
  const author = users.find((u) => u.id === item?.authorId);
  const mine = !!item && item.authorId === currentUserId;
  const [done, setDone] = useState<Done | null>(null);
  // Share to Instagram Story: on its way (the file coming down), and the overlay photographed for it:
  // on a see-through story-sized canvas for a clip's sticker, or drawn onto a photo (`baking`, its address).
  const [working, setWorking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const sticker = useRef<View>(null);
  const baked = useRef<View>(null);
  const [baking, setBaking] = useState<string | null>(null);
  const photoDrawn = useRef<((ok: boolean) => void) | null>(null);
  // Each tap on Story is its own run; Cancel (or a second run) leaves the one before behind.
  const storyRun = useRef(0);
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
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();

  // The same rise and fall as the comments and Send-to sheets.
  const EASE = Easing.bezier(0.22, 0.61, 0.36, 1);
  const rise = useRef(new Animated.Value(1)).current;
  // How far a finger has pulled the sheet down from where it sits.
  const drag = useRef(new Animated.Value(0)).current;
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
  const closeRef = useRef(close);
  closeRef.current = close;

  // The grabber does what it says: pull the sheet down and let go to close it, or it settles back.
  // From the grabber's strip anywhere; on a phone from anywhere on the sheet too, while its list is at the top.
  const listTop = useRef(true);
  const pullDown = (dy: number, dx: number) => dy > 8 && dy > Math.abs(dx) * 1.4;
  const release = (dy: number, vy: number) => {
    if (dy > DRAG_CLOSE_PX || vy > DRAG_CLOSE_SPEED) { closeRef.current(); return; }
    Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 18 }).start();
  };
  const handlers = {
    onPanResponderMove: (_: unknown, g: { dy: number }) => drag.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_: unknown, g: { dy: number; vy: number }) => release(g.dy, g.vy),
    onPanResponderTerminate: () => release(0, 0),
  };
  const grabberPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => pullDown(g.dy, g.dx),
    ...handlers,
  })).current;
  const sheetPan = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => Platform.OS !== 'web' && listTop.current && pullDown(g.dy, g.dx),
    ...handlers,
  })).current;

  const say = (text: string, ok: boolean, retry?: () => void) => { if (!gone.current) setDone({ text, ok, retry }); };

  const url = item ? shareLink('post', item.id, currentUser?.handle) : '';
  // Taken down by an admin (migration 108): only its author and admins see
  // it, so there is nothing to save, send, share or edit; deleting and
  // archiving still work.
  const removed = item?.removed;
  const admin = !!currentUser?.isAdmin;
  // Your own clip or photo, straight into Instagram's story editor with a CourtSide sticker (Oct 5;
  // builds with react-native-share only, never in a browser: see mediaStory.ts). A session post with
  // a photo already goes there as the session's picture (its Photo design), so there it is the clip only.
  const storyMedia: { url: string; kind: StoryMediaKind } | null = post && mine && !removed && currentUser && canShareMediaStory()
    ? (post.videoUrl ? { url: post.videoUrl, kind: 'video' } : post.imageUrl && !post.session ? { url: post.imageUrl, kind: 'photo' } : null)
    : null;
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
    const run = ++storyRun.current;
    // Closing the menu (a tap above it, the back button) or Cancel while the file is still coming
    // down cancels the share: Instagram does not open on its own a moment later.
    const cancelled = () => closing.current || gone.current || storyRun.current !== run;
    setDone(null);
    setWorking(true);
    try {
      const said = await shareMediaToStory({
        url: storyMedia.url, kind: storyMedia.kind, id: post.id, sticker: sticker.current, cancelled,
        ...(storyMedia.kind === 'photo' ? { bake: () => bake(storyMedia.url) } : {}),
      });
      if (cancelled()) return;
      if (said) say(said, false, () => { void toStory(); });
      else close();
    } catch (err) {
      if (cancelled()) return;
      say(err instanceof Error && err.message ? err.message : 'Instagram could not be opened. Try again.', false, () => { void toStory(); });
    } finally {
      if (!gone.current && storyRun.current === run) { setWorking(false); setBaking(null); }
    }
  };
  const cancelStory = () => {
    storyRun.current += 1;
    setWorking(false);
    setBaking(null);
  };
  // What Instagram gets is the file as uploaded (mediaStory.ts): "posted without sound" and a trim
  // are applied by CourtSide's player, not cut into it, so the wait says so rather than surprise anyone.
  const trimmed = !!post && (post.trimStart != null || post.trimEnd != null);
  const asIs = !!post && storyMedia?.kind === 'video' && (!!post.muted || trimmed);
  const asIsNote = !asIs ? undefined
    : post?.muted ? (trimmed ? 'Instagram gets the whole clip, with its sound. Trim and mute it there.' : 'Instagram gets the clip with its sound. Mute it there.')
    : 'Instagram gets the whole clip, before your trim. Trim it there.';

  const download = async () => {
    if (!post || downloading) return;
    setDone(null);
    setDownloading(true);
    try {
      await downloadMedia(post.videoUrl ?? post.imageUrl!, post.id.slice(0, 8));
      if (!gone.current) close();
    } catch (err) {
      say(err instanceof Error && err.message ? err.message : 'It could not be downloaded. Check your connection and try again.', false, () => { void download(); });
    } finally {
      if (!gone.current) setDownloading(false);
    }
  };
  const shareTheLink = async () => {
    if (!post) return;
    try {
      const note = await shareOutside(postShareText(post, users.find((u) => u.id === post.authorId), currentUserId), url);
      if (note) say(note, true);
      else close();
    } catch {
      say(`Share this link: ${url}`, true);
    }
  };

  // The ways to share, as round buttons. A hit is a moment, not a keepsake: an Instant has none.
  const tiles: Tile[] = [];
  if (post && !removed) {
    // A group-only post goes only to people in that group (the Send sheet lists no one else).
    tiles.push({ key: 'send', icon: 'paper-plane-outline', label: 'Send', spoken: 'Send to someone on CourtSide', onPress: () => router.replace({ pathname: '/share', params: { kind: 'post', id: post.id } }) });
    if (storyMedia) tiles.push({ key: 'story', icon: 'logo-instagram', label: 'Story', spoken: storyMedia.kind === 'video' ? 'Share your clip to your Instagram story' : 'Share your photo to your Instagram story', busy: working, onPress: toStory });
    // A group-only post stays in its group: no link to it goes outside.
    if (!post.groupId) tiles.push({ key: 'link', icon: 'link-outline', label: 'Link', spoken: 'Share a link to this post', onPress: shareTheLink });
    // Your own post with a session on it shares as the session's story picture (share-session), the way
    // Strava does; any other post as its own card. Settled before the sheet rises (openOutside.ts); still
    // asking, it waits at the end of the row, so nothing moves if the answer is no.
    if (mine && post.session) tiles.push({ key: 'image', icon: 'image-outline', label: 'Image', spoken: 'Share your session as a picture', onPress: () => router.replace({ pathname: '/share-session', params: { post: post.id } }) });
    else if (openOutside !== false) tiles.push({ key: 'image', icon: 'image-outline', label: 'Image', spoken: 'Share this post as a picture', waiting: openOutside === null, onPress: () => router.replace({ pathname: '/share-card', params: { id: post.id } }) });
    // The original file, for the owner and for CourtSide's own channels (an admin): one tap to the camera roll, then Instagram.
    // Android's share sheet has no "Save to gallery" (a real save needs a new build: docs/android-setup.md), so there it says what it does.
    if ((post.videoUrl || post.imageUrl) && (mine || (admin && post.featureOk !== false))) {
      tiles.push({ key: 'download', icon: 'download-outline', label: Platform.OS === 'android' ? 'Original' : 'Download', spoken: Platform.OS === 'android' ? 'Share the original file' : 'Download the original', busy: downloading, onPress: download });
    }
  }

  // The list: what you can do to it, then (after a hairline) what can't be taken back or reports it.
  const rows: Row[] = [];
  const dangerRows: Row[] = [];
  if (mine && story) {
    // Archive only while it is still up: an expired Instant is already in your archive for good.
    const stillUp = !story.removed && Date.parse(story.expiresAt) > Date.now();
    if (stillUp) rows.push({ key: 'archive', icon: 'archive-outline', label: story.archived ? 'Unarchive' : 'Archive', note: story.archived ? undefined : 'Only you can see it', onPress: () => { actions.toggleArchiveStory(story.id); close(); } });
    dangerRows.push({ key: 'delete', icon: 'trash-outline', label: 'Delete', danger: true, onPress: () => ask({ title: 'Delete Instant?', message: 'Its likes and comments go with it. This can’t be undone.', confirmLabel: 'Delete', destructive: true, onConfirm: () => { void actions.deleteStory(story.id); close(); } }) });
  }
  if (mine && post) {
    if (!removed) {
      rows.push({ key: 'edit', icon: 'create-outline', label: 'Edit', onPress: () => router.replace({ pathname: '/edit-post', params: { id: post.id, kind: 'post' } }) });
      // A place only typed, with no court: one tap to pick the court, so the post shows on its page.
      // Known adults only: a court tag says where a minor regularly plays.
      // Never on a group-only post: the server keeps those off every court's page.
      if (post.location && !post.court && !post.groupId && currentUser && !notKnownAdult(currentUser)) {
        rows.push({ key: 'court', icon: 'court', label: 'Add the court', note: 'Shows it on the court’s page', onPress: () => router.replace({ pathname: '/edit-post', params: { id: post.id, kind: 'post', pickPlace: '1' } }) });
      }
      rows.push({ key: 'pin', icon: 'pin-outline', label: post.pinned ? 'Unpin from profile' : 'Pin to profile', onPress: () => { actions.togglePinPost(post.id); close(); } });
    }
    rows.push({ key: 'archive', icon: 'archive-outline', label: post.archived ? 'Unarchive' : 'Archive', note: post.archived ? undefined : 'Only you can see it', onPress: () => { actions.toggleArchivePost(post.id); close(); } });
    // Asked once, the way other apps ask; the menu stays up behind the question, so Cancel leaves you on it.
    dangerRows.push({ key: 'delete', icon: 'trash-outline', label: 'Delete', danger: true, onPress: () => ask({ title: 'Delete post?', message: 'Its likes and comments go with it. This can’t be undone.', confirmLabel: 'Delete', destructive: true, onConfirm: () => { actions.deletePost(post.id); close(); } }) });
  } else if (item && author && !mine) {
    const muted = mutedIds.includes(author.id);
    const blocked = blockedIds.includes(author.id);
    rows.push({ key: 'mute', icon: muted ? 'volume-high-outline' : 'volume-mute-outline', label: muted ? `Unmute @${author.handle}` : `Mute @${author.handle}`, note: muted ? undefined : 'You won’t see their posts. They aren’t told.', onPress: () => { actions.toggleMute(author.id); close(); } });
    // Asked first, as a comment's report is; the menu stays up behind the question and says thanks after.
    dangerRows.push({ key: 'report', icon: 'flag-outline', label: 'Report', danger: true, onPress: () => ask(reportQuestion(isHit ? 'Instant' : post?.kind === 'clip' ? 'clip' : 'post', () => {
      reported.current = { post, story };
      actions.reportUser(author.id, `${isHit ? 'hit' : 'post'}:${item.id}`);
      say(REPORT_THANKS, true);
    })) });
    // Unblocking is one tap; blocking asks first and says what it does.
    dangerRows.push({ key: 'block', icon: 'ban-outline', label: blocked ? `Unblock @${author.handle}` : `Block @${author.handle}`, danger: !blocked, onPress: () => {
      if (blocked) { actions.toggleBlock(author.id); close(); return; }
      ask(blockQuestion(author, () => { actions.toggleBlock(author.id); close(); }));
    } });
  }
  // Admins only (the database refuses anyone else): take it down, with a
  // reason, on its own page; or, once down, put it back.
  if (admin && item) {
    const what = isHit ? 'hit' as const : 'post' as const;
    dangerRows.push(removed
      ? { key: 'restore', icon: 'eye-outline', label: 'Restore', note: 'Everyone who could see it sees it again', onPress: () => { void actions.restoreContent(what, item.id); close(); } }
      : { key: 'takedown', icon: 'eye-off-outline', label: 'Take down', note: 'Breaks CourtSide’s rules. Its author is told why.', danger: true, onPress: () => router.replace({ pathname: '/take-down', params: { kind: what, id: item.id } }) });
  }

  // Each button's width: 72 where the row has room, narrower so five still fit a small phone.
  const tileW = Math.min(72, Math.floor((Math.min(windowWidth, 640) - spacing.md * 2) / Math.max(4, tiles.length)));

  const listRow = (row: Row) => (
    <Pressable
      key={row.key}
      accessibilityRole="button"
      accessibilityLabel={row.label}
      accessibilityHint={row.note}
      onPress={() => { void row.onPress(); }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {row.icon === 'court'
        ? <View style={styles.glyph}><CourtGlyph size={17} color={row.danger ? colors.danger : colors.text} /></View>
        : <Ionicons name={row.icon} size={22} color={row.danger ? colors.danger : colors.text} />}
      <View style={styles.rowWords}>
        <Text style={[styles.label, row.danger && styles.labelDanger]}>{row.label}</Text>
        {row.note ? <Text style={styles.note}>{row.note}</Text> : null}
      </View>
    </Pressable>
  );

  const body = !item ? (
    // Opened for something no longer loaded (an Instant that ran out, a post deleted, an old link).
    <View style={styles.panel} accessibilityLiveRegion="polite">
      <Ionicons name="time-outline" size={26} color={colors.textMuted} />
      <Text style={styles.panelText}>{isHit ? 'This Instant isn’t here any more.' : 'This post isn’t here any more.'}</Text>
      <View style={styles.panelButtons}>
        <Pressable accessibilityRole="button" onPress={close} style={({ pressed }) => [styles.primary, pressed && styles.pressedButton]}><Text style={styles.primaryText}>Done</Text></Pressable>
      </View>
    </View>
  ) : done ? (
    <View style={styles.panel} accessibilityLiveRegion="polite" {...(Platform.OS === 'web' ? { role: 'status', 'aria-live': 'polite' } : {})}>
      <Ionicons name={done.ok ? 'checkmark-circle' : 'alert-circle'} size={26} color={done.ok ? colors.brand : colors.danger} />
      <Text style={styles.panelText}>{done.text}</Text>
      <View style={styles.panelButtons}>
        {done.retry ? (
          <Pressable accessibilityRole="button" onPress={() => { const again = done.retry; setDone(null); again?.(); }} style={({ pressed }) => [styles.secondary, pressed && styles.pressedButton]}><Text style={styles.secondaryText}>Try again</Text></Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={close} style={({ pressed }) => [styles.primary, pressed && styles.pressedButton]}><Text style={styles.primaryText}>Done</Text></Pressable>
      </View>
    </View>
  ) : working ? (
    // The clip coming down for Instagram (it can take a while): what is happening, what Instagram gets, and a way out.
    <View style={styles.panel} accessibilityLiveRegion="polite" {...(Platform.OS === 'web' ? { role: 'status', 'aria-live': 'polite' } : {})}>
      <CourtSpinner size={26} />
      <Text style={styles.panelText}>{storyMedia?.kind === 'photo' ? 'Getting your photo ready for Instagram…' : 'Getting your clip ready for Instagram…'}</Text>
      {asIsNote ? <Text style={styles.panelNote}>{asIsNote}</Text> : null}
      <View style={styles.panelButtons}>
        <Pressable accessibilityRole="button" onPress={cancelStory} style={({ pressed }) => [styles.secondary, pressed && styles.pressedButton]}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
      </View>
    </View>
  ) : (
    <ScrollView
      style={{ maxHeight: Math.max(240, windowHeight - insets.top - insets.bottom - 64) }}
      contentContainerStyle={styles.list}
      bounces={false}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={32}
      onScroll={(e) => { listTop.current = e.nativeEvent.contentOffset.y <= 0; }}
    >
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
      {tiles.length ? (
        <View style={styles.tiles}>
          {tiles.map((tile) => {
            const still = tile.waiting || tile.busy;
            return (
              <Pressable
                key={tile.key}
                accessibilityRole="button"
                accessibilityLabel={tile.spoken}
                accessibilityState={{ disabled: !!still, busy: !!tile.busy }}
                disabled={!!still}
                onPress={() => { void tile.onPress(); }}
                style={[styles.tile, { width: tileW }]}
              >
                {({ pressed }) => (
                  <>
                    <View style={[styles.tileCircle, pressed && styles.tileCirclePressed, tile.waiting && styles.dimmed]}>
                      {still ? <CourtSpinner size={20} ink={colors.textMuted} /> : <Ionicons name={tile.icon} size={23} color={colors.text} />}
                    </View>
                    <Text style={[styles.tileLabel, tile.waiting && styles.dimmed]} numberOfLines={1}>{tile.label}</Text>
                  </>
                )}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {tiles.length && (rows.length || dangerRows.length) ? <View style={styles.rule} /> : null}
      {rows.map(listRow)}
      {rows.length && dangerRows.length ? <View style={styles.rule} /> : null}
      {dangerRows.map(listRow)}
    </ScrollView>
  );

  return (
    <View style={styles.backdrop}>
      <SheetBackdrop leaving={leaving} />
      <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPressIn={close} style={StyleSheet.absoluteFill} />
      <Animated.View
        {...sheetPan.panHandlers}
        onLayout={(e) => { const h = Math.ceil(e.nativeEvent.layout.height); if (h > 0) setSheetH(h + 24); }}
        style={[
          styles.sheet,
          // On a dark court the page behind is dimmed to almost the sheet's own colour: a step lighter keeps its edge.
          pageIsDark() && { backgroundColor: colors.bgElevated },
          { paddingBottom: insets.bottom + spacing.md, transform: [{ translateY: Animated.add(rise.interpolate({ inputRange: [0, 1], outputRange: [0, sheetH] }), drag) }] },
        ]}
      >
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
            <View pointerEvents="none" style={[styles.stickerCover, pageIsDark() && { backgroundColor: colors.bgElevated }]} />
          </>
        ) : null}
        {/* The grabber, in a strip tall enough to take hold of. */}
        <View {...grabberPan.panHandlers} style={styles.grabberStrip}>
          <View style={styles.grabber} />
        </View>
        {body}
      </Animated.View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end' },
  // A drag with a mouse moves the sheet rather than selecting its words.
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.md, userSelect: 'none' },
  // The same grabber as the comments sheet's, in a strip a finger can find.
  grabberStrip: { height: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong },
  list: { gap: 2, paddingBottom: 2 },
  // The round buttons: one fixed width each, from the left, so a button settling late at the end moves nothing.
  // The first circle's edge lines up with the list's icons below it.
  tiles: { flexDirection: 'row', paddingTop: 4, paddingBottom: spacing.md },
  tile: { alignItems: 'center', gap: 7, paddingVertical: 2 },
  tileCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  tileCirclePressed: { backgroundColor: colors.surfaceAlt },
  tileLabel: { ...font('500'), fontSize: 12.5, color: colors.text },
  dimmed: { opacity: 0.45 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: spacing.sm, marginVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 50, paddingVertical: 11, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  rowWords: { flex: 1, gap: 2 },
  // The court glyph is narrower than an icon: as wide as one, so the labels line up.
  glyph: { width: 22, alignItems: 'center' },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  // The Instagram overlay's hidden copy, clipped to the sheet, and the sheet-coloured cover over it (the rows draw on top).
  stickerClip: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  stickerStage: { position: 'absolute', left: 0, bottom: 0 },
  stickerCover: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  label: { ...font('500'), fontSize: 16, letterSpacing: -0.2, color: colors.text },
  labelDanger: { color: colors.danger },
  note: { ...typography.small, color: colors.textMuted },
  removedBox: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: spacing.md, marginBottom: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  removedTitle: { ...typography.body, ...font('600'), color: colors.danger },
  // What happened, in the sheet's place: an icon, a line or two, and the way on.
  panel: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.lg, paddingHorizontal: spacing.lg },
  panelText: { ...typography.body, ...font('500'), color: colors.text, textAlign: 'center', lineHeight: 21 },
  panelNote: { ...typography.small, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
  panelButtons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  primary: { minHeight: 44, minWidth: 112, paddingHorizontal: spacing.xl, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  primaryText: { ...typography.bodyStrong, color: colors.brandInk },
  secondary: { minHeight: 44, minWidth: 112, paddingHorizontal: spacing.xl, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...typography.bodyStrong, color: colors.text },
  pressedButton: { opacity: 0.8 },
});

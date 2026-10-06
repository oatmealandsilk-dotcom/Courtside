import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlaceLine } from '@/components/PlaceLine';
import { TaggedLine } from '@/components/TaggedLine';
import { Wash } from '@/components/Wash';
import React, { useEffect, useRef, useState, memo } from 'react';
import { Image, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ZoomableMedia, type HomeRect, type ZoomableMediaHandle } from '@/components/ZoomableMedia';
import { router } from 'expo-router';
import * as haptics from '@/lib/haptics';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Heart } from '@/components/Heart';

import { PostVideo } from '@/components/PostVideo';
import { CommentThread, CommentsPeek, threadsOf } from '@/components/CommentThread';
import { useApp } from '@/store/AppContext';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { lockPageSwipe } from '@/features/navigation/swipeLock';
import { useHoldTour } from '@/features/tour/tourHold';
import { BAR_OVERLAY_PX } from '@/features/navigation/barInset';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useLightStatusWhile } from '@/lib/statusBarStyle';
import { allowTurning, stayUpright } from '@/lib/orientation';
import { Tappable } from '@/components/Tappable';
import { NewHereTag } from '@/components/NewHereTag';
import { StreakFlame } from '@/components/StreakFlame';
import { shownStreak, streakWords } from '@/features/practice/streakFlame';
import { isNewHere } from '@/features/feed/newHere';
import { useOptimisticToggle } from '@/lib/useOptimisticToggle';
import { Avatar, Chip } from '@/components/ui';
import { LevelPill } from '@/components/LevelPill';
import { RichText } from '@/components/RichText';
import { SessionStrip } from '@/components/session/SessionStrip';
import { ZoneBar } from '@/components/session/ZoneBar';
import { postZones, zoneColors } from '@/features/activity/zones';
import { hasSessionStats } from '@/features/activity/format';
import { compactNumber, relativeTime } from '@/lib/format';
import type { Post, User } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';
import { tagsNotInCaption } from '@/features/feed/tags';
import { openPlayer } from '@/features/navigation/openPlayer';

interface Props {
  post: Post;
  author: User;
  liked: boolean;
  saved: boolean;
  /** Whether this page is the one on screen: the video plays only then. */
  active: boolean;
  preload?: boolean;
  onDoubleTap: () => void;
  onToggleLike: () => void;
  onToggleSave: () => void;
  onComment: () => void;
  onShare: () => void;
  onMore: () => void;
  /** Room left above for the wordmark. */
  topInset: number;
  /**
   * Room kept clear at the bottom for the tab bar: the feed passes the same
   * as under a written post, so "Add a comment…" sits on one line on every
   * post. Left out, a full-size bar's worth.
   */
  bottomInset?: number;
  /** A play burst over the picture, drawn by the feed. */
  burst?: React.ReactNode;
  /** Counts up on each double tap, so the heart on the button pops with it. */
  pop?: number;
  discInk?: string;
  /** The picture (or video's first frame) is in; false only when the video's player is freed and a rebuilt page fetches again. */
  onReady?: (ready: boolean) => void;
}

/**
 * A photo or video post as a page of the feed — Instagram's post, not its
 * reel. The picture sits at the top in its own frame, and everything about it
 * (who, the caption, the tags, like · comment · send · save) sits underneath
 * in the app's own type and colours, rather than painted over the picture.
 */
const desktopWeb = Platform.OS === 'web' && isDesktopBrowser();
/** Posts whose session strip has already counted up this run. */
const counted = new Set<string>();
/** The breathing room either side of a post on a computer, when the window has it to spare. */
export const LANE_INSET = 28;
/**
 * How much room to keep either side of a post on a computer, for a content
 * column of a given width: the full inset when there is room for it, none on
 * a narrow window.
 */
export const laneInsetFor = (columnWidth: number) => (desktopWeb && columnWidth >= 520 + LANE_INSET * 2 ? LANE_INSET : 0);
/**
 * The shape a post's picture is drawn at (width over height): a wide clip at
 * its own shape (16:9 until it is known), a photo at its own (exactly what
 * its author cut in the editor), a tall clip 4:5. The composer's preview
 * draws the post being written at the same shape.
 */
export const feedFrameRatio = (landscape: boolean, video: boolean, shape: number | null) => (landscape ? (shape ?? 16 / 9) : (!video && shape ? shape : 4 / 5));
/** A picture's measured shape, kept within what the feed draws. */
export const feedShape = (landscape: boolean, w: number, h: number) => (landscape ? Math.max(1.2, Math.min(2.6, w / h)) : Math.max(0.5, Math.min(1.3, w / h)));
/** The narrowest the words and buttons under a post get, so a tall picture never squeezes them. */
const LANE_MIN = 400;
/** The buttons' one size: like, comment, send, save and more all read as a set. */
const ICON = 26;

function MediaPostPageInner({ post, author, liked, saved, active, preload = false, onDoubleTap, onToggleLike, onToggleSave, onComment, onShare, onMore, topInset, bottomInset, burst, pop = 0, discInk, onReady }: Props) {
  // Fills on the tap; the store's own redraw follows without changing anything on screen.
  const like = useOptimisticToggle(`p:${post.id}`, liked, onToggleLike, pop);
  const likes = post.likedBy.length + like.delta;
  const styles = useThemedStyles(styleDefinitions);
  const { comments, currentUser, currentUserId, actions, blockedIds } = useApp();
  const streak = shownStreak(author, currentUserId);
  const footZones = postZones(post.session);
  // The strip's numbers count up the first time its page is on show this run.
  const [stripPlay, setStripPlay] = useState(false);
  useEffect(() => {
    if (!active || !post.session || counted.has(post.id)) return;
    counted.add(post.id);
    setStripPlay(true);
  }, [active, post.id, post.session]);
  // Newest first, the way the sheet lists them; they fill the bottom of the page.
  // Replies stay folded on the page: "View 2 replies" opens the sheet at them.
  // Never one hidden by the owner's Hidden words (migration 117), unless it is yours: the sheet lists those under "Hidden comments".
  const thread = threadsOf(comments, post.id, 'newest', currentUserId);
  const [captionOpen, setCaptionOpen] = useState(false);
  // A photo: one tap opens it full screen (pinch to look closer, it snaps
  // back), two taps like it. The single tap waits out the double-tap window.
  const insets = useSafeAreaInsets();
  const [full, setFull] = useState(false);
  // The tutorial never starts under a photo opened full screen.
  useHoldTour(full);
  // Full screen is black: light status-bar icons over it.
  const fullShown = useLightStatusWhile(full);
  const frameRef = useRef<View>(null);
  const zoom = useRef<ZoomableMediaHandle>(null);
  const [home, setHome] = useState<HomeRect | undefined>(undefined);
  const { width: winW, height: winH } = useWindowDimensions();
  const sideways = winW > winH;
  useEffect(() => { if (full && sideways) setHome(undefined); }, [full, sideways]);
  const openFull = () => {
    const node = frameRef.current;
    if (!node) { setFull(true); return; }
    node.measureInWindow((x, y, w, h) => { setHome(w > 0 && h > 0 ? { x, y, width: w, height: h, radius: radius.lg } : undefined); setFull(true); });
  };
  const closeFull = () => { if (zoom.current) zoom.current.close(); else setFull(false); };
  useEffect(() => { if (!post.videoUrl) { if (full) void allowTurning(); else void stayUpright(); } }, [full, post.videoUrl]);
  useEffect(() => {
    if (!full || Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeFull(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastTap = useRef(0);
  const pendingTap = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapPicture = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      lastTap.current = 0;
      if (pendingTap.current) { clearTimeout(pendingTap.current); pendingTap.current = null; }
      onDoubleTap();
      return;
    }
    lastTap.current = now;
    if (pendingTap.current) clearTimeout(pendingTap.current);
    pendingTap.current = setTimeout(() => { pendingTap.current = null; openFull(); }, 280);
  };
  useEffect(() => () => { if (pendingTap.current) clearTimeout(pendingTap.current); }, []);
  const landscape = post.orientation === 'landscape';
  // A wide video's frame is cut to the video's own shape — the player says
  // what that is the moment it has read the file (the cover picture is only
  // a first guess) — so the picture fills it exactly, no bars at the sides.
  // The frame takes the picture's own shape (a photo is exactly what its
  // author cut in the editor, so nothing more or less of it should show).
  const [shape, setShape] = useState<number | null>(null);
  const [sized, setSized] = useState(false);
  useEffect(() => {
    const cover = post.imageUrl ?? post.thumbnailUrl;
    if (!cover || sized) return;
    let live = true;
    Image.getSize(cover, (w, h) => {
      if (!live || w <= 0 || h <= 0) return;
      setShape(feedShape(landscape, w, h));
    }, () => undefined);
    return () => { live = false; };
  }, [landscape, post.thumbnailUrl, post.imageUrl, sized]);
  // The phone can report a recording's stored size before its rotation flag
  // is applied (a landscape iPhone video often comes back as portrait), so a
  // wide post always takes the wide reading of the two, kept within bounds.
  const onSize = (w: number, h: number) => {
    if (w <= 0 || h <= 0) return;
    setSized(true);
    setShape(Math.max(1.2, Math.min(2.6, Math.max(w, h) / Math.min(w, h))));
  };
  // The frame is sized in points from the room it has, so it is always the
  // picture's own shape: never stretched across a wide window and cropped
  // down to fit its height. A tall picture may take 62% of the page's height.
  const [room, setRoom] = useState<{ w: number; h: number } | null>(null);
  // What the page needs besides the picture: the name above it, and the
  // stats, caption and buttons (and the comment line) below it, measured as
  // they draw. The picture then takes all that is left, up to its own shape,
  // so it fills the gutter whenever the page has the height for it.
  const [head, setHead] = useState(0);
  const [foot, setFoot] = useState(0);
  const [entry, setEntry] = useState(0);
  // Taken down (migration 108): nothing new can be added under it, so there is no line inviting a comment.
  const closed = !!post.removed;
  const measured = (set: (n: number) => void, prev: number) => (e: { nativeEvent: { layout: { height: number } } }) => {
    const h = Math.ceil(e.nativeEvent.layout.height);
    if (h > 0 && Math.abs(h - prev) >= 1) set(h);
  };
  // Room either side only when the window has it: a narrow computer window
  // (or a side panel) gets the post edge to edge.
  const inset = room ? laneInsetFor(room.w) : 0;
  const frameSize = (() => {
    if (!room) return null;
    const ratio = feedFrameRatio(landscape, !!post.videoUrl, shape);
    // Until the words have measured, the old share of the page; after, the
    // page less its words (and a comment's worth of room when there are some),
    // never under 40% of it, so a long caption cannot shrink the picture away.
    const rest = head && foot && (entry || closed) ? head + foot + (closed ? 0 : entry) + spacing.md * 2 + spacing.sm * (thread.length ? 2 : 1) + (thread.length ? 72 : 0) : 0;
    const tall = rest ? Math.max(room.h * 0.4, room.h - rest) : room.h * 0.62;
    const full = room.w - inset * 2;
    const h = Math.min(tall, full / ratio);
    // On a phone a photo always fills the page's width, the way Instagram's feed does (Oct 5, owner: a tall photo
    // with a session card under it was shrunk to a narrow column). When the page is too short for its whole
    // height it is trimmed instead, keeping more of the top, where faces usually are. Videos and computers as before.
    if (!desktopWeb && !post.videoUrl) return { width: Math.round(full), height: Math.round(h), cropped: h < full / ratio - 1 };
    return { width: Math.round(h * ratio), height: Math.round(h), cropped: false };
  })();
  // On a computer the post is one centred column, the way it is on a phone:
  // the picture in the middle at its own size, and the name above it and the
  // words and buttons below it the same width, so all of it shares two edges.
  // A tall, narrow picture still leaves the words a readable width, and
  // nothing is ever wider than the window.
  //
  // Until the page has measured itself, the column already stands in the
  // middle at its narrowest width. Without this it began stretched across the
  // whole window, the name and words starting at the far left, and only
  // jumped to the centre half a second later.
  const firstLane = desktopWeb ? { width: '100%' as const, maxWidth: LANE_MIN, alignSelf: 'center' as const } : null;
  // On a phone the words take the picture's width too when a tall picture is
  // narrower than the page, so the name, the picture and the caption all
  // start on one line down the left (and end on one down the right).
  const lane = desktopWeb && frameSize && room
    ? { width: Math.min(Math.max(frameSize.width, LANE_MIN), room.w - inset * 2), alignSelf: 'center' as const }
    : !desktopWeb && frameSize && room && frameSize.width < room.w - 1
      ? { width: frameSize.width, alignSelf: 'center' as const }
      : firstLane;
  // The picture's stand-in size for that same first moment: centred, and no
  // wider than the column it will sit in.
  const firstFrame = landscape
    ? (desktopWeb ? { width: '100%' as const, maxWidth: LANE_MIN, alignSelf: 'center' as const, aspectRatio: shape ?? 16 / 9 } : { alignSelf: 'stretch' as const, aspectRatio: shape ?? 16 / 9 })
    : { width: '100%' as const, maxHeight: '62%' as const, aspectRatio: !post.videoUrl && shape ? shape : 4 / 5, ...(desktopWeb ? { maxWidth: LANE_MIN } : null) };

  return (
    // Top down, the way every post's page is laid out, so the name sits in the same place from one post
    // to the next; "Add a comment…" closes the page at its bottom edge, comments or not (Oct 6 review).
    <View style={[styles.page, { paddingTop: topInset }, bottomInset != null ? { paddingBottom: bottomInset } : null]}>
      <Wash height={300} strength={0.6} />
     <View style={styles.column} onLayout={(e) => { const { width, height } = e.nativeEvent.layout; if (width > 0 && height > 0) setRoom({ w: width, h: height }); }}>
      {/* Who and their level, in the space above the picture. */}
      <View style={[styles.whoRow, lane]} onLayout={measured(setHead, head)}>
        <Pressable accessibilityRole="link" accessibilityLabel={`View ${author.name}'s profile${streakWords(streak)}`} onPress={() => { actions.noteFeedSignal({ kind: 'post', id: post.id, profileTap: true }); openPlayer(author.id, currentUserId); }} style={styles.who}>
          <Avatar name={author.name} seed={author.avatarSeed} uri={author.avatarUrl} size={40} />
          <View style={{ flex: 1, gap: 1 }}>
            <View style={styles.nameRow}>
              {/* The name keeps some room: the badges beside it never squeeze it down to a letter ("New" is the short tag here, the lane can be narrow). */}
              <Text style={styles.name} numberOfLines={1}>{author.name}</Text>
              <StreakFlame days={streak} />
              {author.isCoach ? <Ionicons name="shield-checkmark" size={14} color={colors.brand} /> : null}
              <LevelPill profile={author.profile} small />
              {isNewHere(post) ? <NewHereTag short /> : null}
            </View>
            <Text style={styles.sub} numberOfLines={1}>@{author.handle} · {relativeTime(post.createdAt)}{post.editedAt ? ' · Edited' : ''}</Text>
            {/* Where, on its own line under the name, as Instagram sets it: the whole place, a tap opens the court. */}
            <PlaceLine court={post.court} location={post.location} />
          </View>
        </Pressable>
      </View>
      {/* A finger on the picture belongs to the picture: no sideways page swipe from here. */}
      <View
        ref={frameRef}
        style={[styles.frame, landscape ? styles.frameWide : styles.frameTall, frameSize ? { width: frameSize.width, height: frameSize.height } : firstFrame]}
        onTouchStart={() => lockPageSwipe(true)}
        onTouchEnd={() => lockPageSwipe(false)}
        onTouchCancel={() => lockPageSwipe(false)}
      >
        {post.videoUrl ? (
          <PostVideo uri={post.videoUrl} poster={post.thumbnailUrl} active={active} preload={preload} onDoubleTap={onDoubleTap} trimStart={post.trimStart} trimEnd={post.trimEnd} speed={post.speed} volume={post.volume} crop={post.crop} silent={post.muted} discInk={discInk} onReady={onReady} onSize={landscape ? onSize : undefined} />
        ) : (
          <Pressable accessibilityRole="image" accessibilityLabel={post.mediaLabel ?? 'Post photo'} onPress={tapPicture} style={StyleSheet.absoluteFill}>
            <ExpoImage accessibilityIgnoresInvertColors source={{ uri: post.imageUrl ?? post.thumbnailUrl }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={frameSize?.cropped ? { top: '25%', left: '50%' } : 'center'} cachePolicy="memory-disk" onLoad={() => onReady?.(true)} />
          </Pressable>
        )}
        {/* Heart-rate zones, when shared: a thin foot along the picture's bottom edge, nothing over the picture itself. */}
        {footZones ? <ZoneBar zones={footZones} colors={zoneColors('media')} height={6} square style={styles.foot} /> : null}
        {burst}
      </View>
      {!post.videoUrl ? (
        <Modal visible={fullShown} transparent animationType="none" statusBarTranslucent supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']} onRequestClose={closeFull}>
          {/* Its own gesture root: on Android a Modal's pinch and swipe need one (see PostVideo). */}
          <GestureHandlerRootView style={styles.fullRoot}>
            <ZoomableMedia ref={zoom} home={home} onDismiss={() => { setFull(false); setHome(undefined); }}>
              <ExpoImage accessibilityIgnoresInvertColors source={{ uri: post.imageUrl ?? post.thumbnailUrl }} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" />
            </ZoomableMedia>
            <Pressable accessibilityRole="button" accessibilityLabel="Close full screen" onPress={closeFull} style={[styles.fullClose, { top: insets.top + 12 }]}>
              <Ionicons name="close" size={22} color="white" />
            </Pressable>
          </GestureHandlerRootView>
        </Modal>
      ) : null}

      <View style={[styles.details, lane]}>
        {/* Everything under the picture that keeps its size, measured so the picture knows what is left: an opened caption makes the picture give way for it, down to 40% of the page. */}
        <View style={styles.under} onLayout={measured(setFoot, foot)}>
          {/* A session's stats (a tracker's numbers, or one from the author's log), straight under the picture; a tap opens them all. */}
          {post.session && hasSessionStats(post.session) ? (
            <SessionStrip session={post.session} hidden={blockedIds} play={stripPlay} onPress={() => router.push({ pathname: '/session-stats', params: { kind: 'post', id: post.id } })} />
          ) : null}
          {post.body ? (
            <Pressable accessibilityRole="button" accessibilityLabel={captionOpen ? 'Show less' : 'Show the whole caption'} onPress={() => setCaptionOpen((o) => !o)}>
              <Text numberOfLines={captionOpen ? undefined : 2} style={styles.caption}><Text style={styles.captionName}>{author.handle} </Text><RichText style={styles.caption}>{post.body}</RichText></Text>
            </Pressable>
          ) : null}
          {/* Who with, right under the words, out of the name's lines. */}
          <TaggedLine post={post} />
          {/* Tags the caption does not already say: a #tag written in it is not repeated as a chip. */}
          {tagsNotInCaption(post.body, post.tags).length ? (
            <View style={styles.tags}>
              {tagsNotInCaption(post.body, post.tags).map((tag) => <Chip key={tag} label={`#${tag}`} onPress={() => router.push({ pathname: '/search', params: { q: `#${tag}` } })} small />)}
            </View>
          ) : null}
          {/* Instagram's row: like, comment and send on the left, save and more on
              the right, one size and weight. A count shows beside its glyph only
              once there is one: no row of zeros. */}
          <View style={styles.actions}>
            {/* A tap likes; holding it opens who liked it. The like waits for the finger to lift, so a hold never likes by accident. The number opens who liked it too. */}
            <View style={styles.like}>
              <Tappable onPress={like.toggle} onLongPress={() => { haptics.commit(); router.push({ pathname: '/likes', params: { id: post.id } }); }} scaleTo={0.78} style={[styles.action, likes > 0 && styles.actionBeforeCount]} accessibilityLabel={like.on ? 'Unlike. Hold to see who liked it' : 'Like. Hold to see who liked it'}>
                <Heart liked={like.on} pop={pop} size={ICON} ink={colors.text} />
              </Tappable>
              {likes > 0 ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`${likes} ${likes === 1 ? 'like' : 'likes'}, see who`} onPress={() => router.push({ pathname: '/likes', params: { id: post.id } })} style={styles.count}>
                  <Text style={styles.actionText}>{compactNumber(likes)}</Text>
                </Pressable>
              ) : null}
            </View>
            <Tappable onPress={onComment} scaleTo={0.78} style={styles.action} accessibilityLabel={post.commentIds.length ? `Comments, ${post.commentIds.length}` : 'Comments'}>
              <Ionicons name="chatbubble-outline" size={ICON - 1} color={colors.text} />
              {post.commentIds.length ? <Text style={styles.actionText}>{compactNumber(post.commentIds.length)}</Text> : null}
            </Tappable>
            {/* Nobody else can open something taken down, so there is nothing to send. */}
            {closed ? null : (
              <Tappable onPress={onShare} scaleTo={0.78} style={styles.action} accessibilityLabel="Send this post to someone">
                <Ionicons name="arrow-redo-outline" size={ICON} color={colors.text} />
                {post.shares ? <Text style={styles.actionText}>{compactNumber(post.shares)}</Text> : null}
              </Tappable>
            )}
            <View style={styles.flex} />
            <Tappable onPress={onToggleSave} scaleTo={0.78} style={styles.action} accessibilityLabel={saved ? 'Remove from saved' : 'Save this post'}>
              <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={ICON - 1} color={colors.text} />
              {post.savedBy?.length ? <Text style={styles.actionText}>{compactNumber(post.savedBy.length)}</Text> : null}
            </Tappable>
            <Tappable onPress={onMore} scaleTo={0.78} style={styles.action} accessibilityLabel="More options">
              <Ionicons name="ellipsis-horizontal" size={ICON - 2} color={colors.text} />
            </Tappable>
          </View>
        </View>

        {/* The comments, a still preview in whatever room is left (CommentsPeek: never a box that scrolls
            inside the feed's swipe); the line on the page's bottom edge opens the sheet to write one. */}
        {thread.length ? (
          <CommentsPeek style={styles.thread} contentContainerStyle={styles.threadInner}>
            {thread.map((t) => (
              <CommentThread
                key={t.top.id}
                thread={t}
                big
                open={false}
                onToggle={() => router.push({ pathname: '/comments', params: { kind: 'post', id: post.id, at: t.replies[0]?.id ?? t.top.id } })}
                onReply={post.removed ? undefined : (c) => router.push({ pathname: '/comments', params: { kind: 'post', id: post.id, reply: c.id } })}
                onPressBody={(c) => router.push({ pathname: '/comments', params: { kind: 'post', id: post.id, at: c.id } })}
              />
            ))}
          </CommentsPeek>
        ) : null}
        {closed ? null : (
          <Pressable accessibilityRole="button" accessibilityLabel="Add a comment" onPress={() => router.push({ pathname: '/comments', params: { kind: 'post', id: post.id, focus: '1' } })} onLayout={measured(setEntry, entry)} style={({ pressed }) => [styles.addComment, pressed && styles.addCommentPressed]}>
            {currentUser ? <Avatar name={currentUser.name} seed={currentUser.avatarSeed} uri={currentUser.avatarUrl} size={28} /> : null}
            <Text style={styles.addCommentText}>{thread.length ? 'Add a comment…' : 'Be the first to comment…'}</Text>
          </Pressable>
        )}
      </View>
     </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  // The bottom keeps clear of the bar at its full size (see VerticalPager).
  page: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.md, paddingBottom: spacing.md + BAR_OVERLAY_PX, alignItems: 'center' },
  column: { flex: 1, width: '100%', gap: spacing.md },
  frame: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' },
  // Instagram's tall post: 4:5 by default, so the picture is big without taking the page.
  frameTall: { alignSelf: 'center' },
  // A wide video: the same rounding as every picture in the feed, the video's own shape.
  frameWide: { alignSelf: 'center' },
  // Takes all the room under the picture, so "Add a comment…" can sit on the page's bottom edge.
  details: { gap: spacing.sm, flexGrow: 1, flexShrink: 1, minHeight: 0 },
  // The stats, caption and buttons: close together, as one block under the picture.
  under: { gap: 10 },
  flex: { flex: 1 },
  fullRoot: { flex: 1, backgroundColor: 'transparent' },
  fullClose: { position: 'absolute', right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  whoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { ...typography.bodyStrong, color: colors.text, flexShrink: 1, minWidth: 56 },
  sub: { ...typography.small, color: colors.textFaint },
  // 18 points between glyphs, each button a full 44-point square (a browser has no hitSlop); the row
  // is pulled out by the padding at its ends, and up and down, so it takes the room it always did.
  actions: { flexDirection: 'row', alignItems: 'center', marginHorizontal: -9, marginVertical: -6 },
  action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, minWidth: 44, paddingHorizontal: 9 },
  like: { flexDirection: 'row', alignItems: 'center' },
  actionBeforeCount: { paddingRight: 3 },
  count: { minHeight: 44, justifyContent: 'center', paddingLeft: 3, paddingRight: 9 },
  actionText: { ...typography.bodyStrong, fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
  thread: { flexShrink: 1, minHeight: 0, marginTop: spacing.xs },
  threadInner: { gap: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  // Pinned to the page's bottom edge, as under a written post (PostCard): marginTop auto takes the room left above it.
  addComment: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, marginTop: 'auto', paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  addCommentPressed: { opacity: 0.7 },
  addCommentText: { ...typography.body, color: colors.textFaint, flex: 1 },
  caption: { ...typography.body, color: colors.text, lineHeight: 21 },
  captionName: { ...typography.bodyStrong, color: colors.text },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});

/** Re-renders only when a shown value changes; the handlers passed in read fresh values through their own props, so a new function alone is no reason to rebuild. */
export const MediaPostPage = memo(MediaPostPageInner, (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = (a as Record<string, unknown>)[k]; const y = (b as Record<string, unknown>)[k];
    if (typeof x === 'function' && typeof y === 'function') continue;
    if (x !== y) return false;
  }
  return true;
});

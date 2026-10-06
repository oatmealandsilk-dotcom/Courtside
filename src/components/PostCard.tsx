import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlaceLine } from '@/components/PlaceLine';
import { TaggedLine } from '@/components/TaggedLine';
import React, { useEffect, useState, memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { router } from 'expo-router';
import * as haptics from '@/lib/haptics';
import Ionicons from '@expo/vector-icons/Ionicons';

import { ClipVideo } from '@/components/ClipVideo';
import { CommentThread, CommentsPeek, threadsOf } from '@/components/CommentThread';
import { Heart } from '@/components/Heart';
import { cropLayer } from '@/lib/crop';
import { Tappable } from '@/components/Tappable';
import { NewHereTag } from '@/components/NewHereTag';
import { StreakFlame } from '@/components/StreakFlame';
import { shownStreak, streakWords } from '@/features/practice/streakFlame';
import { isNewHere } from '@/features/feed/newHere';
import { useOptimisticToggle } from '@/lib/useOptimisticToggle';
import { Avatar, Card, Chip } from '@/components/ui';
import { LevelPill } from '@/components/LevelPill';
import { MediaPlaceholder } from '@/components/MediaPlaceholder';
import { compactNumber, relativeTime } from '@/lib/format';
import type { Post, QuestionTopic, User } from '@/data/types';
import { RichText } from '@/components/RichText';
import { SessionCard } from '@/components/session/SessionCard';
import { SessionStrip } from '@/components/session/SessionStrip';
import { useApp } from '@/store/AppContext';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { hasSessionStats } from '@/features/activity/format';
import { requestSection } from '@/features/navigation/swipeOrder';
import { goToTab } from '@/features/navigation/startTab';
import { colors, radius, spacing, typography } from '@/theme';
import { tagsNotInCaption } from '@/features/feed/tags';

interface Props {
  /** Opens the comments; without it the comment button behaves like a tap on the card. */
  onComment?: () => void;
  post: Post;
  author: User;
  liked: boolean;
  onToggleLike: () => void;
  onPress: () => void;
  onPressAuthor?: () => void;
  saved?: boolean;
  onToggleSave?: () => void;
  onShare?: () => void;
  /**
   * How many lines of the post's words to show before the card would outgrow
   * its page. The feed passes this; a page that scrolls leaves it off.
   */
  clamp?: number;
  /** False in a list of many (search results): the video shows its cover instead of every one playing at once. */
  playing?: boolean;
  /**
   * The ••• at the end of the row of buttons, as under a photo post: the post's
   * menu (yours: edit, pin, archive, delete; anyone else's: report, mute, block).
   */
  onMore?: () => void;
  /** This post's page is the one on show: a session card counts its numbers up, once per post per app run. */
  active?: boolean;
  /**
   * What fills the room a short post leaves, under its pulled-up "Add a
   * comment…" (the feed's find-players card, on one page a visit), given that
   * room in points. Shown only while the post is short; the feed checks it fits (onRoom).
   */
  under?: (room: number) => React.ReactNode;
  /** The room the page leaves empty, in points, each time it changes: the feed picks the page `under` goes on from it. */
  onRoom?: (room: number) => void;
}

/** Session cards that have already counted up this run: after the first time, they just show their numbers. */
const counted = new Set<string>();

/** Which Community topic each kind of post belongs with, for the tappable label. */
const KIND_TOPIC: Record<Post['kind'], QuestionTopic | 'all'> = {
  clip: 'technique', match: 'strategy', session: 'fitness', note: 'all', gear: 'gear', milestone: 'mental',
};

/** An Ionicon, or 'court' for the court drawn the app's way (the game itself). */
type KindIcon = keyof typeof Ionicons.glyphMap | 'court';
type KindMeta = { label: string; icon: KindIcon; tint: keyof typeof colors };
// Tints are palette slots, looked up as the card draws: a colour read once at
// load would stay the light theme's on every other court.
const KIND_META: Record<Post['kind'], KindMeta> = {
  clip: { label: 'Clip', icon: 'videocam-outline', tint: 'brand' },
  match: { label: 'Set play', icon: 'trophy-outline', tint: 'brand' },
  session: { label: 'Session', icon: 'barbell-outline', tint: 'court' },
  note: { label: 'Note', icon: 'chatbubble-ellipses-outline', tint: 'hard' },
  gear: { label: 'Gear', icon: 'pricetag-outline', tint: 'clay' },
  milestone: { label: 'Milestone', icon: 'flag-outline', tint: 'warning' },
};
const TENNIS_META: KindMeta = { label: 'Tennis', icon: 'court', tint: 'court' };
/** The buttons' one size and ink: the same set as under a photo post (MediaPostPage). */
const ICON = 26;
/**
 * A short post: one that would leave at least this much of its page empty
 * between its buttons (or comments) and "Add a comment…". Its comment line
 * comes up under it instead of waiting at the bottom of the page (Oct 6
 * audit, item 10), and the room goes under the line.
 */
const SHORT_ROOM = 120;

function PostCardInner({
  onComment,
  post,
  author,
  liked,
  onToggleLike,
  onPress,
  onPressAuthor,
  saved = false,
  onToggleSave,
  onShare,
  clamp,
  onMore,
  playing = true,
  active = false,
  under,
  onRoom,
}: Props) {
  const styles = useThemedStyles(styleDefinitions);
  const { blockedIds, currentUserId, currentUser, comments } = useApp();
  // Its comments under it, newest first, filling what is left of the page, then "Add a comment…": the same
  // as under a photo post, so a written post is not half a page of nothing (Oct 5 audit).
  const thread = threadsOf(comments, post.id, 'newest', currentUserId);
  const streak = shownStreak(author, currentUserId);
  // A session with no photo or video: the session's card is the post's picture (Oct 2).
  const sessionCard = !!post.session && hasSessionStats(post.session) && !post.imageUrl && !post.videoUrl && post.kind !== 'clip';
  // The room the card has: as wide as the post, and in the feed's fixed-height
  // page only as tall as is left once the caption and buttons have theirs.
  const [slot, setSlot] = useState({ w: 0, h: 0 });
  const [play, setPlay] = useState(false);
  useEffect(() => {
    if (!sessionCard || !active || counted.has(post.id)) return;
    counted.add(post.id);
    setPlay(true);
  }, [sessionCard, active, post.id]);
  const openStats = () => router.push({ pathname: '/session-stats', params: { kind: 'post', id: post.id } });
  // A post carrying a tennis session (a tracker's, or one from your log) is labelled for the game itself, not as a generic session:
  // the court, as in Your sessions; the stopwatch stays for the time and stats under it.
  const kind = post.session?.activityId || (post.session?.sessionId && post.session.kind !== 'fitness') ? TENNIS_META : KIND_META[post.kind];
  const meta = { ...kind, tint: colors[kind.tint] };
  // The heart fills on the tap; the store's own redraw follows without changing anything on screen.
  const like = useOptimisticToggle(`p:${post.id}`, liked, onToggleLike);
  // The page's empty room, measured (null until it has been): a short post's comment line comes up under it.
  const [room, setRoom] = useState<number | null>(null);
  const short = room !== null && room >= SHORT_ROOM;
  // The room is the same wherever the comment line sits, so the line moving never changes the answer.
  const roomBox = (
    <View
      style={styles.room}
      onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (h === room) return;
        setRoom(h);
        onRoom?.(h);
      }}
    >
      {short && under ? under(room) : null}
    </View>
  );

  return (
    <Card style={styles.card}>
      <Pressable accessibilityRole="link" accessibilityLabel={`View ${author.name} profile${streakWords(streak)}`} onPress={onPressAuthor ?? (() => router.push(`/user/${author.id}`))} style={styles.header}>
        <Avatar name={author.name} seed={author.avatarSeed} uri={author.avatarUrl} size={42} />
        <View style={styles.headerText}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {author.name}
            </Text>
            <StreakFlame days={streak} />
            {author.isCoach ? (
              <Ionicons name="shield-checkmark" size={14} color={colors.brand} />
            ) : null}
          </View>
          {/* "New to CourtSide" on the handle's line, or the line under it when the two don't fit:
              beside the name, with the streak and the level, it cut the name down to "June …" (Oct 6 audit, item 9). */}
          <View style={styles.subRow}>
            <Text style={styles.sub} numberOfLines={1}>
              @{author.handle} · {relativeTime(post.createdAt)}
            </Text>
            {isNewHere(post) ? <NewHereTag /> : null}
          </View>
          {/* Where, on its own line under the name, as Instagram sets it: the whole place, a tap opens the court. */}
          <PlaceLine court={post.court} location={post.location} />
        </View>
        <LevelPill profile={author.profile} small />
      </Pressable>

      {post.imageUrl ? <ExpoImage accessibilityLabel={post.mediaLabel ?? "Post photo"} source={{uri:post.imageUrl}} style={styles.photo} contentFit="cover" cachePolicy="memory-disk"/> : null}
      {/* The player fills whatever box it is given, so the card gives it one in the post's own shape. */}
      {post.videoUrl ? (
        <View style={[styles.video, { aspectRatio: post.orientation === 'landscape' ? 16 / 9 : 4 / 5 }]}>
          <View style={cropLayer(post.crop)}><ClipVideo uri={post.videoUrl} poster={post.thumbnailUrl} active={playing} trimStart={post.trimStart} trimEnd={post.trimEnd} speed={post.speed} volume={post.volume} /></View>
        </View>
      ) : post.kind === 'clip' ? <MediaPlaceholder label={post.mediaLabel ?? 'Clip'} seed={post.id} portrait /> : null}
      {sessionCard ? (
        <View
          // Asks for the card's full 4:5 height and gives way first when the
          // page is short (the feed's page is a fixed height), so the caption
          // and the buttons under it always stay on screen; the card is then
          // drawn smaller, still 4:5, centred.
          style={slot.w ? [styles.cardSlot, { height: Math.round(Math.min(slot.w, 420) * 1.25) }] : [styles.cardSlot, styles.cardWait]}
          onLayout={(e) => {
            const w = Math.floor(e.nativeEvent.layout.width);
            const h = Math.floor(e.nativeEvent.layout.height);
            if (w > 0 && (w !== slot.w || h !== slot.h)) setSlot({ w, h });
          }}
        >
          {slot.w && slot.h ? <SessionCard session={post.session!} width={Math.max(1, Math.min(slot.w, 420, Math.floor(slot.h * 0.8)))} play={play} hidden={blockedIds} onPress={openStats} /> : null}
        </View>
      ) : null}
      <Pressable onPress={onPress} style={styles.body}>
        {/* The session's card already says what it was: no label over its words. */}
        {sessionCard ? null : <Tappable
          accessibilityLabel={`${meta.label}: see discussions about this in Community`}
          onPress={() => { requestSection('/discuss', 'discussions'); requestSection('/discuss#topic', KIND_TOPIC[post.kind]); goToTab('/discuss'); }}
          style={[styles.kindRow, { borderColor: `${meta.tint}55` }]}
        >
          {meta.icon === 'court'
            ? <View style={styles.kindGlyph}><CourtGlyph size={10.4} color={meta.tint} /></View>
            : <Ionicons name={meta.icon} size={13} color={meta.tint} />}
          <Text style={[styles.kindLabel, { color: meta.tint }]}>{meta.label}</Text>
          <Ionicons name="chevron-forward" size={11} color={meta.tint} />
        </Tappable>}

        <RichText numberOfLines={clamp} style={styles.text}>{post.body}</RichText>
        {/* Who with, right under the words, out of the name's lines. */}
        <TaggedLine post={post} />

        {post.match ? (
          <View style={styles.detailBox}>
            <Text style={styles.detailTitle}>
              {post.match.won ? 'def.' : 'lost to'} {post.match.opponentName}
            </Text>
            <View style={styles.setRow}>
              {post.match.sets.map((set, i) => (
                <View
                  key={`${set}-${i}`}
                  style={[
                    styles.setChip,
                    { borderColor: post.match?.won ? colors.court : colors.border },
                  ]}
                >
                  <Text style={styles.setText}>{set}</Text>
                </View>
              ))}
              <Text style={styles.surfaceText}>{post.match.surface}</Text>
            </View>
          </View>
        ) : null}

        {/* Any other session is the same box in the same look (Oct 5, owner: one look, not two):
            a session with stats that is not the card opens them; "Minutes on court", or an old
            written plan, says what it was and how long, its drills listed under it. */}
        {sessionCard ? null : post.session && hasSessionStats(post.session) ? (
          <SessionStrip session={post.session} hidden={blockedIds} onPress={openStats} flat />
        ) : post.session ? (
          <View style={styles.planned}>
            <SessionStrip
              flat
              session={post.session}
              title={post.session.focus && post.session.focus !== 'On court' ? post.session.focus : undefined}
              sub={post.session.intensity ? `Intensity ${post.session.intensity}/5` : undefined}
            />
            {(post.session.drills ?? []).map((drill) => (
              <Text key={drill} style={styles.drill}>
                • {drill}
              </Text>
            ))}
          </View>
        ) : null}

        {post.mediaLabel && !post.imageUrl && !post.videoUrl && post.kind !== 'clip' ? <MediaPlaceholder label={post.mediaLabel} seed={post.id}  /> : null}

        {/* Tags the caption does not already say: a #tag written in it is not repeated as a chip. */}
        {tagsNotInCaption(post.body, post.tags).length > 0 ? (
          <View style={styles.tagRow}>
            {tagsNotInCaption(post.body, post.tags).map((tag) => (
              <Chip key={tag} label={`#${tag}`} onPress={() => router.push({pathname:"/search",params:{q:`#${tag}`}})} small />
            ))}
          </View>
        ) : null}
      </Pressable>

      <View style={styles.actions}>
        {/* The heart likes; the number opens who liked it, as on Instagram (holding the heart still works too).
            Each button is a full 44-point square (a browser has no hitSlop); the row gives the extra back at its ends. */}
        <View style={styles.like}>
          <Tappable onPress={like.toggle} onLongPress={() => { haptics.commit(); router.push({ pathname: '/likes', params: { id: post.id } }); }} scaleTo={0.8} style={[styles.action, post.likedBy.length + like.delta > 0 && styles.actionBeforeCount]} accessibilityLabel={like.on ? 'Unlike. Hold to see who liked it' : 'Like. Hold to see who liked it'}>
            <Heart liked={like.on} size={ICON} ink={colors.text} />
          </Tappable>
          {/* A count only once there is one, as on Instagram: no zeros. */}
          {post.likedBy.length + like.delta > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`${post.likedBy.length + like.delta} ${post.likedBy.length + like.delta === 1 ? 'like' : 'likes'}, see who`} onPress={() => router.push({ pathname: '/likes', params: { id: post.id } })} style={styles.count}>
              {(state) => (
                <Text style={[styles.actionText, (state as { hovered?: boolean }).hovered && styles.countHover]}>
                  {compactNumber(post.likedBy.length + like.delta)}
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>
        <Tappable onPress={onComment ?? onPress} scaleTo={0.8} style={styles.action} accessibilityLabel={post.commentIds.length ? `Comments, ${post.commentIds.length}` : 'Comments'}>
          <Ionicons name="chatbubble-outline" size={ICON - 1} color={colors.text} />
          {post.commentIds.length ? <Text style={styles.actionText}>{compactNumber(post.commentIds.length)}</Text> : null}
        </Tappable>
        {onShare ? (
          <Tappable onPress={onShare} scaleTo={0.8} style={styles.action} accessibilityLabel="Send this post to someone">
            <Ionicons name="arrow-redo-outline" size={ICON} color={colors.text} />
            {post.shares ? <Text style={styles.actionText}>{compactNumber(post.shares)}</Text> : null}
          </Tappable>
        ) : null}
        {onToggleSave || onMore ? (
          <View style={styles.actionsEnd}>
            {onToggleSave ? (
              <Tappable
                onPress={onToggleSave}
                scaleTo={0.8}
                style={styles.action}
                accessibilityLabel={saved ? 'Remove from saved' : 'Save this post'}
              >
                <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={ICON - 1} color={colors.text} />
              </Tappable>
            ) : null}
            {onMore ? (
              <Tappable onPress={onMore} scaleTo={0.8} style={styles.action} accessibilityLabel="More options">
                <Ionicons name="ellipsis-horizontal" size={ICON - 2} color={colors.text} />
              </Tappable>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* The comments, a still preview in whatever room is left (they give way first when the page is short),
          then "Add a comment…" on the page's bottom edge, just above the tab bar, the way Threads keeps its
          reply line: so a post with no comments yet ends where every post ends, not halfway down. Replies stay folded here. */}
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
      {/* A short post's room goes under its comment line (and holds `under`); any other post's above it, so the line sits on the page's bottom edge. */}
      {short ? null : roomBox}
      <Pressable accessibilityRole="button" accessibilityLabel="Add a comment" onPress={() => router.push({ pathname: '/comments', params: { kind: 'post', id: post.id, focus: '1' } })} style={({ pressed }) => [styles.addComment, room === null && styles.addCommentWait, pressed && styles.addCommentPressed]}>
        {currentUser ? <Avatar name={currentUser.name} seed={currentUser.avatarSeed} uri={currentUser.avatarUrl} size={28} /> : null}
        <Text style={styles.addCommentText}>{thread.length ? 'Add a comment…' : 'Be the first to comment…'}</Text>
      </Pressable>
      {short ? roomBox : null}
    </Card>
  );
}

const styleDefinitions = StyleSheet.create({
  // In the feed the card fills a page of fixed height. It never overflows:
  // the comments give way first, then the words, so the row of buttons is
  // never sliced through the middle. No rules round it: the page is its edge.
  card: { flex: 1, gap: spacing.md, borderRadius: 0, borderWidth: 0, paddingHorizontal: 0, paddingBottom: 0, backgroundColor: 'transparent', minHeight: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerText: { flex: 1, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { ...typography.bodyStrong, color: colors.text, flexShrink: 1 },
  // The handle's line: "New to CourtSide" goes on to the next line when it doesn't fit beside it.
  subRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.sm, rowGap: spacing.xs },
  sub: { ...typography.small, color: colors.textFaint, flexShrink: 1 },
  body: { gap: spacing.md, flexShrink: 1, minHeight: 0, overflow: 'hidden' },
  // Pictures round off like the feed's photo posts.
  photo: { width: '100%', aspectRatio: 1, borderRadius: radius.lg },
  video: { width: '100%', borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' },
  cardSlot: { width: '100%', alignItems: 'center', justifyContent: 'center', flexShrink: 6, minHeight: 0, overflow: 'hidden' },
  cardWait: { aspectRatio: 4 / 5 },
  kindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  // The court is narrower than an icon: as wide as one, so the label sits where it always did.
  kindGlyph: { width: 13, alignItems: 'center' },
  kindLabel: { ...typography.caption, fontSize: 12, letterSpacing: 0 },
  text: { ...typography.body, color: colors.text, lineHeight: 22 },
  detailBox: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  detailTitle: { ...typography.smallStrong, color: colors.text },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  setChip: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  setText: { ...typography.smallStrong, color: colors.text },
  surfaceText: { ...typography.caption, color: colors.textFaint },
  drill: { ...typography.small, color: colors.textMuted, lineHeight: 20 },
  // A written plan's drills, under its session box.
  planned: { gap: spacing.xs },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // Instagram's row, as under a photo post: like, comment and send on the left, save and more on the
  // right, 18 points between glyphs. Each is a 44-point square; the row is pulled out by the padding
  // at its ends (and up and down) so the first and last glyphs sit on the words' edges.
  actions: { flexDirection: 'row', alignItems: 'center', marginHorizontal: -9, marginVertical: -6 },
  action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, minWidth: 44, paddingHorizontal: 9 },
  like: { flexDirection: 'row', alignItems: 'center' },
  actionBeforeCount: { paddingRight: 3 },
  count: { minHeight: 44, justifyContent: 'center', paddingLeft: 3, paddingRight: 9 },
  // Save and the ••• on the right, as under a photo post.
  actionsEnd: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center' },
  actionText: { ...typography.bodyStrong, fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
  countHover: { textDecorationLine: 'underline' },
  // Gives way before anything else on the page when it is short.
  thread: { flexGrow: 0, flexShrink: 1000, minHeight: 0 },
  threadInner: { gap: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  // On the page's bottom edge (the room above it takes up whatever is left), or right under a short post.
  addComment: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  // Until the room is measured, so it never shows at the bottom and then jumps up under a short post.
  addCommentWait: { opacity: 0 },
  addCommentPressed: { opacity: 0.7 },
  // Whatever the page leaves empty, and no more: its size never comes from what it holds (a find-players
  // card that no longer fits is cut off, never pushing the post up). Its negative margin takes back the card's gap.
  room: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0, marginTop: -spacing.md, overflow: 'hidden' },
  addCommentText: { ...typography.body, color: colors.textFaint, flex: 1 },
});

/** Re-renders only when a shown value changes; the handlers passed in read fresh values through their own props, so a new function alone is no reason to rebuild. */
export const PostCard = memo(PostCardInner, (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = (a as Record<string, unknown>)[k]; const y = (b as Record<string, unknown>)[k];
    if (typeof x === 'function' && typeof y === 'function') continue;
    if (x !== y) return false;
  }
  return true;
});

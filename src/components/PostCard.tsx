import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlaceLine } from '@/components/PlaceLine';
import { TaggedLine } from '@/components/TaggedLine';
import React, { useEffect, useState, memo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { router } from 'expo-router';
import * as haptics from '@/lib/haptics';
import Ionicons from '@expo/vector-icons/Ionicons';

import { ClipVideo } from '@/components/ClipVideo';
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
/** The buttons' one size, the same set as under a photo post. */
const ICON = 24;

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
}: Props) {
  const styles = useThemedStyles(styleDefinitions);
  const { blockedIds, currentUserId } = useApp();
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
            {isNewHere(post) ? <NewHereTag /> : null}
          </View>
          <Text style={styles.sub} numberOfLines={1}>
            @{author.handle} · {relativeTime(post.createdAt)}
          </Text>
          {/* Where, on its own line under the name, as Instagram sets it: the whole place, a tap opens the court. */}
          <PlaceLine court={post.court} location={post.location} />
        </View>
        <LevelPill profile={author.profile} small />
      </Pressable>

      {post.imageUrl && <ExpoImage accessibilityLabel={post.mediaLabel ?? "Post photo"} source={{uri:post.imageUrl}} style={styles.photo} contentFit="cover" cachePolicy="memory-disk"/>}
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
        {/* The heart likes; the number opens who liked it, as on Instagram (holding the heart still works too). */}
        <View style={styles.action}>
          <Tappable onPress={like.toggle} onLongPress={() => { haptics.commit(); router.push({ pathname: '/likes', params: { id: post.id } }); }} scaleTo={0.8} hitSlop={8} accessibilityLabel={like.on ? 'Unlike' : 'Like'}>
            <Ionicons
              name={like.on ? 'heart' : 'heart-outline'}
              size={ICON}
              color={like.on ? colors.danger : colors.textMuted}
            />
          </Tappable>
          {/* A count only once there is one, as on Instagram: no zeros. */}
          {post.likedBy.length + like.delta > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="See who liked this" hitSlop={8} onPress={() => router.push({ pathname: '/likes', params: { id: post.id } })} style={styles.countHit}>
              {(state) => (
                <Text style={[styles.actionText, like.on && { color: colors.danger }, (state as { hovered?: boolean }).hovered && styles.countHover]}>
                  {compactNumber(post.likedBy.length + like.delta)}
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>
        <Tappable onPress={onComment ?? onPress} scaleTo={0.8} style={styles.action} accessibilityLabel="Comments">
          <Ionicons name="chatbubble-outline" size={ICON - 1} color={colors.textMuted} />
          {post.commentIds.length ? <Text style={styles.actionText}>{compactNumber(post.commentIds.length)}</Text> : null}
        </Tappable>
        {onShare ? (
          <Tappable onPress={onShare} scaleTo={0.8} style={styles.action} accessibilityLabel="Share this post">
            <Ionicons name="arrow-redo-outline" size={ICON} color={colors.textMuted} />
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
                <Ionicons
                  name={saved ? 'bookmark' : 'bookmark-outline'}
                  size={ICON - 1}
                  color={saved ? colors.brand : colors.textMuted}
                />
              </Tappable>
            ) : null}
            {onMore ? (
              <Tappable onPress={onMore} scaleTo={0.8} hitSlop={6} style={styles.action} accessibilityLabel="More options">
                <Ionicons name="ellipsis-horizontal" size={ICON - 2} color={colors.textMuted} />
              </Tappable>
            ) : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styleDefinitions = StyleSheet.create({
  // In the feed the card sits in a page of fixed height. It shrinks rather
  // than overflowing, and the words below are what gives, so the row of
  // buttons is never sliced through the middle.
  card: { gap: spacing.md, borderRadius: 0, borderWidth: 0, borderBottomWidth: 1, paddingHorizontal: 0, paddingBottom: spacing.xl, backgroundColor: 'transparent', flexShrink: 1, minHeight: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerText: { flex: 1, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { ...typography.bodyStrong, color: colors.text, flexShrink: 1 },
  sub: { ...typography.small, color: colors.textFaint },
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
  actions: {
    flexDirection: 'row',
    gap: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 },
  // Save and the ••• on the right, as under a photo post.
  actionsEnd: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  actionText: { ...typography.bodyStrong, fontSize: 14, color: colors.textMuted },
  // Browsers ignore hitSlop, so on a computer the number gets a real, bigger click area (without moving anything) and underlines on hover.
  countHit: Platform.OS === 'web' ? ({ padding: 8, margin: -8, cursor: 'pointer' } as object) : {},
  countHover: { textDecorationLine: 'underline' },
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

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { requestScrollToTop } from '@/features/navigation/scrollToTop';
import { router } from 'expo-router';
import { show as showToast } from '@/lib/toast';
import { requestSection } from '@/features/navigation/swipeOrder';
import { goToTab } from '@/features/navigation/startTab';
import { goBack, goHome } from '@/lib/goBack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image as ExpoImage } from 'expo-image';

import { Avatar, EmptyState, Screen } from '@/components/ui';
import { FollowPill } from '@/components/FollowPill';
import { BrandMark } from '@/components/BrandMark';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { confirmUnfollow } from '@/lib/confirm';
import type { Notification, NotificationKind, PostKind } from '@/data/types';
import { colors, radius, spacing, surfaceColorFor, typography } from '@/theme';
import { CourtGlyph } from '@/components/map/MapChrome';
import { isDesktopBrowser } from '@/lib/browserDevice';

/**
 * One row per thing that happened to you, the way Instagram does it.
 *
 * A like you have not seen yet gets its own row, so each new one is noticed.
 * Once seen, likes on the same thing fold into one line — "Sam, Alex and 12
 * others liked your clip" — and so do comments and the rest. Rows sit under
 * New, Today, This week, This month and Earlier. Opening the screen marks
 * everything read, but a row that was unread keeps its tint until you leave,
 * so you can still see what was new.
 */

const ICON: Record<NotificationKind, { name: keyof typeof Ionicons.glyphMap; tint: keyof typeof colors }> = {
  like: { name: 'heart', tint: 'danger' },
  comment: { name: 'chatbubble', tint: 'info' },
  'comment-reply': { name: 'chatbubble-ellipses', tint: 'info' },
  answer: { name: 'chatbubbles', tint: 'info' },
  'coach-reply': { name: 'shield-checkmark', tint: 'brand' },
  helpful: { name: 'ribbon', tint: 'warning' },
  share: { name: 'arrow-redo', tint: 'court' },
  follow: { name: 'person-add', tint: 'brand' },
  tag: { name: 'pricetag', tint: 'court' },
  'follow-request': { name: 'lock-closed', tint: 'brand' },
  'follow-accepted': { name: 'checkmark-done', tint: 'success' },
  posted: { name: 'checkmark', tint: 'success' },
  'coach-application': { name: 'ribbon', tint: 'brand' },
  report: { name: 'flag', tint: 'warning' },
  booking: { name: 'calendar', tint: 'brand' },
  'coach-answer': { name: 'shield-checkmark', tint: 'brand' },
  refund: { name: 'return-down-back', tint: 'success' },
  upvote: { name: 'arrow-up', tint: 'brand' },
  'upvote-reply': { name: 'arrow-up', tint: 'brand' },
  milestone: { name: 'flame', tint: 'warning' },
  joined: { name: 'hand-right', tint: 'court' },
  'hit-join': { name: 'tennisball', tint: 'brand' },
  'hit-match': { name: 'people', tint: 'brand' },
  activity: { name: 'tennisball', tint: 'court' },
};

const VERB: Record<NotificationKind, string> = {
  like: 'liked your post',
  comment: 'commented on your post',
  'comment-reply': 'replied to your comment',
  answer: 'answered your question',
  'coach-reply': 'replied to your question',
  helpful: 'found your reply helpful',
  share: 'shared your post',
  follow: 'started following you',
  tag: 'tagged you in a post',
  'follow-request': 'asked to follow you',
  'follow-accepted': 'accepted your follow request',
  posted: 'is live',
  'coach-application': 'updated your coach application',
  report: 'sent a report',
  booking: 'booked you',
  'coach-answer': 'answered your booking',
  refund: 'refunded a booking',
  upvote: 'upvoted your thread',
  'upvote-reply': 'upvoted your reply',
  milestone: 'just passed',
  joined: 'just joined CourtSide near you',
  'hit-join': 'is in for your hit',
  'hit-match': 'is also looking for a hit',
  activity: 'Tap to log it.',
};

interface Group {
  key: string;
  section: string;
  kind: NotificationKind;
  targetId: string;
  targetKind: Notification['targetKind'];
  actorIds: string[];
  createdAt: string;
  preview?: string;
  unread: boolean;
}

function routeFor(group: Group): string {
  // A tennis session a tracker picked up opens the log sheet, filled in from it.
  if (group.kind === 'activity') return `/log-session?activity=${group.targetId}`;
  // A coach application update opens the application, which shows where it stands.
  if (group.kind === 'coach-application') return '/coach-apply';
  // Anything about a booking opens the booking.
  if (group.targetKind === 'coaching-request') return `/coach-request/${group.targetId}`;
  // A report opens the admin's Reports screen.
  if (group.kind === 'report') return '/admin-reports';
  // Your own "it's up" note takes you to the feed, where the new thing sits first.
  if (group.kind === 'posted') return group.targetKind === 'question' ? `/question/${group.targetId}` : '/';
  // A follow of any kind opens the person, not a post.
  if (group.kind === 'follow' || group.kind === 'follow-request' || group.kind === 'follow-accepted' || group.kind === 'joined') return `/user/${group.actorIds[0]}`;
  if (group.targetKind === 'post') return `/post/${group.targetId}`;
  if (group.targetKind === 'hit') return `/hits/${group.targetId}`;
  if (group.targetKind === 'hit-request') return `/hit-request/${group.targetId}`;
  if (group.targetKind === 'question') return `/question/${group.targetId}`;
  return `/coach-question/${group.targetId}`;
}

/** Which heading a row sits under: new ones first, then by how long ago. */
function sectionFor(unread: boolean, at: string): string {
  if (unread) return 'New';
  const now = new Date();
  const then = new Date(at);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (then.getTime() >= startOfToday) return 'Today';
  const days = (now.getTime() - then.getTime()) / 86_400_000;
  if (days < 7) return 'This week';
  if (days < 31) return 'This month';
  return 'Earlier';
}
const SECTIONS = ['New', 'Today', 'This week', 'This month', 'Earlier'];

export default function Notifications() {
  const styles = useThemedStyles(styleDefinitions);
  const { notifications, users, posts, stories, comments, hitRequests, conversations, currentUserId, followRequests, followingIds, actions } = useApp();
  // "Replied to your comment" opens the comments at that reply, its thread
  // unfolded. The reply is the one by that person on that post with the same
  // words (the notification keeps them), else the nearest in time. A post or
  // Instant not loaded here opens on its own page instead, which fetches it.
  const replyAt = (group: Group): { kind: 'post' | 'hit'; id: string; at?: string } | null => {
    if (group.kind !== 'comment-reply') return null;
    const kind = group.targetKind === 'hit' ? 'hit' : 'post';
    if (!(kind === 'hit' ? stories.some((st) => st.id === group.targetId) : posts.some((p) => p.id === group.targetId))) return null;
    const flat = (text: string) => { const f = text.replace(/\s+/g, ' ').trim(); return f.length > 80 ? `${f.slice(0, 79)}…` : f; };
    const when = Date.parse(group.createdAt);
    const theirs = comments.filter((c) => c.postId === group.targetId && c.authorId === group.actorIds[0] && c.parentId);
    const reply = theirs.find((c) => group.preview !== undefined && flat(c.body) === group.preview)
      ?? [...theirs].sort((a, b) => Math.abs(Date.parse(a.createdAt) - when) - Math.abs(Date.parse(b.createdAt) - when))[0];
    return { kind, id: group.targetId, ...(reply ? { at: reply.id } : {}) };
  };
  // Someone is in for your hit: the hit's group chat, when it is here to open.
  const hitChatFor = (group: Group): string | undefined => {
    if (group.kind !== 'hit-join') return undefined;
    const chat = hitRequests.find((h) => h.id === group.targetId)?.conversationId;
    return chat && conversations.some((c) => c.id === chat) ? chat : undefined;
  };
  // "liked your clip", "liked your photo": the verb names what was liked, not just "post".
  const verbFor = (group: Group) => {
    if (group.kind === 'milestone') return `just passed ${group.preview ?? 'a milestone'}`;
    // A kind this build does not know yet (a newer server) still reads as a sentence.
    if (group.kind !== 'like' && group.kind !== 'comment' && group.kind !== 'share') return VERB[group.kind] ?? 'updated';
    const act = group.kind === 'like' ? 'liked' : group.kind === 'comment' ? 'commented on' : 'shared';
    if (group.targetKind === 'hit') return `${act} your instant`;
    if (group.targetKind === 'question') return `${act} your thread`;
    const post = posts.find((p) => p.id === group.targetId);
    const thing = !post ? 'post' : post.kind === 'clip' ? 'clip' : post.videoUrl ? 'video' : post.imageUrl ? 'photo' : 'post';
    return `${act} your ${thing}`;
  };

  const mine = useMemo(
    () => notifications.filter((n) => n.userId === currentUserId),
    [notifications, currentUserId],
  );

  // Snapshot on first render so rows do not lose their tint as we mark them read.
  const groups = useMemo<Group[]>(() => {
    const byTarget = new Map<string, Group>();
    for (const n of [...mine].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )) {
      // Follows are one row per person, never bundled. A like not yet seen is
      // its own row too; once seen it folds in with the other likes on that thing.
      // The way Instagram's inbox reads: every comment, reply, mention and
      // answer is its own row, with its words; likes (and upvotes and views)
      // on one thing fold together, but only within the same day, so a post
      // still getting likes keeps turning up fresh.
      const day = new Date(n.createdAt).toDateString();
      const key = n.kind === 'follow' || n.kind === 'follow-request' || n.kind === 'follow-accepted'
        ? `${n.kind}:${n.actorId}`
        : n.kind === 'like' || n.kind === 'upvote' || n.kind === 'share' || n.kind === 'helpful'
          ? (!n.read ? `${n.kind}-new:${n.targetKind}:${n.targetId}:${day}` : `${n.kind}:${n.targetKind}:${n.targetId}:${day}`)
          : `one:${n.id}`;
      const existing = byTarget.get(key);
      if (existing) {
        if (!existing.actorIds.includes(n.actorId)) existing.actorIds.push(n.actorId);
        existing.unread = existing.unread || !n.read;
        continue;
      }
      byTarget.set(key, {
        key,
        section: sectionFor(!n.read, n.createdAt),
        kind: n.kind,
        targetId: n.targetId,
        targetKind: n.targetKind,
        actorIds: [n.actorId],
        createdAt: n.createdAt,
        // The server's stand-in for an Instant with no caption; the row already says what it was.
        preview: n.preview === 'your hit' ? undefined : n.preview,
        unread: !n.read,
      });
    }
    return [...byTarget.values()].sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
    // Deliberately keyed on length only: re-grouping as rows are marked read
    // would wipe the tint mid-view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine.length, followRequests.length]);

  // The post each row is about, small on the right the way Instagram's inbox
  // shows it, so "liked your clip" says which clip. Posts the app hasn't
  // loaded (older ones) are asked for once, just their picture.
  // null: asked, and the post is gone (deleted, or never there), so the row shows no picture.
  const [thumbs, setThumbs] = useState<Record<string, { thumb?: string; kind: PostKind } | null>>({});
  useEffect(() => {
    const missing = [...new Set(groups.filter((g) => g.targetKind === 'post' && !posts.some((p) => p.id === g.targetId) && !(g.targetId in thumbs)).map((g) => g.targetId))];
    if (!missing.length) return;
    let on = true;
    void actions.loadPostThumbs(missing).then((found) => {
      if (on) setThumbs((t) => ({ ...t, ...Object.fromEntries(missing.map((id) => [id, found[id] ?? null])) }));
    });
    return () => { on = false; };
  }, [groups, posts, actions]); // eslint-disable-line react-hooks/exhaustive-deps
  const thumbFor = (group: Group): { uri?: string; clip: boolean; words: boolean; seed: string } | null => {
    const seed = group.targetId;
    if (group.targetKind === 'post') {
      const p = posts.find((x) => x.id === group.targetId);
      if (p) return { uri: p.thumbnailUrl ?? p.imageUrl, clip: p.kind === 'clip', words: p.kind === 'note' && !p.imageUrl && !p.videoUrl, seed };
      const t = thumbs[group.targetId];
      return t ? { uri: t.thumb, clip: t.kind === 'clip', words: t.kind === 'note' && !t.thumb, seed } : null;
    }
    if (group.targetKind === 'hit') {
      const st = stories.find((x) => x.id === group.targetId);
      return st ? { uri: st.thumbnailUrl ?? st.imageUrl, clip: !!st.videoUrl, words: false, seed } : null;
    }
    return null;
  };

  useEffect(() => {
    actions.markNotificationsRead();
  }, [actions]);

  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? 'Someone';
  const photoOf = (id: string) => users.find((u) => u.id === id)?.avatarUrl;

  return (
    <Screen title="Notifications" compactTitle onBack={() => goBack()} onRefresh={isDesktopBrowser() ? undefined : actions.refresh}>
      {groups.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="Nothing yet"
          body="Likes, replies and shares on your posts land here. Following players is the quickest way to get some."
          action={{ label: 'Find players near you', onPress: () => { requestSection('/discuss', 'players'); goToTab('/discuss'); } }}
        />
      ) : (
        <View style={styles.list}>
          {groups.map((group, index) => {
            const icon = ICON[group.kind] ?? { name: 'notifications', tint: 'brand' };
            const [first, ...rest] = group.actorIds;
            const who =
              group.kind === 'milestone'
                ? (posts.find((p) => p.id === group.targetId)?.kind === 'clip' ? 'Your clip' : 'Your post')
                : group.kind === 'posted'
                ? (group.preview?.startsWith('Instant') || group.preview?.startsWith('Hit')) ? 'Your instant' : group.targetKind === 'question' ? 'Your question' : 'Your post'
                : group.kind === 'coach-application' || group.kind === 'refund' ? 'CourtSide'
                : group.kind === 'activity' ? 'Tennis detected.'
                : rest.length === 0
                ? nameOf(first)
                : rest.length === 1
                  ? `${nameOf(first)} and ${nameOf(rest[0])}`
                  : `${nameOf(first)}, ${nameOf(rest[0])} and ${rest.length - 1} ${rest.length - 1 === 1 ? 'other' : 'others'}`;
            const heading = index === 0 || groups[index - 1].section !== group.section ? group.section : null;
            const thumb = thumbFor(group);
            const hitChat = hitChatFor(group);

            return (
              <React.Fragment key={group.key}>
              {heading ? <Text style={[styles.heading, index > 0 && { marginTop: spacing.lg }]}>{heading}</Text> : null}
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${who} ${verbFor(group)}`}
                onPress={() => {
                  const reply = replyAt(group);
                  if (reply) { router.push({ pathname: '/comments', params: reply }); return; }
                  const to = routeFor(group);
                  // "Clip posted" and the like open Home: goHome closes this page down to the
                  // tabs. Never '/', the splash screen's address too, which opened a second app on top.
                  if (to === '/') { goHome(); requestScrollToTop('/'); } else router.push(to);
                }}
                style={[styles.row, group.unread && styles.rowUnread]}
              >
                <View>
                  {/* Two faces, overlapped, when more than one person did it. */}
                  {group.kind === 'coach-application' || group.kind === 'refund' || group.kind === 'activity' ? (
                    // From CourtSide itself: the mark, not a person's face.
                    <View style={styles.brandFace}><BrandMark size={24} /></View>
                  ) : rest.length ? (
                    <View style={styles.pair}>
                      <View style={styles.pairBack}><Avatar name={nameOf(rest[0])} seed={rest[0]} uri={photoOf(rest[0])} size={32} /></View>
                      <View style={styles.pairFront}><Avatar name={nameOf(first)} seed={first} uri={photoOf(first)} size={32} /></View>
                    </View>
                  ) : <Avatar name={nameOf(first)} seed={first} uri={photoOf(first)} size={44} />}
                  <View style={[styles.badge, { backgroundColor: colors[icon.tint] }]}>
                    <Ionicons name={icon.name} size={11} color={colors.brandInk} />
                  </View>
                </View>

                <View style={styles.body}>
                  <Text style={styles.text}>
                    <Text style={styles.who}>{who}</Text>
                    <Text> {verbFor(group)}</Text>
                  </Text>
                  {group.preview && group.kind !== 'milestone' ? (
                    <Text style={styles.preview} numberOfLines={1}>
                      {group.preview}
                    </Text>
                  ) : null}
                  <Text style={styles.time}>{relativeTime(group.createdAt)}</Text>
                  {group.kind === 'follow-request' && followRequests.some((r) => r.fromId === first && r.toId === currentUserId) ? (
                    <View style={styles.askRow}>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Accept ${nameOf(first)}`} onPress={() => actions.acceptFollowRequest(first)} style={styles.accept}><Text style={styles.acceptText}>Accept</Text></Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Decline ${nameOf(first)}`} onPress={() => actions.declineFollowRequest(first)} style={styles.decline}><Text style={styles.declineText}>Decline</Text></Pressable>
                    </View>
                  ) : null}
                </View>

                {/* Follow back, right from the row, the way Instagram's inbox does it. */}
                {group.kind === 'hit-match' && first && first !== currentUserId ? (
                  // Someone after the same game: the message is one tap away.
                  <Pressable accessibilityRole="button" accessibilityLabel={`Message ${nameOf(first)}`} onPress={async () => {
                    // Locked (checked with the server first), it says why in a note that stays to be read.
                    const lock = await actions.messageLock(first);
                    if (lock) { showToast({ title: lock, icon: 'lock-closed-outline', long: true }); return; }
                    router.push(`/messages/${actions.openConversationWith(first)}`);
                  }} style={styles.accept}><Text style={styles.acceptText}>Message</Text></Pressable>
                ) : hitChat ? (
                  // In for your hit: straight to the hit's group chat, where the details get sorted.
                  <Pressable accessibilityRole="button" accessibilityLabel="Open the hit's chat" onPress={() => router.push(`/messages/${hitChat}`)} style={styles.accept}><Text style={styles.acceptText}>Chat</Text></Pressable>
                ) : (group.kind === 'follow' || group.kind === 'joined') && first && first !== currentUserId ? (
                  <FollowPill small following={followingIds.includes(first)} userId={first} onPress={() => { const who = users.find((u) => u.id === first); if (who && followingIds.includes(first)) confirmUnfollow(who, () => actions.toggleFollow(first)); else actions.toggleFollow(first); }} name={nameOf(first).split(' ')[0]} />
                ) : thumb ? (
                  <View style={[styles.thumb, !thumb.uri && !thumb.words && { backgroundColor: surfaceColorFor(thumb.seed) }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    {thumb.uri ? <ExpoImage source={{ uri: thumb.uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={120} />
                      // A post that is only words: a speech mark where a picture would be.
                      : thumb.words ? <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.textMuted} />
                      // A photo or clip with no picture yet: the tinted court tile the app uses everywhere for that.
                      : <CourtGlyph size={14} color={colors.brandInk} />}
                    {thumb.clip ? <View style={styles.thumbPlay}><Ionicons name="play" size={8} color="#fff" /></View> : null}
                  </View>
                ) : group.unread ? <View style={styles.dot} /> : null}
              </Pressable>
              </React.Fragment>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  list: { gap: 2 },
  brandFace: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandDim },
  heading: { ...typography.smallStrong, color: colors.text, paddingHorizontal: spacing.sm, paddingBottom: spacing.xs },
  pair: { width: 44, height: 44 },
  pairBack: { position: 'absolute', right: 0, top: 0 },
  pairFront: { position: 'absolute', left: 0, bottom: 0, borderRadius: 18, borderWidth: 2, borderColor: colors.bg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  rowUnread: { backgroundColor: colors.brandDim },
  badge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 19,
    height: 19,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  body: { flex: 1, gap: 2 },
  text: { ...typography.small, color: colors.text, lineHeight: 19 },
  who: { ...typography.smallStrong, color: colors.text },
  preview: { ...typography.small, color: colors.textMuted },
  time: { ...typography.caption, color: colors.textFaint },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  // Square like Instagram's, rounded like everything else here.
  thumb: { width: 44, height: 44, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  thumbPlay: { position: 'absolute', right: 3, bottom: 3, width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  askRow: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.xs },
  accept: { paddingHorizontal: spacing.lg, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.brand },
  acceptText: { ...typography.smallStrong, color: colors.brandInk },
  decline: { paddingHorizontal: spacing.lg, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  declineText: { ...typography.smallStrong, color: colors.text },
});

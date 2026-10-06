import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { requestScrollToTop } from '@/features/navigation/scrollToTop';
import { router } from 'expo-router';
import { show as showToast } from '@/lib/toast';
import { requestSection } from '@/features/navigation/swipeOrder';
import { goToTab } from '@/features/navigation/startTab';
import { goBack, goHome } from '@/lib/goBack';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar, EmptyState, Screen } from '@/components/ui';
import { FollowPill } from '@/components/FollowPill';
import { TileCover } from '@/components/TileCover';
import { BrandMark } from '@/components/BrandMark';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { duration, relativeTime } from '@/lib/format';
import { shortDay } from '@/features/activity/format';
import { tagState, yourResult } from '@/features/activity/sessionTags';
import { useApp } from '@/store/AppContext';
import { confirmUnfollow } from '@/lib/confirm';
import type { Notification, NotificationKind, PostKind } from '@/data/types';
import { colors, radius, spacing, surfaceColorFor, typography } from '@/theme';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { HitGlyph } from '@/components/HitGlyph';
import { showCourtOnMap } from '@/features/players/courtLink';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { notKnownAdult } from '@/features/players/age';
import { useWelcomeNote } from '@/features/welcome/welcomeNote';
import { useMapLead } from '@/features/tour/mapLead';
import { FRIENDS_LINE } from '@/features/invite/friendsWords';

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

// 'hit' is the app's own hit mark (HitGlyph), the one the map, the hit cards and Settings use.
const ICON: Record<NotificationKind, { name: keyof typeof Ionicons.glyphMap | 'hit'; tint: keyof typeof colors }> = {
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
  removed: { name: 'eye-off', tint: 'danger' },
  booking: { name: 'calendar', tint: 'brand' },
  'coach-answer': { name: 'shield-checkmark', tint: 'brand' },
  refund: { name: 'return-down-back', tint: 'success' },
  upvote: { name: 'arrow-up', tint: 'brand' },
  'upvote-reply': { name: 'arrow-up', tint: 'brand' },
  milestone: { name: 'flame', tint: 'warning' },
  joined: { name: 'hand-right', tint: 'court' },
  'hit-join': { name: 'hit', tint: 'brand' },
  'hit-match': { name: 'hit', tint: 'brand' },
  'hit-invite': { name: 'hit', tint: 'brand' },
  // The outline: filled, the dial closes up at badge size.
  activity: { name: 'stopwatch-outline', tint: 'court' },
  'map-friend-hit': { name: 'hit', tint: 'brand' },
  'map-new-hit': { name: 'navigate', tint: 'brand' },
  'map-new-player': { name: 'location', tint: 'court' },
  // The court's own heart: the one you tapped to follow it.
  'court-activity': { name: 'heart', tint: 'court' },
  'session-tag': { name: 'pricetag', tint: 'court' },
};
// The hit mark fills the badge's inside (19 less its 2pt rim on each side), drawn bold for that size.
const HIT_BADGE = 14;

/** The line the server puts on the follow an invite makes (migration 68): said in the verb, not again under it. */
const INVITE_LINE = 'Joined CourtSide from your link';

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
  // The words come from the row's preview (migration 108); see verbFor.
  removed: 'removed something of yours',
  booking: 'booked you',
  'coach-answer': 'answered your booking',
  refund: 'refunded a booking',
  upvote: 'upvoted your thread',
  'upvote-reply': 'upvoted your reply',
  milestone: 'just passed',
  joined: 'just joined CourtSide near you',
  'hit-join': 'is in for your hit',
  'hit-match': 'is also looking for a hit',
  'hit-invite': 'invited you to hit',
  activity: 'Tap to log it.',
  'map-friend-hit': 'is up for a hit today',
  'map-new-hit': 'posted an open hit near you',
  'map-new-player': 'is new and shared their spot near you',
  'court-activity': 'posted at a court you follow',
  // "in a match" or "in a practice" comes from the row's preview (migration 62); see verbFor.
  'session-tag': 'tagged you in a session',
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
  // The map's alerts open the map: on the player, or on the hit with its card up.
  if (group.kind === 'map-friend-hit' || group.kind === 'map-new-player') return `/map?user=${group.actorIds[0]}`;
  if (group.kind === 'map-new-hit') return `/map?hit=${group.targetId}`;
  // A tennis session a tracker picked up opens a new post with it on: post it, or just log it.
  if (group.kind === 'activity') return `/compose?activity=${group.targetId}`;
  // Tagged in someone's session: the tag's sheet (its target is their session).
  if (group.kind === 'session-tag') return `/session-tag?session=${group.targetId}`;
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

/**
 * The server's notice for something of yours taken down (migration 108),
 * "Your clip was removed for breaking CourtSide's rules: Violence or
 * weapons.", in its two parts: what it was, and the reason (none for
 * "something else").
 */
function removedNotice(preview: string | undefined): { thing: string; reason?: string } {
  const m = /^Your (.+?) was removed for breaking CourtSide.s rules(?:: (.+?))?\.?$/.exec((preview ?? '').trim());
  return m ? { thing: m[1], reason: m[2] } : { thing: 'post' };
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

/**
 * The server writes a session's length the long way ("1 hr 24 min · from
 * your WHOOP", migration 58, also the lock-screen alert's words); the row
 * says it the way the rest of the app does now ("1h 24m · from your WHOOP").
 * Since migration 107 the length can come after a workout's name or a day
 * ("Run · 32 min · …", "Tue · 1 hr 24 min · …"), so it is found anywhere.
 */
function shortLength(preview: string): string {
  return preview
    .replace(/\b(\d+) hr (\d+) min\b/, '$1h $2m')
    .replace(/\b(\d+) hr\b/, '$1h')
    .replace(/\b(\d+) min\b/, '$1m');
}

/**
 * "Tennis detected." or "Activity detected." (owner, Oct 5) for a row about a
 * session a tracker picked up. The session itself says, when the app holds it;
 * otherwise the row's own words do: a workout's start with its name ("Run ·
 * 32 min · …", migration 107), tennis's with its length or a weekday.
 */
function detectedWho(preview: string | undefined, sport: string | undefined): string {
  if (sport) return sport === 'tennis' ? 'Tennis detected.' : 'Activity detected.';
  const first = (preview ?? '').split(' · ')[0]?.trim() ?? '';
  if (!first || /^\d/.test(first) || /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/.test(first)) return 'Tennis detected.';
  return 'Activity detected.';
}

export default function Notifications() {
  const styles = useThemedStyles(styleDefinitions);
  const { notifications, users, posts, stories, comments, hitRequests, conversations, questions, currentUserId, currentUser, followRequests, followingIds, followedCourts, sessionTags, detectedActivities, actions, blockedIds } = useApp();
  // CourtSide's own welcome, for a new player (welcomeNote): seen once this page opens, though its tint stays until you leave.
  const welcome = useWelcomeNote(currentUser);
  const [welcomeTint] = useState(welcome.unread);
  const { markSeen: markWelcomeSeen } = welcome;
  useEffect(() => { if (welcome.shown) markWelcomeSeen(); }, [welcome.shown]); // eslint-disable-line react-hooks/exhaustive-deps
  // The welcome's one next step: what the map page leads with right now (mapLead.ts).
  const mapLead = useMapLead();
  const findPlayers = () => { requestSection('/discuss', 'players'); goToTab('/discuss'); };
  // A teen's line is the same sentence as their friends card (friendsWords); the button is the
  // short verb, so that sentence fits on two lines beside it.
  const welcomeStep = currentUser && notKnownAdult(currentUser)
    ? { line: FRIENDS_LINE, label: 'Add friends', go: findPlayers }
    : mapLead === 'invite'
      ? { line: 'Bring the people you play with.', label: 'Invite', go: () => router.push('/invite') }
      : { line: 'See who plays near you.', label: 'Find players', go: findPlayers };
  // "New hit at Alder Park" opens the map on that court: where it is comes from the courts you follow.
  const courtRows = notifications.some((n) => n.kind === 'court-activity');
  useEffect(() => { if (courtRows && followedCourts === null) void actions.loadFollowedCourts(); }, [courtRows, followedCourts, actions]);
  const openFollowedCourt = (courtId: string) => {
    const c = followedCourts?.find((x) => x.courtId === courtId);
    if (c) showCourtOnMap({ id: c.courtId, name: c.name ?? 'Tennis courts', lat: c.lat, lng: c.lng });
    else router.push('/map');
  };
  // A tag of you, for an alert about one: what it was, from your side, and whether you have answered.
  const tagFor = (group: Group) => (group.kind === 'session-tag' ? sessionTags.find((t) => t.taggedId === currentUserId && t.sessionId === group.targetId) : undefined);
  // Which tag is being answered, and which way, so only that button spins.
  const [answering, setAnswering] = useState<{ id: string; accept: boolean } | null>(null);
  const answerTag = async (tagId: string, accept: boolean) => {
    if (answering) return;
    setAnswering({ id: tagId, accept });
    try {
      await actions.respondSessionTag(tagId, accept);
      showToast(accept ? { title: 'Tag accepted', body: 'It’s in your sessions too.', icon: 'checkmark-circle-outline' } : { title: 'Tag declined', body: 'Your name stays off their posts.', icon: 'close-circle-outline' });
    } catch (e) {
      showToast({ title: 'That didn’t go through', body: e instanceof Error ? e.message : undefined, icon: 'alert-circle-outline' });
    }
    setAnswering(null);
  };
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
    // From CourtSide: "removed your clip for breaking its rules"; the reason goes on the line under it.
    if (group.kind === 'removed') return `removed your ${removedNotice(group.preview).thing} for breaking its rules`;
    if (group.kind === 'session-tag') return `tagged you in a ${group.preview === 'match' ? 'match' : 'practice'}`;
    // A workout you have since logged: no longer "Tap to log it" (the tap opens the post for it).
    if (group.kind === 'activity' && detectedActivities.find((a) => a.id === group.targetId)?.status === 'logged') return 'Logged. Tap to post it.';
    // Someone who joined through a link you shared (migration 68).
    if (group.kind === 'follow' && group.preview === INVITE_LINE) return 'joined CourtSide from your link';
    if (group.kind === 'follow-request' && group.preview === INVITE_LINE) return 'joined CourtSide from your link and asked to follow you';
    // A tag in a thread reply is a mention in a thread, not in a post.
    if (group.kind === 'tag' && group.targetKind === 'question') return 'mentioned you in a thread';
    // An answer in someone else's thread was a reply to your reply there, not to your question.
    if (group.kind === 'answer') {
      const thread = questions.find((q) => q.id === group.targetId);
      if (thread && thread.authorId !== currentUserId) return 'replied to your reply';
    }
    // A kind this build does not know yet (a newer server) still reads as a sentence.
    if (group.kind !== 'like' && group.kind !== 'comment' && group.kind !== 'share') return VERB[group.kind] ?? 'updated';
    const act = group.kind === 'like' ? 'liked' : group.kind === 'comment' ? 'commented on' : 'shared';
    if (group.targetKind === 'hit') return `${act} your instant`;
    if (group.targetKind === 'question') return `${act} your thread`;
    const post = posts.find((p) => p.id === group.targetId);
    const thing = !post ? 'post' : post.kind === 'clip' ? 'clip' : post.videoUrl ? 'video' : post.imageUrl ? 'photo' : 'post';
    return `${act} your ${thing}`;
  };

  // Nothing from someone you blocked: their likes, follows and comments go with them.
  const mine = useMemo(
    () => notifications.filter((n) => n.userId === currentUserId && !blockedIds.includes(n.actorId)),
    [notifications, currentUserId, blockedIds],
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
        preview: n.preview === 'your hit' ? undefined : n.kind === 'activity' && n.preview ? shortLength(n.preview) : n.preview,
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

  // Anything that came in since the app last asked shows first (as new), then all of it counts as seen.
  // A slow connection never holds up the badge: after a moment it is all marked seen anyway, and again once the ask lands.
  useEffect(() => {
    const t = setTimeout(() => actions.markNotificationsRead(), 1500);
    void actions.catchUpNotifications().finally(() => { clearTimeout(t); actions.markNotificationsRead(); });
    return () => clearTimeout(t);
  }, [actions]);

  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? 'Someone';
  const photoOf = (id: string) => users.find((u) => u.id === id)?.avatarUrl;
  // The face's colours, the same as on their profile and in every sheet they open.
  const seedOf = (id: string) => users.find((u) => u.id === id)?.avatarSeed ?? id;

  return (
    <Screen title="Notifications" compactTitle onBack={() => goBack()} onRefresh={isDesktopBrowser() ? undefined : actions.refresh}>
      {welcome.shown && currentUser ? (
        // From CourtSide itself: who it is to, and one next step, the same one
        // the map leads with. A teen's friends (on Find Players, where their
        // friends card is; never the invite sheet's poster), the invite sheet
        // where nobody near an adult is on the map yet, else Find Players.
        <View style={[styles.row, welcomeTint && styles.rowUnread, groups.length ? styles.welcomeGap : null]}>
          <View style={styles.brandFace}><BrandMark size={24} /></View>
          <View style={styles.body}>
            <Text style={styles.who}>Welcome, {currentUser.name.split(' ')[0]}.</Text>
            <Text style={styles.preview} numberOfLines={2}>{welcomeStep.line}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={welcomeStep.label} onPress={welcomeStep.go} style={styles.accept}>
            <Text style={styles.acceptText}>{welcomeStep.label}</Text>
          </Pressable>
        </View>
      ) : null}
      {groups.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title={welcome.shown ? 'Nothing else yet' : 'Nothing yet'}
          body="Likes, replies and shares on your posts land here. Following players is the quickest way to get some."
          // The welcome above already offers the way on.
          action={welcome.shown ? undefined : { label: 'Find players near you', onPress: () => { requestSection('/discuss', 'players'); goToTab('/discuss'); } }}
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
                : group.kind === 'coach-application' || group.kind === 'refund' || group.kind === 'removed' ? 'CourtSide'
                : group.kind === 'activity' ? detectedWho(group.preview, detectedActivities.find((a) => a.id === group.targetId)?.sport)
                : rest.length === 0
                ? nameOf(first)
                : rest.length === 1
                  ? `${nameOf(first)} and ${nameOf(rest[0])}`
                  : `${nameOf(first)}, ${nameOf(rest[0])} and ${rest.length - 1} ${rest.length - 1 === 1 ? 'other' : 'others'}`;
            const heading = index === 0 || groups[index - 1].section !== group.section ? group.section : null;
            const thumb = thumbFor(group);
            const hitChat = hitChatFor(group);
            const tag = tagFor(group);

            return (
              <React.Fragment key={group.key}>
              {heading ? <Text style={[styles.heading, index > 0 && { marginTop: spacing.lg }]}>{heading}</Text> : null}
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${who} ${verbFor(group)}`}
                onPress={() => {
                  const reply = replyAt(group);
                  if (reply) { router.push({ pathname: '/comments', params: reply }); return; }
                  if (group.kind === 'court-activity') { openFollowedCourt(group.targetId); return; }
                  const to = routeFor(group);
                  // "Clip posted" and the like open Home: goHome closes this page down to the
                  // tabs. Never '/', the splash screen's address too, which opened a second app on top.
                  if (to === '/') { goHome(); requestScrollToTop('/'); } else router.push(to);
                }}
                style={[styles.row, group.unread && styles.rowUnread]}
              >
                <View>
                  {/* Two faces, overlapped, when more than one person did it. */}
                  {group.kind === 'coach-application' || group.kind === 'refund' || group.kind === 'activity' || group.kind === 'removed' ? (
                    // From CourtSide itself: the mark, not a person's face.
                    <View style={styles.brandFace}><BrandMark size={24} /></View>
                  ) : rest.length ? (
                    <View style={styles.pair}>
                      <View style={styles.pairBack}><Avatar name={nameOf(rest[0])} seed={seedOf(rest[0])} uri={photoOf(rest[0])} size={32} /></View>
                      <View style={styles.pairFront}><Avatar name={nameOf(first)} seed={seedOf(first)} uri={photoOf(first)} size={32} /></View>
                    </View>
                  ) : <Avatar name={nameOf(first)} seed={seedOf(first)} uri={photoOf(first)} size={44} />}
                  <View style={[styles.badge, { backgroundColor: colors[icon.tint] }]}>
                    {icon.name === 'hit'
                      ? <HitGlyph size={HIT_BADGE} color={colors.brandInk} rim={colors[icon.tint]} />
                      : <Ionicons name={icon.name} size={11} color={colors.brandInk} />}
                  </View>
                </View>

                <View style={styles.body}>
                  <Text style={styles.text}>
                    <Text style={styles.who}>{who}</Text>
                    <Text> {verbFor(group)}</Text>
                  </Text>
                  {group.kind === 'session-tag' ? (
                    // Where the tag stands first (the one thing that changes), then what it was from your side: "Declined · You won · Sep 30 · 1h 15m".
                    tag ? (
                      <Text style={styles.preview} numberOfLines={1}>
                        {[tagState(tag), yourResult(tag), shortDay(tag.day), duration(tag.minutes)].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null
                  ) : group.kind === 'removed' ? (
                    // The reason only: the whole sentence is already the row's words.
                    removedNotice(group.preview).reason ? (
                      <Text style={styles.preview} numberOfLines={2}>Reason: {removedNotice(group.preview).reason}</Text>
                    ) : null
                  ) : group.preview && group.kind !== 'milestone' && group.preview !== INVITE_LINE ? (
                    <Text style={styles.preview} numberOfLines={1}>
                      {group.preview}
                    </Text>
                  ) : null}
                  <Text style={styles.time}>{relativeTime(group.createdAt)}</Text>
                  {tag?.status === 'pending' && !tag.dropped ? (
                    <View style={styles.askRow}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Accept ${nameOf(first)}’s tag`}
                        accessibilityState={{ busy: answering?.id === tag.id && answering.accept, disabled: !!answering }}
                        disabled={!!answering}
                        onPress={() => { void answerTag(tag.id, true); }}
                        style={({ pressed }) => [styles.accept, styles.answerBox, (pressed || (!!answering && !(answering.id === tag.id && answering.accept))) && styles.answerDim]}
                      >
                        {answering?.id === tag.id && answering.accept ? <ActivityIndicator size="small" color={colors.brandInk} /> : <Text style={styles.acceptText}>Accept</Text>}
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Decline ${nameOf(first)}’s tag`}
                        accessibilityState={{ busy: answering?.id === tag.id && !answering.accept, disabled: !!answering }}
                        disabled={!!answering}
                        onPress={() => { void answerTag(tag.id, false); }}
                        style={({ pressed }) => [styles.decline, styles.answerBox, (pressed || (!!answering && !(answering.id === tag.id && !answering.accept))) && styles.answerDim]}
                      >
                        {answering?.id === tag.id && !answering.accept ? <ActivityIndicator size="small" color={colors.textMuted} /> : <Text style={styles.declineText}>Decline</Text>}
                      </Pressable>
                    </View>
                  ) : null}
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
                ) : (group.kind === 'follow' || group.kind === 'joined' || group.kind === 'map-new-player') && first && first !== currentUserId ? (
                  <FollowPill small following={followingIds.includes(first)} userId={first} onPress={() => { const who = users.find((u) => u.id === first); if (who && followingIds.includes(first)) confirmUnfollow(who, () => actions.toggleFollow(first)); else actions.toggleFollow(first); }} name={nameOf(first).split(' ')[0]} />
                ) : thumb ? (
                  <View style={[styles.thumb, !thumb.uri && !thumb.words && { backgroundColor: surfaceColorFor(thumb.seed) }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    {thumb.uri ? <TileCover uri={thumb.uri} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={120} />
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
  // The welcome sits above the sections, with a little air before the first heading.
  welcomeGap: { marginBottom: spacing.md },
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
  // A tag's Accept and Decline keep their width while one spins, and dim while pressed or while the other is going through.
  answerBox: { minWidth: 84, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  answerDim: { opacity: 0.6 },
  declineText: { ...typography.smallStrong, color: colors.text },
});

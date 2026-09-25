import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { requestScrollToTop } from '@/features/navigation/scrollToTop';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, EmptyState, Screen } from '@/components/ui';
import { BrandMark } from '@/components/BrandMark';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import type { Notification, NotificationKind } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

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
};

const VERB: Record<NotificationKind, string> = {
  like: 'liked your post',
  comment: 'commented on your post',
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
  // A coach application update opens the application, which shows where it stands.
  if (group.kind === 'coach-application') return '/coach-apply';
  // A report opens the admin's Reports screen.
  if (group.kind === 'report') return '/admin-reports';
  // Your own "it's up" note takes you to the feed, where the new thing sits first.
  if (group.kind === 'posted') return group.targetKind === 'question' ? `/question/${group.targetId}` : '/';
  // A follow of any kind opens the person, not a post.
  if (group.kind === 'follow' || group.kind === 'follow-request' || group.kind === 'follow-accepted') return `/user/${group.actorIds[0]}`;
  if (group.targetKind === 'post') return `/post/${group.targetId}`;
  if (group.targetKind === 'hit') return `/hits/${group.targetId}`;
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
  const { notifications, users, posts, currentUserId, followRequests, actions } = useApp();
  // "liked your clip", "liked your photo": the verb names what was liked, not just "post".
  const verbFor = (group: Group) => {
    if (group.kind !== 'like' && group.kind !== 'comment' && group.kind !== 'share') return VERB[group.kind];
    const act = group.kind === 'like' ? 'liked' : group.kind === 'comment' ? 'commented on' : 'shared';
    if (group.targetKind === 'hit') return `${act} your hit`;
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
      const key = n.kind === 'follow' || n.kind === 'follow-request' || n.kind === 'follow-accepted'
        ? `${n.kind}:${n.actorId}`
        : n.kind === 'like' && !n.read
          ? `like-new:${n.id}`
          : `${n.kind}:${n.targetKind}:${n.targetId}:${n.read ? 'seen' : 'new'}`;
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
        preview: n.preview,
        unread: !n.read,
      });
    }
    return [...byTarget.values()].sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
    // Deliberately keyed on length only: re-grouping as rows are marked read
    // would wipe the tint mid-view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine.length, followRequests.length]);

  useEffect(() => {
    actions.markNotificationsRead();
  }, [actions]);

  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? 'Someone';

  return (
    <Screen title="Notifications" compactTitle onBack={() => goBack()}>
      {groups.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="Nothing yet"
          body="Likes, replies and shares on your posts land here."
        />
      ) : (
        <View style={styles.list}>
          {groups.map((group, index) => {
            const icon = ICON[group.kind];
            const [first, ...rest] = group.actorIds;
            const who =
              group.kind === 'posted'
                ? (group.preview?.startsWith('Instant') || group.preview?.startsWith('Hit')) ? 'Your instant' : group.targetKind === 'question' ? 'Your question' : 'Your post'
                : group.kind === 'coach-application' ? 'CourtSide'
                : rest.length === 0
                ? nameOf(first)
                : rest.length === 1
                  ? `${nameOf(first)} and ${nameOf(rest[0])}`
                  : `${nameOf(first)}, ${nameOf(rest[0])} and ${rest.length - 1} ${rest.length - 1 === 1 ? 'other' : 'others'}`;
            const heading = index === 0 || groups[index - 1].section !== group.section ? group.section : null;

            return (
              <React.Fragment key={group.key}>
              {heading ? <Text style={[styles.heading, index > 0 && { marginTop: spacing.lg }]}>{heading}</Text> : null}
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${who} ${verbFor(group)}`}
                onPress={() => { const to = routeFor(group); if (to === '/') { router.navigate('/'); requestScrollToTop('/'); } else router.push(to); }}
                style={[styles.row, group.unread && styles.rowUnread]}
              >
                <View>
                  {/* Two faces, overlapped, when more than one person did it. */}
                  {group.kind === 'coach-application' ? (
                    // From CourtSide itself: the mark, not a person's face.
                    <View style={styles.brandFace}><BrandMark size={24} /></View>
                  ) : rest.length ? (
                    <View style={styles.pair}>
                      <View style={styles.pairBack}><Avatar name={nameOf(rest[0])} seed={rest[0]} size={32} /></View>
                      <View style={styles.pairFront}><Avatar name={nameOf(first)} seed={first} size={32} /></View>
                    </View>
                  ) : <Avatar name={nameOf(first)} seed={first} size={44} />}
                  <View style={[styles.badge, { backgroundColor: colors[icon.tint] }]}>
                    <Ionicons name={icon.name} size={11} color={colors.brandInk} />
                  </View>
                </View>

                <View style={styles.body}>
                  <Text style={styles.text}>
                    <Text style={styles.who}>{who}</Text>
                    <Text> {verbFor(group)}</Text>
                  </Text>
                  {group.preview ? (
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

                {group.unread ? <View style={styles.dot} /> : null}
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
  askRow: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.xs },
  accept: { paddingHorizontal: spacing.lg, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.brand },
  acceptText: { ...typography.smallStrong, color: colors.brandInk },
  decline: { paddingHorizontal: spacing.lg, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  declineText: { ...typography.smallStrong, color: colors.text },
});

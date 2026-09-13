import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, EmptyState, Screen } from '@/components/ui';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import type { Notification, NotificationKind } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * One row per thing that happened to you.
 *
 * Notifications are grouped by what they landed on, the way every social app
 * does it — six people liking one clip is one line, not six. Opening the screen
 * marks everything read, but a row that was unread keeps its tint until you
 * leave, so you can still see what was new.
 */

const ICON: Record<NotificationKind, { name: keyof typeof Ionicons.glyphMap; tint: keyof typeof colors }> = {
  like: { name: 'heart', tint: 'danger' },
  comment: { name: 'chatbubble', tint: 'info' },
  answer: { name: 'chatbubbles', tint: 'info' },
  'coach-reply': { name: 'shield-checkmark', tint: 'brand' },
  helpful: { name: 'ribbon', tint: 'warning' },
  share: { name: 'paper-plane', tint: 'court' },
  follow: { name: 'person-add', tint: 'brand' },
};

const VERB: Record<NotificationKind, string> = {
  like: 'liked your post',
  comment: 'commented on your post',
  answer: 'answered your question',
  'coach-reply': 'replied to your question',
  helpful: 'found your reply helpful',
  share: 'shared your post',
  follow: 'started following you',
};

interface Group {
  key: string;
  kind: NotificationKind;
  targetId: string;
  targetKind: Notification['targetKind'];
  actorIds: string[];
  createdAt: string;
  preview?: string;
  unread: boolean;
}

function routeFor(group: Group): string {
  if (group.targetKind === 'post') return `/post/${group.targetId}`;
  if (group.targetKind === 'question') return `/question/${group.targetId}`;
  return `/coach-question/${group.targetId}`;
}

export default function Notifications() {
  const styles = useThemedStyles(styleDefinitions);
  const { notifications, users, currentUserId, actions } = useApp();

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
      const key = `${n.kind}:${n.targetKind}:${n.targetId}`;
      const existing = byTarget.get(key);
      if (existing) {
        if (!existing.actorIds.includes(n.actorId)) existing.actorIds.push(n.actorId);
        existing.unread = existing.unread || !n.read;
        continue;
      }
      byTarget.set(key, {
        key,
        kind: n.kind,
        targetId: n.targetId,
        targetKind: n.targetKind,
        actorIds: [n.actorId],
        createdAt: n.createdAt,
        preview: n.preview,
        unread: !n.read,
      });
    }
    return [...byTarget.values()];
    // Deliberately keyed on length only: re-grouping as rows are marked read
    // would wipe the tint mid-view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine.length]);

  useEffect(() => {
    actions.markNotificationsRead();
  }, [actions]);

  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? 'Someone';

  return (
    <Screen title="Notifications" compactTitle onBack={() => router.back()}>
      {groups.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="Nothing yet"
          body="Likes, replies and shares on your posts land here."
        />
      ) : (
        <View style={styles.list}>
          {groups.map((group) => {
            const icon = ICON[group.kind];
            const [first, ...rest] = group.actorIds;
            const who =
              rest.length === 0
                ? nameOf(first)
                : rest.length === 1
                  ? `${nameOf(first)} and ${nameOf(rest[0])}`
                  : `${nameOf(first)} and ${rest.length} others`;

            return (
              <Pressable
                key={group.key}
                accessibilityRole="link"
                accessibilityLabel={`${who} ${VERB[group.kind]}`}
                onPress={() => router.push(routeFor(group))}
                style={[styles.row, group.unread && styles.rowUnread]}
              >
                <View>
                  <Avatar name={nameOf(first)} seed={first} size={44} />
                  <View style={[styles.badge, { backgroundColor: colors[icon.tint] }]}>
                    <Ionicons name={icon.name} size={11} color={colors.brandInk} />
                  </View>
                </View>

                <View style={styles.body}>
                  <Text style={styles.text}>
                    <Text style={styles.who}>{who}</Text>
                    <Text> {VERB[group.kind]}</Text>
                  </Text>
                  {group.preview ? (
                    <Text style={styles.preview} numberOfLines={1}>
                      {group.preview}
                    </Text>
                  ) : null}
                  <Text style={styles.time}>{relativeTime(group.createdAt)} ago</Text>
                </View>

                {group.unread ? <View style={styles.dot} /> : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  list: { gap: 2 },
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
});

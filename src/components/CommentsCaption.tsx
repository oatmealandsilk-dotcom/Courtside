import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Avatar, DottedRule } from '@/components/ui';
import { LevelPill } from '@/components/LevelPill';
import { NewHereTag } from '@/components/NewHereTag';
import { StreakFlame } from '@/components/StreakFlame';
import { shownStreak } from '@/features/practice/streakFlame';
import { FollowPill } from '@/components/FollowPill';
import { RichText } from '@/components/RichText';
import type { User } from '@/data/types';
import { isNewHere } from '@/features/feed/newHere';
import { PushedDownTag } from '@/components/PushedDownTag';
import { tagsNotInCaption } from '@/features/feed/tags';
import { openCourt } from '@/features/players/courtLink';
import { confirmUnfollow } from '@/lib/confirm';
import { relativeTime, timeLeft } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, font, spacing, typography } from '@/theme';
import { openPlayer } from '@/features/navigation/openPlayer';

/**
 * The post itself, at the top of its comments: who, the whole caption (never
 * folded here) and its small line, set like a comment so it reads as the
 * first word in the conversation. A tap on a clip's words opens the comments
 * to exactly this, as Instagram's caption tap does. It scrolls away with the
 * list; the count in the header leaves it out.
 */
export function CommentsCaption({ kind, id }: { kind: 'post' | 'hit'; id: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const { posts, stories, users, currentUserId, followingIds, blockedIds, actions } = useApp();
  const post = kind === 'post' ? posts.find((p) => p.id === id) : undefined;
  const story = kind === 'hit' ? stories.find((st) => st.id === id) : undefined;
  const author = users.find((u) => u.id === (post?.authorId ?? story?.authorId));
  // Follow is offered only to someone you did not follow when the comments
  // opened, and once offered it stays (saying Following after the tap), so
  // nothing in the line jumps.
  const offerFollow = useRef<boolean | null>(null);
  if (offerFollow.current === null && author) offerFollow.current = author.id !== currentUserId && !followingIds.includes(author.id);
  // An Instant's time left, ticking once a minute.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!story) return undefined;
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, [story]);
  if (!author || (!post && !story)) return null;

  const words = post
    ? [post.body?.trim(), tagsNotInCaption(post.body, post.tags).map((t) => `#${t}`).join(' ')].filter(Boolean).join(' ')
    : story?.caption?.trim() ?? '';
  const openProfile = () => openPlayer(author.id, currentUserId);
  const following = followingIds.includes(author.id);
  const streak = shownStreak(author, currentUserId);
  const tagged = (post?.taggedUserIds ?? []).filter((uid) => !blockedIds.includes(uid)).map((uid) => users.find((u) => u.id === uid)).filter((u): u is User => !!u);
  const first = (name: string) => name.split(' ')[0];
  const withWho = tagged.length === 1 ? first(tagged[0].name) : tagged.length === 2 ? `${first(tagged[0].name)} and ${first(tagged[1].name)}` : tagged.length ? `${first(tagged[0].name)} and ${tagged.length - 1} others` : '';

  // The small line, its parts joined by " · ": when, edited, where (the court opens its page), who with.
  const parts: React.ReactNode[] = [];
  if (post) {
    parts.push(relativeTime(post.createdAt));
    if (post.editedAt) parts.push('Edited');
    if (post.court) {
      const court = post.court;
      parts.push(<Text key="court" accessibilityRole="link" accessibilityLabel={`${court.name}, see posts from here`} suppressHighlighting onPress={() => openCourt(court)} style={styles.link}>{court.name}</Text>);
    } else if (post.location) parts.push(post.location);
    if (withWho) {
      parts.push(
        <Text
          key="with"
          accessibilityRole="link"
          accessibilityLabel={`With ${tagged.map((u) => u.name).join(', ')}`}
          suppressHighlighting
          onPress={() => { if (tagged.length === 1) router.push(`/user/${tagged[0].id}`); else router.push({ pathname: '/likes', params: { id: post.id, set: 'tagged' } }); }}
        >with <Text style={styles.withNames}>{withWho}</Text></Text>,
      );
    }
  } else if (story) {
    parts.push(`Instant · ${timeLeft(story.expiresAt)}`);
  }

  return (
    <View>
      <View style={styles.row}>
        <Pressable accessibilityRole="link" accessibilityLabel={`Open ${author.name}'s profile`} onPress={openProfile}>
          <Avatar name={author.name} seed={author.avatarSeed} uri={author.avatarUrl} size={40} ring={author.isCoach} />
        </Pressable>
        <View style={styles.column}>
          <View style={styles.who}>
            {/* The name first and whole: its pills follow on the same line while there is room, and drop
                under it on a narrow phone, rather than squeezing the name down to "J…" (Oct 5 audit). */}
            <View style={styles.badges}>
              <Text style={styles.name} numberOfLines={1} onPress={openProfile} accessibilityRole="link" suppressHighlighting>{author.name}</Text>
              <StreakFlame days={streak} style={styles.flame} />
              <LevelPill profile={author.profile} small />
              {post && isNewHere(post) ? <NewHereTag short /> : null}
              {/* Admins only: pushed to the bottom of feeds (migration 152). Nothing at all for anyone else. */}
              {post ? <PushedDownTag post={post} /> : null}
            </View>
            {offerFollow.current ? (
              <FollowPill
                small
                following={following}
                userId={author.id}
                name={author.name}
                onPress={() => { if (following) confirmUnfollow(author, () => actions.toggleFollow(author.id)); else actions.toggleFollow(author.id); }}
              />
            ) : null}
          </View>
          {words ? <RichText style={styles.words} hashtagStyle={styles.tag} mentionStyle={styles.tag}>{words}</RichText> : null}
          <Text style={styles.meta}>
            {parts.map((part, i) => <React.Fragment key={i}>{i ? ' · ' : ''}{part}</React.Fragment>)}
          </Text>
        </View>
      </View>
      {/* The caption ends here and the conversation starts: 24 above and below (the list's own 16, and 8). */}
      <DottedRule gap={spacing.sm} />
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  // The same shape as a comment's row on this sheet (CommentRow big): the picture, 12, the words.
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  column: { flex: 1, minWidth: 0, gap: 4 },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  badges: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.sm, rowGap: 4 },
  name: { ...typography.bodyStrong, fontSize: 15, color: colors.text, flexShrink: 1 },
  flame: { marginLeft: -3 },
  words: { ...typography.body, lineHeight: 22, color: colors.text },
  tag: { color: colors.brand, ...font('600') },
  meta: { ...typography.small, lineHeight: 18, color: colors.textMuted },
  link: { ...typography.smallStrong, color: colors.brand },
  withNames: { ...typography.smallStrong, color: colors.textMuted },
});

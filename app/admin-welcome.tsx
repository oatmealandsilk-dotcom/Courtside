import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { TileCover } from '@/components/TileCover';
import { FollowPill } from '@/components/FollowPill';
import { EmptyState, Avatar, Screen } from '@/components/ui';
import { CourtSpinner } from '@/components/CourtSpinner';
import type { Post } from '@/data/types';
import { remote, type ComebackWeek, type FirstDayStats, type FirstMove, type NewPlayer } from '@/data/remote';
import { isSupabaseConfigured } from '@/lib/supabase';
import { goBack } from '@/lib/goBack';
import { relativeTime } from '@/lib/format';
import { show as showToast } from '@/lib/toast';
import { confirmUnfollow } from '@/lib/confirm';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography, lift } from '@/theme';

/**
 * Everyone who joined this week (Oct 20 sweep, R4: "Welcome every new
 * player, not just posters"; most new players never post), with Follow and,
 * for adults, Say hi. Then everyone's first post from the last month, newest
 * first, and whether you have said hello yet. A comment from the founder on
 * day one is the best thing that can happen to a new account.
 */
export default function AdminWelcome() {
  const styles = useThemedStyles(styleDefinitions);
  const { users, comments, currentUserId, actions } = useApp();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [stats, setStats] = useState<FirstDayStats | null>(null);
  const [weeks, setWeeks] = useState<ComebackWeek[] | null>(null);
  const [joined, setJoined] = useState<NewPlayer[] | null>(null);
  // This week by default; one tap shows the last 30 days.
  const [longer, setLonger] = useState(false);
  const load = useCallback(async () => {
    const [got, numbers, comeback, fresh] = await Promise.all([
      actions.loadFirstPosts(),
      actions.loadFirstDayStats(),
      // The demo has no app opens to count.
      isSupabaseConfigured ? remote.fetchComebackWeeks().catch(() => null) : Promise.resolve(null),
      actions.loadNewPlayers(longer ? 30 : 7),
    ]);
    // A first post an admin took down (migration 108) needs no welcome.
    setPosts(got.filter((p) => !p.removed));
    setStats(numbers);
    setWeeks(comeback);
    setJoined(fresh);
  }, [actions, longer]);
  useEffect(() => { void load(); }, [load]);

  const welcomed = (post: Post) => comments.some((c) => c.postId === post.id && c.authorId === currentUserId);
  const waiting = posts?.filter((p) => !welcomed(p)).length ?? 0;

  return (
    <Screen title="Welcome new players" compactTitle onBack={() => goBack()} onRefresh={load}>
      <Text style={styles.lead}>
        {posts === null ? ' ' : waiting ? `${waiting} new ${waiting === 1 ? 'player has' : 'players have'} posted for the first time and nobody has replied yet.` : 'Everyone has been welcomed.'} Saying hi on someone's first day is the best way to get them to come back.
      </Text>
      {stats ? <Numbers stats={stats} /> : null}
      {weeks?.length ? <Comebacks weeks={weeks} /> : null}
      {joined ? <NewThisWeek players={joined} longer={longer} onLonger={() => setLonger((l) => !l)} /> : null}
      {posts !== null ? <Text style={styles.heading}>First posts</Text> : null}
      {posts === null ? (
        <View style={styles.loading}><CourtSpinner size={28} /></View>
      ) : !posts.length ? (
        <EmptyState icon="sparkles-outline" title="No first posts yet" body="When a new player posts for the first time, it shows up here." />
      ) : (
        <View style={styles.card}>
          {posts.map((post, index) => {
            const author = users.find((u) => u.id === post.authorId);
            const done = welcomed(post);
            const picture = post.thumbnailUrl ?? post.imageUrl;
            return (
              <Pressable key={post.id} accessibilityRole="link" accessibilityLabel={`${author?.name ?? 'A new player'}'s first post`} onPress={() => router.push(`/post/${post.id}`)} style={({ pressed }) => [styles.row, index > 0 && styles.rowLine, pressed && { backgroundColor: colors.surfaceAlt }]}>
                <Avatar name={author?.name ?? '?'} seed={author?.avatarSeed ?? post.authorId} size={44} />
                <View style={styles.words}>
                  <Text style={styles.name} numberOfLines={1}>{author?.name ?? 'New player'}</Text>
                  <Text style={styles.meta} numberOfLines={1}>{[author?.handle ? `@${author.handle}` : null, author?.location?.split(',')[0] || null, relativeTime(post.createdAt)].filter(Boolean).join(' · ')}</Text>
                  {post.body ? <Text style={styles.body} numberOfLines={1}>{post.body}</Text> : null}
                </View>
                {picture ? <TileCover accessibilityIgnoresInvertColors uri={picture} style={styles.thumb} /> : null}
                {done ? (
                  <View style={styles.done}><Ionicons name="checkmark" size={14} color={colors.brand} /><Text style={styles.doneText}>Said hi</Text></View>
                ) : (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Say hi to ${author?.name ?? 'them'}`} hitSlop={6} onPress={() => router.push({ pathname: '/comments', params: { kind: 'post', id: post.id } })} style={styles.hi}>
                    <Text style={styles.hiText}>Say hi</Text>
                  </Pressable>
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

/**
 * Everyone who joined lately, newest first, posted or not (Oct 20 sweep,
 * R4). Follow for everyone: a follow sends the usual "started following
 * you" alert. Say hi (a message you write yourself) only for adults: a teen,
 * or someone who gave no birthday, gets only the follow, per the teen rules
 * (no messages from people they do not follow). The message rules are
 * checked again before the chat opens.
 */
function NewThisWeek({ players, longer, onLonger }: { players: NewPlayer[]; longer: boolean; onLonger: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const { users, followingIds, conversations, messages, currentUserId, actions } = useApp();
  // People you have already sent a message to one-to-one.
  const messaged = new Set<string>();
  for (const c of conversations) {
    if (c.isGroup || c.participantIds.length !== 2 || !currentUserId) continue;
    const other = c.participantIds.find((id) => id !== currentUserId);
    if (other && messages.some((m) => m.conversationId === c.id && m.senderId === currentUserId)) messaged.add(other);
  }
  const shown = players.flatMap((p) => { const user = users.find((u) => u.id === p.id); return user ? [{ ...p, user }] : []; });
  const waiting = shown.filter((p) => !followingIds.includes(p.id)).length;
  const follow = (id: string) => {
    const who = users.find((u) => u.id === id);
    if (who && followingIds.includes(id)) confirmUnfollow(who, () => actions.toggleFollow(id));
    else actions.toggleFollow(id);
  };
  const sayHi = async (id: string) => {
    const lock = await actions.messageLock(id);
    if (lock) { showToast({ title: lock, icon: 'lock-closed-outline', long: true }); return; }
    router.push(`/messages/${actions.openConversationWith(id)}`);
  };
  return (
    <View style={styles.joined}>
      <Text style={styles.heading}>{longer ? 'Joined in the last 30 days' : 'Joined this week'}</Text>
      <Text style={styles.sub}>
        {!shown.length ? 'Nobody new yet.' : `${shown.length} new ${shown.length === 1 ? 'player' : 'players'}${waiting ? `, ${waiting} you don't follow yet` : ''}. A follow on day one brings people back. Say hi is for adults only; teens and players with no birthday get a follow.`}
      </Text>
      {shown.length ? (
        <View style={styles.card}>
          {shown.map(({ user, joinedAt, adult, posted }, index) => (
            <Pressable key={user.id} accessibilityRole="link" accessibilityLabel={`${user.name}, open profile`} onPress={() => router.push(`/user/${user.id}`)} style={({ pressed }) => [styles.row, index > 0 && styles.rowLine, pressed && { backgroundColor: colors.surfaceAlt }]}>
              <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={44} />
              <View style={styles.words}>
                <Text style={styles.name} numberOfLines={1}>{user.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>{[`@${user.handle}`, user.location.split(',')[0] || null].filter(Boolean).join(' · ')}</Text>
                <Text style={styles.body} numberOfLines={1}>{posted ? `Joined ${relativeTime(joinedAt)} · posted` : `Joined ${relativeTime(joinedAt)}`}</Text>
              </View>
              <View style={styles.buttons}>
                <FollowPill small following={followingIds.includes(user.id)} userId={user.id} onPress={() => follow(user.id)} name={user.name.split(' ')[0]} />
                {!adult ? (
                  // A teen, or no birthday on file: no message from someone they do not follow (teen rules).
                  <Text style={styles.teen} accessibilityLabel="Follow only: teen rules">Follow only</Text>
                ) : messaged.has(user.id) ? (
                  <View style={styles.done}><Ionicons name="checkmark" size={14} color={colors.brand} /><Text style={styles.doneText}>Said hi</Text></View>
                ) : (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Say hi to ${user.name} in a message`} hitSlop={6} onPress={() => { void sayHi(user.id); }} style={styles.hiQuiet}>
                    <Text style={styles.hiQuietText}>Say hi</Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Pressable accessibilityRole="button" onPress={onLonger} hitSlop={6} style={({ pressed }) => [styles.longer, pressed && { opacity: 0.6 }]}>
        <Text style={styles.longerText}>{longer ? 'Just this week' : 'Show the last 30 days'}</Text>
      </Pressable>
    </View>
  );
}

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');

/** Each first move, as the Picked line names it. */
const PICK_LABEL: Record<FirstMove, string> = { invite: 'Shared their link', follow: 'Followed someone', find: 'Found a friend', post: 'Posted', instant: 'Posted an Instant', answer: 'Answered', ask: 'Asked', later: 'Skipped' };

/**
 * Whether the first-move step works. Day one: what share of new players
 * post, answer or ask within a day of joining. Week two: of players old
 * enough to tell, how often those who moved came back, against those who
 * did not. If movers come back more, push the step harder; if people stop
 * at it, soften it.
 */
function Numbers({ stats }: { stats: FirstDayStats }) {
  const styles = useThemedStyles(styleDefinitions);
  const others = stats.cohort - stats.movers;
  // The first-move page's new moves (invite, follow, find) come with migration 133; before it they are not in the numbers at all.
  const picks = (['invite', 'follow', 'find', 'post', 'instant', 'answer', 'ask', 'later'] as const).filter((k) => (stats.picked[k] ?? 0) > 0);
  return (
    <View style={styles.numbers}>
      <View style={styles.numRow}>
        <View style={styles.num}><Text style={styles.numValue}>{pct(stats.moved30, stats.new30)}</Text><Text style={styles.numLabel}>did something on their first day</Text><Text style={styles.numFoot}>{stats.moved30} of {stats.new30} new players, last 30 days</Text></View>
        <View style={styles.num}><Text style={styles.numValue}>{pct(stats.moversBack, stats.movers)} <Text style={styles.numVs}>vs {pct(stats.othersBack, others)}</Text></Text><Text style={styles.numLabel}>came back a week later if they did something on day one (vs if they didn't)</Text><Text style={styles.numFoot}>{stats.cohort ? `Out of ${stats.cohort} players who joined 2+ weeks ago` : 'Needs players who joined 2+ weeks ago'}</Text></View>
      </View>
      {picks.length ? <Text style={styles.picks}>Their first step: {picks.map((k) => `${PICK_LABEL[k]} ${stats.picked[k] ?? 0}`).join(' · ')}</Text> : null}
    </View>
  );
}

/** "Oct 12" for a week's Sunday (YYYY-MM-DD), read as that date wherever the phone is. */
const weekName = (week: string) => new Date(`${week}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * Of the players who joined each week, how many opened the app again the
 * next day and a week later. Any open counts (the map, Discussions, a chat),
 * not only the Feed. A week whose next day, or week later, has not come yet
 * shows a dash.
 */
function Comebacks({ weeks }: { weeks: ComebackWeek[] }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={[styles.num, styles.weeks]}>
      <Text style={styles.numLabel}>Came back, by the week they joined (any open of the app)</Text>
      <View style={styles.weekRow}>
        <Text style={[styles.weekCell, styles.weekHead, styles.weekFirst]}>Joined</Text>
        <Text style={[styles.weekCell, styles.weekHead]}>Players</Text>
        <Text style={[styles.weekCell, styles.weekHead]}>Next day</Text>
        <Text style={[styles.weekCell, styles.weekHead]}>A week later</Text>
      </View>
      {weeks.map((w) => (
        <View key={w.week} style={styles.weekRow}>
          <Text style={[styles.weekCell, styles.weekFirst]}>Week of {weekName(w.week)}</Text>
          <Text style={styles.weekCell}>{w.joined}</Text>
          <Text style={styles.weekCell}>{w.day1Of ? `${pct(w.day1Back, w.day1Of)} (${w.day1Back})` : '—'}</Text>
          <Text style={styles.weekCell}>{w.day7Of ? `${pct(w.day7Back, w.day7Of)} (${w.day7Back})` : '—'}</Text>
        </View>
      ))}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  weeks: { flex: 0, gap: spacing.xs, marginBottom: spacing.lg },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  weekCell: { ...typography.small, color: colors.text, flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  weekFirst: { flex: 1.6, textAlign: 'left' },
  weekHead: { ...typography.caption, letterSpacing: 0, color: colors.textFaint },
  lead: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingBottom: spacing.lg },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },
  numbers: { gap: spacing.sm, marginBottom: spacing.lg },
  numRow: { flexDirection: 'row', gap: spacing.sm },
  num: { flex: 1, gap: 2, padding: spacing.md, borderRadius: 16, backgroundColor: colors.surface },
  numValue: { ...typography.title, color: colors.text, fontVariant: ['tabular-nums'] },
  numVs: { ...typography.body, color: colors.textMuted },
  numLabel: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  numFoot: { ...typography.caption, letterSpacing: 0, color: colors.textFaint, marginTop: 2 },
  picks: { ...typography.small, color: colors.textMuted, paddingHorizontal: spacing.xs },
  card: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  words: { flex: 1, gap: 1 },
  name: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.small, color: colors.textMuted },
  body: { ...typography.small, color: colors.textFaint },
  thumb: { width: 40, height: 50, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  joined: { marginBottom: spacing.lg },
  heading: { ...typography.bodyStrong, color: colors.text, paddingHorizontal: spacing.xs, paddingBottom: spacing.xs },
  sub: { ...typography.small, color: colors.textMuted, lineHeight: 19, paddingHorizontal: spacing.xs, paddingBottom: spacing.md },
  buttons: { alignItems: 'flex-end', gap: 6 },
  hiQuiet: { height: 28, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  hiQuietText: { ...typography.smallStrong, color: colors.text },
  teen: { ...typography.caption, letterSpacing: 0, color: colors.textFaint, height: 28, lineHeight: 28 },
  longer: { alignSelf: 'flex-start', paddingHorizontal: spacing.xs, paddingTop: spacing.sm },
  longerText: { ...typography.smallStrong, color: colors.brand },
  hi: { height: 32, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  hiText: { ...typography.smallStrong, color: colors.brandInk },
  done: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  doneText: { ...typography.smallStrong, color: colors.brand },
});

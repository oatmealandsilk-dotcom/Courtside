import { PostCard } from '@/components/PostCard';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { LevelPill } from '@/components/LevelPill';
import { QuestionCard } from '@/components/QuestionCard';
import { Avatar, EmptyState, Field, Screen, SegmentedControl } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { sourceUserIds } from '@/features/community/importedThreads';
import { colors, spacing, typography } from '@/theme';

type Scope = 'all' | 'clips' | 'posts' | 'threads' | 'players' | 'coaches';

/** One search box across discussions, players, and coaches. */
export default function Search() {
  const styles = useThemedStyles(styleDefinitions);
  const { posts, questions, users, coaches, currentUserId, saved, actions, followingIds, followEdges, detectedLocation } = useApp();
  const params=useLocalSearchParams<{q?:string; scope?:string}>();
  const [term, setTerm] = useState(params.q ?? '');
  const startScope = (s?: string): Scope => (s === 'players' || s === 'coaches' || s === 'threads' || s === 'posts' || s === 'clips' ? s : 'all');
  useEffect(()=>{setTerm(params.q ?? '');setScope(startScope(params.scope));},[params.q, params.scope]);
  const [scope, setScope] = useState<Scope>(startScope(params.scope));

  const q = term.trim().toLowerCase();
  const matches=(text:string,tags:string[])=>q.startsWith('#') ? tags.some(t=>t.replace(/^#/,'').toLowerCase()===q.slice(1)) || text.toLowerCase().split(/[^#\p{L}\p{N}_]+/u).includes(q) : `${text} ${tags.join(' ')}`.toLowerCase().includes(q);
  const matchedPosts = posts.filter(p=>q && !p.archived && matches(p.body,p.tags) && (scope==='clips' ? p.kind==='clip' : scope==='posts' ? p.kind!=='clip' : true));
  const showPosts=scope==='all'||scope==='posts'||scope==='clips';

  const matchedQuestions = useMemo(
    () =>
      !q
        ? []
        : questions.filter((question) =>
            matches(`${question.title} ${question.body} ${question.topic}`,question.tags),
          ),
    [questions, q],
  );

  /**
   * People, ranked the way Instagram and TikTok do it: the closest name match
   * first, then anyone near you, then people you share follows with, then by
   * how many follow them. A search starting with @ is a handle search only.
   */
  const matchedPlayers = useMemo(() => {
    if (!q) return [];
    const byHandle = q.startsWith('@');
    const needle = byHandle ? q.slice(1) : q;
    if (!needle) return [];
    const me = users.find((u) => u.id === currentUserId);
    const myCity = (detectedLocation ?? me?.location ?? '').split(',')[0].trim().toLowerCase();
    const iFollow = new Set(followingIds);
    const followersOf = (id: string) => followEdges.filter((e) => e.followingId === id).map((e) => e.followerId);
    return users
      .filter((user) => user.id !== currentUserId && !sourceUserIds.includes(user.id))
      .map((user) => {
        const name = user.name.toLowerCase();
        const handle = user.handle.toLowerCase();
        let match = 0;
        if (byHandle) match = handle.startsWith(needle) ? 3 : handle.includes(needle) ? 1 : 0;
        else if (name.startsWith(needle) || handle.startsWith(needle)) match = 3;
        else if (name.split(/\s+/).some((part) => part.startsWith(needle))) match = 2.5;
        else if (name.includes(needle) || handle.includes(needle)) match = 2;
        else if (`${user.location} ${user.bio}`.toLowerCase().includes(needle)) match = 1;
        if (!match) return null;
        const near = !!myCity && user.location.split(',')[0].trim().toLowerCase() === myCity;
        const theirFollowers = followersOf(user.id);
        const mutual = theirFollowers.filter((id) => iFollow.has(id)).length;
        const follows = iFollow.has(user.id);
        const score = match * 10 + (near ? 4 : 0) + Math.min(mutual, 5) * 1.5 + (follows ? 2 : 0) + Math.log10(1 + user.followers);
        const reason = follows ? 'Following' : mutual ? `${mutual} mutual` : near ? 'Near you' : user.followers >= 1000 ? 'Popular' : '';
        return { user, score, reason };
      })
      .filter((row): row is { user: (typeof users)[number]; score: number; reason: string } => !!row)
      .sort((a, b) => b.score - a.score);
  }, [users, currentUserId, q, followingIds, followEdges, detectedLocation]);

  const matchedCoaches = useMemo(
    () =>
      !q
        ? []
        : coaches.filter((coach) => {
            const user = users.find((u) => u.id === coach.userId);
            return `${user?.name ?? ''} ${coach.headline} ${coach.specialties.join(' ')} ${coach.credentials.join(' ')}`
              .toLowerCase()
              .includes(q);
          }),
    [coaches, users, q],
  );

  const showThreads = scope === 'all' || scope === 'threads';
  const showPlayers = scope === 'all' || scope === 'players';
  const showCoaches = scope === 'all' || scope === 'coaches';
  const total = (showPosts ? matchedPosts.length : 0) +
    (showThreads ? matchedQuestions.length : 0) +
    (showPlayers ? matchedPlayers.length : 0) +
    (showCoaches ? matchedCoaches.length : 0);

  return (
    <Screen title="Search" compactTitle onBack={() => goBack()}>
      <View style={styles.top}>
        <Field
          value={term}
          onChangeText={setTerm}
          placeholder="People, @handles, threads, coaches, gear…"
          autoCapitalize="none"
        />
        <SegmentedControl
          scrollable
          segments={[
            { value: 'all', label: 'All' },
            {value:'clips',label:'Clips'},
            {value:'posts',label:'Posts'},
            { value: 'threads', label: 'Threads' },
            { value: 'players', label: 'Players' },
            { value: 'coaches', label: 'Coaches' },
          ]}
          value={scope}
          onChange={setScope}
        />
      </View>

      {!q ? (
        <EmptyState
          icon="search-outline"
          title="Search CourtSide"
          body="Find a thread about strings, a player near you, or a coach who fixes serves."
        />
      ) : total === 0 ? (
        <EmptyState icon="search-outline" title={`No results for “${term}”`} body="Try a different word." />
      ) : (
        <View style={{ gap: spacing.xl }}>
          {showPosts && matchedPosts.map(post=>{const author=users.find(u=>u.id===post.authorId);return author ? <PostCard key={post.id} post={post} author={author} liked={post.likedBy.includes(currentUserId ?? '')} onToggleLike={()=>actions.toggleLike(post.id)} onPress={()=>router.push(`/post/${post.id}`)} saved={saved.postIds.includes(post.id)} onToggleSave={()=>actions.toggleSavePost(post.id)} onShare={()=>router.push(`/share?kind=post&id=${post.id}`)}/> : null;})}
          {showPlayers && matchedPlayers.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>PLAYERS</Text>
              {matchedPlayers.map(({ user, reason }) => (
                <Pressable
                  key={user.id}
                  accessibilityRole="link"
                  onPress={() => router.push(`/user/${user.id}`)}
                  style={styles.person}
                >
                  <Avatar name={user.name} seed={user.avatarSeed} size={44} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.name}>{user.name}</Text>
                    <Text style={styles.meta}>
                      @{user.handle}{reason ? ` · ${reason}` : ''}{user.location ? ` · ${user.location}` : ''}
                    </Text>
                  </View>
                  <LevelPill profile={user.profile} small />
                </Pressable>
              ))}
            </View>
          ) : null}

          {showCoaches && matchedCoaches.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>COACHES</Text>
              {matchedCoaches.map((coach) => {
                const user = users.find((u) => u.id === coach.userId);
                return (
                  <Pressable
                    key={coach.id}
                    accessibilityRole="link"
                    onPress={() => router.push(`/coach/${coach.id}`)}
                    style={styles.person}
                  >
                    <Avatar
                      name={user?.name ?? 'Coach'}
                      seed={coach.id}
                      size={44}
                      style={{ backgroundColor: colors.borderStrong }}
                    />
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={styles.nameRow}>
                        <PlayerName userId={user?.id} style={styles.name}>{user?.name}</PlayerName>
                        <Ionicons name="shield-checkmark" size={14} color={colors.brand} />
                      </View>
                      <Text style={styles.meta} numberOfLines={1}>
                        {coach.headline}
                      </Text>
                    </View>
                    <Text style={styles.rating}>★ {coach.ratingAvg.toFixed(1)}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {showThreads && matchedQuestions.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>DISCUSSIONS</Text>
              {matchedQuestions.map((question) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  author={users.find((u) => u.id === question.authorId)}
                  answered={Boolean(question.acceptedAnswerId)}
                  saved={saved.questionIds.includes(question.id)}
                  onToggleSave={() => actions.toggleSaveQuestion(question.id)}
                  onShare={() => router.push(`/share?kind=question&id=${question.id}`)}
                  onPress={() => router.push(`/question/${question.id}`)}
                />
              ))}
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  top: { gap: spacing.md, paddingBottom: spacing.lg },
  section: { gap: spacing.xs },
  sectionTitle: { ...typography.caption, color: colors.textMuted, letterSpacing: 1.3, paddingBottom: spacing.sm },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.small, color: colors.textFaint },
  rating: { ...typography.smallStrong, color: colors.warning },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, View,
  type NativeScrollEvent, type NativeSyntheticEvent, type TextInput,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtGlyph } from '@/components/map/CourtGlyph';
import { CourtSpinner } from '@/components/CourtSpinner';
import { Highlighted, labelOf } from '@/components/CourtSearch';
import { PersonRow } from '@/components/PersonRow';
import { PostTile } from '@/components/PostTile';
import { TOPIC_META } from '@/components/QuestionCard';
import { SearchField } from '@/components/SearchField';
import { Avatar, DottedRule, EmptyState } from '@/components/ui';
import type { Post, Question, User } from '@/data/types';
import { useBarInset } from '@/features/navigation/barInset';
import { useSuggestedPlayers } from '@/features/people/suggestions';
import { openCourt as openCourtPage } from '@/features/players/courtLink';
import { useCourtSearch } from '@/features/places/useCourtSearch';
import { fetchCourts, type Court } from '@/features/players/courts';
import { formatMiles, milesBetween } from '@/features/players/geo';
import { homeFor, type LatLng } from '@/features/players/positions';
import { highlightParts, matchCourts, matchPeople, matchPosts, matchThreads, parseQuery, snippet, strongPerson, townOf, type CourtHit, type PersonHit, type ThreadHit } from '@/features/search/match';
import { readRecents, withRecent, withoutRecent, writeRecents, type Recent } from '@/features/search/recents';
import { relativeTime } from '@/lib/format';
import { goBack } from '@/lib/goBack';
import { KEYBOARD_ROOM, useKeyboardRoom } from '@/lib/keyboardRoom';
import { LAYOUT, useResponsive } from '@/lib/useResponsive';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography } from '@/theme';

type Tab = 'all' | 'people' | 'posts' | 'threads' | 'courts';
const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'people', label: 'People' },
  { value: 'posts', label: 'Posts' },
  { value: 'threads', label: 'Threads' },
  { value: 'courts', label: 'Courts' },
];
/** Links in say what they want with `scope` (Find players says "players"); older names map onto today's tabs. */
const tabFor = (scope?: string): Tab =>
  scope === 'players' || scope === 'coaches' || scope === 'people' ? 'people'
    : scope === 'clips' || scope === 'posts' ? 'posts'
      : scope === 'threads' ? 'threads'
        : scope === 'courts' ? 'courts'
          : 'all';
/** How many of each the All tab shows before "See all". */
const ON_ALL = { people: 3, posts: 6, threads: 3, courts: 3 } as const;
const RECENT_ROWS = 8;
/** "@" alone lists this many of the people you follow. */
const FOLLOWED_ROWS = 8;
/** "#" with a letter or less lists this many tags. */
const TAG_ROWS = 12;

/**
 * A topic's colour, read from the theme as the row draws. TOPIC_META's own
 * tints were copied from whichever theme was up when the app started.
 */
function topicTint(topic: Question['topic']): string {
  const tint = { gear: colors.clay, technique: colors.hard, strategy: colors.brand, injury: colors.danger, fitness: colors.court, rules: colors.warning, mental: TOPIC_META.mental.tint }[topic] ?? colors.brand;
  return /^#[0-9a-f]{6}$/i.test(tint) ? tint : colors.brand;
}

/**
 * Search, the way Instagram and TikTok do it: the box stays pinned at the
 * top while results scroll under it; before you type, your recent searches
 * (each with its own ✕), this week's tags and players near you; as you type,
 * People, Posts, Threads and Courts, each compact, with what matched in bold.
 */
export default function Search() {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const keyboardRoom = useKeyboardRoom();
  const { isPhone, width: windowWidth } = useResponsive();
  const barInset = useBarInset();
  const { posts, questions, users, coaches, currentUserId, followingIds, followEdges, blockedIds, detectedLocation, detectedCoords, actions } = useApp();
  const params = useLocalSearchParams<{ q?: string; scope?: string }>();
  const [term, setTerm] = useState(params.q ?? '');
  // With an empty box the tab is remembered (Find players asks for People) and shows once typing starts.
  const [tab, setTab] = useState<Tab>(tabFor(params.scope));
  useEffect(() => { setTerm(params.q ?? ''); setTab(tabFor(params.scope)); }, [params.q, params.scope]);

  const q = useMemo(() => parseQuery(term), [term]);
  const typing = q.raw.length > 0;
  // "#" and one letter (or none) lists tags to pick from rather than a page of posts.
  const pickingTag = q.mode === 'tag' && q.text.length < 2;
  // The tabs come with something to sort: not for "@" or "#" on their own.
  const showTabs = q.text.length > 0 && !pickingTag;
  const blocked = useMemo(() => new Set(blockedIds), [blockedIds]);
  const me = users.find((u) => u.id === currentUserId);
  const myTown = townOf(detectedLocation ?? me?.location);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  /* ----------------------------- The box and focus ---------------------------- */
  const input = useRef<TextInput>(null);
  // Opened plainly, the box is ready to type in. Opened from a #tag, the results show with the keyboard down.
  useEffect(() => {
    if (params.q) return;
    const t = setTimeout(() => input.current?.focus(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------------- Recents --------------------------------- */
  const account = currentUserId ?? '';
  const [recents, setRecents] = useState<Recent[]>([]);
  const [undo, setUndo] = useState<Recent[] | null>(null);
  useEffect(() => {
    if (!account) return;
    let gone = false;
    void readRecents(account).then((list) => { if (!gone) setRecents(list); });
    return () => { gone = true; };
  }, [account]);
  const keep = useCallback((next: Recent[]) => { setRecents(next); if (account) void writeRecents(account, next); }, [account]);
  const save = useCallback((entry: Omit<Recent, 'at'>) => {
    setRecents((cur) => { const next = withRecent(cur, entry); if (account) void writeRecents(account, next); return next; });
  }, [account]);
  const saveTerm = useCallback((text: string) => {
    const t = text.trim();
    if (t.length >= 2) save({ kind: 'term', key: t.toLowerCase(), text: t });
  }, [save]);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);
  const clearAll = () => {
    setUndo(recents);
    keep([]);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 4000);
  };
  const putBack = () => { if (undo) keep(undo); setUndo(null); };
  // Gone or blocked people are skipped rather than shown as a blank row.
  const shownRecents = recents.filter((r) => r.kind !== 'user' || (userById.has(r.key) && !blocked.has(r.key))).slice(0, RECENT_ROWS);

  /* -------------------------------- Suggestions ------------------------------- */
  // Trending: the tags used most on posts and threads this past week.
  const trending = useMemo(() => {
    const since = Date.now() - 7 * 86_400_000;
    const counts = new Map<string, number>();
    const add = (tag: string) => { const t = tag.replace(/^#/, '').toLowerCase(); if (t.length >= 2) counts.set(t, (counts.get(t) ?? 0) + 1); };
    for (const p of posts) if (Date.parse(p.createdAt) >= since) p.tags.forEach(add);
    for (const qn of questions) if (Date.parse(qn.createdAt) >= since) qn.tags.forEach(add);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
  }, [posts, questions]);
  // Every tag in use, with how many posts and threads carry it: the rows under "#".
  const tagCounts = useMemo(() => {
    const counts = new Map<string, { posts: number; threads: number }>();
    const add = (tag: string, kind: 'posts' | 'threads') => {
      const t = tag.replace(/^#/, '').toLowerCase();
      if (t.length < 2) return;
      const c = counts.get(t) ?? { posts: 0, threads: 0 };
      c[kind] += 1;
      counts.set(t, c);
    };
    for (const p of posts) if (!p.archived && !p.removed && !blocked.has(p.authorId)) p.tags.forEach((t) => add(t, 'posts'));
    for (const qn of questions) if (!qn.removed && !blocked.has(qn.authorId)) qn.tags.forEach((t) => add(t, 'threads'));
    return counts;
  }, [posts, questions, blocked]);
  // "#" alone: this week's tags. "#s": every tag starting with s, the most used first.
  const tagRows = useMemo(() => {
    if (!pickingTag) return [];
    if (!q.text) return trending.filter((t) => tagCounts.has(t));
    return [...tagCounts.entries()]
      .filter(([t]) => t.startsWith(q.text))
      .sort((a, b) => b[1].posts + b[1].threads - (a[1].posts + a[1].threads))
      .slice(0, TAG_ROWS)
      .map(([t]) => t);
  }, [pickingTag, q.text, trending, tagCounts]);
  // "@" alone: the people you follow, or players to follow when that is nobody yet.
  const followedRows = useMemo(
    () => followingIds.flatMap((id) => { const u = userById.get(id); return u && !blocked.has(id) ? [u] : []; }).slice(0, FOLLOWED_ROWS),
    [followingIds, userById, blocked],
  );
  // Followed from this list: the row stays where it is and reads Following, the way Instagram keeps it.
  const [followedHere, setFollowedHere] = useState<string[]>([]);
  const noteFollowed = useCallback((id: string) => setFollowedHere((cur) => (cur.includes(id) ? cur : [...cur, id])), []);
  const suggested = useSuggestedPlayers({ keep: followedHere }).slice(0, 5);
  const nearAny = suggested.some((s) => !!myTown && townOf(s.user.location) === myTown);
  const suggestionReason = (user: User, reason: string) =>
    myTown && townOf(user.location) === myTown ? 'Near you' : user.isCoach ? 'Coach' : reason === 'Interacted with you' ? reason : '';

  /* ---------------------------------- Courts --------------------------------- */
  // Once, as the page opens: the courts about 15 miles around you, or none after eight seconds.
  const [courts, setCourts] = useState<Court[] | null>(null);
  const [home, setHome] = useState<LatLng | null>(null);
  const askedCourts = useRef(false);
  useEffect(() => {
    if (!me || askedCourts.current) return;
    askedCourts.current = true;
    const at = homeFor(me, detectedCoords);
    setHome(at);
    const late = new Promise<Court[]>((resolve) => setTimeout(() => resolve([]), 8000));
    Promise.race([fetchCourts(at, 25000), late]).then(setCourts).catch(() => setCourts([]));
  }, [me, detectedCoords]);

  /* --------------------------------- Results --------------------------------- */
  const people = useMemo(
    () => matchPeople(q, { users, coaches, me: currentUserId, myTown, followingIds, followEdges, blocked }),
    [q, users, coaches, currentUserId, myTown, followingIds, followEdges, blocked],
  );
  const ranked = useMemo(() => matchPosts(q, posts, blocked), [q, posts, blocked]);
  // Tiles already on screen for this search keep their places; posts that
  // arrive later (from the server, or a like that would re-rank) go after
  // them, so the grid never reshuffles under your finger.
  const tileOrder = useRef<{ raw: string; ids: string[] }>({ raw: '', ids: [] });
  const foundPosts = useMemo(() => {
    const before = tileOrder.current;
    let out = ranked;
    if (before.raw === q.raw && before.ids.length) {
      const byId = new Map(ranked.map((p) => [p.id, p]));
      const kept = before.ids.flatMap((id) => { const p = byId.get(id); return p ? [p] : []; });
      const keptIds = new Set(kept.map((p) => p.id));
      out = [...kept, ...ranked.filter((p) => !keptIds.has(p.id))];
    }
    tileOrder.current = { raw: q.raw, ids: out.map((p) => p.id) };
    return out;
  }, [ranked, q.raw]);
  const threads = useMemo(() => matchThreads(q, questions, blocked, (x) => TOPIC_META[x.topic]?.label ?? ''), [q, questions, blocked]);
  // Courts further away whose names match, from our own database, a beat after
  // the second letter: the ring loaded above only reaches about 15 miles.
  const farCourts = useCourtSearch(q.mode === 'all' ? q.text : '', home, undefined, 40);
  const foundCourts = useMemo(() => {
    const pool = courts || farCourts.length ? [...(courts ?? []), ...farCourts.map((r) => r.c)] : null;
    return pool ? matchCourts(q, pool, home) : [];
  }, [q, courts, farCourts, home]);
  const order: ('people' | 'posts' | 'threads' | 'courts')[] = q.mode === 'people' ? ['people'] : q.mode === 'tag' ? ['posts', 'threads'] : ['people', 'posts', 'threads', 'courts'];
  // All shows only people whose name or handle matched. Someone found only
  // through their town or bio ("serve" in a bio) waits on the People tab,
  // unless nothing else matched at all.
  const others = (order.includes('posts') ? foundPosts.length + threads.length : 0) + (order.includes('courts') ? foundCourts.length : 0);
  const strongPeople = people.filter(strongPerson);
  const peopleOnAll = strongPeople.length || others ? strongPeople : people;
  const counts = { people: peopleOnAll.length, posts: foundPosts.length, threads: threads.length, courts: foundCourts.length };
  const sections = order.filter((s) => counts[s] > 0);
  const total = tab === 'all' ? sections.reduce((n, s) => n + counts[s], 0) : tab === 'people' ? people.length : counts[tab];

  // Posts the app has not loaded yet: asked for 300ms after typing stops. While that is out and
  // nothing here matches, a small spinner, for a second and a half at most, instead of "No results".
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    if (q.mode === 'people' || q.text.length < 2) { setPending(null); return; }
    const raw = q.raw;
    setPending(raw);
    const done = () => setPending((cur) => (cur === raw ? null : cur));
    const giveUp = setTimeout(done, 1500);
    const ask = setTimeout(() => { void actions.searchPosts(raw).finally(done); }, 300);
    return () => { clearTimeout(ask); clearTimeout(giveUp); };
  }, [q.raw, q.mode, q.text, actions]);
  const searching = pending === q.raw && (tab === 'all' || tab === 'posts' || tab === 'threads');

  // A screen reader hears how many came up once typing settles; the bold is for eyes only.
  useEffect(() => {
    if (!q.text) return;
    const t = setTimeout(() => AccessibilityInfo.announceForAccessibility(total ? `${total} result${total === 1 ? '' : 's'}` : 'No results'), 600);
    return () => clearTimeout(t);
  }, [q.text, total]);

  /* ------------------------------ Scroll and keyboard ------------------------------ */
  const scrollRef = useRef<ScrollView>(null);
  const peopleRef = useRef<FlatList<PersonHit>>(null);
  const postsRef = useRef<FlatList<Post>>(null);
  const threadsRef = useRef<FlatList<ThreadHit>>(null);
  const courtsRef = useRef<FlatList<CourtHit>>(null);
  const offset = useRef(0);
  const focusedAt = useRef<number | null>(null);
  // Every new letter and every tab starts the results from the top.
  useEffect(() => {
    offset.current = 0;
    if (focusedAt.current !== null) focusedAt.current = 0;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    for (const list of [peopleRef, postsRef, threadsRef, courtsRef]) list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [q.raw, tab]);
  // A phone's browser has no "drop the keyboard on scroll", so the page does it: the first real scroll after typing.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
    if (Platform.OS === 'web' && isPhone && focusedAt.current !== null && Math.abs(offset.current - focusedAt.current) > 10) input.current?.blur();
  };
  const scrolling = {
    style: styles.flex,
    keyboardShouldPersistTaps: 'handled' as const,
    keyboardDismissMode: Platform.OS === 'web' ? undefined : ('on-drag' as const),
    automaticallyAdjustKeyboardInsets: Platform.OS === 'ios',
    onScroll,
    scrollEventThrottle: 16,
  };
  const bottom = { paddingBottom: barInset + 24 };

  // Tiles: three across the column's width, 3:4, the way a profile grid is.
  const [columnW, setColumnW] = useState(0);
  const gridW = (columnW || Math.min(windowWidth, LAYOUT.soloColumn)) - spacing.lg * 2;
  const tileW = Math.floor(gridW / 3);
  const tileH = Math.round((tileW * 4) / 3);

  /* ---------------------------------- Actions --------------------------------- */
  const openPerson = (user: User) => { save({ kind: 'user', key: user.id, text: user.name }); router.push(`/user/${user.id}`); };
  const openThread = (question: Question) => { save({ kind: 'thread', key: question.id, text: question.title }); router.push(`/question/${question.id}`); };
  const openCourt = (court: Court) => {
    const name = labelOf(court);
    save({ kind: 'court', key: court.id, text: name, lat: court.lat, lng: court.lng });
    openCourtPage({ id: court.id, name, lat: court.lat, lng: court.lng });
  };
  const openPost = (post: Post) => { saveTerm(term); router.push(`/post/${post.id}`); };
  const openRecent = (r: Recent) => {
    save(r);
    // The results come up with the keyboard down, so they are not under it.
    if (r.kind === 'term') { setTerm(r.text); input.current?.blur(); return; }
    if (r.kind === 'user') { router.push(`/user/${r.key}`); return; }
    if (r.kind === 'thread') { router.push(`/question/${r.key}`); return; }
    if (r.lat !== undefined && r.lng !== undefined) openCourtPage({ id: r.key, name: r.text, lat: r.lat, lng: r.lng });
  };
  const empty = () => { setTerm(''); setTab('all'); };
  const pickTag = (t: string) => { setTerm(`#${t}`); saveTerm(`#${t}`); input.current?.blur(); };

  /* ---------------------------------- Pieces ---------------------------------- */
  const head = (title: string, onAll?: () => void) => (
    <View style={styles.head}>
      <Text style={styles.headTitle} accessibilityRole="header">{title}</Text>
      {onAll ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`See all ${title.toLowerCase()}`} hitSlop={{ top: 14, bottom: 14, left: 12, right: 16 }} onPress={onAll}>
          <Text style={styles.seeAll}>See all</Text>
        </Pressable>
      ) : null}
    </View>
  );
  const rule = <View style={styles.ruleWrap}><DottedRule gap={spacing.md} /></View>;
  const personRow = (hit: PersonHit, first: boolean) => (
    <PersonRow key={hit.user.id} user={hit.user} reason={hit.reason} via={strongPerson(hit) ? undefined : hit.via} words={q.words} first={first} onPress={() => openPerson(hit.user)} onFollowed={noteFollowed} />
  );
  const tile = (post: Post) => {
    const author = userById.get(post.authorId);
    return (
      <PostTile
        key={post.id}
        post={post}
        width={tileW}
        height={tileH}
        words={q.words}
        label={`${post.kind === 'clip' ? 'Clip' : 'Post'}${author ? ` by ${author.name}` : ''}: ${post.body}`}
        onPress={() => openPost(post)}
      />
    );
  };
  const threadRow = ({ question, bodyOnly, tag }: ThreadHit, first: boolean) => {
    const tint = topicTint(question.topic);
    const meta = TOPIC_META[question.topic];
    const replies = question.source?.replies ?? question.answerIds.length;
    const answered = !!question.acceptedAnswerId;
    return (
      <Pressable
        key={question.id}
        accessibilityRole="link"
        accessibilityLabel={`Thread: ${question.title}, ${meta?.label ?? ''}, ${replies} ${replies === 1 ? 'reply' : 'replies'}${answered ? ', answered' : ''}`}
        onPress={() => openThread(question)}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <View style={[styles.topicTile, { backgroundColor: `${tint}26` }]}>
          <Ionicons name={meta?.icon ?? 'chatbubbles-outline'} size={18} color={tint} />
        </View>
        <View style={[styles.rowBody, styles.threadBody, !first && styles.rowRule]}>
          <Highlighted text={question.title} words={q.words} style={styles.rowName} strong={styles.rowNameMatch} lines={2} wordStart />
          {bodyOnly ? (
            <Highlighted text={snippet(question.body, q.words)} words={q.words} style={styles.snippet} strong={styles.snippetMatch} lines={2} wordStart />
          ) : (
            <View style={styles.metaLine}>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {tag ? <Text style={styles.rowTag}>#{highlightParts(tag, q.words).map((p, k) => (p.on ? <Text key={k} style={styles.rowTagMatch}>{p.s}</Text> : p.s))} · </Text> : null}
                {meta?.label} · {replies} {replies === 1 ? 'reply' : 'replies'} · {relativeTime(question.createdAt)}
              </Text>
              {answered ? <Ionicons name="checkmark-circle" size={13} color={colors.success} accessibilityLabel="Answered" /> : null}
            </View>
          )}
        </View>
      </Pressable>
    );
  };
  const courtRow = ({ court, miles }: CourtHit, first: boolean) => {
    const meta = [home ? formatMiles(miles) : null, court.count > 1 ? `${court.count} courts` : null, court.lit ? 'lights' : null].filter(Boolean).join(' · ');
    return (
      <Pressable
        key={court.id}
        accessibilityRole="link"
        accessibilityLabel={`${labelOf(court)}${meta ? `, ${meta}` : ''}, open the court`}
        onPress={() => openCourt(court)}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <View style={styles.courtTile}><CourtGlyph size={14} color={colors.brand} /></View>
        <View style={[styles.rowBody, !first && styles.rowRule]}>
          <Highlighted text={labelOf(court)} words={q.words} style={styles.rowName} strong={styles.rowNameMatch} lines={2} wordStart />
          {meta ? <Text style={styles.rowMeta} numberOfLines={1}>{meta}</Text> : null}
        </View>
      </Pressable>
    );
  };
  const recentRow = (r: Recent, first: boolean) => {
    const user = r.kind === 'user' ? userById.get(r.key) : undefined;
    const tag = r.kind === 'term' && r.text.startsWith('#');
    const line2 = user ? `@${user.handle}` : r.kind === 'thread' ? 'Thread' : r.kind === 'court' && home && r.lat !== undefined && r.lng !== undefined ? formatMiles(milesBetween(home, { lat: r.lat, lng: r.lng })) : '';
    const lead = user ? <Avatar uri={user.avatarUrl} name={user.name} seed={user.avatarSeed} size={40} ring={user.isCoach} />
      : r.kind === 'court' ? <View style={[styles.circle, styles.circleCourt]}><CourtGlyph size={15} color={colors.brand} /></View>
        : r.kind === 'thread' ? <View style={styles.circle}><Ionicons name="chatbubbles-outline" size={17} color={colors.textMuted} /></View>
          : tag ? <View style={styles.circle}><Text style={styles.hash}>#</Text></View>
            : <View style={styles.circle}><Ionicons name="search" size={17} color={colors.textMuted} /></View>;
    const text = tag ? r.text.slice(1) : r.text;
    return (
      <View key={`${r.kind}:${r.key}`} style={styles.recentRow}>
        <Pressable
          accessibilityRole={r.kind === 'term' ? 'button' : 'link'}
          accessibilityLabel={r.kind === 'term' ? `Search ${r.text}` : r.kind === 'user' ? `${user?.name}, @${user?.handle}` : r.kind === 'thread' ? `Thread: ${r.text}` : `${r.text}${line2 ? `, ${line2}` : ''}, open the court`}
          onPress={() => openRecent(r)}
          style={({ pressed }) => [styles.recentMain, pressed && styles.pressed]}
        >
          {lead}
          <View style={[styles.recentWords, !first && styles.rowRule]}>
            <Text style={styles.recentText} numberOfLines={1}>{tag ? <Text style={styles.hashInline}>#</Text> : null}{user?.name ?? text}</Text>
            {line2 ? <Text style={styles.rowMeta} numberOfLines={1}>{line2}</Text> : null}
          </View>
        </Pressable>
        <View style={[styles.removeWrap, !first && styles.rowRule]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${user?.name ?? r.text} from recent searches`} onPress={() => keep(withoutRecent(recents, r))} style={styles.remove}>
            <Ionicons name="close" size={18} color={colors.textFaint} />
          </Pressable>
        </View>
      </View>
    );
  };
  const spinner = <View style={styles.spinner}><CourtSpinner size={24} /></View>;

  /* ---------------------------------- Bodies ---------------------------------- */
  const beforeTyping = () => {
    const nothing = !shownRecents.length && !undo && !trending.length && !suggested.length;
    return (
      <ScrollView ref={scrollRef} {...scrolling} contentContainerStyle={bottom}>
        {nothing ? (
          <EmptyState icon="search-outline" title="Search CourtSide" body="Find a player by name or @handle, a clip by #tag, a thread or a court." />
        ) : null}
        {undo ? (
          <View style={styles.head}>
            <Text style={styles.clearedText}>Recent searches cleared</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Undo clearing recent searches" hitSlop={{ top: 14, bottom: 14, left: 12, right: 16 }} onPress={putBack}>
              <Text style={styles.seeAll}>Undo</Text>
            </Pressable>
          </View>
        ) : shownRecents.length ? (
          <View>
            <View style={styles.head}>
              <Text style={styles.headTitle} accessibilityRole="header">Recent</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Clear all recent searches" hitSlop={{ top: 14, bottom: 14, left: 12, right: 16 }} onPress={clearAll}>
                <Text style={styles.seeAll}>Clear all</Text>
              </Pressable>
            </View>
            {shownRecents.map((r, i) => recentRow(r, i === 0))}
          </View>
        ) : null}
        {trending.length ? (
          <View style={(shownRecents.length || undo) ? styles.gapAbove : null}>
            {head('Trending this week')}
            {/* On a phone, one sideways row: three wrapped rows pushed the players below under the
                keyboard. A computer has the room (and no keyboard), and wraps them where a mouse reaches. */}
            {(() => {
              const chips = trending.map((t) => (
                <Pressable key={t} accessibilityRole="button" accessibilityLabel={`Search #${t}`} onPress={() => pickTag(t)} style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}>
                  <Text style={styles.chipHash}>#</Text>
                  <Text style={styles.chipText}>{t}</Text>
                </Pressable>
              ));
              return isPhone ? (
                <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{chips}</ScrollView>
              ) : <View style={[styles.chips, styles.chipsWrap]}>{chips}</View>;
            })()}
          </View>
        ) : null}
        {suggested.length ? (
          <View style={styles.gapAbove}>
            {head(nearAny ? 'Players near you' : 'Suggested players')}
            {suggested.map((s, i) => (
              <PersonRow key={s.user.id} user={s.user} reason={suggestionReason(s.user, s.reason)} first={i === 0} onPress={() => openPerson(s.user)} onFollowed={noteFollowed} />
            ))}
          </View>
        ) : null}
      </ScrollView>
    );
  };

  const noneTitle = (which: Tab) => {
    const t = q.raw;
    return which === 'people' ? `No players called “${t}”`
      : which === 'posts' ? `No posts with “${t}”`
        : which === 'threads' ? `No threads about “${t}”`
          : which === 'courts' ? `No courts called “${t}” near you`
            : `No results for “${t}”`;
  };
  const none = (which: Tab) => (
    searching ? spinner : which !== 'people' && which !== 'all' && q.text.length < 2 ? (
      <EmptyState icon="search-outline" title="Keep typing" body="Posts, threads and courts show from two letters." />
    ) : (
      <EmptyState
        icon="search-outline"
        title={noneTitle(which)}
        body={which === 'courts' ? 'Courts come from the map, about 15 miles around you.' : 'Check the spelling, or try a name, an @handle, a #tag or a court.'}
      />
    )
  );

  // "#" alone, or with one letter: tags to pick, each saying how much carries it.
  const tagBody = () => (
    <ScrollView ref={scrollRef} {...scrolling} contentContainerStyle={bottom}>
      {tagRows.length ? head(q.text ? 'Tags' : 'Trending this week') : null}
      {tagRows.map((t, i) => {
        const c = tagCounts.get(t) ?? { posts: 0, threads: 0 };
        const line2 = [c.posts ? `${c.posts} ${c.posts === 1 ? 'post' : 'posts'}` : null, c.threads ? `${c.threads} ${c.threads === 1 ? 'thread' : 'threads'}` : null].filter(Boolean).join(' · ');
        return (
          <Pressable key={t} accessibilityRole="button" accessibilityLabel={`Search #${t}, ${line2}`} onPress={() => pickTag(t)} style={({ pressed }) => [styles.recentMain, styles.tagRow, pressed && styles.pressed]}>
            <View style={styles.circle}><Text style={styles.hash}>#</Text></View>
            <View style={[styles.recentWords, i > 0 && styles.rowRule]}>
              <Highlighted text={t} words={q.words} style={styles.recentText} strong={styles.rowNameMatch} lines={1} wordStart />
              {line2 ? <Text style={styles.rowMeta} numberOfLines={1}>{line2}</Text> : null}
            </View>
          </Pressable>
        );
      })}
      {!tagRows.length ? (
        <EmptyState icon="pricetag-outline" title={q.text ? `No tags starting “${q.text}”` : 'No tags yet'} body="Type a word after the # to find posts and threads tagged with it." />
      ) : null}
    </ScrollView>
  );

  // "@" alone: the people you follow (or players to follow), ready to open.
  const followedBody = () => (
    <ScrollView ref={scrollRef} {...scrolling} contentContainerStyle={bottom}>
      {followedRows.length ? (
        <>
          {head('Following')}
          {followedRows.map((u, i) => <PersonRow key={u.id} user={u} first={i === 0} onPress={() => openPerson(u)} />)}
        </>
      ) : suggested.length ? (
        <>
          {head(nearAny ? 'Players near you' : 'Suggested players')}
          {suggested.map((sg, i) => <PersonRow key={sg.user.id} user={sg.user} reason={suggestionReason(sg.user, sg.reason)} first={i === 0} onPress={() => openPerson(sg.user)} onFollowed={noteFollowed} />)}
        </>
      ) : (
        <EmptyState icon="at-outline" title="Find a player" body="Type their @handle." />
      )}
    </ScrollView>
  );

  const allTab = () => (
    <ScrollView ref={scrollRef} {...scrolling} contentContainerStyle={bottom}>
      {!q.text ? null : !sections.length ? none('all') : sections.map((s, i) => (
        <View key={s}>
          {i > 0 ? rule : null}
          {s === 'people' ? (
            <>
              {head('People', people.length > Math.min(counts.people, ON_ALL.people) ? () => setTab('people') : undefined)}
              {peopleOnAll.slice(0, ON_ALL.people).map((hit, k) => personRow(hit, k === 0))}
            </>
          ) : s === 'posts' ? (
            <>
              {head('Posts', counts.posts > ON_ALL.posts ? () => setTab('posts') : undefined)}
              <View style={styles.grid}>{foundPosts.slice(0, ON_ALL.posts).map(tile)}</View>
            </>
          ) : s === 'threads' ? (
            <>
              {head('Threads', counts.threads > ON_ALL.threads ? () => setTab('threads') : undefined)}
              {threads.slice(0, ON_ALL.threads).map((hit, k) => threadRow(hit, k === 0))}
            </>
          ) : (
            <>
              {head('Courts', counts.courts > ON_ALL.courts ? () => setTab('courts') : undefined)}
              {foundCourts.slice(0, ON_ALL.courts).map((hit, k) => courtRow(hit, k === 0))}
            </>
          )}
        </View>
      ))}
    </ScrollView>
  );

  const oneTab = () => {
    if (!q.text) return null;
    if (tab === 'people') return <FlatList key="people" ref={peopleRef} {...scrolling} contentContainerStyle={bottom} data={people} keyExtractor={(h) => h.user.id} renderItem={({ item, index }) => personRow(item, index === 0)} ListEmptyComponent={none('people')} />;
    if (tab === 'posts') return <FlatList key="posts" ref={postsRef} {...scrolling} contentContainerStyle={[styles.gridList, bottom]} numColumns={3} data={foundPosts} keyExtractor={(p) => p.id} renderItem={({ item }) => tile(item)} ListEmptyComponent={none('posts')} />;
    if (tab === 'threads') return <FlatList key="threads" ref={threadsRef} {...scrolling} contentContainerStyle={bottom} data={threads} keyExtractor={(h) => h.question.id} renderItem={({ item, index }) => threadRow(item, index === 0)} ListEmptyComponent={none('threads')} />;
    return <FlatList key="courts" ref={courtsRef} {...scrolling} contentContainerStyle={bottom} data={foundCourts} keyExtractor={(h) => h.court.id} renderItem={({ item, index }) => courtRow(item, index === 0)} ListEmptyComponent={courts === null && q.text.length >= 2 ? spinner : none('courts')} />;
  };

  return (
    <View style={[styles.root, { paddingTop: isPhone ? insets.top : Platform.OS !== 'web' ? Math.max(insets.top, spacing.sm) : spacing.sm }]}>
      <View
        style={[styles.column, !isPhone && { maxWidth: LAYOUT.soloColumn }]}
        onLayout={(e) => { const w = Math.floor(e.nativeEvent.layout.width); if (w > 0 && w !== columnW) setColumnW(w); }}
      >
        <View style={[styles.bar, !isPhone && styles.barWide]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ left: 10, right: 4 }} onPress={() => goBack()} style={styles.back}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <SearchField
            ref={input}
            value={term}
            onChangeText={setTerm}
            onClear={() => { setTab('all'); input.current?.focus(); }}
            onSubmit={() => { saveTerm(term); input.current?.blur(); }}
            onFocus={() => { focusedAt.current = offset.current; }}
            onBlur={() => { focusedAt.current = null; }}
            onKeyPress={(e) => { if (e.nativeEvent.key === 'Escape' && term) empty(); }}
          />
        </View>
        {showTabs ? (
          <View style={styles.tabs} accessibilityRole="tablist">
            {TABS.map((t) => {
              const on = tab === t.value;
              return (
                <Pressable key={t.value} accessibilityRole="tab" accessibilityState={{ selected: on }} hitSlop={{ top: 3, bottom: 3 }} onPress={() => setTab(t.value)} style={styles.tab}>
                  <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
                  {on ? <View style={styles.tabLine} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {!typing ? beforeTyping() : q.mode === 'people' && !q.text ? followedBody() : pickingTag ? tagBody() : tab === 'all' ? allTab() : oneTab()}
      </View>
      {/* Android: the results end at the keyboard's top, not under it (see keyboardRoom). */}
      {KEYBOARD_ROOM ? <Reanimated.View pointerEvents="none" style={keyboardRoom} /> : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  column: { flex: 1, width: '100%', alignSelf: 'center' },
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  barWide: { paddingTop: spacing.xl },
  back: { width: 32, height: 44, marginLeft: -6, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', height: 40, paddingHorizontal: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabText: { ...typography.smallStrong, fontSize: 14, color: colors.textFaint },
  tabTextOn: { color: colors.text },
  tabLine: { position: 'absolute', bottom: 0, width: 24, height: 2, borderRadius: 1, backgroundColor: colors.brand },
  head: { height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  // A grouped list's head (DESIGN.md): a step above the 16/500 names under it.
  headTitle: { ...typography.heading, color: colors.text },
  seeAll: { ...typography.smallStrong, color: colors.brand },
  clearedText: { ...typography.small, color: colors.textMuted },
  gapAbove: { marginTop: spacing.xl },
  ruleWrap: { marginHorizontal: spacing.lg },
  spinner: { paddingTop: spacing.xxl, alignItems: 'center' },
  // One row frame for threads and courts, the same as a person's.
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingLeft: spacing.lg },
  pressed: { backgroundColor: colors.bgElevated },
  rowBody: { flex: 1, minWidth: 0, minHeight: 60, paddingVertical: spacing.sm, paddingRight: spacing.lg, justifyContent: 'center', gap: 2 },
  threadBody: { minHeight: 64 },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowName: { ...font('500'), fontSize: 16, lineHeight: 21, color: colors.text },
  rowNameMatch: { ...font('700') },
  rowMeta: { ...typography.small, color: colors.textFaint, flexShrink: 1 },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowTag: { color: colors.textMuted },
  rowTagMatch: { ...font('700'), color: colors.text },
  snippet: { ...typography.small, lineHeight: 18, color: colors.textMuted },
  snippetMatch: { ...font('700'), color: colors.text },
  topicTile: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  courtTile: { width: 34, height: 34, marginHorizontal: 3, borderRadius: 10, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: spacing.lg },
  gridList: { paddingHorizontal: spacing.lg },
  // Recent searches: 56 high, the hairline from the words to the ✕.
  recentRow: { flexDirection: 'row', alignItems: 'stretch' },
  recentMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingLeft: spacing.lg },
  recentWords: { flex: 1, minWidth: 0, minHeight: 56, justifyContent: 'center', gap: 1, paddingVertical: 6 },
  recentText: { ...font('500'), fontSize: 16, color: colors.text },
  removeWrap: { paddingRight: spacing.xs, justifyContent: 'center' },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  circle: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  circleCourt: { backgroundColor: colors.brandDim },
  tagRow: { paddingRight: spacing.lg },
  hash: { ...font('600'), fontSize: 17, color: colors.brand },
  hashInline: { color: colors.brand },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  // The # sits against its word ("#practice", not "# practice").
  chip: { flexDirection: 'row', alignItems: 'center', gap: 1, height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.surface },
  chipText: { ...typography.small, color: colors.text },
  chipHash: { ...typography.smallStrong, color: colors.brand },
});

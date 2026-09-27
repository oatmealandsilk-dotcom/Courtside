import { asTabRoute } from '@/features/navigation/tabFocus';
import { SectionPager } from '@/components/SectionPager';
import Reanimated from 'react-native-reanimated';
import { useTabUnderline } from '@/features/navigation/useTabUnderline';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, TextInput, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import Ionicons from '@expo/vector-icons/Ionicons';

import { LevelPill } from '@/components/LevelPill';
import { NearbyMap } from '@/components/NearbyMap';
import { useLocationToggle } from '@/features/players/useLocationToggle';
import { QuestionCard, TOPIC_META } from '@/components/QuestionCard';
import { HitCard } from '@/components/HitCard';
import { Avatar, Chip, EmptyState, Screen } from '@/components/ui';
import { reportSection, subscribeSectionRequest } from '@/features/navigation/swipeOrder';
import { useApp } from '@/store/AppContext';
import type { QuestionTopic } from '@/data/types';
import { colors, radius, spacing, typography, font, lift } from '@/theme';
import { isDesktopBrowser } from '@/lib/browserDevice';

const TOPICS: (QuestionTopic | 'all')[] = [
  'all',
  'gear',
  'technique',
  'strategy',
  'injury',
  'fitness',
  'rules',
  'mental',
];

const SORT_LABEL = { new: 'New', hot: 'Hot', top: 'Top', unanswered: 'Unanswered' } as const;
const SORT_HINT = { new: 'Newest first', hot: 'Busiest right now', top: 'Most upvoted', unanswered: 'Nobody has replied yet' } as const;

function Discuss({ previewSection }: { previewSection?: string } = {}) {
  const styles = useThemedStyles(styleDefinitions);
  const { questions, users, currentUserId, currentUser, blockedIds, mutedIds, saved, actions, detectedCoords, locationEnabled, hitRequests } = useApp();
  // The section lives here, not in the address: listening to the address made
  // this whole tab re-render on every route change anywhere in the app.
  // Other pages ask for a section through requestSection before navigating.
  const [localSection, setLocalSection] = useState<'players' | 'discussions'>('discussions');
  const section = previewSection ? (previewSection === 'players' ? 'players' : 'discussions') : localSection;
  // Held locally only: pushing it into the address on every swipe made the
  // whole app re-render mid-gesture.
  const setSection = (value: string) => setLocalSection(value === 'players' ? 'players' : 'discussions');
  useEffect(() => subscribeSectionRequest('/discuss', (value) => setLocalSection(value === 'players' ? 'players' : 'discussions')), []);
  if (!previewSection) reportSection('/discuss', section);
  // The underline under Discussions / Find Players follows the finger.
  const sectionIndex = section === 'players' ? 1 : 0;
  const [tabWidth, setTabWidth] = useState(0);
  const underline = useTabUnderline(sectionIndex, 2, tabWidth);
  const [search, setSearch] = useState('');
  const location = useLocationToggle();
  // The account that threads are pulled in under (Reddit) is not a player.
  const myCity = (currentUser?.location ?? '').split(',')[0].trim().toLowerCase();
  const sameCity = (u: (typeof users)[number]) => !!myCity && (u.location ?? '').toLowerCase().startsWith(myCity);
  // Your own city first — the people you could actually hit with this week.
  const players = users
    .filter(u => u.id !== currentUserId && !blockedIds.includes(u.id) && `${u.name} ${u.handle} ${u.location}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Number(sameCity(b)) - Number(sameCity(a)));
  const [topic, setTopic] = useState<QuestionTopic | 'all'>('all');
  // A topic picked from a thread's label may sit off the end of the strip: the strip slides it into view.
  const topicStrip = useRef<ScrollView>(null);
  const chipX = useRef<Record<string, number>>({});
  useEffect(() => { const x = chipX.current[topic]; if (x !== undefined) topicStrip.current?.scrollTo({ x: Math.max(0, x - 16), animated: true }); }, [topic]);
  // A post's category label asks for its topic before opening this tab.
  useEffect(() => subscribeSectionRequest('/discuss#topic', (value) => setTopic(value in TOPIC_META ? (value as QuestionTopic) : 'all')), []);


  // How the list is ordered, the way Reddit offers it. New stays the default.
  const [sort, setSort] = useState<'new' | 'hot' | 'top' | 'unanswered'>('new');
  // Hits still ahead (or just started), not called off, not from anyone blocked or muted.
  const openHits = hitRequests.filter((h) => !h.cancelled && Date.parse(h.startsAt) > Date.now() - 3_600_000 && !blockedIds.includes(h.authorId) && !mutedIds.includes(h.authorId)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const [sortOpen, setSortOpen] = useState(false);
  const [shownCount, setShownCount] = useState(25);
  const visible = useMemo(() => {
    // Nobody you have blocked or muted shows up here, the same as in the feed.
    let list = questions.filter((q) => !blockedIds.includes(q.authorId) && !mutedIds.includes(q.authorId));
    if (topic !== 'all') list = list.filter((q) => q.topic === topic);

    const newest = (a: typeof list[number], b: typeof list[number]) => Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (sort === 'unanswered') list = list.filter((q) => q.answerIds.length === 0);
    if (sort === 'top') list.sort((a, b) => b.votes - a.votes || b.answerIds.length - a.answerIds.length || newest(a, b));
    else if (sort === 'hot') {
      // Votes and replies, pulled down by age: a lively thread from today beats a quiet one from last month.
      const heat = (q: typeof list[number]) => (q.votes + 2 * q.answerIds.length + 1) / Math.pow((Date.now() - Date.parse(q.createdAt)) / 3_600_000 + 2, 1.5);
      list.sort((a, b) => heat(b) - heat(a));
    } else list.sort(newest);
    return list;
  }, [questions, topic, blockedIds, mutedIds, sort]);
  // A long list is drawn in slices: the first screenfuls at once, the rest on request.
  const slice = visible.slice(0, shownCount);

  const content = (section:string) => (section === 'players' ? <View style={{ gap: 16 }}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={17} color={colors.textFaint} style={styles.searchIcon} />
          <TextInput accessibilityLabel="Search players" placeholder="Name, handle or city" placeholderTextColor={colors.textFaint} value={search} onChangeText={setSearch} style={styles.search} />
        </View>
        {currentUser && !search ? (section === 'players'
          ? <NearbyMap me={currentUser} players={players} at={detectedCoords} locationOn={location.locationOn} locating={location.locating} onToggleLocation={location.toggle} onOpen={id => router.push(`/user/${id}`)} onExpand={() => router.push('/map')} />
          // The same footprint, empty: keeps the list from jumping when the map mounts on arrival.
          : <View style={styles.mapStandIn} />) : null}
        {/* Hits: someone wants a game, soonest first. Posting one is right here. */}
        {!search ? (
          <View style={styles.hits}>
            <View style={styles.hitsHead}>
              <Text style={styles.playersTitle}>Open hits</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push('/hit-request/new')} hitSlop={8}><Text style={styles.postHit}>Post one</Text></Pressable>
            </View>
            {openHits.length ? openHits.slice(0, 5).map((h) => <HitCard key={h.id} hit={h} />) : (
              <Pressable accessibilityRole="button" onPress={() => router.push('/hit-request/new')} style={styles.hitPrompt}>
                <Ionicons name="tennisball-outline" size={20} color={colors.brand} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.hitPromptTitle}>Looking for someone to play?</Text>
                  <Text style={styles.hitPromptBody}>Say when and where. Players nearby can join.</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </Pressable>
            )}
          </View>
        ) : null}
        {players.length ? <View style={styles.playersHead}>
          {/* Just "Players": the ones near you say so on their own row. */}
          <Text style={styles.playersTitle}>Players</Text>
          {search ? <Text style={styles.playersBody}>{`${players.length} ${players.length === 1 ? 'match' : 'matches'}`}</Text> : null}
        </View> : null}
        {players.map((user, index) => <Pressable key={user.id} accessibilityRole="link" onPress={() => router.push(`/user/${user.id}`)} style={({ pressed }) => [styles.player, pressed && styles.playerPressed]}>
          <Avatar name={user.name} seed={user.avatarSeed} size={52} ring={user.isCoach} />
          <View style={[styles.playerBody, index > 0 && styles.playerLine]}>
            <View style={styles.playerTop}><Text style={styles.playerName} numberOfLines={1}>{user.name}</Text><LevelPill profile={user.profile} small /></View>
            <View style={styles.playerTop}>
              {sameCity(user) ? <View style={styles.near}><Text style={styles.nearText}>Near you</Text></View> : null}
              <Text style={styles.playerMeta} numberOfLines={1}>@{user.handle} · {user.location}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} style={styles.playerChevron} />
        </Pressable>)}
        {!players.length && <EmptyState title="No players found" body="Try another name or city." />}
      </View> : <>
      <View style={styles.controls}>
        <ScrollView ref={topicStrip} nativeID="topic-filter-strip" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topicRow}>
          {TOPICS.map((t) => (
            // The picked topic is filled in the section's own colour, so it is plain which one is on.
            <View key={t} onLayout={(e) => { chipX.current[t] = e.nativeEvent.layout.x; }}>
              <Chip
                label={t === 'all' ? 'All' : t === 'injury' ? 'Injuries' : t.charAt(0).toUpperCase() + t.slice(1)}
                selected={topic === t}
                tint={colors.text}
                ink={colors.brandInk}
                onPress={() => setTopic(t)}
                small
              />
            </View>
          ))}
        </ScrollView>
        {/* One quiet line under the topics: how many threads, and a single Sort button, the way Reddit does it. */}
        <View style={styles.sortRow}>
          <Text style={styles.sortCount}>{visible.length === 1 ? '1 thread' : `${visible.length} threads`}</Text>
          <View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Sort: ${SORT_LABEL[sort]}`} accessibilityState={{ expanded: sortOpen }} onPress={() => setSortOpen((o) => !o)} hitSlop={8} style={({ pressed }) => [styles.sortButton, pressed && { opacity: 0.7 }]}>
              <Ionicons name="swap-vertical" size={14} color={colors.textMuted} />
              <Text style={styles.sortButtonText}>{SORT_LABEL[sort]}</Text>
              <Ionicons name={sortOpen ? 'chevron-up' : 'chevron-down'} size={13} color={colors.textMuted} />
            </Pressable>
            {sortOpen ? (
              <View style={styles.sortMenu}>
                {(['new', 'hot', 'top', 'unanswered'] as const).map((key, i) => (
                  <Pressable key={key} accessibilityRole="menuitem" accessibilityState={{ selected: sort === key }} onPress={() => { setSort(key); setSortOpen(false); }} style={({ pressed }) => [styles.sortItem, i > 0 && styles.sortItemLine, pressed && { backgroundColor: colors.bgElevated }]}>
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text style={[styles.sortItemTitle, sort === key && { color: colors.brand }]}>{SORT_LABEL[key]}</Text>
                      <Text style={styles.sortItemBody}>{SORT_HINT[key]}</Text>
                    </View>
                    {sort === key ? <Ionicons name="checkmark" size={16} color={colors.brand} /> : null}
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {visible.length === 0 ? (
        <EmptyState
          icon="help-circle-outline"
          title="No questions here"
          body="Be the first to ask. Specific questions get specific answers."
        />
      ) : (
        <View style={styles.list}>
          {slice.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              author={users.find((u) => u.id === q.authorId)}
              answered={Boolean(q.acceptedAnswerId)}
              saved={saved.questionIds.includes(q.id)}
              onToggleSave={() => actions.toggleSaveQuestion(q.id)}
              onShare={() => router.push(`/share?kind=question&id=${q.id}`)}
              onPress={() => router.push(`/question/${q.id}`)}
            />
          ))}
          {visible.length > slice.length ? (
            <Pressable accessibilityRole="button" onPress={() => setShownCount((n) => n + 25)} style={styles.more}>
              <Text style={styles.moreText}>Show more threads</Text>
            </Pressable>
          ) : null}
          <Text style={styles.end}>
            {visible.length} {visible.length === 1 ? 'thread' : 'threads'}
          </Text>
        </View>
      )}
      </>);

  return (
    <Screen memoryKey="discuss" wash onRefresh={previewSection === undefined && !isDesktopBrowser() ? actions.refresh : undefined}
      title="Community"
      subtitle="Find your people. Talk about your game."
      right={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Search discussions and players"
            // From Find Players the search opens on players; from Discussions on everything.
            onPress={() => router.push(section === 'players' ? { pathname: '/search', params: { scope: 'players' } } : '/search')}
            hitSlop={8}
          >
            <Ionicons name="search" size={23} color={colors.text} />
          </Pressable>
          {/* The + makes what the tab is about: a thread on Discussions, a hit on Find Players. */}
          <Pressable accessibilityRole="button" accessibilityLabel={section === 'players' ? 'Look for someone to play with' : 'Start a discussion'} onPress={() => router.push(section === 'players' ? '/hit-request/new' : '/ask')} style={styles.fab}>
            <Ionicons name="add" size={22} color={colors.brandInk} />
          </Pressable>
        </View>
      }
    >
      <View style={styles.sections} onLayout={e => setTabWidth(e.nativeEvent.layout.width / 2)}>
        {(['discussions', 'players'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: section === value }} onPress={() => setSection(value)} style={styles.section}><Text style={{ ...typography.bodyStrong, fontSize: 16, color: section === value ? colors.text : colors.textMuted }}>{value === 'discussions' ? 'Discussions' : 'Find Players'}</Text></Pressable>)}
        {tabWidth > 0 && <Reanimated.View pointerEvents="none" style={[styles.sectionUnderline, { width: tabWidth }, underline.style]} />}
      </View>
      <SectionPager
        index={sectionIndex}
        panes={[content('discussions'), content('players')]}
        progress={underline.progress}
        depth={1}
        delegateLeft
        delegateRight
        onIndex={(i) => setSection(i === 1 ? 'players' : 'discussions')}
      />
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  hits: { gap: spacing.md },
  hitsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm },
  postHit: { ...typography.smallStrong, color: colors.brand },
  hitPrompt: { ...lift, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.surface },
  hitPromptTitle: { ...typography.bodyStrong, color: colors.text },
  hitPromptBody: { ...typography.small, color: colors.textMuted },
  sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 5 },
  sortCount: { ...typography.small, color: colors.textFaint },
  sortButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  sortButtonText: { ...typography.smallStrong, color: colors.textMuted },
  sortMenu: { ...lift, position: 'absolute', top: 36, right: 0, width: 240, borderRadius: 16, backgroundColor: colors.surface, overflow: 'hidden', zIndex: 10 },
  sortItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 14, paddingVertical: 11 },
  sortItemLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sortItemTitle: { ...typography.smallStrong, color: colors.text },
  sortItemBody: { ...typography.caption, letterSpacing: 0, color: colors.textMuted },
  sections: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 16 },
  more: { alignSelf: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, marginTop: spacing.md },
  moreText: { ...typography.smallStrong, color: colors.text },
  section: { flex: 1, alignItems: 'center', paddingVertical: 18 },
  sectionUnderline: { position: 'absolute', left: 0, bottom: -1, height: 2, backgroundColor: colors.brand, borderRadius: 1 },
  searchWrap: { position: 'relative', justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: 16, zIndex: 1 },
  search: { ...typography.body, fontSize: 16, color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingLeft: 42, paddingRight: spacing.lg, paddingVertical: 12 },
  mapStandIn: { height: 330, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  playersHead: { gap: 3, paddingTop: spacing.sm },
  playersTitle: { ...typography.title, color: colors.text },
  playersBody: { ...typography.small, color: colors.textMuted },
  player: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginHorizontal: -spacing.lg, paddingLeft: spacing.lg },
  playerPressed: { backgroundColor: colors.bgElevated },
  playerBody: { flex: 1, gap: 4, minWidth: 0, paddingVertical: 14 },
  playerLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  playerTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  playerName: { ...typography.body, ...font('500'), fontSize: 16, color: colors.text, flexShrink: 1 },
  playerMeta: { ...typography.small, color: colors.textMuted, flexShrink: 1 },
  near: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  nearText: { ...typography.caption, fontSize: 11, color: colors.brand, letterSpacing: 0 },
  playerChevron: { marginRight: spacing.lg },
  fab: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Above the list, so the Sort menu opens over the threads rather than under them.
  controls: { gap: spacing.md, paddingBottom: spacing.lg, zIndex: 10, elevation: 10 },
  topicRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 8 },
  list: { gap: spacing.md },
  end: { ...typography.small, color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.xl },
});

export default asTabRoute<{ previewSection?: string }>(Discuss);

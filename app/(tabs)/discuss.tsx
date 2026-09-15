import { asTabRoute } from '@/features/navigation/tabFocus';
import { SectionPager } from '@/components/SectionPager';
import Reanimated from 'react-native-reanimated';
import { useTabUnderline } from '@/features/navigation/useTabUnderline';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, TextInput, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Ionicons } from '@expo/vector-icons';

import { LevelPill } from '@/components/LevelPill';
import { NearbyMap } from '@/components/NearbyMap';
import { QuestionCard, TOPIC_META } from '@/components/QuestionCard';
import { Avatar, Chip, EmptyState, Screen } from '@/components/ui';
import { reportSection, subscribeSectionRequest } from '@/features/navigation/swipeOrder';
import { useApp } from '@/store/AppContext';
import type { QuestionTopic } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

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

function Discuss({ previewSection }: { previewSection?: string } = {}) {
  const styles = useThemedStyles(styleDefinitions);
  const { questions, users, currentUserId, currentUser, blockedIds, saved, actions, detectedCoords } = useApp();
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
  const players = users.filter(u => u.id !== currentUserId && !blockedIds.includes(u.id) && `${u.name} ${u.handle} ${u.location}`.toLowerCase().includes(search.toLowerCase()));
  const [topic, setTopic] = useState<QuestionTopic | 'all'>('all');
  // A post's category label asks for its topic before opening this tab.
  useEffect(() => subscribeSectionRequest('/discuss#topic', (value) => setTopic(value in TOPIC_META ? (value as QuestionTopic) : 'all')), []);


  const [shownCount, setShownCount] = useState(25);
  const visible = useMemo(() => {
    let list = [...questions];
    if (topic !== 'all') list = list.filter((q) => q.topic === topic);

    list.sort((a, b) => b.votes - a.votes);
    return list;
  }, [questions, topic]);
  // A long list is drawn in slices: the first screenfuls at once, the rest on request.
  const slice = visible.slice(0, shownCount);

  const content = (section:string) => (section === 'players' ? <View style={{ gap: 16 }}>
        <TextInput accessibilityLabel="Search players" placeholder="Search by name, handle, or city" placeholderTextColor={colors.textFaint} value={search} onChangeText={setSearch} style={styles.search} />
        {currentUser && !search ? <NearbyMap me={currentUser} players={players} at={detectedCoords} onOpen={id => router.push(`/user/${id}`)} onExpand={() => router.push('/map')} /> : null}
        {players.map(user => <Pressable key={user.id} accessibilityRole="link" onPress={() => router.push(`/user/${user.id}`)} style={styles.player}>
          <Avatar name={user.name} seed={user.avatarSeed} size={44} />
          <View style={{ flex: 1, gap: 4 }}><View style={{flexDirection:"row",alignItems:"center",gap:8,flexWrap:"wrap"}}><Text style={styles.playerName}>{user.name}</Text><LevelPill profile={user.profile} small /></View><Text style={styles.playerMeta}>@{user.handle} · {user.location}</Text></View>

        </Pressable>)}
        {!players.length && <EmptyState title="No players found" body="Try another name or city." />}
      </View> : <>
      <View style={styles.controls}>
        <ScrollView nativeID="topic-filter-strip" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topicRow}>
          {TOPICS.map((t) => (
            <Chip
              key={t}
              label={t === 'all' ? 'All' : t === 'injury' ? 'Injuries' : t.charAt(0).toUpperCase() + t.slice(1)}
              selected={topic === t}
              tint={colors.surfaceAlt}
              ink={colors.warning}
              onPress={() => setTopic(t)}
              small
            />
          ))}
        </ScrollView>
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
    <Screen memoryKey="discuss"
      title="Community"
      subtitle="Find your people. Talk about your game."
      right={
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Search discussions and players"
          onPress={() => router.push('/search')}
          hitSlop={8}
        >
          <Ionicons name="search" size={23} color={colors.text} />
        </Pressable>
      }
    >
      <View style={styles.sections} onLayout={e => setTabWidth(e.nativeEvent.layout.width / 2)}>
        {(['discussions', 'players'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: section === value }} onPress={() => setSection(value)} style={styles.section}><Text style={{ fontSize: 16, fontWeight: '600', color: section === value ? colors.warning : colors.textMuted }}>{value === 'discussions' ? 'Discussions' : 'Find Players'}</Text></Pressable>)}
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
  sections: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 16 },
  more: { alignSelf: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, marginTop: spacing.md },
  moreText: { ...typography.smallStrong, color: colors.text },
  section: { flex: 1, alignItems: 'center', paddingVertical: 18 },
  sectionUnderline: { position: 'absolute', left: 0, bottom: -1, height: 3, backgroundColor: colors.warning, borderRadius: 1.5 },
  search: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 14, color: colors.text, backgroundColor: colors.surface },
  player: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.border },
  playerName: { fontWeight: '600', fontSize: 15, color: colors.text },
  playerMeta: { fontSize: 12, color: colors.textMuted },
  fab: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controls: { gap: spacing.md, paddingBottom: spacing.lg },
  topicRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 8 },
  list: { gap: spacing.md },
  end: { ...typography.small, color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.xl },
});

export default asTabRoute<{ previewSection?: string }>(Discuss);

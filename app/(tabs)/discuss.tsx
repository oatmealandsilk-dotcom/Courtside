import { SwipeSurface } from '@/components/SwipeSurface';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useMemo, useState } from 'react';
import { ScrollView, TextInput, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Ionicons } from '@expo/vector-icons';

import { LevelPill } from '@/components/LevelPill';
import { QuestionCard } from '@/components/QuestionCard';
import { Avatar, Chip, EmptyState, Screen } from '@/components/ui';
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

export default function Discuss({ previewSection }: { previewSection?: string } = {}) {
  const styles = useThemedStyles(styleDefinitions);
  const { questions, users, currentUserId, saved, actions } = useApp();
  const params = useLocalSearchParams<{ section?: string }>();
  const section = (previewSection ?? params.section) === 'players' ? 'players' : 'discussions';
  const setSection = (value: string) => router.setParams({ section: value });
  const [search, setSearch] = useState('');
  const players = users.filter(u => u.id !== currentUserId && `${u.name} ${u.handle} ${u.location}`.toLowerCase().includes(search.toLowerCase()));
  const [topic, setTopic] = useState<QuestionTopic | 'all'>('all');

  const visible = useMemo(() => {
    let list = [...questions];
    if (topic !== 'all') list = list.filter((q) => q.topic === topic);

    list.sort((a, b) => b.votes - a.votes);
    return list;
  }, [questions, topic]);

  const content = (section:string) => (section === 'players' ? <View style={{ gap: 16 }}>
        <TextInput accessibilityLabel="Search players" placeholder="Search by name, handle, or city" placeholderTextColor={colors.textFaint} value={search} onChangeText={setSearch} style={styles.search} />
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
          {visible.map((q) => (
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
          <Text style={styles.end}>
            {visible.length} {visible.length === 1 ? 'thread' : 'threads'}
          </Text>
        </View>
      )}
      </>);

  return (
    <Screen
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
      <View style={styles.sections}>
        {(['discussions', 'players'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: section === value }} onPress={() => setSection(value)} style={[styles.section, section === value && styles.sectionActive]}><Text style={{ fontSize: 16, fontWeight: '600', color: section === value ? colors.warning : colors.textMuted }}>{value === 'discussions' ? 'Discussions' : 'Find Players'}</Text></Pressable>)}
      </View>
      <SwipeSurface fill={false} enabled={!previewSection} delegateRight={section === 'discussions'} delegateLeft={section === 'players'}
        onSwipe={direction=>setSection(direction===1 ? 'players' : 'discussions')}
        renderPreview={direction=>direction===1 && section==='discussions' ? content('players') : direction===-1 && section==='players' ? content('discussions') : null}>
        {content(section)}
      </SwipeSurface>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  sections: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 16 },
  section: { flex: 1, alignItems: 'center', paddingVertical: 18, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  sectionActive: { borderBottomColor: colors.warning },
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

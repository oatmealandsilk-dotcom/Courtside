import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { QuestionCard } from '@/components/QuestionCard';
import { Chip, EmptyState, Screen, SegmentedControl, type Segment } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import type { QuestionTopic } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

type Sort = 'top' | 'new' | 'unanswered';

const SORTS: Segment<Sort>[] = [
  { value: 'top', label: 'Top' },
  { value: 'new', label: 'Newest' },
  { value: 'unanswered', label: 'Unanswered' },
];

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

export default function Discuss() {
  const { questions, users } = useApp();
  const [sort, setSort] = useState<Sort>('top');
  const [topic, setTopic] = useState<QuestionTopic | 'all'>('all');

  const visible = useMemo(() => {
    let list = [...questions];
    if (topic !== 'all') list = list.filter((q) => q.topic === topic);
    if (sort === 'unanswered') list = list.filter((q) => q.answerIds.length === 0);
    list.sort((a, b) =>
      sort === 'new'
        ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        : b.votes - a.votes,
    );
    return list;
  }, [questions, sort, topic]);

  return (
    <Screen
      title="Discuss"
      subtitle="Gear, technique, injuries, strategy — answered by people who play"
      right={
        <Pressable
          onPress={() => router.push('/ask')}
          style={styles.fab}
          accessibilityRole="button"
          accessibilityLabel="Ask a question"
        >
          <Ionicons name="create-outline" size={19} color={colors.brandInk} />
        </Pressable>
      }
    >
      <View style={styles.controls}>
        <SegmentedControl segments={SORTS} value={sort} onChange={setSort} />
        <View style={styles.topicRow}>
          {TOPICS.map((t) => (
            <Chip
              key={t}
              label={t === 'all' ? 'All topics' : t}
              selected={topic === t}
              onPress={() => setTopic(t)}
              small
            />
          ))}
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
          {visible.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              author={users.find((u) => u.id === q.authorId)}
              answered={Boolean(q.acceptedAnswerId)}
              onPress={() => router.push(`/question/${q.id}`)}
            />
          ))}
          <Text style={styles.end}>
            {visible.length} {visible.length === 1 ? 'thread' : 'threads'}
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fab: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controls: { gap: spacing.md, paddingBottom: spacing.lg },
  topicRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  list: { gap: spacing.md },
  end: { ...typography.small, color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.xl },
});

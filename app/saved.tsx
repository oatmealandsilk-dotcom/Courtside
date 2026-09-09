import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { QuestionCard } from '@/components/QuestionCard';
import { EmptyState, Screen, SegmentedControl } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/** Everything the player has bookmarked: reels and posts, plus discussions. */
export default function Saved() {
  const { saved, posts, questions, users, actions } = useApp();
  const [tab, setTab] = useState<'videos' | 'discussions'>('videos');

  const savedPosts = saved.postIds
    .map((id) => posts.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const savedQuestions = saved.questionIds
    .map((id) => questions.find((q) => q.id === id))
    .filter((q): q is NonNullable<typeof q> => Boolean(q));

  return (
    <Screen title="Saved" compactTitle onBack={() => router.back()}>
      <View style={styles.top}>
        <SegmentedControl
          segments={[
            { value: 'videos', label: `Videos${savedPosts.length ? ` (${savedPosts.length})` : ''}` },
            {
              value: 'discussions',
              label: `Discussions${savedQuestions.length ? ` (${savedQuestions.length})` : ''}`,
            },
          ]}
          value={tab}
          onChange={setTab}
        />
        <Text style={styles.note}>Only you can see what you save.</Text>
      </View>

      {tab === 'videos' ? (
        savedPosts.length ? (
          <View style={styles.grid}>
            {savedPosts.map((post) => {
              const author = users.find((u) => u.id === post.authorId);
              return (
                <Pressable
                  key={post.id}
                  accessibilityRole="link"
                  accessibilityLabel={`Open post by ${author?.name}`}
                  onPress={() => router.push(`/post/${post.id}`)}
                  style={styles.tile}
                >
                  <View style={styles.tileTop}>
                    <Ionicons
                      name={post.kind === 'reel' ? 'play' : 'document-text-outline'}
                      size={16}
                      color="#D7DDCB"
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Remove from saved"
                      onPress={() => actions.toggleSavePost(post.id)}
                      hitSlop={8}
                    >
                      <Ionicons name="bookmark" size={16} color="#D7DDCB" />
                    </Pressable>
                  </View>
                  <Text numberOfLines={4} style={styles.tileText}>
                    {post.body}
                  </Text>
                  <Text style={styles.tileMeta}>
                    @{author?.handle ?? 'player'} · {relativeTime(post.createdAt)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <EmptyState
            icon="bookmark-outline"
            title="Nothing saved yet"
            body="Tap the bookmark on any reel or post to keep it here."
          />
        )
      ) : savedQuestions.length ? (
        <View style={styles.list}>
          {savedQuestions.map((question) => (
            <QuestionCard
              key={question.id}
              question={question}
              author={users.find((u) => u.id === question.authorId)}
              answered={Boolean(question.acceptedAnswerId)}
              saved
              onToggleSave={() => actions.toggleSaveQuestion(question.id)}
              onPress={() => router.push(`/question/${question.id}`)}
            />
          ))}
        </View>
      ) : (
        <EmptyState
          icon="bookmark-outline"
          title="No saved discussions"
          body="Bookmark a thread and it will wait for you here."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: spacing.sm, paddingBottom: spacing.lg },
  note: { ...typography.small, color: colors.textFaint },
  list: { gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '48%',
    aspectRatio: 0.95,
    borderRadius: radius.md,
    backgroundColor: '#22392A',
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tileText: { fontSize: 12, lineHeight: 17, color: '#E6E7D9' },
  tileMeta: { fontSize: 10, color: '#B9C4AE' },
});

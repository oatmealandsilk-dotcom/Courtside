import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { QuestionCard } from '@/components/QuestionCard';
import { EmptyState, Screen, SegmentedControl } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';

/** Everything the player has bookmarked: clips and posts, plus discussions. */
export default function Saved() {
  const styles = useThemedStyles(styleDefinitions);
  const { saved, posts, questions, users, actions } = useApp();
  const [tab, setTab] = useState<'videos' | 'discussions'>('videos');
  // The grid is three across, sized from its own measured width, the way the profile grid is.
  const { width: windowWidth } = useWindowDimensions();
  const [gridW, setGridW] = useState(0);
  const tileW = Math.floor((gridW || windowWidth - spacing.lg * 2) / 3);
  const tileH = Math.round((tileW * 4) / 3);

  const savedPosts = saved.postIds
    .map((id) => posts.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const savedQuestions = saved.questionIds
    .map((id) => questions.find((q) => q.id === id))
    .filter((q): q is NonNullable<typeof q> => Boolean(q));

  return (
    <Screen title="Saved" compactTitle onBack={() => goBack()}>
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
          // The profile grid's look: tall tiles, the picture edge to edge and nothing else on it
          // but a small mark for a video. A post with no picture shows its words instead.
          <View style={styles.grid} onLayout={(e) => { const w = Math.floor(e.nativeEvent.layout.width); if (w > 0 && w !== gridW) setGridW(w); }}>
            {savedPosts.map((post) => {
              const author = users.find((u) => u.id === post.authorId);
              const picture = post.thumbnailUrl ?? post.imageUrl;
              const video = post.kind === 'clip' || !!post.videoUrl;
              return (
                <Pressable
                  key={post.id}
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${video ? 'video' : 'post'} by ${author?.name ?? 'a player'}: ${post.body}`}
                  onPress={() => router.push(`/post/${post.id}`)}
                  style={({ pressed }) => [styles.tile, { width: tileW, height: tileH }, pressed && { opacity: 0.85 }]}
                >
                  <View style={[StyleSheet.absoluteFill, styles.tileBlank]}>
                    <Text numberOfLines={6} style={styles.tileText}>{post.body}</Text>
                  </View>
                  {picture ? <Image accessibilityIgnoresInvertColors source={{ uri: picture }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={post.id} transition={120} /> : null}
                  {video ? <Ionicons name="play" size={15} color="#FFFFFF" style={styles.tileMark} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : (
          <EmptyState
            icon="bookmark-outline"
            title="Nothing saved yet"
            body="Tap the bookmark on any clip or post to keep it here."
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

const styleDefinitions = StyleSheet.create({
  top: { gap: spacing.sm, paddingBottom: spacing.lg },
  note: { ...typography.small, color: colors.textFaint },
  list: { gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  // The same tile as the profile grid: a hairline of page colour between tiles, no rounding, no wash.
  tile: { borderWidth: 1, borderColor: colors.bg, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  tileBlank: { padding: 10, justifyContent: 'center' },
  tileText: { fontSize: 11, lineHeight: 15, color: colors.textMuted },
  tileMark: { position: 'absolute', top: 6, right: 6, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
});

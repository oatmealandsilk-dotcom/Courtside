import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { QuestionCard } from '@/components/QuestionCard';
import Reanimated from 'react-native-reanimated';

import { EmptyState, Screen } from '@/components/ui';
import { useTabUnderline } from '@/features/navigation/useTabUnderline';
import { useApp } from '@/store/AppContext';
import { colors, font, spacing, typography } from '@/theme';

/** Everything the player has bookmarked: clips and posts, plus discussions. */
export default function Saved() {
  const styles = useThemedStyles(styleDefinitions);
  const { saved, posts, questions, users, actions } = useApp();
  // Everything bookmarked, however far back — otherwise older saves quietly
  // drop off as the feed moves on.
  useEffect(() => { void actions.loadSavedPosts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = useState<'videos' | 'discussions'>('videos');
  // The profile's own tabs: two words, a count beside each, a line that slides.
  const [tabWidth, setTabWidth] = useState(0);
  const underline = useTabUnderline(tab === 'videos' ? 0 : 1, 2, tabWidth);
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
      <View style={styles.tabs} onLayout={(e) => setTabWidth(e.nativeEvent.layout.width / 2)}>
        {([['videos', 'Videos', savedPosts.length], ['discussions', 'Discussions', savedQuestions.length]] as const).map(([value, label, n]) => (
          <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} accessibilityLabel={`${label}, ${n}`} onPress={() => setTab(value)} style={styles.tab}>
            <Text style={[typography.body, tab === value ? { ...font('600'), color: colors.text } : { color: colors.textMuted }]}>{label}<Text style={[styles.tabCount, tab === value && { color: colors.brand }]}>  {n}</Text></Text>
          </Pressable>
        ))}
        {tabWidth > 0 ? <Reanimated.View pointerEvents="none" style={[styles.tabIndicator, { width: tabWidth }, underline.style]} /> : null}
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
  tabs: { flexDirection: 'row', marginBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  tabCount: { ...typography.smallStrong, fontSize: 12, color: colors.textFaint },
  tabIndicator: { position: 'absolute', left: 0, bottom: -1, height: 2, backgroundColor: colors.brand, borderRadius: 1 },
  list: { gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  // The same tile as the profile grid: a hairline of page colour between tiles, no rounding, no wash.
  tile: { borderWidth: 1, borderColor: colors.bg, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  tileBlank: { padding: 10, justifyContent: 'center' },
  tileText: { fontSize: 11, lineHeight: 15, color: colors.textMuted },
  tileMark: { position: 'absolute', top: 6, right: 6, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
});

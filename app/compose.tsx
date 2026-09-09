import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { MediaPicker, type PickedMedia } from '@/components/MediaPicker';
import { TOPIC_META } from '@/components/QuestionCard';
import { Button, Chip, Field, Screen, SegmentedControl } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import type { QuestionTopic } from '@/data/types';
import { colors, spacing, typography } from '@/theme';

/**
 * Instagram-shaped composer: pick media, write a caption, post.
 * A post carries a caption and how long you were on court — nothing else.
 * Questions get their own mode because they need a title and a topic.
 */
export default function Compose() {
  const { actions } = useApp();

  const [mode, setMode] = useState<'post' | 'question'>('post');
  const [media, setMedia] = useState<PickedMedia | null>(null);
  const [body, setBody] = useState('');
  const [minutes, setMinutes] = useState('');
  const [questionTitle, setQuestionTitle] = useState('');
  const [topic, setTopic] = useState<QuestionTopic>('gear');

  const canPost = body.trim().length > 0;
  const canAsk = questionTitle.trim().length > 8 && body.trim().length > 20;
  const canSubmit = mode === 'post' ? canPost : canAsk;

  const submit = () => {
    if (!canSubmit) return;

    if (mode === 'question') {
      const id = actions.addQuestion({
        title: questionTitle.trim(),
        body: body.trim(),
        topic,
        tags: [],
      });
      router.replace(`/question/${id}`);
      return;
    }

    const onCourt = Number(minutes);
    actions.addPost({
      kind: media?.kind === 'video' ? 'reel' : 'note',
      body: body.trim(),
      tags: [],
      videoUrl: media?.kind === 'video' ? media.uri : undefined,
      mediaLabel: media?.label,
      session:
        onCourt > 0
          ? { focus: 'On court', minutes: onCourt, drills: [], intensity: 3 }
          : undefined,
    });
    router.back();
  };

  return (
    <View style={styles.backdrop}>
      <View style={styles.sheet}>
        <Screen
          title={mode === 'post' ? 'New post' : 'Ask the room'}
          compactTitle
          onBack={() => router.back()}
          right={<Button label="Share" variant="secondary" onPress={submit} disabled={!canSubmit} />}
        >
          <View style={styles.form}>
            <SegmentedControl
              segments={[
                { value: 'post', label: 'Post' },
                { value: 'question', label: 'Question' },
              ]}
              value={mode}
              onChange={(value: 'post' | 'question') => setMode(value)}
            />

            {mode === 'post' ? (
              <>
                <MediaPicker value={media} onChange={setMedia} />

                <Field
                  label="Caption"
                  value={body}
                  onChangeText={setBody}
                  placeholder="Say what you worked on and what actually changed."
                  multiline
                />

                <Field
                  label="Time on court (optional)"
                  value={minutes}
                  onChangeText={setMinutes}
                  placeholder="90"
                  keyboardType="number-pad"
                  hint="Minutes. Shows on your post and counts toward your hours."
                />
              </>
            ) : (
              <>
                <Field
                  label="Question"
                  value={questionTitle}
                  onChangeText={setQuestionTitle}
                  placeholder="What would you like to ask the community?"
                />
                <View style={styles.row}>
                  {(Object.keys(TOPIC_META) as QuestionTopic[]).map((t) => (
                    <Chip
                      key={t}
                      label={TOPIC_META[t].label}
                      selected={topic === t}
                      onPress={() => setTopic(t)}
                      small
                    />
                  ))}
                </View>
                <Field
                  label="Details"
                  value={body}
                  onChangeText={setBody}
                  placeholder="Your level, what you have already tried, and what actually happens."
                  multiline
                  minHeight={140}
                />
                {!canAsk ? (
                  <Text style={styles.note}>
                    Add a question over 8 characters and details over 20.
                  </Text>
                ) : null}
              </>
            )}
          </View>
        </Screen>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: {
    height: '88%',
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.bg,
  },
  form: { gap: spacing.lg, paddingTop: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  note: { ...typography.small, color: colors.textFaint, lineHeight: 18 },
});

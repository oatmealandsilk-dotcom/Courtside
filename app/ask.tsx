import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';

import { Button, Chip, Field, Screen } from '@/components/ui';
import { TOPIC_META } from '@/components/QuestionCard';
import { useApp } from '@/store/AppContext';
import type { QuestionTopic } from '@/data/types';
import { colors, spacing, typography } from '@/theme';

const TOPICS = Object.keys(TOPIC_META) as QuestionTopic[];

export default function Ask() {
  const styles = useThemedStyles(styleDefinitions);
  const { actions } = useApp();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [topic, setTopic] = useState<QuestionTopic>('gear');
  const [tags, setTags] = useState('');

  const canSubmit = title.trim().length > 8 && body.trim().length > 20;

  const submit = () => {
    if (!canSubmit) return;
    const id = actions.addQuestion({
      title: title.trim(),
      body: body.trim(),
      topic,
      tags: tags
        .split(',')
        .map((t) => t.trim().replace(/^#/, ''))
        .filter(Boolean),
    });
    router.replace(`/question/${id}`);
  };

  return (
    <Screen title="Ask the room" compactTitle onBack={() => goBack()}>
      <View style={styles.form}>
        <View style={styles.group}>
          <Text style={styles.label}>Topic</Text>
          <View style={styles.row}>
            {TOPICS.map((t) => (
              <Chip
                key={t}
                label={TOPIC_META[t].label}
                selected={topic === t}
                tint={TOPIC_META[t].tint}
                ink="#0A1120"
                onPress={() => setTopic(t)}
              />
            ))}
          </View>
        </View>

        <Field
          label="Question"
          value={title}
          onChangeText={setTitle}
          placeholder="Ask something specific enough to have a real answer"
        />
        <Field
          label="Detail"
          value={body}
          onChangeText={setBody}
          placeholder="Your level, what you have already tried, and what actually happens. Vague questions get vague answers."
          multiline
          minHeight={150}
        />
        <Field
          label="Tags (optional)"
          value={tags}
          onChangeText={setTags}
          placeholder="strings, poly, arm-health"
          autoCapitalize="none"
        />

        <Button label="Post question" onPress={submit} disabled={!canSubmit} full />
        {!canSubmit ? (
          <Text style={styles.hint}>
            Add a bit more — a title over 8 characters and detail over 20 gets far better answers.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  form: { gap: spacing.lg, paddingTop: spacing.sm },
  group: { gap: spacing.sm },
  label: { ...typography.smallStrong, color: colors.textMuted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hint: { ...typography.small, color: colors.textFaint, lineHeight: 18 },
});

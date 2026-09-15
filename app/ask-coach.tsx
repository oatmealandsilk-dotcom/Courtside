import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { MediaPicker, type PickedMedia } from '@/components/MediaPicker';
import { Button, Chip, Field, Screen } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import type { CoachSpecialty } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

const SPECIALTIES: { value: CoachSpecialty; label: string }[] = [
  { value: 'serve', label: 'Serve' },
  { value: 'forehand', label: 'Forehand' },
  { value: 'backhand', label: 'Backhand' },
  { value: 'volleys', label: 'Volleys' },
  { value: 'footwork', label: 'Footwork' },
  { value: 'strategy', label: 'Strategy' },
  { value: 'mental', label: 'Mental' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'juniors', label: 'Juniors' },
];

/** Free, public question addressed to the whole coaching pool. */
export default function AskCoach() {
  const styles = useThemedStyles(styleDefinitions);
  const { actions, coaches } = useApp();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [specialty, setSpecialty] = useState<CoachSpecialty>('serve');
  const [media, setMedia] = useState<PickedMedia | null>(null);

  const canSubmit = title.trim().length > 10 && body.trim().length > 25;

  const submit = () => {
    if (!canSubmit) return;
    const id = actions.askCoach({
      title: title.trim(),
      body: body.trim(),
      specialty,
      videoUrl: media?.kind === 'video' ? media.uri : undefined,
      mediaLabel: media?.label,
    });
    router.replace(`/coach-question/${id}`);
  };

  return (
    <Screen
      title="Ask a coach"
      subtitle="Free · answered by verified coaches"
      compactTitle
      onBack={() => goBack()}
    >
      <View style={styles.banner}>
        <Ionicons name="shield-checkmark" size={20} color={colors.brand} />
        <Text style={styles.bannerText}>
          {coaches.length} verified coaches are watching this board. Answers usually land within a day.
        </Text>
      </View>

      <View style={styles.form}>
        <View style={styles.group}>
          <Text style={styles.label}>What is this about?</Text>
          <View style={styles.row}>
            {SPECIALTIES.map((item) => (
              <Chip
                key={item.value}
                label={item.label}
                selected={specialty === item.value}
                onPress={() => setSpecialty(item.value)}
                small
              />
            ))}
          </View>
        </View>

        <Field
          label="What are you struggling with?"
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. My second serve falls apart at break point"
        />

        <Field
          label="Give the coach something to work with"
          value={body}
          onChangeText={setBody}
          placeholder="Your level, what you have already tried, and what actually happens on court. The more specific you are, the more useful the answer."
          multiline
          minHeight={150}
        />

        <View style={styles.group}>
          <Text style={styles.label}>Add footage (optional)</Text>
          <MediaPicker value={media} onChange={setMedia} />
          <Text style={styles.hint}>
            A ten-second clip gets you a far better answer than a paragraph of description.
          </Text>
        </View>

        <Button label="Post to coaches" onPress={submit} disabled={!canSubmit} full />
        {!canSubmit ? (
          <Text style={styles.hint}>
            Add a title over 10 characters and detail over 25 so a coach can actually answer.
          </Text>
        ) : null}
        <Text style={styles.hint}>
          Posting here is free and public. For private, in-depth work — video breakdowns and
          training plans — book a coach directly.
        </Text>
      </View>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandDim,
    marginBottom: spacing.lg,
  },
  bannerText: { ...typography.small, color: colors.text, flex: 1, lineHeight: 19 },
  form: { gap: spacing.lg },
  group: { gap: spacing.sm },
  label: { ...typography.smallStrong, color: colors.textMuted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hint: { ...typography.small, color: colors.textFaint, lineHeight: 18 },
});

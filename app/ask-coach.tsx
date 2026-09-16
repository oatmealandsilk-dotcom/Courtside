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
  // The length notes only appear once you have left a box with too little in it.
  const [touched, setTouched] = useState({ title: false, body: false });
  const titleShort = touched.title && title.trim().length > 0 && title.trim().length <= 10;
  const bodyShort = touched.body && body.trim().length > 0 && body.trim().length <= 25;

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
          onBlur={() => setTouched((t) => ({ ...t, title: true }))}
          hint={titleShort ? 'A few more words — over 10 characters — so a coach knows what this is.' : undefined}
          placeholder="e.g. My second serve falls apart at break point"
        />

        <Field
          label="Give the coach something to work with"
          value={body}
          onChangeText={setBody}
          placeholder="Your level, what you have already tried, and what actually happens on court. The more specific you are, the more useful the answer."
          onBlur={() => setTouched((t) => ({ ...t, body: true }))}
          hint={bodyShort ? 'Give a little more — over 25 characters — so the answer can be specific.' : undefined}
          multiline
          minHeight={150}
        />

        <View style={styles.group}>
          <Text style={styles.label}>Add footage (optional)</Text>
          <MediaPicker value={media} onChange={setMedia} noCover />
        </View>

        <Button label="Post to coaches" onPress={submit} disabled={!canSubmit} full />
        <Text style={styles.hint}>Free and public. For private work, book a coach directly.</Text>
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

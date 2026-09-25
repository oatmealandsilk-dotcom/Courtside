import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { DragSheet } from '@/components/DragSheet';
import { LocationChip } from '@/components/LocationChip';
import { TagPlayers } from '@/components/TagPlayers';
import { Button, Field } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';

/**
 * Editing something of yours after it is up: a post's caption, who is in it
 * and where it was, or a thread's question and details. Saving stamps it
 * "Edited" next to the date.
 */
export default function EditPost() {
  const styles = useThemedStyles(styleDefinitions);
  const { id = '', kind: rawKind } = useLocalSearchParams<{ id?: string; kind?: string }>();
  const { posts, questions, currentUserId, actions } = useApp();
  const isQuestion = rawKind === 'question';
  const post = isQuestion ? undefined : posts.find((p) => p.id === id);
  const question = isQuestion ? questions.find((q) => q.id === id) : undefined;
  const mine = (post?.authorId ?? question?.authorId) === currentUserId;

  const [body, setBody] = useState(post?.body ?? question?.body ?? '');
  const [title, setTitle] = useState(question?.title ?? '');
  const [tagged, setTagged] = useState<string[]>(post?.taggedUserIds ?? []);
  const [location, setLocation] = useState(post?.location ?? '');
  const [closeSignal, setCloseSignal] = useState(0);

  const canSave = mine && (isQuestion ? title.trim().length >= 3 : true);
  const save = () => {
    if (!canSave) return;
    if (post) actions.editPost(post.id, { body: body.trim(), taggedUserIds: tagged, location });
    if (question) actions.editQuestion(question.id, { title: title.trim(), body: body.trim() });
    setCloseSignal((n) => n + 1);
  };

  return (
    <DragSheet
      closeSignal={closeSignal}
      onDismissed={() => router.back()}
      peekFraction={0.72}
      header={
        <View style={styles.headerRow}>
          <Text style={styles.heading}>{isQuestion ? 'Edit thread' : post?.kind === 'clip' ? 'Edit clip' : 'Edit post'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={() => setCloseSignal((n) => n + 1)}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
      }
    >
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        {!mine ? (
          <Text style={styles.note}>Only the person who posted this can change it.</Text>
        ) : isQuestion ? (
          <>
            <Field label="Question" value={title} onChangeText={setTitle} placeholder="What would you like to ask?" />
            <Field label="Details" value={body} onChangeText={setBody} placeholder="Your level, what you have tried, what happens." multiline minHeight={120} mentions />
          </>
        ) : (
          <>
            <Field label="Caption" value={body} onChangeText={setBody} placeholder="Write a caption…" multiline minHeight={80} mentions />
            <LocationChip value={location} onChange={setLocation} />
            <TagPlayers tagged={tagged} onChange={setTagged} />
          </>
        )}
        {mine ? <Button label="Save" onPress={save} disabled={!canSave} full /> : null}
        <Text style={styles.note}>It will say “Edited” next to the date.</Text>
      </ScrollView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  heading: { ...typography.title, color: colors.text },
  form: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xxl },
  note: { ...typography.small, color: colors.textFaint, textAlign: 'center' },
});

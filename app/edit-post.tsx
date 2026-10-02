import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { DragSheet } from '@/components/DragSheet';
import { LocationLink } from '@/components/LocationChip';
import type { TaggedCourt } from '@/data/types';
import { openPlacePicker } from '@/features/places/picker';
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
  const { id = '', kind: rawKind, pickPlace } = useLocalSearchParams<{ id?: string; kind?: string; pickPlace?: string }>();
  const { posts, questions, currentUserId, actions } = useApp();
  const isQuestion = rawKind === 'question';
  const post = isQuestion ? undefined : posts.find((p) => p.id === id);
  const question = isQuestion ? questions.find((q) => q.id === id) : undefined;
  const mine = (post?.authorId ?? question?.authorId) === currentUserId;

  const [body, setBody] = useState(post?.body ?? question?.body ?? '');
  const [title, setTitle] = useState(question?.title ?? '');
  const [tagged, setTagged] = useState<string[]>(post?.taggedUserIds ?? []);
  const [location, setLocation] = useState(post?.location ?? '');
  const [court, setCourt] = useState<TaggedCourt | null>(post?.court ?? null);
  const [closeSignal, setCloseSignal] = useState(0);
  // Opened before the post had loaded (a reload, a link): the fields fill in
  // once, when it arrives, and Save stays off until then, so saving can
  // never write a blank caption over the real one.
  const [filled, setFilled] = useState(!!(post || question));
  useEffect(() => {
    if (filled || !(post || question)) return;
    setBody(post?.body ?? question?.body ?? '');
    setTitle(question?.title ?? '');
    setTagged(post?.taggedUserIds ?? []);
    setLocation(post?.location ?? '');
    setCourt(post?.court ?? null);
    setFilled(true);
  }, [filled, post, question]);

  // Opened from "Add the court" in the post's menu: straight to the place picker
  // once the post is here, a beat after the sheet is up.
  const picked = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (pickPlace !== '1' || picked.current || !filled || !post || !mine) return;
    const typed = post.location ?? '';
    picked.current = setTimeout(() => openPlacePicker((value, court) => { setLocation(value); setCourt(court ?? null); }, typed), 350);
  }, [pickPlace, filled, post, mine]);
  useEffect(() => () => { if (picked.current) clearTimeout(picked.current); }, []);

  const canSave = filled && mine && (isQuestion ? title.trim().length >= 3 : true);
  const save = () => {
    if (!canSave) return;
    if (post) actions.editPost(post.id, { body: body.trim(), taggedUserIds: tagged, location, court });
    if (question) actions.editQuestion(question.id, { title: title.trim(), body: body.trim() });
    setCloseSignal((n) => n + 1);
  };

  return (
    <DragSheet fitContent
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
            <Field label="Question" value={title} onChangeText={setTitle} />
            <Field label="Details" value={body} onChangeText={setBody} multiline minHeight={120} mentions />
          </>
        ) : (
          <>
            <Field label="Caption" labelRight={<LocationLink value={location} court={!!court} onPress={() => openPlacePicker((value, picked) => { setLocation(value); setCourt(picked ?? null); }, location)} onClear={() => { setLocation(''); setCourt(null); }} />} value={body} onChangeText={setBody} multiline minHeight={80} mentions />
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

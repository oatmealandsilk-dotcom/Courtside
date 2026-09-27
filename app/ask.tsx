import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { DragSheet } from '@/components/DragSheet';
import { Button, Chip, Field } from '@/components/ui';
import { TOPIC_META } from '@/components/QuestionCard';
import { useApp } from '@/store/AppContext';
import type { QuestionTopic } from '@/data/types';
import { colors, spacing, typography } from '@/theme';

const TOPICS = Object.keys(TOPIC_META) as QuestionTopic[];

/**
 * Ask the room, as a card that rises two-thirds of the way up with the page
 * you came from still showing above it. The handle drags it fully open or
 * all the way closed — nothing in between.
 */
export default function Ask() {
  const styles = useThemedStyles(styleDefinitions);
  const { actions } = useApp();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [topic, setTopic] = useState<QuestionTopic>('gear');
  const [closeSignal, setCloseSignal] = useState(0);
  const [posted, setPosted] = useState<string | null>(null);
  // A poll: off until asked for, then two options to start, up to four.
  const [poll, setPoll] = useState<string[] | null>(null);
  const pollOk = !poll || poll.filter((o) => o.trim()).length >= 2;

  const canSubmit = title.trim().length >= 3 && pollOk;

  const submit = () => {
    if (!canSubmit) return;
    const id = actions.addQuestion({
      title: title.trim(),
      body: body.trim(),
      topic,
      tags: Array.from(new Set((body.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((tag) => tag.slice(1).toLowerCase()))),
      poll: poll ?? undefined,
    });
    setPosted(id);
    setCloseSignal((n) => n + 1);
  };

  return (
    <DragSheet fitContent
      closeSignal={closeSignal}
      onDismissed={() => (posted ? router.replace(`/question/${posted}`) : router.back())}
      header={
        <View style={styles.headerRow}>
          <Text style={styles.heading}>Ask the room</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={() => setCloseSignal((n) => n + 1)}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
      }
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
          <Field
            label="Question"
            value={title}
            onChangeText={setTitle}
            placeholder="What would you like to ask the community?"
          />
          <View style={styles.row}>
            {TOPICS.map((t) => (
              <Chip key={t} label={TOPIC_META[t].label} selected={topic === t} onPress={() => setTopic(t)} small />
            ))}
          </View>
          <Field
            label="Details"
            value={body}
            onChangeText={setBody}
            placeholder="Your level, what you have already tried, and what actually happens."
            multiline
            minHeight={120}
            mentions
          />
          {poll ? (
            <View style={styles.poll}>
              <View style={styles.pollHead}>
                <Text style={styles.pollTitle}>Poll</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Remove the poll" hitSlop={8} onPress={() => setPoll(null)}><Text style={styles.pollRemove}>Remove</Text></Pressable>
              </View>
              {poll.map((option, i) => (
                <Field key={i} label={`Option ${i + 1}`} value={option} onChangeText={(v) => setPoll((p) => p && p.map((o, j) => (j === i ? v.slice(0, 80) : o)))} placeholder={i === 0 ? 'e.g. Full poly' : i === 1 ? 'e.g. Hybrid' : 'Another option'} />
              ))}
              {poll.length < 4 ? (
                <Pressable accessibilityRole="button" onPress={() => setPoll((p) => (p && p.length < 4 ? [...p, ''] : p))} style={styles.addOption}>
                  <Ionicons name="add" size={18} color={colors.brand} /><Text style={styles.addOptionText}>Add an option</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setPoll(['', ''])} style={styles.addPoll}>
              <Ionicons name="stats-chart-outline" size={17} color={colors.brand} />
              <Text style={styles.addOptionText}>Add a poll</Text>
            </Pressable>
          )}
          <Button label="Post to the room" onPress={submit} disabled={!canSubmit} full />
        </ScrollView>
      </KeyboardAvoidingView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  heading: { ...typography.title, color: colors.text },
  form: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.lg, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  poll: { gap: spacing.md, padding: spacing.md, borderRadius: 16, backgroundColor: colors.bgElevated },
  pollHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pollTitle: { ...typography.smallStrong, color: colors.text },
  pollRemove: { ...typography.smallStrong, color: colors.textMuted },
  addOption: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
  addPoll: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 6 },
  addOptionText: { ...typography.smallStrong, color: colors.brand },
});

import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { DragSheet } from '@/components/DragSheet';
import { Field } from '@/components/ui';
import { Chips, Section, SheetTitle, Submit, formBody } from '@/components/sheet/SheetForm';
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
      header={<SheetTitle title="Ask the room" line="Players and coaches answer, often within the hour." onClose={() => setCloseSignal((n) => n + 1)} />}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={formBody} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
          <Section title="Your question">
            <Field soft value={title} onChangeText={setTitle} placeholder="What do you want to know?" />
          </Section>
          <Section title="Topic">
            <Chips options={TOPICS.map((t) => ({ value: t, label: TOPIC_META[t].label }))} value={topic} onChange={(t) => { if (t) setTopic(t); }} />
          </Section>
          <Section title="Details">
            <Field soft value={body} onChangeText={setBody} placeholder="Your level, what you have tried, what happens (optional)" multiline minHeight={96} mentions />
          </Section>
          {poll ? (
            <Section title="Poll" right={<Pressable accessibilityRole="button" accessibilityLabel="Remove the poll" hitSlop={8} onPress={() => setPoll(null)}><Text style={styles.remove}>Remove</Text></Pressable>}>
              {poll.map((option, i) => (
                <Field key={i} soft value={option} onChangeText={(v) => setPoll((p) => p && p.map((o, j) => (j === i ? v.slice(0, 80) : o)))} placeholder={i === 0 ? 'Option 1, e.g. Full poly' : i === 1 ? 'Option 2, e.g. Hybrid' : `Option ${i + 1}`} />
              ))}
              {poll.length < 4 ? (
                <Pressable accessibilityRole="button" onPress={() => setPoll((p) => (p && p.length < 4 ? [...p, ''] : p))} style={styles.link}>
                  <Ionicons name="add" size={18} color={colors.brand} /><Text style={styles.linkText}>Add an option</Text>
                </Pressable>
              ) : null}
            </Section>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setPoll(['', ''])} style={styles.link}>
              <Ionicons name="stats-chart-outline" size={17} color={colors.brand} />
              <Text style={styles.linkText}>Add a poll</Text>
            </Pressable>
          )}
          <Submit label="Post to the room" onPress={submit} disabled={!canSubmit} waiting={title.trim().length < 3 ? 'Write your question first' : 'Fill in two poll options'} />
        </ScrollView>
      </KeyboardAvoidingView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  remove: { ...typography.smallStrong, color: colors.textMuted },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4, marginTop: -spacing.sm },
  linkText: { ...typography.smallStrong, color: colors.brand },
});

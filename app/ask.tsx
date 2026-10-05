import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { DragSheet } from '@/components/DragSheet';
import { Field } from '@/components/ui';
import { Chips, Section, SheetTitle, Submit, formBody } from '@/components/sheet/SheetForm';
import { TOPIC_META } from '@/components/QuestionCard';
import { BLOCKED_WORDS_NOTE } from '@/features/hiddenWords/hiddenWords';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';
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

  // A quick second tap would post it twice.
  const [checking, setChecking] = useState(false);
  const submit = () => {
    if (!canSubmit || checking || posted) return;
    setChecking(true);
    // Words CourtSide refuses (migration 117) are said here, and the card
    // stays open with what you wrote, to change and post again.
    void actions.wordsRefused([title, body, ...(poll ?? [])]).then((refused) => {
      setChecking(false);
      if (refused) {
        haptics.reject();
        showToast({ title: BLOCKED_WORDS_NOTE, body: 'Change them and post again.', icon: 'alert-circle-outline', long: true });
        return;
      }
      const id = actions.addQuestion({
        title: title.trim(),
        body: body.trim(),
        topic,
        tags: Array.from(new Set((body.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((tag) => tag.slice(1).toLowerCase()))),
        poll: poll ?? undefined,
      });
      setPosted(id);
      setCloseSignal((n) => n + 1);
    });
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
            {/* The section title already says what goes here, so the box stays empty. */}
            {/* The most the database keeps (300 for the question, 10,000 for the details): longer looked posted and was lost. */}
            <Field soft value={title} onChangeText={setTitle} accessibilityLabel="Your question" maxLength={300} />
          </Section>
          <Section title="Topic">
            <Chips options={TOPICS.map((t) => ({ value: t, label: TOPIC_META[t].label }))} value={topic} onChange={(t) => { if (t) setTopic(t); }} />
          </Section>
          <Section title="Details">
            <Field soft value={body} onChangeText={setBody} placeholder="Optional" accessibilityLabel="Details" multiline minHeight={96} mentions maxLength={10000} />
          </Section>
          {poll ? (
            <Section title="Poll" right={<Pressable accessibilityRole="button" accessibilityLabel="Remove the poll" hitSlop={8} onPress={() => setPoll(null)}><Text style={styles.remove}>Remove</Text></Pressable>}>
              {poll.map((option, i) => (
                <Field key={i} soft value={option} onChangeText={(v) => setPoll((p) => p && p.map((o, j) => (j === i ? v.slice(0, 80) : o)))} placeholder={`Option ${i + 1}`} />
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
          <Submit label="Post to the room" onPress={submit} disabled={!canSubmit} busy={checking} waiting={title.trim().length < 3 ? 'Write your question first' : 'Fill in two poll options'} />
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

import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { MediaPicker, type PickedMedia } from '@/components/MediaPicker';
import { Screen } from '@/components/ui';
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

/**
 * A free, public question to every coach on CourtSide. Written like a
 * message, not filled in like a form: one line for what is wrong, room
 * beneath for the detail, a clip if you have one, and Post.
 */
export default function AskCoach() {
  const styles = useThemedStyles(styleDefinitions);
  const { actions, coaches } = useApp();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [specialty, setSpecialty] = useState<CoachSpecialty>('serve');
  const [media, setMedia] = useState<PickedMedia | null>(null);
  const [footage, setFootage] = useState(false);
  const bodyBox = useRef<TextInput>(null);

  const canSubmit = title.trim().length > 10 && body.trim().length > 25;
  const submit = () => {
    if (!canSubmit) return;
    const id = actions.askCoach({ title: title.trim(), body: body.trim(), specialty, videoUrl: media?.kind === 'video' ? media.uri : undefined, mediaLabel: media?.label });
    router.replace(`/coach-question/${id}`);
  };
  const watching = coaches.length;

  return (
    <Screen title="Ask a coach" compactTitle scroll={false} padded={false} onBack={() => goBack()}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
        <Text style={styles.lead}>Free, and public. {watching ? `${watching} verified ${watching === 1 ? 'coach' : 'coaches'} read this board` : 'Verified coaches read this board'} and usually answer within a day.</Text>

        {/* What it is about: one scrolling row, no heading — the words say it. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topics} style={styles.topicsWrap}>
          {SPECIALTIES.map((item) => (
            <Pressable key={item.value} accessibilityRole="tab" accessibilityState={{ selected: specialty === item.value }} onPress={() => setSpecialty(item.value)} style={[styles.topic, specialty === item.value && styles.topicOn]}>
              <Text style={[styles.topicText, specialty === item.value && styles.topicTextOn]}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* The question, large, then the detail beneath a hairline: written, not filled in. */}
        <View style={styles.sheet}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="What's going wrong?"
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={140}
            returnKeyType="next"
            blurOnSubmit
            onSubmitEditing={() => bodyBox.current?.focus()}
            accessibilityLabel="Your question"
            style={styles.question}
          />
          <View style={styles.rule} />
          <TextInput
            ref={bodyBox}
            value={body}
            onChangeText={setBody}
            placeholder="Your level, what you've tried, what actually happens."
            placeholderTextColor={colors.textFaint}
            multiline
            textAlignVertical="top"
            accessibilityLabel="The detail"
            style={styles.detail}
          />
          <View style={styles.rule} />
          {footage || media ? (
            <View style={styles.footage}>
              <MediaPicker value={media} onChange={setMedia} noCover />
            </View>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Add a clip" onPress={() => setFootage(true)} style={styles.addRow}>
              <Ionicons name="videocam-outline" size={20} color={colors.text} />
              <Text style={styles.addText}>Add a clip</Text>
              <Text style={styles.addNote}>Optional · helps a coach see it</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.foot}>
          <Text style={styles.footNote}>{canSubmit ? 'Coaches see your level with it.' : title.trim().length <= 10 ? 'A few more words on what is wrong.' : 'A little more detail, so the answer can be specific.'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Post to coaches" accessibilityState={{ disabled: !canSubmit }} disabled={!canSubmit} onPress={submit} style={({ pressed }) => [styles.post, !canSubmit && styles.postOff, pressed && canSubmit && { opacity: 0.85 }]}>
            <Text style={[styles.postText, !canSubmit && styles.postTextOff]}>Post</Text>
            <Ionicons name="arrow-forward" size={16} color={canSubmit ? colors.brandInk : colors.textFaint} />
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  page: { paddingBottom: spacing.xxl },
  lead: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  topicsWrap: { flexGrow: 0 },
  topics: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  topic: { height: 32, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  topicOn: { backgroundColor: colors.text, borderColor: colors.text },
  topicText: { ...typography.smallStrong, color: colors.text },
  topicTextOn: { color: colors.bg },
  // One sheet of paper: the question in large type, hairlines between the parts.
  sheet: { marginHorizontal: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  question: { ...typography.title, color: colors.text, paddingVertical: spacing.md, lineHeight: 30 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  detail: { ...typography.body, color: colors.text, lineHeight: 23, minHeight: 150, paddingVertical: spacing.md },
  footage: { paddingVertical: spacing.md },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 14 },
  addText: { ...typography.bodyStrong, color: colors.text },
  addNote: { ...typography.small, color: colors.textFaint, marginLeft: 'auto' },
  foot: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  footNote: { ...typography.small, color: colors.textFaint, flex: 1, lineHeight: 18 },
  post: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 20, borderRadius: radius.pill, backgroundColor: colors.brand },
  postOff: { backgroundColor: colors.surfaceAlt },
  postText: { ...typography.bodyStrong, color: colors.brandInk },
  postTextOff: { color: colors.textFaint },
});

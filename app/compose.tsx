import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { MediaPicker, type PickedMedia } from '@/components/MediaPicker';
import { SheetBackdrop } from '@/components/SheetBackdrop';
import { TOPIC_META } from '@/components/QuestionCard';
import { Button, Chip, Field, Screen } from '@/components/ui';
import { addToBank, getBank } from '@/features/compose/mediaBank';
import { useApp } from '@/store/AppContext';
import type { QuestionTopic } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

type Mode = 'clip' | 'post' | 'story' | 'question';
/** choose → library → form, with back always stepping one page left. */
type Stage = 'choose' | 'library' | 'form';

/**
 * Instagram-shaped composer: pick media, write a caption, post.
 * A post carries a caption and how long you were on court — nothing else.
 * Questions get their own mode because they need a title and a topic.
 */
export default function Compose() {
  const styles = useThemedStyles(styleDefinitions);
  const { actions, posts, currentUserId } = useApp();

  // The story rail opens this straight at the library with ?mode=story.
  const params = useLocalSearchParams<{ mode?: string }>();
  useEffect(() => { if (params.mode === 'story') router.replace('/hit'); }, [params.mode]);
  const [stage, setStage] = useState<Stage>('choose');
  const [mode, setMode] = useState<Mode>(params.mode === 'story' ? 'story' : 'post');
  const [media, setMedia] = useState<PickedMedia | null>(null);
  const [body, setBody] = useState('');
  const [minutes, setMinutes] = useState('');
  const [questionTitle, setQuestionTitle] = useState('');
  const [topic, setTopic] = useState<QuestionTopic>('gear');

  const canPost = !!media?.uri && (mode !== 'clip' || media.kind === 'video');
  const canAsk = questionTitle.trim().length > 8 && body.trim().length > 20;
  const canSubmit = mode === 'question' ? canAsk : canPost;

  const submit = () => {
    if (!canSubmit) return;

    if (mode === 'question') {
      const id = actions.addQuestion({
        title: questionTitle.trim(),
        body: body.trim(),
        topic,
        tags: Array.from(new Set((body.match(/#[\p{L}\p{N}_]+/gu) ?? []).map(tag=>tag.slice(1).toLowerCase()))),
      });
      router.replace(`/question/${id}`);
      return;
    }

    if (mode === 'story') {
      actions.addStory({
        caption: body.trim() || undefined,
        imageUrl: media?.kind === 'photo' ? media.uri : undefined,
        videoUrl: media?.kind === 'video' ? media.uri : undefined,
        mediaLabel: media?.label,
        thumbnailUrl: media?.thumbnailUrl ?? (media?.kind === 'photo' ? media.uri : undefined),
      });
      router.back();
      return;
    }

    const onCourt = Number(minutes);
    actions.addPost({
      kind: mode === 'clip' ? 'clip' : 'note',
      body: body.trim(),
      tags: Array.from(new Set((body.match(/#[\p{L}\p{N}_]+/gu) ?? []).map(tag=>tag.slice(1).toLowerCase()))),
      imageUrl: media?.kind === 'photo' ? media.uri : undefined,
      videoUrl: media?.kind === 'video' ? media.uri : undefined,
      mediaLabel: media?.label,
      thumbnailUrl: media?.thumbnailUrl ?? (media?.kind === 'photo' ? media.uri : undefined),
      session:
        onCourt > 0
          ? { focus: 'On court', minutes: onCourt, drills: [], intensity: 3 }
          : undefined,
    });
    router.back();
  };

  const pick = (next: PickedMedia | null) => {
    if (!next) return;
    addToBank(next);
    setMedia(next);
    setStage('form');
  };

  if (stage === 'choose') return <View style={styles.choiceBackdrop}>
    <SheetBackdrop />
    <Pressable accessibilityRole="button" accessibilityLabel="Close create menu" onPress={() => router.back()} style={StyleSheet.absoluteFill}/>
    <View style={styles.choiceSheet}>
      <View style={styles.choiceHeader}><Text style={styles.choiceTitle}>Create</Text><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()}><Ionicons name="close" size={24} color={colors.text}/></Pressable></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Create a clip" onPress={() => { setMode('clip'); setStage('library'); }} style={styles.choiceOption}>
        <Ionicons name="videocam-outline" size={28} color={colors.textMuted}/><Text style={styles.choiceLabel}>Clip</Text><Text style={styles.note}>Share a video from your device.</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Create a post" onPress={() => { setMode('post'); setStage('library'); }} style={styles.choiceOption}>
        <Ionicons name="images-outline" size={28} color={colors.textMuted}/><Text style={styles.choiceLabel}>Post</Text><Text style={styles.note}>Choose from your photos and videos.</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Take a hit" onPress={() => router.replace('/hit')} style={styles.choiceOption}>
        <Ionicons name="camera-outline" size={28} color={colors.textMuted}/><Text style={styles.choiceLabel}>Hit</Text><Text style={styles.note}>One photo after a session. Five-second count, no retakes. Up for 24 hours.</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Create a thread or question" onPress={() => { setMode('question'); setStage('form'); }} style={styles.choiceOption}>
        <Ionicons name="chatbubbles-outline" size={28} color={colors.textMuted}/><Text style={styles.choiceLabel}>Thread or question</Text><Text style={styles.note}>Ask the community or start a conversation.</Text>
      </Pressable>
    </View>
  </View>;

  if (stage === 'library') {
    // Everything picked this session plus anything you have already posted,
    // so a clip can be reused without another trip through the file dialog.
    const posted: PickedMedia[] = posts
      .filter((p) => p.authorId === currentUserId && (p.videoUrl || p.imageUrl))
      .map((p) => ({
        uri: p.videoUrl ?? p.imageUrl,
        label: p.mediaLabel ?? (p.videoUrl ? 'Video' : 'Photo'),
        kind: p.videoUrl ? 'video' as const : 'photo' as const,
        thumbnailUrl: p.thumbnailUrl ?? p.imageUrl,
      }));
    const seen = new Set<string>();
    const bank = [...getBank(), ...posted].filter((item) => {
      if (!item.uri || seen.has(item.uri)) return false;
      if (mode === 'clip' && item.kind !== 'video') return false;
      seen.add(item.uri);
      return true;
    });

    return (
      <View style={styles.backdrop}>
        <SheetBackdrop />
        <View style={styles.sheet}>
          <Screen
            title={mode === 'clip' ? 'Your videos' : 'Your library'}
            compactTitle
            onBack={() => (params.mode === 'story' ? router.back() : setStage('choose'))}
          >
            <MediaPicker compact selection={mode === 'clip' ? 'video' : 'all'} label={mode === 'clip' ? 'New video from your device' : 'New from your device'} value={null} onChange={pick} />
            <Text style={styles.libraryTitle}>{bank.length ? 'Recent' : 'Nothing here yet'}</Text>
            {bank.length ? (
              <ScrollView contentContainerStyle={styles.grid}>
                {bank.map((item) => (
                  <Pressable
                    key={item.uri}
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${item.label}`}
                    onPress={() => pick(item)}
                    style={styles.tile}
                  >
                    {item.thumbnailUrl ? (
                      <Image accessibilityIgnoresInvertColors source={{ uri: item.thumbnailUrl }} resizeMode="cover" style={StyleSheet.absoluteFill} />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="videocam" size={26} color={colors.textFaint} />
                      </View>
                    )}
                    {item.kind === 'video' ? <Ionicons name="play" size={16} color="white" style={styles.tileBadge} /> : null}
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.note}>Videos and photos you pick show up here so you can use them again.</Text>
            )}
          </Screen>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.backdrop}>
      <SheetBackdrop />
      <View style={styles.sheet}>
        <Screen
          title={mode === 'clip' ? 'New clip' : mode === 'post' ? 'New post' : mode === 'story' ? 'New story' : 'Ask the room'}
          compactTitle
          onBack={() => (mode === 'question' ? router.back() : setStage('library'))}
          right={<Button label={mode === 'story' ? 'Add to story' : 'Share'} variant="secondary" onPress={submit} disabled={!canSubmit} />}
        >
          <View style={styles.form}>
            {mode !== 'question' ? (
              <>
                <MediaPicker bare selection={mode === 'clip' ? 'video' : 'all'} value={media} onChange={setMedia} />

                <Field
                  label={mode === 'story' ? 'Caption (optional)' : 'Caption'}
                  value={body}
                  onChangeText={setBody}
                  placeholder={mode === 'story' ? 'A line over the top, if you want one.' : 'Say what you worked on and what actually changed.'}
                  multiline
                />

                {mode !== 'story' ? (
                  <Field
                    label="Time on court (optional)"
                    value={minutes}
                    onChangeText={setMinutes}
                    placeholder="90"
                    keyboardType="number-pad"
                    hint="Minutes. Shows on your post and counts toward your hours."
                  />
                ) : (
                  <Text style={styles.note}>Your story stays up for 24 hours, then moves to your archive. You can archive it earlier from the viewer.</Text>
                )}
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

const styleDefinitions = StyleSheet.create({
  choiceBackdrop: { flex: 1, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', padding: 20 },
  choiceSheet: { width: '100%', maxWidth: 400, borderRadius: 24, padding: 20, gap: 12, backgroundColor: colors.bg },
  choiceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8 },
  choiceTitle: { fontSize: 22, fontWeight: '700', color: colors.text },
  choiceOption: { padding: 20, gap: 8, borderRadius: 18, backgroundColor: colors.surface },
  choiceLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'transparent' },
  sheet: {
    height: '88%',
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
  },
  form: { gap: spacing.lg, paddingTop: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  note: { ...typography.small, color: colors.textFaint, lineHeight: 18 },
  libraryTitle: { ...typography.caption, color: colors.textMuted, letterSpacing: 1.1, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  tile: { width: '32.5%', aspectRatio: 9 / 12, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  tileBadge: { position: 'absolute', right: 6, bottom: 6, textShadowColor: '#0008', textShadowRadius: 3 },
});

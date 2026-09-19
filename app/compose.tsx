import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import Reanimated, { Easing, FadeInDown, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { MediaPicker, pickFromDevice, type PickedMedia } from '@/components/MediaPicker';
import { MediaEditor, type EditedMedia } from '@/components/MediaEditor';
import { takePendingShot } from '@/features/compose/pendingShot';
import { registerCreateClose } from '@/features/compose/createMenu';
import { PermissionBanner } from '@/components/PermissionRows';
import { SheetBackdrop } from '@/components/SheetBackdrop';
import { TOPIC_META } from '@/components/QuestionCard';
import { Button, Chip, Field, Screen } from '@/components/ui';
import { TagPlayers } from '@/components/TagPlayers';
import { addToBank, getBank } from '@/features/compose/mediaBank';
import { useApp } from '@/store/AppContext';
import type { QuestionTopic } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

type Mode = 'clip' | 'post' | 'story' | 'hit' | 'question';

const goBackNow = () => router.back();
/** Each choice in the Create box arrives a moment after the one above it. */
const arrive = (index: number) => FadeInDown.delay(90 + index * 55).duration(260).easing(Easing.out(Easing.cubic));
/** choose → library → form, with back always stepping one page left. */
type Stage = 'choose' | 'library' | 'edit' | 'form';

/**
 * Instagram-shaped composer: pick media, write a caption, post.
 * A post carries a caption and how long you were on court — nothing else.
 * Questions get their own mode because they need a title and a topic.
 */
export default function Compose() {
  const styles = useThemedStyles(styleDefinitions);
  const { actions, posts, currentUserId } = useApp();

  // The story rail opens this straight at the library with ?mode=story.
  const params = useLocalSearchParams<{ mode?: string; shot?: string }>();
  useEffect(() => { if (params.mode === 'story') router.replace('/hit'); }, [params.mode]);
  // A hit arrives here with its photo already taken: straight to the form.
  // The camera's photo travels in memory; the address only says one is waiting.
  const shotUri = params.shot === 'pending' ? takePendingShot() : params.shot;
  const isHit = params.mode === 'hit' && !!shotUri;
  const [stage, setStage] = useState<Stage>(isHit ? 'form' : 'choose');
  // The Create box rises and grows into place with a small spring when it
  // opens, and plays that backwards when it closes, instead of only fading.
  const pop = useSharedValue(0);
  useEffect(() => { pop.value = withSpring(1, { damping: 15, stiffness: 190, mass: 0.8 }); }, [pop]);
  // Closing is its own motion, not the opening played backwards: from the
  // first frame the box starts fading, sinks a little and shrinks slightly,
  // and the dimmed page behind it fades with it, so everything leaves as one.
  const leave = useSharedValue(0);
  const popStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 1.6) * (1 - leave.value),
    transform: [
      { translateY: (1 - pop.value) * 28 + leave.value * 16 },
      { scale: (0.94 + 0.06 * pop.value) * (1 - 0.05 * leave.value) },
    ],
  }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: 1 - leave.value }));
  const navigation = useNavigation();
  const closing = useRef(false);
  const closeMenu = () => {
    if (closing.current) return;
    closing.current = true;
    // The page's own fade would run after the box has already gone, leaving
    // an invisible layer that swallows taps for a moment; it is switched off
    // now, well before the page leaves.
    navigation.setOptions({ animation: 'none' });
    leave.value = withTiming(1, { duration: 210, easing: Easing.out(Easing.cubic) }, (done) => { if (done) runOnJS(goBackNow)(); });
  };
  // While the box is up, the + in the tab bar can close it the same way.
  const closeRef = useRef(closeMenu);
  closeRef.current = closeMenu;
  useEffect(() => (stage === 'choose' ? registerCreateClose(() => closeRef.current()) : undefined), [stage]);
  const [mode, setMode] = useState<Mode>(isHit ? 'hit' : params.mode === 'story' ? 'story' : 'post');
  // A post is 4:5 upright, the way the feed shows it; a clip and a story fill a phone screen (9:16).
  const portraitRatio = mode === 'post' ? 4 / 5 : 9 / 16;
  const [media, setMedia] = useState<PickedMedia | null>(isHit ? { uri: shotUri as string, label: 'Hit', kind: 'photo', thumbnailUrl: shotUri as string, orientation: 'portrait' } : null);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  // What the edit step decided: where a clip starts and stops, and whether it has sound.
  const [edit, setEdit] = useState<Pick<EditedMedia, 'trimStart' | 'trimEnd' | 'muted' | 'crop'>>({});
  const [body, setBody] = useState('');
  const [minutes, setMinutes] = useState('');
  // People tagged in the post: chips under the caption, added from a short search.
  const [tagged, setTagged] = useState<string[]>([]);
  const [questionTitle, setQuestionTitle] = useState('');
  const [topic, setTopic] = useState<QuestionTopic>('gear');

  const canPost = !!media?.uri && (mode !== 'clip' || media.kind === 'video');
  const canAsk = questionTitle.trim().length >= 3;
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

    if (mode === 'story' || mode === 'hit') {
      actions.addStory({
        caption: body.trim() || undefined,
        imageUrl: media?.kind === 'photo' ? media.uri : undefined,
        videoUrl: media?.kind === 'video' ? media.uri : undefined,
        mediaLabel: mode === 'hit' ? 'Hit' : media?.label,
        thumbnailUrl: media?.thumbnailUrl ?? (media?.kind === 'photo' ? media.uri : undefined),
      });
      // A hit came in over the camera page, which has already gone; land on the feed.
      if (mode === 'hit') router.replace('/'); else router.back();
      return;
    }

    const onCourt = Number(minutes);
    actions.addPost({
      kind: mode === 'clip' ? 'clip' : 'note',
      orientation,
      ...edit,
      body: body.trim(),
      tags: Array.from(new Set((body.match(/#[\p{L}\p{N}_]+/gu) ?? []).map(tag=>tag.slice(1).toLowerCase()))),
      taggedUserIds: tagged.length ? tagged : undefined,
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
    setOrientation(next.orientation ?? 'portrait');
    setEdit({});
    // A clip or photo goes through the edit step first; a hit already has its shot.
    setStage(mode === 'hit' ? 'form' : 'edit');
  };

  // Straight to the phone's library from the + menu; a cancel leaves the menu up.
  const [pickError, setPickError] = useState('');
  const openDevice = async (selection: 'video' | 'all') => {
    setPickError('');
    try {
      const next = await pickFromDevice(selection);
      if (next) pick(next);
    } catch (err) {
      setPickError(err instanceof Error ? err.message : String(err));
    }
  };

  if (stage === 'choose') return <View style={styles.choiceBackdrop}>
    <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, dimStyle]}><SheetBackdrop /></Reanimated.View>
    <Pressable accessibilityRole="button" accessibilityLabel="Close create menu" onPress={closeMenu} style={StyleSheet.absoluteFill}/>
    <Reanimated.View style={[styles.choiceSheet, popStyle]}>
      <View style={styles.choiceHeader}><Text style={styles.choiceTitle}>Create</Text><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={closeMenu} hitSlop={10}><Ionicons name="close" size={24} color={colors.text}/></Pressable></View>
      {/* Catches a Photos problem before it turns into the cryptic iOS 3164
          error mid-pick, and links straight to the fix. */}
      <PermissionBanner needs={['photos']} />
      <Reanimated.View entering={arrive(0)}><Pressable accessibilityRole="button" accessibilityLabel="Create a clip" onPress={() => { setMode('clip'); void openDevice('video'); }} style={styles.choiceOption}>
        <Ionicons name="videocam-outline" size={28} color={colors.textMuted}/><Text style={styles.choiceLabel}>Clip</Text><Text style={styles.note}>Share a video from your device.</Text>
      </Pressable></Reanimated.View>
      <Reanimated.View entering={arrive(1)}><Pressable accessibilityRole="button" accessibilityLabel="Create a post" onPress={() => { setMode('post'); void openDevice('all'); }} style={styles.choiceOption}>
        <Ionicons name="images-outline" size={28} color={colors.textMuted}/><Text style={styles.choiceLabel}>Post</Text><Text style={styles.note}>Choose from your photos and videos.</Text>
      </Pressable></Reanimated.View>
      {pickError ? <Text style={styles.pickError}>{pickError}</Text> : null}
      <Reanimated.View entering={arrive(2)}><Pressable accessibilityRole="button" accessibilityLabel="Take a hit" onPress={() => router.replace('/hit')} style={styles.choiceOption}>
        <Ionicons name="camera-outline" size={28} color={colors.textMuted}/><Text style={styles.choiceLabel}>Hit</Text><Text style={styles.note}>One photo after a session. Five-second count, no retakes. Up for 24 hours.</Text>
      </Pressable></Reanimated.View>
      <Reanimated.View entering={arrive(3)}><Pressable accessibilityRole="button" accessibilityLabel="Create a thread or question" onPress={() => router.replace('/ask')} style={styles.choiceOption}>
        <Ionicons name="chatbubbles-outline" size={28} color={colors.textMuted}/><Text style={styles.choiceLabel}>Thread or question</Text><Text style={styles.note}>Ask the community or start a conversation.</Text>
      </Pressable></Reanimated.View>
    </Reanimated.View>
  </View>;

  if (stage === 'edit' && media) {
    return (
      <View style={[styles.backdrop, { backgroundColor: '#000' }]}>
        <MediaEditor
          media={media}
          portraitRatio={portraitRatio}
          onBack={() => setStage('choose')}
          onDone={(result) => {
            setMedia(result.media);
            setOrientation(result.orientation);
            setEdit({ trimStart: result.trimStart, trimEnd: result.trimEnd, muted: result.muted, crop: result.crop });
            setStage('form');
          }}
        />
      </View>
    );
  }

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
            <PermissionBanner needs={['photos']} />
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
    <View style={[styles.backdrop, mode === 'hit' && { backgroundColor: colors.bg }]}>
      {mode === 'hit' ? null : <SheetBackdrop />}
      <View style={styles.sheet}>
        <Screen
          title={mode === 'clip' ? 'New clip' : mode === 'post' ? 'New post' : mode === 'story' ? 'New story' : mode === 'hit' ? 'New hit' : 'Ask the room'}
          compactTitle
          onBack={() => (mode === 'question' ? router.back() : mode === 'hit' ? router.navigate('/hit') : setStage('edit'))}
          right={<Button label={mode === 'story' ? 'Add to story' : mode === 'hit' ? 'Post hit' : 'Share'} variant="secondary" onPress={submit} disabled={!canSubmit} />}
        >
          <View style={styles.form}>
            {mode !== 'question' ? (
              <>
                <View style={styles.stage}>
                  {mode === 'hit' && media?.uri ? (
                    // The hit is what the camera took, full stop: shown plainly, nothing to click.
                    <View style={styles.hitFrame}>
                      <Image source={{ uri: media.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel="Your hit" />
                    </View>
                  ) : (
                    <MediaPicker bare orientation={orientation} portraitRatio={portraitRatio} selection={mode === 'clip' ? 'video' : 'all'} value={media} onChange={setMedia} trim={edit} />
                  )}
                </View>
                {mode === 'hit' ? (
                  <View style={styles.hitMeta}>
                    <View style={styles.hitPill}><Ionicons name="time-outline" size={13} color={colors.brand} /><Text style={styles.hitPillText}>24 HOURS</Text></View>
                    <Text style={styles.hitMetaText}>On the feed for a day, then kept in your archive.</Text>
                  </View>
                ) : null}
                <Field
                  value={body}
                  onChangeText={setBody}
                  placeholder={mode === 'story' ? 'Add a line (optional)' : mode === 'hit' ? 'How did it go? (optional)' : 'Write a caption…'}
                  multiline
                  minHeight={64}
                  mentions
                />

                {mode !== 'story' && mode !== 'hit' ? <TagPlayers tagged={tagged} onChange={setTagged} /> : null}

                {mode !== 'story' && mode !== 'hit' ? (
                  <View style={styles.inlineRow}>
                    <Ionicons name="time-outline" size={18} color={colors.textMuted} />
                    <Text style={styles.inlineLabel}>Minutes on court</Text>
                    <View style={{ width: 96 }}>
                      <Field value={minutes} onChangeText={setMinutes} placeholder="optional" keyboardType="number-pad" />
                    </View>
                  </View>
                ) : null}
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
    height: '100%',
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
    overflow: 'hidden',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
  },
  form: { gap: spacing.md, paddingTop: 0 },
  // Bleed past the screen's own padding so the media runs edge to edge.
  // A little room under the header, so the preview's rounded top corners show.
  stage: { marginTop: spacing.xs },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  inlineLabel: { ...typography.small, color: colors.textMuted, flex: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  note: { ...typography.small, color: colors.textFaint, lineHeight: 18 },
  pickError: { ...typography.small, color: colors.danger, lineHeight: 18 },
  hitFrame: { width: '100%', aspectRatio: 4 / 3, maxHeight: 520, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000', alignSelf: 'center' },
  hitMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hitPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.brandDim },
  hitPillText: { color: colors.brand, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  hitMetaText: { ...typography.small, color: colors.textMuted, flex: 1 },
  libraryTitle: { ...typography.caption, color: colors.textMuted, letterSpacing: 1.1, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  tile: { width: '32.5%', aspectRatio: 9 / 12, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  tileBadge: { position: 'absolute', right: 6, bottom: 6, textShadowColor: '#0008', textShadowRadius: 3 },
});

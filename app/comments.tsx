import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image as ExpoImage } from 'expo-image';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { CommentRow } from '@/components/CommentRow';
import { DragSheet } from '@/components/DragSheet';
import { pickFromDevice } from '@/components/MediaPicker';
import { Avatar, BrandWash, Field } from '@/components/ui';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/** One tap drops these into the box, the way Instagram's row above the keyboard does. Tennis first. */
const QUICK = ['🎾', '🔥', '👏', '😂', '😮', '🙌', '💯', '❤️'];

/**
 * Comments on a clip, a post or a hit, as a sheet over the feed — the way
 * Instagram does it — instead of a page of its own. Threads keep their page.
 *
 * The box at the bottom: your picture, the words, and on the right a photo
 * button that turns into send as soon as there is something to send. A sent
 * comment slides in at the bottom of the list.
 */
export default function CommentsSheet() {
  const styles = useThemedStyles(styleDefinitions);
  const { kind: rawKind, id = '', focus, at } = useLocalSearchParams<{ kind?: string; id?: string; focus?: string; at?: string }>();
  // Opened from "Add a comment": the box is ready to type in as the sheet lands.
  const input = useRef<TextInput>(null);
  // Opened from a comment on the page: the list scrolls to that comment as the sheet lands.
  const list = useRef<ScrollView>(null);
  const rowY = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!at) return;
    const t = setTimeout(() => { const y = rowY.current[at]; if (y !== undefined) list.current?.scrollTo({ y: Math.max(0, y - 12), animated: true }); }, 420);
    return () => clearTimeout(t);
  }, [at]);
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => input.current?.focus(), 380);
    return () => clearTimeout(t);
  }, [focus]);
  const kind = rawKind === 'hit' ? 'hit' : 'post';
  const { comments, posts, stories, users, currentUserId, actions } = useApp();
  const me = users.find((u) => u.id === currentUserId);
  const [draft, setDraft] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [closeSignal, setCloseSignal] = useState(0);
  const post = kind === 'post' ? posts.find((p) => p.id === id) : undefined;
  const exists = kind === 'hit' ? stories.some((st) => st.id === id) : !!post;
  const author = post ? users.find((u) => u.id === post.authorId) : undefined;
  const thread = comments.filter((c) => c.postId === id).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  // Comments made while the sheet is open slide in; the ones already there just appear.
  const openedAt = useRef(Date.now());
  const canSend = exists && (!!draft.trim() || !!photo);

  // The right-hand button: a photo button while the box is empty, send once there is something to send.
  const sendOn = useSharedValue(canSend ? 1 : 0);
  const sendPop = useSharedValue(1);
  useEffect(() => { sendOn.value = withTiming(canSend ? 1 : 0, { duration: 160 }); }, [canSend, sendOn]);
  const sendStyle = useAnimatedStyle(() => ({ opacity: sendOn.value, transform: [{ scale: (0.6 + 0.4 * sendOn.value) * sendPop.value }] }));
  const photoStyle = useAnimatedStyle(() => ({ opacity: 1 - sendOn.value, transform: [{ scale: 1 - 0.3 * sendOn.value }] }));

  // Sending feels instant: the box clears first, the button gives a little
  // push, the comment lands, and the list slides to it once it is drawn.
  const justSent = useRef(false);
  const send = () => {
    const text = draft.trim();
    if (!canSend) return;
    const picked = photo;
    setDraft('');
    setPhoto(null);
    justSent.current = true;
    sendPop.value = withSequence(withTiming(0.8, { duration: 80 }), withSpring(1, { damping: 10, stiffness: 320 }));
    if (kind === 'hit') actions.addStoryComment(id, text);
    else actions.addComment(id, text, picked ?? undefined);
    input.current?.focus();
  };
  const addPhoto = async () => {
    try {
      const got = await pickFromDevice('photo');
      if (got?.uri) { setPhoto(got.uri); haptics.tap(); }
    } catch { /* the library was closed or refused: nothing to add */ }
  };
  const addEmoji = (emoji: string) => {
    haptics.tap();
    setDraft((d) => d + emoji);
    input.current?.focus();
  };

  return (
    <DragSheet
      closeSignal={closeSignal}
      onDismissed={() => router.back()}
      peekFraction={0.7}
      side
      header={
        <View style={styles.headerRow}>
          <Text style={styles.heading}>Comments{thread.length ? ` · ${thread.length}` : ''}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={() => setCloseSignal((n) => n + 1)}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
      }
    >
      <View style={{ flex: 1 }}>
        <ScrollView ref={list} style={{ flex: 1 }} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled" onContentSizeChange={() => { if (justSent.current) { justSent.current = false; list.current?.scrollToEnd({ animated: true }); } }}>
          {thread.map((c) => {
            const row = <CommentRow comment={c} big onLayout={(y) => { rowY.current[c.id] = y; }} />;
            return Date.parse(c.createdAt) > openedAt.current
              ? <Animated.View key={c.id} entering={FadeInDown.duration(260)}>{row}</Animated.View>
              : <View key={c.id}>{row}</View>;
          })}
          {!thread.length ? <Text style={styles.empty}>{exists ? 'No comments yet. Start the conversation.' : 'This is no longer available.'}</Text> : null}
        </ScrollView>
        <View style={styles.composer}>
          <View style={styles.quick}>
            {QUICK.map((e) => (
              <Pressable key={e} accessibilityRole="button" accessibilityLabel={`Add ${e}`} hitSlop={6} onPress={() => addEmoji(e)} style={({ pressed }) => [styles.quickItem, pressed && styles.quickPressed]}>
                <Text style={styles.quickEmoji}>{e}</Text>
              </Pressable>
            ))}
          </View>
          {photo ? (
            <Animated.View entering={FadeInDown.duration(180)} style={styles.attached}>
              <ExpoImage source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <Pressable accessibilityRole="button" accessibilityLabel="Remove the photo" hitSlop={8} onPress={() => setPhoto(null)} style={styles.attachedRemove}>
                <Ionicons name="close" size={13} color="#fff" />
              </Pressable>
            </Animated.View>
          ) : null}
          <View style={styles.inputRow}>
            <Avatar name={me?.name ?? 'You'} seed={me?.avatarSeed ?? currentUserId ?? 'me'} uri={me?.avatarUrl} size={34} style={styles.me} />
            <View style={{ flex: 1 }}>
              <Field inputRef={input} value={draft} onChangeText={setDraft} placeholder={author && author.id !== currentUserId ? `Add a comment for ${author.name.split(' ')[0]}…` : 'Add a comment…'} multiline minHeight={44} onSubmitEditing={send} mentions compact />
            </View>
            <View style={styles.action}>
              {kind === 'post' ? (
                <Animated.View style={[StyleSheet.absoluteFill, styles.center, photoStyle]} pointerEvents={canSend ? 'none' : 'auto'}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Add a photo" hitSlop={6} onPress={() => void addPhoto()} style={styles.photoButton}>
                    <Ionicons name="image-outline" size={19} color={colors.textMuted} />
                  </Pressable>
                </Animated.View>
              ) : null}
              <Animated.View style={[StyleSheet.absoluteFill, styles.center, kind === 'post' ? sendStyle : null]} pointerEvents={canSend ? 'auto' : kind === 'post' ? 'none' : 'auto'}>
                <Pressable accessibilityRole="button" accessibilityLabel="Post comment" disabled={!canSend} onPress={send} style={[styles.send, !canSend && kind !== 'post' && { opacity: 0.4 }]}>
                  <BrandWash />
                  <Ionicons name="arrow-up" size={19} color={colors.brandInk} />
                </Pressable>
              </Animated.View>
            </View>
          </View>
        </View>
      </View>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  heading: { ...typography.title, color: colors.text },
  list: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.lg, paddingBottom: spacing.xl },
  empty: { ...typography.small, color: colors.textFaint, paddingVertical: spacing.lg, textAlign: 'center' },
  composer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 10, gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg },
  quick: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  quickItem: { width: 34, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  quickPressed: { backgroundColor: colors.surfaceAlt, transform: [{ scale: 1.15 }] },
  quickEmoji: { fontSize: 22 },
  attached: { width: 64, height: 80, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surfaceAlt, marginLeft: 34 + spacing.sm },
  attachedRemove: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  // Centred on the box while it is one line; it stays at the bottom as the box grows.
  me: { marginBottom: 5 },
  action: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  // The same two round buttons as the message box: a quiet one for the photo (like the mic there), the green one to send.
  photoButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  send: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', shadowColor: colors.brand, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
});

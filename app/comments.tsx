import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View, type TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image as ExpoImage } from 'expo-image';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { CommentThread, threadOf, threadsOf, useReplyDraft } from '@/components/CommentThread';
import { DragSheet } from '@/components/DragSheet';
import { pickFromDevice } from '@/components/MediaPicker';
import { Avatar, BrandWash, Field } from '@/components/ui';
import type { Comment, ID } from '@/data/types';
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
 *
 * Replies work the way Instagram's do: "Reply" under a comment puts
 * "@them " in the box with a slim "Replying to @them ×" bar above it; the
 * reply lands under that comment's thread (one level: a reply to a reply
 * joins the same thread), which stays folded behind "View 2 replies" until
 * opened. `reply` opens the sheet already replying to a comment; `at` opens
 * it scrolled to one, its thread unfolded.
 */
export default function CommentsSheet() {
  const styles = useThemedStyles(styleDefinitions);
  const { kind: rawKind, id = '', focus, at, reply: replyParam } = useLocalSearchParams<{ kind?: string; id?: string; focus?: string; at?: string; reply?: string }>();
  // Opened from "Add a comment": the box is ready to type in as the sheet lands.
  const input = useRef<TextInput>(null);
  // Opened from a comment on the page: the list scrolls to that comment as the sheet lands.
  const list = useRef<ScrollView>(null);
  const rowY = useRef<Record<string, number>>({});
  const rowH = useRef<Record<string, number>>({});
  // How far the list is scrolled, and the two edges of what can be seen of it:
  // its top, and the top of the box under it (which rides on the keyboard).
  const scrollY = useRef(0);
  const frame = useRef<View>(null);
  const composer = useRef<View>(null);
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
  // Every comment and reply here (the count), and the same laid out as threads.
  const all = comments.filter((c) => c.postId === id);
  const threads = threadsOf(comments, id, 'oldest');
  // Comments made while the sheet is open slide in; the ones already there just appear.
  const openedAt = useRef(Date.now());

  // A post opened from a notification may not be loaded yet: it is fetched once.
  const [looked, setLooked] = useState(exists);
  useEffect(() => {
    if (exists || kind !== 'post' || !id) { setLooked(true); return; }
    let on = true;
    void Promise.resolve(actions.loadPost(id)).catch(() => undefined).finally(() => { if (on) setLooked(true); });
    return () => { on = false; };
  }, [exists, kind, id, actions]);
  // New replies and comments arrive while the sheet is open.
  useEffect(() => (id ? actions.watchComments(id, kind) : undefined), [id, kind, actions]);

  // Threads whose replies are showing. Folded by default; opened by a tap, by
  // your own reply, or by arriving at a reply from a notification or the page.
  const [openThreads, setOpenThreads] = useState<Set<ID>>(() => new Set());
  // When the box last lost the keyboard: a browser takes it away the moment
  // anything else is pressed, a phone does not.
  const blurredAt = useRef(0);
  const openThread = (topId: ID | undefined) => { if (topId) setOpenThreads((s) => (s.has(topId) ? s : new Set(s).add(topId))); };
  const toggleThread = (topId: ID) => {
    haptics.tap();
    const closing = openThreads.has(topId);
    setOpenThreads((s) => { const next = new Set(s); if (next.has(topId)) next.delete(topId); else next.add(topId); return next; });
    // "Hide replies" from far down a long thread: the replies fold away above
    // you, so the list goes back to the comment they hang from.
    const y = rowY.current[topId];
    if (closing && y !== undefined && y < scrollY.current) requestAnimationFrame(() => list.current?.scrollTo({ y: Math.max(0, y - 12), animated: false }));
    // Typing when the toggle was pressed: keep typing (only a browser needs it given back).
    if (Date.now() - blurredAt.current < 400) input.current?.focus();
  };
  const atParent = comments.find((c) => c.id === at)?.parentId;
  useEffect(() => { openThread(atParent); }, [atParent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Replying: "@them " in the box and a "Replying to @them ×" strip above it.
  const { replyingTo, start: startReply, change: changeDraft, stop: stopReplying, done: doneReplying, words } = useReplyDraft(setDraft, () => input.current?.focus());
  // Something of your own to send: words beyond the "@them " Reply put in, or a photo.
  const canSend = exists && (!!words(draft).trim() || !!photo);

  // The comment being answered stays in sight just above the box, as on
  // Instagram, rather than sliding under the keyboard as it comes up. Measured
  // on screen each time, so it holds whatever height the keyboard and the
  // sheet have reached.
  const reveal = (commentId: ID) => {
    const y = rowY.current[commentId];
    if (y === undefined) return;
    const bottom = y + (rowH.current[commentId] ?? 0) + 12;
    frame.current?.measureInWindow((_x, top) => composer.current?.measureInWindow((_x2, boxTop) => {
      const seen = boxTop - top;
      if (!(seen > 0)) return;
      if (bottom > scrollY.current + seen) list.current?.scrollTo({ y: Math.max(0, bottom - seen), animated: true });
      else if (y < scrollY.current) list.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }));
  };
  const replyTo = (comment: Comment) => {
    startReply(comment);
    if (Platform.OS === 'web') { setTimeout(() => reveal(comment.id), 350); return; }
    // Now (the keyboard may already be up), and again once it has finished coming up.
    setTimeout(() => reveal(comment.id), 120);
    const shown = Keyboard.addListener('keyboardDidShow', () => { shown.remove(); setTimeout(() => reveal(comment.id), 60); });
    setTimeout(() => shown.remove(), 1500);
  };
  // Opened from "Reply" on the post page: already replying as the sheet lands.
  const replyStarted = useRef(false);
  const replyTarget = comments.find((c) => c.id === replyParam && c.postId === id);
  useEffect(() => {
    if (!replyTarget || replyStarted.current) return;
    const t = setTimeout(() => { replyStarted.current = true; replyTo(replyTarget); }, 380);
    return () => clearTimeout(t);
  }, [replyTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  // The right-hand button: a photo button while the box is empty, send once there is something to send.
  const sendOn = useSharedValue(canSend ? 1 : 0);
  const sendPop = useSharedValue(1);
  useEffect(() => { sendOn.value = withTiming(canSend ? 1 : 0, { duration: 160 }); }, [canSend, sendOn]);
  const sendStyle = useAnimatedStyle(() => ({ opacity: sendOn.value, transform: [{ scale: (0.6 + 0.4 * sendOn.value) * sendPop.value }] }));
  const photoStyle = useAnimatedStyle(() => ({ opacity: 1 - sendOn.value, transform: [{ scale: 1 - 0.3 * sendOn.value }] }));

  // Sending feels instant: the box clears first, the button gives a little
  // push, the comment lands, and the list slides to it once it is drawn: to
  // the bottom for a comment, to the reply itself (its thread unfolded) for a reply.
  const justSent = useRef<Set<ID> | null>(null);
  const send = () => {
    const text = draft.trim();
    if (!canSend) return;
    const picked = photo;
    const answering = replyingTo?.id;
    setDraft('');
    setPhoto(null);
    doneReplying();
    justSent.current = new Set(all.map((c) => c.id));
    sendPop.value = withSequence(withTiming(0.8, { duration: 80 }), withSpring(1, { damping: 10, stiffness: 320 }));
    if (answering) openThread(threadOf(comments, answering));
    if (kind === 'hit') actions.addStoryComment(id, text, answering);
    else actions.addComment(id, text, picked ?? undefined, answering);
    input.current?.focus();
  };
  useEffect(() => {
    const before = justSent.current;
    const sent = before ? all.find((c) => !before.has(c.id) && c.authorId === currentUserId) : undefined;
    if (!sent) return;
    justSent.current = null;
    const go = (tries: number) => {
      if (!sent.parentId) { list.current?.scrollToEnd({ animated: true }); return; }
      const y = rowY.current[sent.id];
      if (y !== undefined) list.current?.scrollTo({ y: Math.max(0, y - 160), animated: true });
      else if (tries > 0) setTimeout(() => go(tries - 1), 120);
    };
    setTimeout(() => go(4), 80);
  }, [all.length]); // eslint-disable-line react-hooks/exhaustive-deps
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
          <Text style={styles.heading}>Comments{all.length ? ` · ${all.length}` : ''}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={() => setCloseSignal((n) => n + 1)}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
      }
    >
      <View ref={frame} style={{ flex: 1 }}>
        <ScrollView
          ref={list}
          style={{ flex: 1 }}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={32}
          onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
        >
          {threads.map((t) => (
            <CommentThread
              key={t.top.id}
              thread={t}
              big
              open={openThreads.has(t.top.id)}
              onToggle={() => toggleThread(t.top.id)}
              onReply={exists ? replyTo : undefined}
              onRowLayout={(commentId, y, height) => { rowY.current[commentId] = y; rowH.current[commentId] = height; }}
              isFresh={(c) => Date.parse(c.createdAt) > openedAt.current}
            />
          ))}
          {!threads.length ? <Text style={styles.empty}>{exists ? 'No comments yet. Start the conversation.' : looked ? 'This is no longer available.' : ''}</Text> : null}
        </ScrollView>
        <View ref={composer} style={styles.composer}>
          {replyingTo ? (
            <Animated.View entering={FadeInDown.duration(160)} style={styles.replying}>
              <Text style={styles.replyingText} numberOfLines={1}>
                Replying to {replyingTo.self ? 'your comment' : <Text style={styles.replyingHandle}>@{replyingTo.handle}</Text>}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Stop replying" hitSlop={10} onPress={stopReplying}>
                <Ionicons name="close" size={16} color={colors.textMuted} />
              </Pressable>
            </Animated.View>
          ) : null}
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
              <Field inputRef={input} value={draft} onChangeText={changeDraft} placeholder={replyingTo ? (replyingTo.self ? 'Add a reply…' : `Reply to @${replyingTo.handle}…`) : author && author.id !== currentUserId ? `Add a comment for ${author.name.split(' ')[0]}…` : 'Add a comment…'} multiline minHeight={44} onSubmitEditing={send} onBlur={() => { blurredAt.current = Date.now(); }} mentions compact />
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
  // A slim strip across the top of the box while replying, the × on the right.
  replying: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginHorizontal: -spacing.lg, marginTop: -spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 8, backgroundColor: colors.surfaceAlt },
  replyingText: { ...typography.small, color: colors.textMuted, flex: 1 },
  replyingHandle: { ...typography.smallStrong, color: colors.text },
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

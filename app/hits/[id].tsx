import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@/lib/useIsFocused';
import { Pressable, StyleSheet, Text, View, type TextInput } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as haptics from '@/lib/haptics';
import { goBack } from '@/lib/goBack';
import Ionicons from '@expo/vector-icons/Ionicons';

import { ClipPlayback } from '@/components/ClipPlayback';
import { MediaPlaceholder } from '@/components/MediaPlaceholder';
import { PlayerName } from '@/components/PlayerName';
import { RichText } from '@/components/RichText';
import { CommentThread, threadOf, threadsOf, useReplyDraft } from '@/components/CommentThread';
import { CommentRow } from '@/components/CommentRow';
import { HiddenComments } from '@/components/HiddenComments';
import { hiddenCommentsOn, listedComments } from '@/features/hiddenWords/hiddenWords';
import type { ID } from '@/data/types';
import { Tappable } from '@/components/Tappable';
import { Avatar, Button, EmptyState, Field, Screen } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { hitClock } from '@/features/stories/stories';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography, font } from '@/theme';
import { useStillLoading } from '@/lib/useStillLoading';
import { CourtSpinner } from '@/components/CourtSpinner';
import { RemovedNote } from '@/features/moderation/RemovedNote';
import { confirm } from '@/lib/confirm';
import { openPlayer } from '@/features/navigation/openPlayer';
import { COMMENT_MAX } from '@/features/feed/limits';

/** One hit with its likes and comments — the same page a post gets. */
export default function HitThread() {
  const focused = useIsFocused();
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { stories, users, comments, currentUserId, currentUser, actions } = useApp();
  const loading = useStillLoading();
  const story = stories.find((st) => st.id === id);
  const author = users.find((u) => u.id === story?.authorId);
  const [draft, setDraft] = useState('');
  // Ticks once a minute so the countdown stays honest while you read.
  const [, tick] = useState(0);
  useEffect(() => { const timer = setInterval(() => tick((n) => n + 1), 60_000); return () => clearInterval(timer); }, []);
  // New comments and replies arrive while the page is open.
  useEffect(() => (id ? actions.watchComments(String(id), 'hit') : undefined), [id, actions]);
  // Replies, as in the comment sheet: "Reply" puts "@them " in the box with a
  // "Replying to @them ×" line above it; each thread stays folded until opened.
  const input = useRef<TextInput>(null);
  const [openThreads, setOpenThreads] = useState<Set<ID>>(() => new Set());
  const { replyingTo, start: startReply, change: changeDraft, stop: stopReplying, done: doneReplying, resume: resumeDraft, words } = useReplyDraft(setDraft, () => input.current?.focus());
  // Words of your own, beyond the "@them " Reply put in: a bare "@them" is not sent.
  const hasWords = !!words(draft).trim();
  // What is in the box now, for words sent and then refused (see submit).
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const toggleThread = (topId: ID) => {
    haptics.tap();
    setOpenThreads((s) => { const next = new Set(s); if (next.has(topId)) next.delete(topId); else next.add(topId); return next; });
  };

  if (!story || !author) {
    return (
      <Screen title="Instant" compactTitle onBack={() => goBack()}>
        {loading ? <View style={{ paddingVertical: 60, alignItems: 'center' }}><CourtSpinner size={28} /></View> : <EmptyState title="This instant has gone" body="It may have expired or been taken down." />}
      </Screen>
    );
  }

  // Admins: take this Instant down (the reason is picked on the next page), or
  // put it back, the way a thread's header does it (migration 108). Here
  // because a removed Instant is no longer live, so the feed (and its menu)
  // never shows it again; this page is where Removed → Open lands.
  const moderate = currentUser?.isAdmin ? () => {
    haptics.tap();
    if (story.removed) {
      confirm({ title: 'Restore this instant?', message: 'Everyone who could see it before sees it again, with its comments.', confirmLabel: 'Restore', onConfirm: () => { void actions.restoreContent('hit', story.id); } });
    } else {
      router.push({ pathname: '/take-down', params: { kind: 'hit', id: story.id } });
    }
  } : undefined;
  const liked = !!currentUserId && story.likedBy.includes(currentUserId);
  // One hidden by the owner's Hidden words (migration 117), or a reply under it, is neither shown nor
  // counted for the owner, who finds it under "Hidden comments" at the end.
  const count = listedComments(comments, story.id, currentUserId).length;
  const thread = threadsOf(comments, story.id, 'oldest', currentUserId);
  const hidden = hiddenCommentsOn(comments, story.id, currentUserId, story.authorId);
  const submit = () => {
    const text = draft.trim();
    if (!hasWords) return;
    const answering = replyingTo?.id;
    const was = replyingTo;
    if (answering) { const top = threadOf(comments, answering); if (top) setOpenThreads((s) => new Set(s).add(top)); }
    // Refused for its words (migration 117), or it didn't save at all: the toast
    // says why, and what you wrote comes back into the box (if you haven't started something else there).
    void actions.addStoryComment(story.id, text, answering).then((result) => {
      if (result && !latestDraft.current.trim()) resumeDraft(text, was);
    });
    setDraft('');
    doneReplying();
  };

  return (
    <Screen
      title="Instant"
      compactTitle
      onBack={() => goBack()}
      right={moderate ? (
        <Pressable accessibilityRole="button" accessibilityLabel={story.removed ? 'Restore this instant' : 'Take down this instant'} hitSlop={10} onPress={moderate}>
          <Ionicons name={story.removed ? 'eye-outline' : 'eye-off-outline'} size={23} color={story.removed ? colors.text : colors.danger} />
        </Pressable>
      ) : undefined}
    >
      <Pressable accessibilityRole="button" accessibilityLabel="Open this hit full screen" onPress={() => router.push({ pathname: `/story/${author.id}`, params: { story: story.id } })} style={styles.frame}>
        {story.videoUrl ? (
          <ClipPlayback uri={story.videoUrl} poster={story.thumbnailUrl} active={focused} preload />
        ) : story.imageUrl ? (
          <ExpoImage accessibilityIgnoresInvertColors source={{ uri: story.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <MediaPlaceholder label={story.mediaLabel ?? 'Instant'} seed={story.id} portrait />
        )}
        <View pointerEvents="none" style={styles.clock}>
          <Ionicons name="time-outline" size={13} color="white" />
          <Text style={styles.clockText}>INSTANT · {hitClock(story)}</Text>
        </View>
      </Pressable>
      {/* Taken down by an admin (migration 108): only its author and admins can open it. */}
      {story.removed ? <RemovedNote removed={story.removed} style={{ marginTop: spacing.md }} /> : null}

      <View style={styles.authorRow}>
        <Pressable accessibilityRole="link" onPress={() => openPlayer(author.id, currentUserId)} style={styles.author}>
          <Avatar name={author.name} seed={author.avatarSeed} size={36} />
          <View style={{ flex: 1 }}>
            <PlayerName userId={author.id} style={styles.name}>{author.name}</PlayerName>
            <Text style={styles.meta}>@{author.handle} · {relativeTime(story.createdAt)}</Text>
          </View>
        </Pressable>
        <Tappable accessibilityLabel={liked ? 'Unlike hit. Hold to see who liked it' : 'Like hit. Hold to see who liked it'} onPress={() => actions.toggleLikeStory(story.id)} onLongPress={() => { haptics.commit(); router.push({ pathname: '/likes', params: { id: story.id, kind: 'hit' } }); }} scaleTo={0.8} style={styles.like}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={22} color={liked ? colors.danger : colors.text} />
          <Text style={styles.likeCount}>{story.likedBy.length}</Text>
        </Tappable>
      </View>
      {story.caption ? <RichText style={styles.caption}>{story.caption}</RichText> : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{count} {count === 1 ? 'comment' : 'comments'}</Text>
        {thread.map((t) => (
          <CommentThread key={t.top.id} thread={t} open={openThreads.has(t.top.id)} onToggle={() => toggleThread(t.top.id)} onReply={story.removed ? undefined : startReply} />
        ))}
        <HiddenComments count={hidden.length}>
          {hidden.map((c) => <CommentRow key={c.id} comment={c} onUnhide={() => actions.unhideByWords('hit-comment', c.id)} />)}
        </HiddenComments>
        {story.removed ? null : <View style={styles.composer}>
          {replyingTo ? (
            <View style={styles.replying}>
              <Text style={styles.replyingText} numberOfLines={1}>Replying to {replyingTo.self ? 'your comment' : <Text style={styles.replyingHandle}>@{replyingTo.handle}</Text>}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Stop replying" hitSlop={10} onPress={stopReplying}>
                <Ionicons name="close" size={16} color={colors.textMuted} />
              </Pressable>
            </View>
          ) : null}
          <Field inputRef={input} value={draft} onChangeText={changeDraft} placeholder={replyingTo ? (replyingTo.self ? 'Add a reply' : `Reply to @${replyingTo.handle}`) : 'Add a comment'} multiline minHeight={70} onSubmitEditing={submit} mentions maxLength={COMMENT_MAX} />
          <Button label={replyingTo ? 'Post reply' : 'Post comment'} onPress={submit} disabled={!hasWords} />
        </View>}
      </View>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 3 / 4, maxHeight: 520, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  clock: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.5)' },
  clockText: { color: 'white', fontSize: 11, ...font('700'), letterSpacing: 0.6 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg },
  author: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.small, color: colors.textFaint },
  like: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  likeCount: { ...typography.smallStrong, color: colors.text },
  caption: { ...typography.body, color: colors.text, lineHeight: 22, paddingTop: spacing.md },
  section: { gap: spacing.lg, paddingTop: spacing.xl },
  sectionTitle: { ...typography.heading, color: colors.text },
  comment: { flexDirection: 'row', gap: spacing.md },
  commentBody: { flex: 1, gap: 3 },
  commentMeta: { ...typography.caption, color: colors.textFaint },
  commentText: { ...typography.small, color: colors.text, lineHeight: 20 },
  composer: { gap: spacing.md, paddingTop: spacing.md },
  replying: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, marginBottom: -spacing.xs },
  replyingText: { ...typography.small, color: colors.textMuted, flex: 1 },
  replyingHandle: { ...typography.smallStrong, color: colors.text },
});

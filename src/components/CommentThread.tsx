import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CommentRow, replyIndent } from '@/components/CommentRow';
import type { Comment, ID } from '@/data/types';
import { shownInList } from '@/features/hiddenWords/hiddenWords';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';

/** A top-level comment and the replies under it. */
export interface Thread { top: Comment; replies: Comment[] }

const time = (c: Comment) => Date.parse(c.createdAt);

/**
 * A post's or Instant's comments as threads, the way Instagram lays them
 * out: top-level comments in `order`, each with its replies oldest first (the
 * newest at the bottom of its thread). A reply whose comment is not here (a
 * hidden or not-yet-loaded one) is left out rather than shown on its own.
 * One hidden by its owner's Hidden words (migration 117) shows only to `me`
 * when I wrote it (the owner finds it under "Hidden comments" instead).
 */
export function threadsOf(comments: Comment[], targetId: ID, order: 'oldest' | 'newest', me: ID | null = null): Thread[] {
  const here = comments.filter((c) => c.postId === targetId && shownInList(c, c.authorId, me));
  const tops = here.filter((c) => !c.parentId).sort((a, b) => (order === 'oldest' ? time(a) - time(b) : time(b) - time(a)));
  const under = new Map<ID, Comment[]>();
  for (const c of here) if (c.parentId) under.set(c.parentId, [...(under.get(c.parentId) ?? []), c]);
  return tops.map((top) => ({ top, replies: (under.get(top.id) ?? []).sort((a, b) => time(a) - time(b)) }));
}

/** The top-level comment a comment belongs under: its parent for a reply, itself otherwise. */
export function threadOf(comments: Comment[], commentId: ID | undefined): ID | undefined {
  const c = commentId ? comments.find((x) => x.id === commentId) : undefined;
  return c ? c.parentId ?? c.id : undefined;
}

/**
 * Who is being answered, whether "@them " was put in front of the words, and
 * whether it is your own comment (no "@you": the strip says "your comment").
 */
export interface Replying { id: ID; handle: string; prefixed: boolean; self: boolean }

/**
 * Replying from a comment box, the way Instagram does it: "Reply" puts
 * "@them " at the front of the words (never "@you" on your own comment) and
 * remembers who is answered; taking that "@them" back out makes it a plain
 * comment again; the × takes it out too (and keeps the box open). Tapping
 * Reply again, or on someone else, swaps the handle rather than stacking a
 * second one. `words` is what was typed beyond that "@them ": nothing there
 * means nothing to send yet, so a bare "@them" never goes out on its own.
 */
export function useReplyDraft(setDraft: React.Dispatch<React.SetStateAction<string>>, focus: () => void) {
  const { users, currentUserId } = useApp();
  const [replyingTo, setReplyingTo] = useState<Replying | null>(null);
  // The same, read at once: two quick taps must not each add a handle.
  const now = useRef<Replying | null>(null);
  const set = (next: Replying | null) => { now.current = next; setReplyingTo(next); };
  const without = (words: string, handle: string | null) => (handle && words.startsWith(`@${handle}`) ? words.slice(handle.length + 1).trimStart() : words);
  const start = (comment: Comment) => {
    const who = users.find((u) => u.id === comment.authorId);
    const prefixed = !!who && comment.authorId !== currentUserId;
    const before = now.current?.prefixed ? now.current.handle : null;
    setDraft((d) => (prefixed ? `@${who!.handle} ` : '') + without(without(d, before), prefixed ? who!.handle : null));
    set({ id: comment.id, handle: who?.handle ?? 'them', prefixed, self: comment.authorId === currentUserId });
    haptics.tap();
    setTimeout(focus, 30);
  };
  const change = (text: string) => {
    setDraft(text);
    if (now.current?.prefixed && !text.startsWith(`@${now.current.handle}`)) set(null);
  };
  const stop = () => {
    const before = now.current?.prefixed ? now.current.handle : null;
    haptics.untap();
    setDraft((d) => without(d, before));
    set(null);
    // The × sits outside the box; tapping it must not close the keyboard.
    setTimeout(focus, 30);
  };
  /** After sending: the box is empty again and answers nobody. */
  const done = () => set(null);
  /** Sent words refused (migration 117): back in the box, answering whoever they answered. */
  const resume = (text: string, was: Replying | null) => {
    setDraft(text);
    set(was);
  };
  const words = (text: string) => (replyingTo?.prefixed ? without(text, replyingTo.handle) : text);
  return { replyingTo, start, change, stop, done, resume, words };
}

/**
 * One thread: the comment, then its replies a step in, folded away behind
 * "View 2 replies" until asked for, with "Hide replies" to fold them again.
 * The rows are siblings in the list rather than nested, so each one reports
 * its own place in it (the sheet scrolls to a row by that).
 */
export function CommentThread({ thread, big = false, open, onToggle, onReply, onPressBody, onRowLayout, isFresh }: {
  thread: Thread;
  big?: boolean;
  /** The replies are showing. */
  open: boolean;
  /** "View N replies" / "Hide replies". */
  onToggle: () => void;
  /** "Reply" under each row. */
  onReply?: (comment: Comment) => void;
  onPressBody?: (comment: Comment) => void;
  /** Where each row sits in the list, and how tall it is. */
  onRowLayout?: (commentId: ID, y: number, height: number) => void;
  /** Rows that just arrived slide in; the ones already there just appear. */
  isFresh?: (comment: Comment) => boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const count = thread.replies.length;
  // Under a comment that was taken down (migration 108) nobody can reply any
  // more, the replies under it included (a reply joins its thread), so none
  // of its rows offer Reply. Its author and the admins are the ones who see it.
  const replyHere = thread.top.removed ? undefined : onReply;
  const row = (c: Comment, reply: boolean) => (
    <Animated.View
      key={c.id}
      entering={isFresh?.(c) ? FadeInDown.duration(260) : undefined}
      onLayout={onRowLayout ? (e) => onRowLayout(c.id, e.nativeEvent.layout.y, e.nativeEvent.layout.height) : undefined}
    >
      <CommentRow
        comment={c}
        big={big}
        reply={reply}
        onReply={replyHere ? () => replyHere(c) : undefined}
        onPressBody={onPressBody ? () => onPressBody(c) : undefined}
      />
    </Animated.View>
  );
  return (
    <>
      {row(thread.top, false)}
      {open ? thread.replies.map((c) => row(c, true)) : null}
      {count ? (
        <Pressable
          key={`${thread.top.id}:toggle`}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={open ? 'Hide replies' : `View ${count} ${count === 1 ? 'reply' : 'replies'}`}
          hitSlop={{ top: 4, bottom: 8, left: 8, right: 24 }}
          onPress={onToggle}
          style={[styles.toggle, { marginLeft: replyIndent(big) }]}
        >
          <View style={styles.dash} />
          <Text style={[styles.toggleText, big && styles.toggleTextBig]}>{open ? 'Hide replies' : `View ${count} ${count === 1 ? 'reply' : 'replies'}`}</Text>
        </Pressable>
      ) : null}
    </>
  );
}

const styleDefinitions = StyleSheet.create({
  // Tucked up under the comment (or its last reply), closer than the gap
  // between comments. Padded to a full finger's height (about 41pt) and pulled
  // up by the same, so it sits where it did: a browser ignores hitSlop.
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'flex-start', marginTop: -12, paddingVertical: 6 },
  dash: { width: 24, height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.textFaint, opacity: 0.6 },
  toggleText: { ...typography.smallStrong, fontSize: 12, color: colors.textFaint },
  toggleTextBig: { fontSize: 13 },
});

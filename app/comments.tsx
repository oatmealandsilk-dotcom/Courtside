import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, BackHandler, Keyboard, Platform, Pressable, StyleSheet, Text, View, type TextInput } from 'react-native';
import { router, useFocusEffect, useIsFocused, useLocalSearchParams, useNavigation, useRoute } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image as ExpoImage } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeInDown, FadeOut, runOnJS, scrollTo, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, type AnimatedRef } from 'react-native-reanimated';

import { CommentThread, threadOf, threadsOf, useReplyDraft } from '@/components/CommentThread';
import { CommentsCaption } from '@/components/CommentsCaption';
import { CommentRow } from '@/components/CommentRow';
import { HiddenComments } from '@/components/HiddenComments';
import { DragSheet, useSheetDrag } from '@/components/DragSheet';
import { pickFromDevice } from '@/components/MediaPicker';
import { StageRail } from '@/components/StageRail';
import { Avatar, BrandWash, Field } from '@/components/ui';
import type { Comment, ID } from '@/data/types';
import { LIST_PULL, getStage, markGone, markMounted, setCovered, stageKeyOf, useStageSelect } from '@/features/feed/commentStage';
import { hiddenCommentsOn, listedComments } from '@/features/hiddenWords/hiddenWords';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/** One tap drops these into the box, the way Instagram's row above the keyboard does. Tennis first. */
const QUICK = ['🎾', '🔥', '👏', '😂', '😮', '🙌', '💯', '❤️'];
/**
 * On the stage, how many threads come in with the sheet: about what fills
 * it at half. The rest follow once it has come to rest, so the comments are
 * drawn, and the rise starts, as soon as they can be.
 */
const FIRST_THREADS = 4;
/**
 * What you were writing, by post, until the app quits: closing the comments
 * (or a stray swipe) never throws away a half-written comment.
 */
const drafts = new Map<string, string>();

/**
 * Comments on a clip, a post or a hit, as a sheet over the feed — the way
 * Instagram does it — instead of a page of its own. Threads keep their page.
 *
 * Opened from a clip's words or its speech bubble in the Feed, on a phone, it
 * is the comments stage: the clip stays playing above the sheet, shrunk into
 * the room left, with its heart, send and save beside it (see commentStage).
 * From anywhere else (an alert, a link, a post's page) it is the plain sheet.
 *
 * At the top of the list, the post itself: who, the whole caption and its
 * small line (CommentsCaption). The box at the bottom: your picture, the
 * words, and on the right a photo button that turns into send as soon as
 * there is something to send. A sent comment slides in at the bottom.
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
  const { kind: rawKind, id = '', focus, at, reply: replyParam, stage: stageParam } = useLocalSearchParams<{ kind?: string; id?: string; focus?: string; at?: string; reply?: string; stage?: string }>();
  const kind = rawKind === 'hit' ? 'hit' : 'post';
  const key = stageKeyOf(kind, id);
  // The stage only when the Feed has just put this very clip on it; a reload,
  // an old link (the address says stage, nothing is on it) or a stage already
  // on its way out gets the plain sheet. A wide computer window's docked panel
  // (mode 'side') takes the clip on too, with nothing to shrink.
  const [adopted] = useState(() => {
    const now = getStage();
    if (!now || now.ending || now.key !== key) return null;
    if (now.mode === 'side') return { id: now.id, geo: null };
    return stageParam === '1' && now.geo ? { id: now.id, geo: now.geo } : null;
  });
  const stage = adopted?.geo ?? null;
  const staged = !!stage;
  // Read as one word, so the comments redraw only when it changes: whether
  // the stage they took on is still up, and whether its page went away.
  const stageNow = useStageSelect((s) => (adopted && s?.id === adopted.id ? (s.lost ? 'lost' : 'up') : 'off'));
  const mine = stageNow !== 'off';
  // Told before anything else can run, so the feed never gives up on a stage these comments have taken.
  useLayoutEffect(() => { if (adopted) markMounted(adopted.id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Gone without their own close (taken down with pages opened over them): the feed may need telling.
  useEffect(() => () => { if (adopted) markGone(adopted.id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // A page opened over the comments (a profile, a #tag, a court) holds the
  // clip under the stage still until you are back; then it carries on from there.
  const focused = useIsFocused();
  useEffect(() => { if (mine) setCovered(!focused); }, [focused, mine]);
  // Leaving: back, as ever, from the page in front. Under a page opened over
  // it (the clip went away meanwhile, say), this page alone goes: never the
  // one on top, and never left behind, invisible, over the feed.
  const navigation = useNavigation();
  const route = useRoute();
  const leave = () => {
    if (navigation.isFocused()) { router.back(); return; }
    navigation.dispatch({ type: 'POP', payload: { count: 1 }, source: route.key, target: navigation.getState()?.key });
  };

  // Opened from "Add a comment": the box is ready to type in as the sheet lands.
  const input = useRef<TextInput>(null);
  // Opened from a comment on the page: the list scrolls to that comment as the sheet lands.
  const list = useAnimatedRef<Animated.ScrollView>();
  const rowY = useRef<Record<string, number>>({});
  const rowH = useRef<Record<string, number>>({});
  // How far the list is scrolled, and the two edges of what can be seen of it:
  // its top, and the top of the box under it (which rides on the keyboard).
  const scrollY = useRef(0);
  const frame = useRef<View>(null);
  const composer = useRef<View>(null);
  const heading = useRef<Text>(null);
  useEffect(() => {
    if (!at) return;
    const t = setTimeout(() => { const y = rowY.current[at]; if (y !== undefined) list.current?.scrollTo({ y: Math.max(0, y - 12), animated: true }); }, 420);
    return () => clearTimeout(t);
  }, [at]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => input.current?.focus(), 380);
    return () => clearTimeout(t);
  }, [focus]);
  const { comments, posts, stories, users, currentUserId, actions } = useApp();
  const me = users.find((u) => u.id === currentUserId);
  const [draft, setDraft] = useState(() => drafts.get(key) ?? '');
  const [photo, setPhoto] = useState<string | null>(null);
  const [closeSignal, setCloseSignal] = useState(0);
  const close = useCallback(() => setCloseSignal((n) => n + 1), []);
  const post = kind === 'post' ? posts.find((p) => p.id === id) : undefined;
  const exists = kind === 'hit' ? stories.some((st) => st.id === id) : !!post;
  // Taken down by an admin (migration 108): its author and admins can still read it, but nothing new can be added.
  const takenDown = !!(kind === 'hit' ? stories.find((st) => st.id === id)?.removed : post?.removed);
  const author = post ? users.find((u) => u.id === post.authorId) : undefined;
  // Every comment and reply here (the count), and the same laid out as threads.
  // One hidden by the owner's Hidden words (migration 117), or a reply under it, is neither shown nor
  // counted for the owner, who finds it under "Hidden comments" at the end.
  const all = listedComments(comments, id, currentUserId);
  const threads = threadsOf(comments, id, 'oldest', currentUserId);
  const ownerId = kind === 'hit' ? stories.find((st) => st.id === id)?.authorId : post?.authorId;
  const hidden = hiddenCommentsOn(comments, id, currentUserId, ownerId);
  // Comments made while the sheet is open slide in; the ones already there just appear.
  const openedAt = useRef(Date.now());
  // On the stage the first few threads rise with the sheet; the rest are drawn
  // once it is at rest. Opened at a comment, or as the plain sheet, all of them at once.
  const [allThreads, setAllThreads] = useState(!!at || !staged);
  const settledOnce = useRef(false);
  const onSettled = () => {
    if (settledOnce.current) return;
    settledOnce.current = true;
    setAllThreads(true);
    // A screen reader starts on the sheet's heading, "Comments, 12". Not when
    // the sheet opened to type in ("Add a comment", "Reply"), or the box would lose the keyboard.
    if (focus || replyParam) return;
    if (Platform.OS !== 'web') { if (heading.current) AccessibilityInfo.sendAccessibilityEvent(heading.current as never, 'focus'); return; }
    const el = heading.current as unknown as HTMLElement | null;
    const active = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    if (!el || (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable))) return;
    // A heading takes the focus only when told it may (and never by Tab).
    el.tabIndex = -1;
    el.focus?.({ preventScroll: true });
  };

  // Your words are kept if you leave without sending them.
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  // The page under the stage went away (an Instant ran out, its author was
  // blocked): the sheet closes the usual way. With a page opened over it (the
  // profile they were blocked from), it waits until it is back in front.
  useEffect(() => { if (stageNow === 'lost' && focused) close(); }, [stageNow, focused]); // eslint-disable-line react-hooks/exhaustive-deps
  // Android's Back closes the sheet with its own animation, while it is the page in front.
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => sub.remove();
  }, [close]));

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
  const canSend = exists && !takenDown && (!!words(draft).trim() || !!photo);
  // Kept for next time only if there is something of your own in it.
  const latestWords = useRef(words);
  latestWords.current = words;
  useEffect(() => () => {
    const text = latestDraft.current;
    if (latestWords.current(text).trim()) drafts.set(key, text); else drafts.delete(key);
  }, [key]);

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
  // Not on something taken down, or under a comment that was (migration 108): the server would refuse it.
  const replyClosed = takenDown || !!(replyTarget && comments.find((c) => c.id === (replyTarget.parentId ?? replyTarget.id))?.removed);
  useEffect(() => {
    if (!replyTarget || replyClosed || replyStarted.current) return;
    const t = setTimeout(() => { replyStarted.current = true; replyTo(replyTarget); }, 380);
    return () => clearTimeout(t);
  }, [replyTarget, replyClosed]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!canSend || takenDown) return;
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
  // On the stage the emoji row shows only while you type, giving its room
  // back to the comments at half. A moment's grace on blur: pressing an emoji
  // takes the focus away for an instant, and the row must not go under the finger.
  const [typing, setTyping] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (blurTimer.current) clearTimeout(blurTimer.current); }, []);
  const onBoxFocus = () => { if (blurTimer.current) clearTimeout(blurTimer.current); setTyping(true); };
  const onBoxBlur = () => {
    blurredAt.current = Date.now();
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => setTyping(false), 250);
  };
  const quickRow = (
    <>
      {QUICK.map((e) => (
        <Pressable key={e} accessibilityRole="button" accessibilityLabel={`Add ${e}`} hitSlop={6} onPress={() => addEmoji(e)} style={({ pressed }) => [styles.quickItem, pressed && styles.quickPressed]}>
          <Text style={styles.quickEmoji}>{e}</Text>
        </Pressable>
      ))}
    </>
  );

  const shownThreads = allThreads ? threads : threads.slice(0, FIRST_THREADS);
  const count = all.length;
  return (
    <>
      {/* Over the stage's black the phone's clock is white, as it is over the clip in the Feed. */}
      {staged && focused ? <StatusBar style="light" animated /> : null}
      <DragSheet
        ownBack
        closeSignal={closeSignal}
        onDismissed={leave}
        peekFraction={0.7}
        active={focused}
        side
        stage={stage}
        stageOverlay={staged ? <StageRail kind={kind} id={id} /> : undefined}
        onSettled={onSettled}
        header={
          <View style={styles.headerRow}>
            <Text ref={heading} accessibilityRole="header" accessibilityLabel={count ? `Comments, ${count}` : 'Comments'} style={styles.heading}>Comments{count ? ` · ${count}` : ''}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={close}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
        }
      >
        <View ref={frame} style={{ flex: 1 }} onAccessibilityEscape={close}>
          <CommentList
            listRef={list}
            pull={staged && LIST_PULL && Platform.OS !== 'web'}
            onScrollY={(y) => { scrollY.current = y; }}
            contentContainerStyle={styles.list}
          >
            {/* The post itself first: who, the whole caption, its small line. */}
            <CommentsCaption kind={kind} id={id} />
            {shownThreads.map((t) => (
              <CommentThread
                key={t.top.id}
                thread={t}
                big
                open={openThreads.has(t.top.id)}
                onToggle={() => toggleThread(t.top.id)}
                onReply={exists && !takenDown ? replyTo : undefined}
                onRowLayout={(commentId, y, height) => { rowY.current[commentId] = y; rowH.current[commentId] = height; }}
                isFresh={(c) => Date.parse(c.createdAt) > openedAt.current}
              />
            ))}
            {!threads.length ? <Text style={styles.empty}>{exists ? 'No comments yet. Start the conversation.' : looked ? 'This is no longer available.' : ''}</Text> : null}
            <HiddenComments count={hidden.length}>
              {hidden.map((c) => (
                <CommentRow key={c.id} comment={c} big onUnhide={() => actions.unhideByWords(kind === 'hit' ? 'hit-comment' : 'comment', c.id)} />
              ))}
            </HiddenComments>
          </CommentList>
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
            {!staged ? <View style={styles.quick}>{quickRow}</View> : typing ? (
              <Animated.View entering={FadeInDown.duration(160)} exiting={FadeOut.duration(120)} style={styles.quick}>{quickRow}</Animated.View>
            ) : null}
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
                <Field inputRef={input} value={draft} onChangeText={changeDraft} placeholder={takenDown ? 'Comments are closed: this was taken down.' : replyingTo ? (replyingTo.self ? 'Add a reply…' : `Reply to @${replyingTo.handle}…`) : author && author.id !== currentUserId ? `Add a comment for ${author.name.split(' ')[0]}…` : 'Add a comment…'} multiline minHeight={44} onSubmitEditing={send} onFocus={onBoxFocus} onBlur={onBoxBlur} mentions compact />
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
    </>
  );
}

/**
 * The comments list. On the stage (a phone, not a browser) a pull down while
 * the list is at its very top moves the sheet instead, so the comments can be
 * pulled down and away from anywhere, as on Instagram; anywhere else it is
 * the list's own scroll. The list is held at its top while the sheet moves.
 */
function CommentList({ listRef, pull, onScrollY, contentContainerStyle, children }: {
  listRef: AnimatedRef<Animated.ScrollView>;
  pull: boolean;
  onScrollY: (y: number) => void;
  contentContainerStyle: object;
  children: React.ReactNode;
}) {
  const drag = useSheetDrag();
  const listY = useSharedValue(0);
  const pulling = useSharedValue(false);
  const touchStart = useSharedValue({ x: 0, y: 0 });
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      listY.value = e.contentOffset.y;
      runOnJS(onScrollY)(e.contentOffset.y);
    },
  });
  // Made once: the sheet re-draws as you type, and the pull must not be re-made under a finger.
  const gesture = useMemo(() => {
    if (!pull || !drag) return null;
    const native = Gesture.Native();
    // Taken only for a pull down that starts with the list at its top; a move up, or a list already scrolled, is the list's own.
    const sheetPull = Gesture.Pan()
      .manualActivation(true)
      .simultaneousWithExternalGesture(native)
      .onTouchesDown((e) => {
        'worklet';
        const t = e.allTouches[0];
        if (t) touchStart.value = { x: t.absoluteX, y: t.absoluteY };
      })
      .onTouchesMove((e, manager) => {
        'worklet';
        const t = e.allTouches[0];
        if (!t) return;
        const dy = t.absoluteY - touchStart.value.y;
        const dx = Math.abs(t.absoluteX - touchStart.value.x);
        if (listY.value <= 0 && dy > 6 && dx < 12) manager.activate();
        else if (dy < -2 || listY.value > 0 || dx >= 12) manager.fail();
      })
      .onStart(() => { 'worklet'; pulling.value = true; drag.start(); })
      .onUpdate((e) => {
        'worklet';
        drag.to(e.translationY);
        scrollTo(listRef, 0, 0, false);
      })
      .onEnd((e) => { 'worklet'; drag.release(e.velocityY); })
      .onFinalize(() => { 'worklet'; pulling.value = false; });
    return Gesture.Simultaneous(native, sheetPull);
  }, [pull, drag, listRef]); // eslint-disable-line react-hooks/exhaustive-deps
  const scroller = (
    <Animated.ScrollView
      ref={listRef}
      style={{ flex: 1 }}
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
      // A swipe down the list takes the keyboard with it, following the finger on an iPhone.
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      bounces={!pull}
      scrollEventThrottle={16}
      onScroll={onScroll}
    >
      {children}
    </Animated.ScrollView>
  );
  if (!gesture) return scroller;
  return <GestureDetector gesture={gesture}>{scroller}</GestureDetector>;
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

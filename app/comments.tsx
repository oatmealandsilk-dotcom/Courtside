import { brandShadow } from '@/theme/fillMode';
import { LESS_AI, LESS_AI_ROUND2 } from '@/theme/look';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, BackHandler, Keyboard, Platform, Pressable, Animated as RNAnimated, Easing as RNEasing, StyleSheet, Text, View, type TextInput } from 'react-native';
import { router, useFocusEffect, useIsFocused, useLocalSearchParams, useNavigation, useRoute } from 'expo-router';
import { openJoinSheet } from '@/features/guest/joinAsk';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image as ExpoImage } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { LayoutAnimationConfig, ZoomIn, ZoomOut, runOnJS, scrollTo, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, type AnimatedRef, type SharedValue } from 'react-native-reanimated';

import { CommentThread, threadOf, threadsOf, useReplyDraft, type Thread } from '@/components/CommentThread';
import { JumpProvider } from '@/components/JumpTo';
import { CommentsCaption } from '@/components/CommentsCaption';
import { CommentRow } from '@/components/CommentRow';
import { HiddenComments } from '@/components/HiddenComments';
import { DragSheet, useSheetDrag, useSheetKeyboard, type SheetKeyboard } from '@/components/DragSheet';
import { pickFromDevice } from '@/components/MediaPicker';
import { StageRail } from '@/components/StageRail';
import { Avatar, BrandWash, Field } from '@/components/ui';
import type { Comment, ID } from '@/data/types';
import { LIST_PULL, getStage, markGone, markMounted, setCovered, stageKeyOf, useStageSelect } from '@/features/feed/commentStage';
import { hiddenCommentsOn, listedComments } from '@/features/hiddenWords/hiddenWords';
import { COMMENT_MAX } from '@/features/feed/limits';
import { useCommentsV2 } from '@/features/feed/commentsV2';
import { TextScale } from '@/theme/textScale';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/** One tap drops these into the box, the way Instagram's row above the keyboard does. Tennis first. */
const QUICK = ['🎾', '🔥', '👏', '😂', '😮', '🙌', '💯', '❤️'];
/** COMMENTS_V2's row: tennis first, then the warm ones; no 💯 (it reads as a red stamp at this size). */
const QUICK_V2 = ['🎾', '❤️', '🔥', '🙌', '👏', '😍', '😮', '😂'];
/**
 * COMMENTS_V2's row, the way Instagram's sits (Oct 25, owner: "Emoji bar
 * should be smaller like instagrams"): a compact 40-point strip of small
 * glyphs, tight on the box, there only while you type.
 */
const QUICK_ROW_H = 40;
/** What the row adds to the box when it shows: its height, less the 4 it tucks into the gap under it, plus that gap. */
const QUICK_ROW_BLOCK = QUICK_ROW_H - 4 + spacing.sm;
/** The Replying strip's height before it has ever been drawn (it is measured after that). */
const STRIP_GUESS = 36;
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
  // The new comments feel (COMMENTS_V2: admins first): read once as the sheet opens, so it never changes under you.
  const v2Now = useCommentsV2();
  const [v2] = useState(v2Now);
  // On a phone (not a browser) with it: posting, a tap on the comments and the header put the keyboard away.
  const v2Phone = v2 && Platform.OS !== 'web';
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
  // How far the list is scrolled, kept on the UI thread (read only on taps): no hop to JS on each scroll frame.
  const scrollY = useSharedValue(0);
  const frame = useRef<View>(null);
  const composer = useRef<View>(null);
  // The box's height (strip, emoji row, words), and the sheet's word on where its comments start once the keyboard is up (keyboardSync).
  const composerH = useRef(0);
  // What the box held when it was last measured ('r' the emoji row, 's' the Replying strip, 'p' a photo), its
  // height at rest (the words on one line, nothing above them) and the strip's own height: so where its top will
  // be is known the moment the keyboard starts, drawn yet or not.
  const composerShape = useRef('');
  const restComposerH = useRef(0);
  const stripH = useRef(STRIP_GUESS);
  const sheetKeyboard = useRef<SheetKeyboard | null>(null);
  // The emoji row shows only while you type (on the stage; with COMMENTS_V2 everywhere, as on Instagram),
  // giving its room back to the comments otherwise (see onBoxFocus).
  const [typing, setTyping] = useState(false);
  const heading = useRef<Text>(null);
  // It lights up for a moment as it comes into view (the same light as a reported reply's in its thread).
  const [atLit, setAtLit] = useState(0);
  useEffect(() => {
    if (!at) return;
    const t = setTimeout(() => {
      const y = rowY.current[at];
      if (y === undefined) return;
      list.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
      setAtLit(Date.now());
    }, 420);
    return () => clearTimeout(t);
  }, [at]); // eslint-disable-line react-hooks/exhaustive-deps
  // COMMENTS_V2: the comment you just posted gets the same soft light once, as the list brings it into view.
  const [fresh, setFresh] = useState<{ id: ID; lit: number } | null>(null);
  const jumpCtx = useMemo(() => (
    at ? { at, ref: () => undefined, onLayout: () => undefined, lit: atLit }
      : fresh ? { at: fresh.id, ref: () => undefined, onLayout: () => undefined, lit: fresh.lit }
        : null
  ), [at, atLit, fresh]);
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => input.current?.focus(), 380);
    return () => clearTimeout(t);
  }, [focus]);
  const { comments, posts, stories, users, currentUserId, actions, isGuest } = useApp();
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
  // Comments made while the sheet is open fade in; the ones already there just appear.
  const openedAt = useRef(Date.now());
  // Every comment and reply here (the count), and the same laid out as threads.
  // One hidden by the owner's Hidden words (migration 117), or a reply under it, is neither shown nor
  // counted for the owner, who finds it under "Hidden comments" at the end.
  // Worked out again only when the comments change, not on each keystroke in the box.
  const all = useMemo(() => listedComments(comments, id, currentUserId), [comments, id, currentUserId]);
  // Oldest first, like a conversation; what you write here lands at the bottom (see sentLast).
  const threads = useMemo(() => sentLast(threadsOf(comments, id, 'oldest', currentUserId), currentUserId, openedAt.current), [comments, id, currentUserId]);
  const ownerId = kind === 'hit' ? stories.find((st) => st.id === id)?.authorId : post?.authorId;
  const hidden = useMemo(() => hiddenCommentsOn(comments, id, currentUserId, ownerId), [comments, id, currentUserId, ownerId]);
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
    if (closing && y !== undefined && y < scrollY.value) requestAnimationFrame(() => list.current?.scrollTo({ y: Math.max(0, y - 12), animated: false }));
    // Typing when the toggle was pressed: keep typing (only a browser needs it given back).
    if (Date.now() - blurredAt.current < 400) input.current?.focus();
  };
  const atParent = comments.find((c) => c.id === at)?.parentId;
  useEffect(() => { openThread(atParent); }, [atParent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Replying: "@them " in the box and a "Replying to @them ×" strip above it.
  const { replyingTo, start: startReply, change: changeDraft, stop: stopReplying, cancel: cancelReply, done: doneReplying, resume: resumeDraft, words } = useReplyDraft(setDraft, () => input.current?.focus());
  // Something of your own to send: words beyond the "@them " Reply put in, or a photo.
  const canSend = exists && !takenDown && (!!words(draft).trim() || !!photo);
  // Kept for next time only if there is something of your own in it.
  const latestWords = useRef(words);
  latestWords.current = words;
  useEffect(() => () => {
    const text = latestDraft.current;
    if (latestWords.current(text).trim()) drafts.set(key, text); else drafts.delete(key);
  }, [key]);
  // Whether the sheet is still open, and the photo in the box now (see send).
  const sheetOpen = useRef(true);
  useEffect(() => { sheetOpen.current = true; return () => { sheetOpen.current = false; }; }, []);
  const latestPhoto = useRef(photo);
  latestPhoto.current = photo;
  // Leaving the box with nothing of your own in it (only the "@them " Reply put
  // there): the reply is let go, as on Instagram, and the box is a plain empty
  // comment box again. Anything typed beyond the "@them " keeps the reply. Not
  // while a photo is being picked: the library takes the keyboard away for a moment.
  const picking = useRef(false);
  const latestCancel = useRef(cancelReply);
  latestCancel.current = cancelReply;
  const letGoIfBare = () => {
    if (picking.current || latestPhoto.current) return;
    if (latestWords.current(latestDraft.current).trim()) return;
    latestCancel.current();
  };
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const sub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => letGoIfBare());
    return () => sub.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The comment being answered stays in sight just above the box, as on
  // Instagram, rather than sliding under the keyboard as it comes up. Measured
  // on screen each time, so it holds whatever height the keyboard and the
  // sheet have reached.
  /** Scrolls only as far as it takes for the comment to be in sight in the top `seen` points of the list. */
  const showIn = (commentId: ID, seen: number) => {
    const y = rowY.current[commentId];
    if (y === undefined || !(seen > 0)) return;
    const bottom = y + (rowH.current[commentId] ?? 0) + 12;
    if (bottom > scrollY.value + seen) list.current?.scrollTo({ y: Math.max(0, bottom - seen), animated: true });
    else if (y < scrollY.value) list.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  };
  const reveal = (commentId: ID) => {
    if (rowY.current[commentId] === undefined) return;
    frame.current?.measureInWindow((_x, top) => composer.current?.measureInWindow((_x2, boxTop) => showIn(commentId, boxTop - top)));
  };
  /** The box's height with the keyboard up while replying (COMMENTS_V2): the emoji row and the strip in it, drawn yet or not. */
  const typingComposerH = () => {
    const s = composerShape.current;
    return composerH.current + (s.includes('r') ? 0 : QUICK_ROW_BLOCK) + (s.includes('s') ? 0 : stripH.current);
  };
  /**
   * How much of the list will show between the header and the box once the
   * keyboard is down and the box is back to one empty line (COMMENTS_V2), or
   * undefined when the sheet cannot say.
   */
  const restSeen = () => {
    const sk = sheetKeyboard.current;
    if (!sk || !(restComposerH.current > 0)) return undefined;
    const seen = sk.bodyBottomAtRest() - restComposerH.current - sk.bodyTopAtRest();
    return seen > 0 ? seen : undefined;
  };
  const replyTo = (comment: Comment) => {
    startReply(comment);
    // COMMENTS_V2: the emoji row comes in the same drawing as the strip, not a beat later with the keyboard.
    if (v2) setTyping(true);
    if (Platform.OS === 'web') { setTimeout(() => reveal(comment.id), 350); return; }
    if (v2 && Platform.OS === 'ios' && sheetKeyboard.current) {
      // Already typing: the box only gains its strip; the comment comes up just above it once that is drawn.
      if (Keyboard.isVisible()) { setTimeout(() => reveal(comment.id), 60); return; }
      // The keyboard on its way: one scroll, worked out from where the box and the sheet will be once
      // it is up, starting the moment it does, so the comment arrives above the box with them (Oct 25).
      const coming = Keyboard.addListener('keyboardWillShow', (e) => {
        coming.remove();
        const top = sheetKeyboard.current?.bodyTopWithKeyboard();
        if (top !== undefined) showIn(comment.id, e.endCoordinates.screenY - typingComposerH() - top);
      });
      setTimeout(() => coming.remove(), 1500);
      return;
    }
    // One scroll, not two: at once if the keyboard is already up; otherwise once it has come up
    // (a first scroll part way up, then a second to correct it, read as a jump).
    if (Keyboard.isVisible()) { setTimeout(() => reveal(comment.id), 60); return; }
    const shown = Keyboard.addListener('keyboardDidShow', () => { shown.remove(); clearTimeout(late); setTimeout(() => reveal(comment.id), 60); });
    const late = setTimeout(() => { shown.remove(); reveal(comment.id); }, 1200);
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

  // The right-hand button: a photo button while the box is empty, send once there is something to send
  // (on an Instant, send only). Sending gives it a little push.
  const sendPop = useSharedValue(1);
  const sendStyle = useAnimatedStyle(() => ({ transform: [{ scale: sendPop.value }] }));

  // Sending feels instant: the box clears first, the button gives a little
  // push, the comment lands, and the list slides to it once it is drawn: to
  // the bottom for a comment, to the reply itself (its thread unfolded) for a reply.
  const justSent = useRef<Set<ID> | null>(null);
  // Whether the keyboard was put away as it went (COMMENTS_V2 on a phone): the list then works out where
  // things will be once it is down, and brings the comment into view as they get there.
  const sentHiding = useRef(false);
  const send = () => {
    const text = draft.trim();
    if (!canSend || takenDown) return;
    const picked = photo;
    const answering = replyingTo?.id;
    const was = replyingTo;
    setDraft('');
    setPhoto(null);
    doneReplying();
    justSent.current = new Set(all.map((c) => c.id));
    sentHiding.current = v2Phone && Keyboard.isVisible();
    // A slight dip and a settle with no wobble, as the Follow button answers (Oct 20 sweep: the deeper pop read as a bounce).
    sendPop.value = withSequence(withTiming(0.96, { duration: 60 }), withSpring(1, { damping: 20, stiffness: 320 }));
    if (answering) openThread(threadOf(comments, answering));
    const saving = kind === 'hit' ? actions.addStoryComment(id, text, answering) : actions.addComment(id, text, picked ?? undefined, answering);
    // Refused for its words (migration 117), or it didn't save at all: the
    // toast says why, and what you wrote comes back into the box (if you
    // haven't started something else there), answering whoever it answered,
    // its photo too. The sheet already closed: it waits there for next time.
    void saving.then((result) => {
      if (!result) return;
      if (!sheetOpen.current) { if (!drafts.get(key)?.trim()) drafts.set(key, text); return; }
      if (latestDraft.current.trim() || latestPhoto.current) return;
      resumeDraft(text, was);
      if (picked) setPhoto(picked);
    });
    // Sent: the keyboard goes down and the sheet with it (COMMENTS_V2 on a phone), as on Instagram; otherwise the box stays ready for more.
    if (v2Phone) Keyboard.dismiss();
    else input.current?.focus();
  };
  // Your comment, once drawn, is brought into view only if it is not already
  // in sight between the header and the box, and then only just enough: a
  // reply under a comment on screen leaves the list where it is (Oct 25: it
  // used to jump, cutting the caption off under the header).
  useEffect(() => {
    const before = justSent.current;
    const sent = before ? all.find((c) => !before.has(c.id) && c.authorId === currentUserId) : undefined;
    if (!sent) return;
    justSent.current = null;
    if (!v2) {
      const go = (tries: number) => {
        if (rowY.current[sent.id] !== undefined) reveal(sent.id);
        else if (tries > 0) setTimeout(() => go(tries - 1), 120);
      };
      setTimeout(() => go(4), 80);
      return;
    }
    // COMMENTS_V2 (Oct 25, v3: "way smoother"): one glide, started the frame the comment is drawn. With the
    // keyboard on its way down it is aimed at where the box and the sheet will be once it is down, so it runs
    // with them rather than after them (it used to wait for the keyboard, then move the list: two moves).
    // Then a moment of soft light on it.
    const hiding = sentHiding.current;
    let frames = 0;
    const go = () => {
      if (!sheetOpen.current) return;
      if (rowY.current[sent.id] === undefined) { if (frames++ < 30) requestAnimationFrame(go); return; }
      const seen = hiding ? restSeen() : undefined;
      if (seen !== undefined) showIn(sent.id, seen); else reveal(sent.id);
      setFresh({ id: sent.id, lit: Date.now() });
    };
    requestAnimationFrame(go);
  }, [all.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const addPhoto = async () => {
    picking.current = true;
    try {
      const got = await pickFromDevice('photo');
      if (got?.uri) { setPhoto(got.uri); haptics.tap(); }
    } catch { /* the library was closed or refused: nothing to add */ } finally {
      picking.current = false;
    }
  };
  // Where the caret is in the box (COMMENTS_V2: an emoji goes in there, as typing would put it), and the
  // words it was in. An iPhone says nothing when the page itself changes the words (Reply's "@them ", the
  // strip's ×, a tap out, sending): the caret it last gave is then stale, and an emoji put there would land
  // inside "@them" and drop the reply. So it counts only while the words are still the ones it was given in.
  const selection = useRef<{ start: number; end: number; text: string } | null>(null);
  const typed = (text: string) => {
    latestDraft.current = text;
    changeDraft(text);
  };
  const addEmoji = (emoji: string) => {
    haptics.tap();
    if (!v2) {
      setDraft((d) => d + emoji);
      input.current?.focus();
      return;
    }
    // At the caret while typing (a browser takes the focus away for the press itself); at the end otherwise.
    const typingNow = !!input.current?.isFocused?.() || Date.now() - blurredAt.current < 400;
    const d = latestDraft.current;
    const at = selection.current;
    const sel = typingNow && at && at.text === d ? at : { start: d.length, end: d.length };
    const start = Math.min(sel.start, d.length);
    const end = Math.min(Math.max(sel.end, start), d.length);
    const next = d.slice(0, start) + emoji + d.slice(end);
    typed(next);
    const caret = start + emoji.length;
    selection.current = { start: caret, end: caret, text: next };
    // Opens the keyboard if it was down.
    input.current?.focus();
    // The caret after the emoji once the new words have landed.
    setTimeout(() => {
      const box = input.current as unknown as { setSelection?: (a: number, b: number) => void; setSelectionRange?: (a: number, b: number) => void } | null;
      if (box?.setSelection) box.setSelection(caret, caret);
      else box?.setSelectionRange?.(caret, caret);
    }, 0);
  };
  // The emoji row while you type (typing, above). A moment's grace on blur: pressing an emoji takes the focus
  // away for an instant in a browser, and the row must not go under the finger.
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (blurTimer.current) clearTimeout(blurTimer.current); }, []);
  const onBoxFocus = () => { if (blurTimer.current) clearTimeout(blurTimer.current); setTyping(true); };
  // COMMENTS_V2 on a phone: the row goes the moment the keyboard starts down, not a beat later part way
  // down (the box stepping down under it), and comes back with it (Android's Back can put the keyboard
  // away and leave the box focused).
  useEffect(() => {
    if (!v2Phone) return undefined;
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => { if (input.current?.isFocused?.()) setTyping(true); });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => { if (blurTimer.current) clearTimeout(blurTimer.current); setTyping(false); });
    return () => { show.remove(); hide.remove(); };
  }, [v2Phone]);
  const onBoxBlur = () => {
    blurredAt.current = Date.now();
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => {
      setTyping(false);
      // A browser has no keyboard to listen to: the box left (and not taken back by an emoji or the strip's ×) lets a bare reply go.
      if (Platform.OS === 'web' && !input.current?.isFocused?.()) letGoIfBare();
    }, 250);
  };
  const quickRow = v2 ? (
    // COMMENTS_V2: Instagram's row: small glyphs evenly spaced in a compact strip (not stretched across a wide
    // screen), tight on the box, no bubble; a press gives a small squeeze.
    <View style={styles.quickV2}>
      {QUICK_V2.map((e) => (
        <Pressable key={e} accessibilityRole="button" accessibilityLabel={`Add ${e}`} hitSlop={{ top: 4, bottom: 4 }} onPress={() => addEmoji(e)} style={({ pressed }) => [styles.quickSlot, pressed && styles.quickSqueeze]}>
          <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.quickGlyph}>{e}</Text>
        </Pressable>
      ))}
    </View>
  ) : (
    <View style={styles.quick}>
      {QUICK.map((e) => (
        <Pressable key={e} accessibilityRole="button" accessibilityLabel={`Add ${e}`} hitSlop={6} onPress={() => addEmoji(e)} style={({ pressed }) => [styles.quickItem, pressed && styles.quickPressed]}>
          <Text style={styles.quickEmoji}>{e}</Text>
        </Pressable>
      ))}
    </View>
  );
  // COMMENTS_V2 on a phone: the photo button and send swap with a short cross-fade, both always there (the
  // hidden one takes no taps), instead of one zooming out as the other zooms in. A browser keeps the one-at-a-
  // time swap: there a hidden button still caught the tap meant for the one on show (Oct 5 audit, again Oct 25).
  const crossFade = v2Phone;
  const swap = useRef(new RNAnimated.Value(canSend ? 1 : 0)).current;
  const swapped = useRef(canSend);
  useEffect(() => {
    if (!crossFade || swapped.current === canSend) return;
    swapped.current = canSend;
    RNAnimated.timing(swap, { toValue: canSend ? 1 : 0, duration: 150, easing: RNEasing.out(RNEasing.quad), useNativeDriver: true }).start();
  }, [canSend, crossFade, swap]);
  const swapLooks = useMemo(() => ({
    photo: { opacity: swap.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ scale: swap.interpolate({ inputRange: [0, 1], outputRange: [1, 0.8] }) }] },
    send: { opacity: swap, transform: [{ scale: swap.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] },
  }), [swap]);

  const shownThreads = allThreads ? threads : threads.slice(0, FIRST_THREADS);
  // The threads, made again only when they, which are open, or whether you can reply change: typing a
  // comment (the draft lives here) leaves every thread, row and caption under it as it was. The
  // callbacks go through refs so they always run the latest toggle and reply.
  const toggleRef = useRef(toggleThread);
  toggleRef.current = toggleThread;
  const replyRef = useRef(replyTo);
  replyRef.current = replyTo;
  const canReply = exists && !takenDown;
  const threadEls = useMemo(() => shownThreads.map((t) => (
    <CommentThread
      key={t.top.id}
      thread={t}
      big
      open={openThreads.has(t.top.id)}
      onToggle={() => toggleRef.current(t.top.id)}
      onReply={canReply ? (c: Comment) => replyRef.current(c) : undefined}
      onRowLayout={(commentId, y, height) => { rowY.current[commentId] = y; rowH.current[commentId] = height; }}
      isFresh={(c) => Date.parse(c.createdAt) > openedAt.current}
      glide
    />
  )), [threads, allThreads, openThreads, canReply]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = all.length;
  // The header, the small rail and the whole list, made again only when what they show changes: a keystroke
  // (the draft lives here) redraws the box alone, never the caption, the comments or the sheet's header under
  // a finger that is typing (Oct 25, v3: "way smoother").
  const header = useMemo(() => (
    <View style={styles.headerRow}>
      <Text ref={heading} accessibilityRole="header" accessibilityLabel={count ? `Comments, ${count}` : 'Comments'} style={styles.heading}>Comments{count ? ` · ${count}` : ''}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={styles.closeButton}>
        <Ionicons name="close" size={22} color={colors.textMuted} />
      </Pressable>
    </View>
  ), [styles, count, close]);
  const rail = useMemo(() => (staged ? <StageRail kind={kind} id={id} /> : undefined), [staged, kind, id]);
  const listEl = useMemo(() => (
    <CommentList
      listRef={list}
      pull={staged && LIST_PULL && Platform.OS !== 'web'}
      tapsPutKeyboardAway={v2Phone}
      scrollYValue={scrollY}
      contentContainerStyle={styles.list}
    >
      {/* The post itself first: who, the whole caption, its small line. */}
      <CommentsCaption kind={kind} id={id} />
      <JumpProvider value={jumpCtx}>
        {threadEls}
      </JumpProvider>
      {/* Only hidden ones so far: "Hidden comments" below says so, not "No comments yet" above it. */}
      {!threads.length && !(exists && hidden.length) ? <Text style={styles.empty}>{exists ? (LESS_AI || LESS_AI_ROUND2 ? 'No comments yet.' : 'No comments yet. Start the conversation.') : looked ? 'This is no longer available.' : ''}</Text> : null}
      <HiddenComments count={hidden.length}>
        {hidden.map((c) => (
          <CommentRow key={c.id} comment={c} big onUnhide={() => actions.unhideByWords(kind === 'hit' ? 'hit-comment' : 'comment', c.id)} />
        ))}
      </HiddenComments>
    </CommentList>
  ), [list, staged, v2Phone, scrollY, styles, kind, id, jumpCtx, threadEls, threads.length, exists, hidden, looked, actions]);
  // The emoji row: COMMENTS_V2 only while typing, as on Instagram; otherwise always on the plain sheet, and while typing on the stage.
  const showRow = v2 ? typing : !staged || typing;
  // What the box holds this time (see composerShape).
  const shape = `${showRow ? 'r' : ''}${replyingTo ? 's' : ''}${photo ? 'p' : ''}`;
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
        stageOverlay={rail}
        onSettled={onSettled}
        keyboardSync={v2}
        smoothOpen={v2}
        header={header}
      >
        <View ref={frame} style={{ flex: 1 }} onAccessibilityEscape={close}>
          {v2 ? <SheetKeyboardProbe into={sheetKeyboard} /> : null}
          {listEl}
          <View
            ref={composer}
            style={styles.composer}
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              composerH.current = h;
              composerShape.current = shape;
              // At rest: nothing above the words. The lowest seen is the one line an empty box has.
              if (!shape && (!(restComposerH.current > 0) || h < restComposerH.current)) restComposerH.current = h;
            }}
          >
            {/* A guest (guest mode, Oct 17) reads the comments; the box asks them to join instead of typing. */}
            {isGuest ? <Pressable accessibilityRole="button" accessibilityLabel="Add a comment" onPress={() => openJoinSheet('comment')} style={[StyleSheet.absoluteFill, { zIndex: 5 }]} /> : null}
            {/* Docked on the box's top edge while replying, the × on the right. Plain, never a
                height animation: an iPhone kept the animation's first frame (no height) and the
                strip never showed (Oct 25 recording). */}
            {replyingTo ? (
              <View style={styles.replying} onLayout={(e) => { stripH.current = e.nativeEvent.layout.height; }}>
                <Text style={styles.replyingText} numberOfLines={1}>
                  Replying to {replyingTo.self ? 'your comment' : <Text style={styles.replyingHandle}>@{replyingTo.handle}</Text>}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Stop replying" hitSlop={10} onPress={stopReplying}>
                  <Ionicons name="close" size={16} color={colors.textMuted} />
                </Pressable>
              </View>
            ) : null}
            {/* Part of the box, just above the words: it moves only with the box, never on its own (Oct 25). */}
            {showRow ? quickRow : null}
            {photo ? (
              <View style={styles.attached}>
                <ExpoImage source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
                <Pressable accessibilityRole="button" accessibilityLabel="Remove the photo" onPress={() => setPhoto(null)} style={styles.attachedRemoveTarget}>
                  <View style={styles.attachedRemove}>
                    <Ionicons name="close" size={13} color="#fff" />
                  </View>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.inputRow}>
              <Avatar name={me?.name ?? 'You'} seed={me?.avatarSeed ?? currentUserId ?? 'me'} uri={me?.avatarUrl} size={34} style={styles.me} />
              <View style={{ flex: 1 }}>
                <Field inputRef={input} value={draft} onChangeText={v2 ? typed : changeDraft} placeholder={takenDown ? 'Comments are closed: this was taken down.' : replyingTo ? (replyingTo.self ? 'Add a reply…' : `Reply to @${replyingTo.handle}…`) : author && author.id !== currentUserId ? `Add a comment for ${author.name.split(' ')[0]}…` : 'Add a comment…'} multiline minHeight={44} onSubmitEditing={send} onFocus={onBoxFocus} onBlur={onBoxBlur} onSelectionChange={v2 ? (sel) => { selection.current = { start: sel.start, end: sel.end, text: latestDraft.current }; } : undefined} mentions compact maxLength={COMMENT_MAX} />
              </View>
              {crossFade ? (
                <View style={styles.action}>
                  {kind === 'post' ? (
                    <RNAnimated.View
                      pointerEvents={canSend ? 'none' : 'auto'}
                      aria-hidden={canSend || undefined}
                      accessibilityElementsHidden={canSend}
                      importantForAccessibility={canSend ? 'no-hide-descendants' : 'auto'}
                      style={[StyleSheet.absoluteFill, styles.center, swapLooks.photo]}
                    >
                      <Pressable accessibilityRole="button" accessibilityLabel="Add a photo" onPress={() => void addPhoto()} style={styles.target}>
                        {({ pressed }) => (
                          <View style={[styles.photoButton, pressed && styles.photoPressed]}>
                            <Ionicons name="image-outline" size={19} color={colors.textMuted} />
                          </View>
                        )}
                      </Pressable>
                    </RNAnimated.View>
                  ) : null}
                  <RNAnimated.View
                    pointerEvents={kind === 'post' && !canSend ? 'none' : 'auto'}
                    aria-hidden={(kind === 'post' && !canSend) || undefined}
                    accessibilityElementsHidden={kind === 'post' && !canSend}
                    importantForAccessibility={kind === 'post' && !canSend ? 'no-hide-descendants' : 'auto'}
                    style={[StyleSheet.absoluteFill, styles.center, kind === 'post' ? swapLooks.send : null]}
                  >
                    <Animated.View style={sendStyle}>
                      <Pressable accessibilityRole="button" accessibilityLabel="Post comment" disabled={!canSend} onPress={send} style={styles.target}>
                        <View style={[styles.send, !canSend && { opacity: 0.4 }]}>
                          <BrandWash />
                          <Ionicons name="arrow-up" size={19} color={colors.brandInk} />
                        </View>
                      </Pressable>
                    </Animated.View>
                  </RNAnimated.View>
                </View>
              ) : (
                // One button at a time, swapped with a quick zoom: drawn one over the other, a browser
                // let the hidden send arrow catch the tap meant for the photo button (Oct 5 audit).
                <LayoutAnimationConfig skipEntering>
                  <View style={styles.action}>
                    {kind === 'post' && !canSend ? (
                      <Animated.View key="photo" entering={ZoomIn.duration(160)} exiting={ZoomOut.duration(110)} style={[StyleSheet.absoluteFill, styles.center]}>
                        <Pressable accessibilityRole="button" accessibilityLabel="Add a photo" onPress={() => void addPhoto()} style={styles.target}>
                          {({ pressed }) => (
                            <View style={[styles.photoButton, pressed && styles.photoPressed]}>
                              <Ionicons name="image-outline" size={19} color={colors.textMuted} />
                            </View>
                          )}
                        </Pressable>
                      </Animated.View>
                    ) : (
                      <Animated.View key="send" entering={kind === 'post' ? ZoomIn.duration(160) : undefined} exiting={kind === 'post' ? ZoomOut.duration(110) : undefined} style={[StyleSheet.absoluteFill, styles.center]}>
                        <Animated.View style={sendStyle}>
                          <Pressable accessibilityRole="button" accessibilityLabel="Post comment" disabled={!canSend} onPress={send} style={styles.target}>
                            <View style={[styles.send, !canSend && { opacity: 0.4 }]}>
                              <BrandWash />
                              <Ionicons name="arrow-up" size={19} color={colors.brandInk} />
                            </View>
                          </Pressable>
                        </Animated.View>
                      </Animated.View>
                    )}
                  </View>
                </LayoutAnimationConfig>
              )}
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
/**
 * What you write while the sheet is open lands at the bottom, as in a
 * conversation (Oct 25, owner: "commenting puts it on the top not bottom"):
 * your comments made since it opened come after every other comment, your
 * replies last in their thread, in the order you sent them, whatever the
 * clocks say. A comment's time is its writer's phone's (it is saved with
 * it), so one written on a phone set ahead, or brought in with a time to
 * come, would otherwise sort below yours and leave your new one above it.
 * Next time the sheet opens, everything is in plain time order again.
 */
function sentLast(threads: Thread[], me: ID | null, since: number): Thread[] {
  if (!me) return threads;
  const mineNow = (c: Comment) => c.authorId === me && Date.parse(c.createdAt) > since;
  const last = <T,>(xs: T[], isLast: (x: T) => boolean): T[] => {
    const after = xs.filter(isLast);
    if (!after.length || after.length === xs.length) return xs;
    return [...xs.filter((x) => !isLast(x)), ...after];
  };
  return last(threads, (t) => mineNow(t.top)).map((t) => {
    const replies = last(t.replies, mineNow);
    return replies === t.replies ? t : { ...t, replies };
  });
}

/** Hands the page the sheet's keyboard word (it lives inside the sheet, under the page). */
function SheetKeyboardProbe({ into }: { into: React.MutableRefObject<SheetKeyboard | null> }) {
  into.current = useSheetKeyboard();
  return null;
}

function CommentList({ listRef, pull, tapsPutKeyboardAway = false, scrollYValue, contentContainerStyle, children }: {
  listRef: AnimatedRef<Animated.ScrollView>;
  pull: boolean;
  /**
   * With the keyboard up, the first tap anywhere on the comments only puts it
   * away (nothing is liked, no profile opens), as on Instagram (COMMENTS_V2
   * on a phone). Otherwise taps go straight through.
   */
  tapsPutKeyboardAway?: boolean;
  /** Where the list is scrolled, for the sheet's taps to read. */
  scrollYValue: SharedValue<number>;
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
      scrollYValue.value = e.contentOffset.y;
    },
  });
  const hideKeyboard = () => Keyboard.dismiss();
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
        const pullDown = listY.value <= 0 && dy > 6 && dx < 12;
        // The keyboard up and riding with the sheet (keyboardSync on an iPhone): the sheet never takes the pull.
        // At the very top, where the list cannot move, a pull down puts the keyboard away and the sheet comes
        // down with it (nothing would move until the finger reached the keyboard, past the box); scrolled
        // down, it is the list's own scroll, the keyboard following the finger once it gets there.
        if (drag.keyboardUp()) {
          if (pullDown) { runOnJS(hideKeyboard)(); manager.fail(); }
          else if (dy < -2 || listY.value > 0 || dx >= 12) manager.fail();
          return;
        }
        if (pullDown) manager.activate();
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
      keyboardShouldPersistTaps={tapsPutKeyboardAway ? 'never' : 'handled'}
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
  // A full 44-point target (a browser has no hitSlop), its × still on the page's right edge.
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -11, marginVertical: -8 },
  list: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.lg, paddingBottom: spacing.xl },
  empty: { ...typography.small, color: colors.textFaint, paddingVertical: spacing.lg, textAlign: 'center' },
  composer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 10, gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg },
  // A slim strip across the top of the box while replying, the × on the right: edge to edge, flush with the box's top.
  replying: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 36, marginHorizontal: -spacing.lg, marginTop: -spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 8, backgroundColor: colors.surfaceAlt },
  replyingText: { ...typography.small, color: colors.textMuted, flex: 1 },
  replyingHandle: { ...typography.smallStrong, color: colors.text },
  // Each emoji is a full-height target sharing the row's width; the row gives back the extra height around it.
  quick: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: -6 },
  quickItem: { flex: 1, maxWidth: 48, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  quickPressed: { backgroundColor: colors.surfaceAlt, transform: [{ scale: 1.15 }] },
  quickEmoji: { fontSize: 22 },
  // COMMENTS_V2 (Oct 25, v3: "smaller like instagrams"): a compact 40-point strip of 23-point glyphs, evenly
  // spaced across at most 340 points (a wide phone does not stretch it), tucked 4 points into the gap above the box.
  quickV2: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', height: QUICK_ROW_H, marginBottom: -4, width: '100%', maxWidth: 340, alignSelf: 'center' },
  quickSlot: { flexBasis: 38, flexShrink: 1, minWidth: 30, height: QUICK_ROW_H, alignItems: 'center', justifyContent: 'center' },
  quickSqueeze: { transform: [{ scale: 0.88 }] },
  quickGlyph: { fontSize: 23, lineHeight: 28 },
  attached: { width: 64, height: 80, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surfaceAlt, marginLeft: 34 + spacing.sm },
  // The × is small on the photo; what takes the tap is the whole top-right corner of it.
  attachedRemoveTarget: { position: 'absolute', top: 0, right: 0, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  attachedRemove: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  // Centred on the box while it is one line; it stays at the bottom as the box grows.
  me: { marginBottom: 5 },
  action: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  // The round button is 40 across; the whole 44-point square around it takes the tap.
  target: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  // The same two round buttons as the message box: a quiet one for the photo (like the mic there), the green one to send.
  photoButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  photoPressed: { backgroundColor: colors.surfaceAlt },
  send: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', ...brandShadow },
});

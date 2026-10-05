import { useThemedStyles } from '@/theme/ThemeProvider';
import { TipBubble } from '@/components/TipBubble';
import { learned, useTip } from '@/features/tips/tips';
import { Wash } from '@/components/Wash';
import { PlayerName } from '@/components/PlayerName';
import React, { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type AccessibilityActionEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@/lib/useIsFocused';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { Avatar, BrandWash, EmptyState } from '@/components/ui';
import { GROUP_CAP, GroupAvatar, eventText, groupName, isGroupChat, isMuted, leaveGroupMessage, othersIn } from '@/features/messages/groups';
import { HitGlyph } from '@/components/HitGlyph';
import { joinedCount } from '@/features/hits/audience';
import { hitWhen } from '@/features/hits/format';
import { goBack } from '@/lib/goBack';
import { VoiceNote } from '@/components/VoiceNote';
import { EmojiKeyboard } from '@/components/EmojiKeyboard';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { VOICE_LIMIT_MS, clock, useVoiceRecorder } from '@/features/voice/useVoiceRecorder';
import { openCourt } from '@/features/players/courtLink';
import { isOpenToHit } from '@/features/players/openToHit';
import { COURT_CARD_W, CourtCard } from '@/features/messages/CourtCard';
import { CourtMapSnapshots } from '@/components/map/CourtMapThumb';
import { PHOTO_W, PhotoStack, PhotoTray, PhotoViewer, type TileRect, type TrayPhoto } from '@/features/messages/ChatPhotoViews';
import { MAX_CHAT_PHOTOS, useChatPhotosReady, useSendProgress } from '@/features/messages/chatPhotos';
import { pickPhotos, takePhoto } from '@/components/MediaPicker';
import { Tappable, useDoubleTap } from '@/components/Tappable';
import { chatStamp, chatStampParts, chatTime } from '@/lib/format';
import { firstLink, isOnlyLink } from '@/lib/links';
import { LINK_CARD_W, LinkCard, linkCardShows } from '@/features/messages/LinkCard';
import { useLinkPreview } from '@/features/messages/linkPreview';
import { useDragDownDismiss, useKeyboardLift } from '@/features/messages/keyboardLift';
import { GroupInviteCard } from '@/features/groups/GroupInviteCard';
import { readGroupInvite } from '@/features/groups/inviteMessage';
import { Slide, TimeAnchor, TimeSwipeArea } from '@/features/messages/MessageTimes';
import { SwipeReply } from '@/features/messages/SwipeReply';
import { buildRows, keepRows, type Gap, type ThreadRow } from '@/features/messages/threadRows';
import {
  Arrive, EmojiReactSheet, Flash, MessageInfoSheet, NewMessagesButton, ReactionsSheet, ReplyBar, ReplyQuote, SeenFaces, type ArriveMode,
} from '@/features/messages/ChatBits';
import { RichText } from '@/components/RichText';
import { useApp } from '@/store/AppContext';
import { MESSAGE_PAGE } from '@/data/remote';
import { MentionSuggestions } from '@/components/MentionSuggestions';
import { useMentionCandidates } from '@/features/mentions/useMentionCandidates';
import { activeMention, applyMention } from '@/lib/mentions';
import { show as showToast } from '@/lib/toast';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { afterMenu, confirm, confirmAfterMenu } from '@/lib/confirm';
import * as haptics from '@/lib/haptics';
import type { HitRequest, ID, Message, Post, Question, User } from '@/data/types';
import Reanimated, { Easing, FadeIn, FadeInDown, FadeInUp, FadeOut, ZoomIn, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { colors, lift, pageIsDark, radius, spacing, typography, font, withAlpha } from '@/theme';

/** One line of words in the typing box, and how many it grows to before it scrolls inside. */
const INPUT_LINE = 21;
const INPUT_MAX_H = INPUT_LINE * 5;

/**
 * In a group, others' messages sit beside a small face (Instagram and
 * Messenger do this): the sender's picture by the last bubble of each run,
 * and an empty space of the same width by the rest, so the bubbles line up.
 */
const FACE = 28;

/**
 * Within this far of the newest message you are "at the bottom": a new
 * message is followed in (with a faint tick). Any further up, the round
 * "back down" button shows and counts what comes meanwhile. One number for
 * all three, so a message can never land out of sight with no sign of it.
 */
const NEAR_PX = 80;

/** Held this long, the mic records while held and sends on letting go; a quicker tap records until Send (or the bin). */
const HOLD_MS = 350;
/** Slid this far to the left while holding the mic: the recording is thrown away. */
const CANCEL_AT = 110;

type Styles = typeof styleDefinitions;

/**
 * What the rows and the message box call. Made once for the life of the
 * chat and pointed at the screen's latest code each time it draws, so a row
 * (drawn again only when something of its own changes) never holds an old one.
 */
interface Calls {
  openMenu: (target: MenuTarget) => void;
  startReply: (message: Message) => void;
  react: (messageId: ID, emoji?: string) => void;
  anyEmoji: (message: Message) => void;
  copy: (text: string) => void;
  retry: (messageId: ID) => void;
  openReactions: (message: Message) => void;
  jumpTo: (messageId: ID) => void;
  showFolded: (ids: ID[]) => void;
  openPhoto: (message: Message, index: number, rects: (TileRect | undefined)[]) => void;
  // The message box.
  send: (text: string) => void;
  sendVoice: (recording: { uri: string; ms: number }) => void;
  recording: (on: boolean) => void;
  typed: (text: string) => void;
  focused: (on: boolean) => void;
  toggleEmoji: () => void;
  plusToggled: () => void;
  camera: () => void;
  photos: () => void;
  court: () => void;
  escape: () => void;
}
const CALL_NAMES: (keyof Calls)[] = [
  'openMenu', 'startReply', 'react', 'anyEmoji', 'copy', 'retry', 'openReactions', 'jumpTo', 'showFolded', 'openPhoto',
  'send', 'sendVoice', 'recording', 'typed', 'focused', 'toggleEmoji', 'plusToggled', 'camera', 'photos', 'court', 'escape',
];

/** What every row shares: the chat's look and people, and the calls. Changes only when one of those does. */
interface RowCtx {
  styles: Styles;
  me: ID | null;
  group: boolean;
  defaultReaction: string;
  users: User[];
  posts: Post[];
  questions: Question[];
  hitRequests: HitRequest[];
  /** Where you are, for a court card's distance. */
  from: { lat: number; lng: number } | null;
  winW: number;
  faceOf: (uid: ID) => User | undefined;
  nameOf: (uid: ID) => string;
  arrivalOf: (m: Message) => ArriveMode;
  call: Calls;
}

const firstName = (u?: User) => u?.name.trim().split(/\s+/)[0] ?? 'Someone';

/**
 * One conversation: bubbles, shared-item cards and a message box.
 *
 * The messages are an upside-down list (the standard chat build): its start
 * is the newest message, at the bottom, so the chat opens already there
 * with nothing to scroll, the keyboard lifts the newest message with the
 * box by itself, older pages load at its far end (the top) without moving
 * anything, and only the rows on screen are drawn. Each row is drawn again
 * only when something of its own changes (Messages' and WhatsApp's way):
 * typing redraws only the box, and a new message only its own row and the
 * one it joins.
 */
export default function Thread() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const { conversations, messages, users, posts, questions, hitRequests, currentUserId, currentUser, detectedCoords, defaultReaction, actions, blockedIds, lastSeen } = useApp();
  // The message box keeps its own words, cursor and recording (Composer, below):
  // a key typed redraws the box alone, never the chat above it.
  const composer = useRef<ComposerHandle>(null);
  // Photos picked from the camera roll, waiting above the box for Send (the box becomes their caption).
  const [picked, setPicked] = useState<TrayPhoto[]>([]);
  // A photo opened full screen: which message, which of its photos, and where it sits in the chat.
  const [viewing, setViewing] = useState<{ message: Message; index: number; rects: (TileRect | undefined)[] } | null>(null);
  // The photo button only shows once the server can keep chat photos (migration 61).
  const photosOn = useChatPhotosReady();
  // Holding a message opens its menu over the chat; Edit puts its words back in the box.
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  // What was in the box when Edit filled it with a message's words: it comes back when the edit ends.
  const draftBeforeEdit = useRef<string | null>(null);
  // The message being answered: "Replying to …" over the box, and quoted above what is sent.
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  // The sheets a held message or a reaction chip opens.
  const [reactionsOf, setReactionsOf] = useState<Message | null>(null);
  const [infoOf, setInfoOf] = useState<Message | null>(null);
  const [anyEmojiFor, setAnyEmojiFor] = useState<Message | null>(null);
  // Going to the message a reply answers: it lights up.
  const [flash, setFlash] = useState<{ id: string; n: number } | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // A voice note recording in the box: the emoji keyboard steps aside.
  const [recording, setRecording] = useState(false);
  // The emoji keyboard takes the phone keyboard's place at the phone keyboard's
  // height, so switching between them leaves the typing bar where it was.
  const keyboardHeight = useRef(Platform.OS === 'web' ? 260 : 300);
  const listRef = useRef<FlatList<ThreadRow>>(null);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Keyboard.addListener('keyboardDidShow', (e) => {
      keyboardHeight.current = Math.max(220, e.endCoordinates.height - insets.bottom);
    });
    return () => sub.remove();
  }, [insets.bottom]);
  const [typingFocus, setTypingFocus] = useState(false);
  const focused = useIsFocused();
  // The room under the typing bar: a little above the home indicator with the
  // keyboard down, right on the keyboard with it up, riding on it frame by
  // frame on an iPhone. See keyboardLift.ts.
  const emojiRoom = emojiOpen ? keyboardHeight.current + insets.bottom : 0;
  const room = useKeyboardLift({ rest: Math.max(insets.bottom, 12) + 2, focused, typing: typingFocus, emojiRoom });
  // Dragging the messages down puts the keyboard away (on an iPhone, following the finger).
  const dragDown = useDragDownDismiss(
    () => { composer.current?.blur(); Keyboard.dismiss(); setEmojiOpen(false); },
    // On an iPhone the phone's own keyboard follows the finger by itself; the emoji keyboard is closed by the drag.
    () => setEmojiOpen(false),
  );

  const liveConversation = conversations.find((c) => c.id === id);
  // Someone took you out of this group (found out while it was open, or on
  // opening it): it stays readable as it last stood, with a note in place of
  // the box, the way Instagram and WhatsApp keep it, instead of vanishing.
  const removedFrom = !liveConversation && id ? actions.removedChat(id) : undefined;
  const removed = !!removedFrom;
  const conversation = liveConversation ?? removedFrom?.conversation;
  const other = users.find(
    (u) => u.id === conversation?.participantIds.find((p) => p !== currentUserId),
  );
  const group = !!conversation && isGroupChat(conversation);
  const people = useMemo(() => (conversation ? othersIn(conversation, users, currentUserId) : []), [conversation, users, currentUserId]);
  // Someone you blocked who is in this group with you. Instagram's way: you
  // both stay and can both still write; their messages fold away on your
  // side, and a line over the box says they are here.
  const blockedInGroup = group ? people.filter((u) => blockedIds.includes(u.id)) : [];
  // Folded messages you chose to see, by id, for as long as the chat is open.
  const [shownIds, setShownIds] = useState<string[]>([]);
  useEffect(() => { setShownIds([]); setPicked([]); setViewing(null); setReplyTo(null); setFlash(null); }, [id]);

  // Opening a chat fetches it fresh, so it never sits on an old copy waiting for the next refresh.
  useEffect(() => { if (id) void actions.syncConversation(id); }, [id, actions]);

  useEffect(() => {
    const mark = () => {
      if (focused && conversation && !removed && (typeof document === 'undefined' || document.visibilityState === 'visible')) actions.markConversationRead(conversation.id);
    };
    mark();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', mark);
      return () => document.removeEventListener('visibilitychange', mark);
    }
  }, [focused, conversation?.id, messages, currentUserId, actions, removed]);

  // A group you were taken out of shows the messages it had when you were.
  const pool = removedFrom ? removedFrom.messages : messages;
  // Every message by its id, once: the chat, and the messages its replies answer, are looked up here.
  const byId = useMemo(() => new Map(pool.map((m) => [m.id, m])), [pool]);
  // A chat you deleted from your inbox shows only what came after.
  const hiddenAt = conversation?.hiddenAt;
  const thread = useMemo(
    () => (conversation?.messageIds ?? [])
      .map((mid) => byId.get(mid))
      .filter((m): m is Message => !!m && (!hiddenAt || m.createdAt > hiddenAt)),
    [conversation?.messageIds, byId, hiddenAt],
  );

  // "Typing…": who else in this chat is typing right now. Heard straight from
  // their phone (nothing is stored). It holds steady for as long as they have
  // a message on the go (their phone keeps saying so every couple of
  // seconds), goes at once when they send, clear it or leave, and lapses 7
  // seconds after the last word of it if their phone goes quiet.
  const [typing, setTyping] = useState<Record<string, number>>({});
  const typingLink = useRef<{ ping: () => void; stop: () => void; off: () => void } | null>(null);
  useEffect(() => {
    if (!id || removed) return;
    setTyping({});
    const link = actions.watchTyping(id, (uid, stopped) => setTyping((t) => {
      if (!stopped) return { ...t, [uid]: Date.now() };
      if (!t[uid]) return t;
      const next = { ...t }; delete next[uid]; return next;
    }));
    typingLink.current = link;
    return () => { if (draftNow.current.trim()) link.stop(); link.off(); typingLink.current = null; };
  }, [id, actions, removed]);
  useEffect(() => {
    if (!Object.keys(typing).length) return;
    const t = setInterval(() => setTyping((cur) => {
      const now = Date.now();
      const next = Object.fromEntries(Object.entries(cur).filter(([, at]) => now - at < 7000));
      return Object.keys(next).length === Object.keys(cur).length ? cur : next;
    }), 1000);
    return () => clearInterval(t);
  }, [typing]);
  const lastMessage = thread[thread.length - 1];
  // Your newest message's photos still going up: its line says "Sending…", not "Sent".
  const lastReal = useMemo(() => [...thread].reverse().find((m) => m.kind !== 'system'), [thread]);
  const lastSending = useSendProgress(lastReal?.id ?? '') !== null;
  useEffect(() => {
    if (!lastMessage) return;
    setTyping((cur) => { if (!cur[lastMessage.senderId]) return cur; const next = { ...cur }; delete next[lastMessage.senderId]; return next; });
  }, [lastMessage?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const typers = Object.keys(typing).filter((uid) => uid !== currentUserId && !blockedIds.includes(uid));
  // While you type, the others hear it every couple of seconds, never on every key.
  const lastPing = useRef(0);
  // What is in your box now and when you last typed in it, for the steady "typing…" the others see.
  const draftNow = useRef('');
  const lastKey = useRef(0);
  // A court (or anything else) sent from elsewhere as the answer to the message being replied to: the strip has done its job.
  useEffect(() => {
    if (replyTo && lastReal?.senderId === currentUserId && lastReal.replyToId === replyTo.id) setReplyTo(null);
  }, [lastReal?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // A one-to-one chat with someone you are blocked with (either of you
  // blocked the other) can still be read, but not written in: the box gives
  // way to a note. A group stays open to both (the server agrees from
  // migration 54); before that, the server may still lock one, and the note
  // says so in a group's words.
  const [chatBlocked, setChatBlocked] = useState(false);
  const checkBlocked = actions.isChatBlocked;
  useEffect(() => {
    let on = true;
    if (conversation?.id && !removed) void checkBlocked(conversation.id).then((b) => { if (on) setChatBlocked(b); });
    return () => { on = false; };
  }, [conversation?.id, checkBlocked, blockedIds, removed]);
  const blockedHere = chatBlocked || (!group && !!other && blockedIds.includes(other.id));
  // Nothing can be written here (nor reacted with): the box gives way to a note.
  const canWrite = !removed && !blockedHere;

  // Reaching the top of the list loads the page of messages before the
  // oldest here, like Instagram. The list is upside down, so they go in at
  // its far end and nothing on screen moves. A small spinner shows at the top while it loads.
  const [olderLoading, setOlderLoading] = useState(false);
  const loadingOlder = useRef(false);
  const noMoreOlder = useRef(false);
  useEffect(() => { noMoreOlder.current = false; }, [id]);
  const loadOlder = useCallback(async () => {
    if (loadingOlder.current || noMoreOlder.current || !conversation || removed) return;
    loadingOlder.current = true;
    setOlderLoading(true);
    // The end only when the server says so: a page can come short because of messages you deleted for yourself.
    const { more } = await actions.loadOlderMessages(conversation.id);
    if (more === false) noMoreOlder.current = true;
    loadingOlder.current = false;
    setOlderLoading(false);
  }, [conversation, removed, actions]);

  // In a group, whose read position is shown as faces: the others who let read receipts show (never someone you blocked).
  const readers = useMemo(() => (group ? people.filter((u) => u.readReceiptsEnabled !== false && !blockedIds.includes(u.id)) : []), [group, people, blockedIds]);
  // The rows, each kept as the same object while nothing about it changes, so its row is not drawn again.
  const rowCache = useRef(new Map<string, ThreadRow>());
  const rows = useMemo(
    () => keepRows(rowCache.current, buildRows(thread, { me: currentUserId, group, blockedIds, shownIds, readers })),
    [thread, currentUserId, group, blockedIds, shownIds, readers],
  );
  // The list is upside down: its first row is the newest message.
  const data = useMemo(() => [...rows].reverse(), [rows]);
  const dataRef = useRef(data);
  dataRef.current = data;

  // Scrolled up to read: the "back down" button, and how many came meanwhile.
  const [away, setAway] = useState(false);
  const awayRef = useRef(false);
  // Resting at the newest message (within NEAR_PX of it): a new one is followed in, with a faint tick.
  const atBottom = useRef(true);
  const [unseen, setUnseen] = useState(0);
  const toNewest = useCallback((animated = true) => {
    listRef.current?.scrollToOffset({ offset: 0, animated });
    setUnseen(0);
  }, []);

  /*
   * Which messages arrived while the chat was open, and so come in moving
   * (yours rising out of the box, theirs fading up); everything there when it
   * opened, and older pages, simply appear. Noticed as the list draws, and
   * written down just after, so a row drawn again never moves twice.
   */
  const known = useRef<Set<string> | null>(null);
  const arrivedAt = useRef(new Map<string, number>());
  const arrivalOf = useCallback((m: Message): ArriveMode => {
    const at = arrivedAt.current.get(m.id);
    const fresh = at !== undefined ? Date.now() - at < 900 : !!known.current && !known.current.has(m.id) && Date.now() - Date.parse(m.createdAt) < 60_000;
    return !fresh ? 'none' : m.senderId === currentUserId ? 'sent' : 'received';
  }, [currentUserId]);
  useEffect(() => {
    const first = !known.current;
    const seen = known.current ?? new Set<string>();
    const came: Message[] = [];
    for (const m of thread) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      if (!first && Date.now() - Date.parse(m.createdAt) < 60_000) { came.push(m); arrivedAt.current.set(m.id, Date.now()); }
    }
    known.current = seen;
    if (!came.length) return;
    const theirs = came.filter((m) => m.senderId !== currentUserId && m.kind !== 'system');
    if (theirs.length) {
      // Reading further up: counted on the "back down" button. At the bottom: the faintest tick as it lands.
      if (atBottom.current) haptics.untap();
      else setUnseen((n) => n + theirs.length);
    }
    // A browser has no "keep my place" for the list: at the bottom, it stays at the very bottom as one lands.
    if (Platform.OS === 'web' && atBottom.current) requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }));
  }, [thread, currentUserId]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    atBottom.current = y < NEAR_PX;
    const isAway = !atBottom.current;
    if (isAway !== awayRef.current) {
      awayRef.current = isAway;
      setAway(isAway);
    }
    if (atBottom.current) setUnseen((n) => (n ? 0 : n));
    dragDown.onScrollY(y);
  };

  // A reply's original from further back than this chat has loaded: fetched, so its quote can show.
  const askedFor = useRef(new Set<string>());
  useEffect(() => {
    for (const m of thread) {
      const want = m.replyToId;
      if (!want || byId.has(want) || askedFor.current.has(want)) continue;
      askedFor.current.add(want);
      void actions.loadMessage(want);
    }
  }, [thread, byId, actions]);

  /** Goes to the message a reply answers (loading older pages for it if need be) and lights it up. */
  const jumpTo = async (messageId: string) => {
    const find = () => dataRef.current.findIndex((r) => r.message.id === messageId || !!r.folded?.includes(messageId));
    let index = find();
    for (let tries = 0; index < 0 && tries < 6 && !noMoreOlder.current; tries += 1) {
      await loadOlder();
      await new Promise((r) => setTimeout(r, 80));
      index = find();
    }
    if (index < 0) { showToast({ title: 'That message is no longer here', icon: 'chatbubble-outline' }); return; }
    listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    setFlash({ id: messageId, n: Date.now() });
  };

  // In a group, its own people come first in "@" suggestions: they are who you are talking to.
  const memberKey = conversation?.participantIds.join(',') ?? '';
  const memberIds = useMemo(() => (memberKey ? memberKey.split(',').filter((p) => p !== currentUserId) : []), [memberKey, currentUserId]);

  const faceOf = useCallback((uid: ID) => users.find((u) => u.id === uid), [users]);
  const nameOf = useCallback((uid: ID) => (uid === currentUserId ? 'You' : firstName(faceOf(uid))), [currentUserId, faceOf]);

  // The read line under your newest message (event lines aside), small and at
  // its right edge, like iMessage's "Delivered" and "Read": "Sending…" until
  // the server has it, then "Seen" or "Sent" in a one-to-one chat (Seen only
  // when they let read receipts show). In a group, faces show who has read
  // up to where; "Sent" until anyone has.
  const readLine = !typers.length && lastReal && lastReal.senderId === currentUserId && !lastReal.failed
    ? lastSending || lastReal.sending ? 'Sending…' : group
      ? (rows.some((r) => r.seenBy?.length && r.message.id === lastReal.id) ? null : 'Sent')
      : other && other.readReceiptsEnabled !== false && lastReal.readAtBy?.[other.id] ? 'Seen' : 'Sent'
    : null;

  // The calls the rows and the box make, made once (see Calls).
  const live = useRef<Calls | null>(null);
  const calls = useMemo(() => Object.fromEntries(CALL_NAMES.map((name) => [
    name, (...args: unknown[]) => (live.current?.[name] as ((...a: unknown[]) => void) | undefined)?.(...args),
  ])) as unknown as Calls, []);

  // Where you are, for court cards' distances: the same object while you have not moved.
  const fromRaw = detectedCoords ?? currentUser?.cityAt ?? null;
  const fromKey = fromRaw ? `${fromRaw.lat},${fromRaw.lng}` : '';
  const from = useMemo(() => fromRaw, [fromKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const rowCtx = useMemo<RowCtx>(() => ({
    styles, me: currentUserId, group, defaultReaction, users, posts, questions, hitRequests, from, winW, faceOf, nameOf, arrivalOf, call: calls,
  }), [styles, currentUserId, group, defaultReaction, users, posts, questions, hitRequests, from, winW, faceOf, nameOf, arrivalOf, calls]);

  // One row of the list. What changes for only some rows goes in as small
  // values of their own (held, lit up, the read line), so only those rows draw again.
  const menuId = menu?.message.id;
  const typingNow = typers.length > 0;
  const lastRealId = lastReal?.id;
  const renderRow = useCallback(({ item }: { item: ThreadRow }) => {
    const m = item.message;
    const got = m.replyToId ? byId.get(m.replyToId) : undefined;
    const original = got && (!hiddenAt || got.createdAt > hiddenAt) ? got : undefined;
    return (
      <MessageRow
        item={item}
        ctx={rowCtx}
        original={original}
        // Answering someone you blocked, whose words are folded away here: the quote keeps them hidden too.
        originalBlocked={!!original && group && original.senderId !== currentUserId && blockedIds.includes(original.senderId) && !shownIds.includes(original.id)}
        held={menuId === m.id}
        flashKey={flash?.id === m.id ? flash.n : undefined}
        readLine={m.id === lastRealId ? readLine : null}
        seenHidden={!!item.seenBy?.length && typingNow}
        canWrite={canWrite}
      />
    );
  }, [rowCtx, byId, hiddenAt, group, currentUserId, blockedIds, shownIds, menuId, flash, lastRealId, readLine, typingNow, canWrite]);

  // A group opens even with nobody else left in it (or nobody else loaded yet).
  if (!conversation || (!group && !other)) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Wash height={320} strength={0.7} />
        {/* A way back, even from a chat that is gone. */}
        <View style={styles.header}>
          <Pressable onPress={() => goBack('/messages')} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
        </View>
        <EmptyState title="Conversation not found" body="It may have been removed." />
      </View>
    );
  }
  const title = group ? groupName(conversation, users, currentUserId) : other?.name ?? '';
  const muted = isMuted(conversation);
  const members = conversation.participantIds.length;
  // The group's page, or a one-to-one chat's details (mute, block, report).
  const openDetails = () => router.push({ pathname: '/messages/group', params: { id: conversation.id } });
  // The add-people page for a group (Add, then back here).
  const openAddPeople = () => router.push({ pathname: '/messages/group', params: { id: conversation.id, add: '1' } });
  // Holding a message opens its menu; a group you were taken out of offers none.
  // A court card of yours on its way has nothing to offer until it lands (see onItsWay).
  const openMenu = (target: MenuTarget) => { if (!removed && !(target.message.kind === 'court' && onItsWay(target))) setMenu(target); };
  const leaveGroup = () => confirm({
    title: 'Leave this group?',
    message: leaveGroupMessage(conversation, hitRequests, currentUserId),
    confirmLabel: 'Leave',
    destructive: true,
    onConfirm: () => { actions.leaveGroup(conversation.id); router.dismissTo('/messages'); },
  });
  // Under the name in the header, something worth knowing: who is typing; in
  // a one-to-one chat, the court they are at, or that they are up to hit
  // today; else their handle. A group shows how many are in it.
  const typingLine = typers.length ? (group ? `${firstName(faceOf(typers[0]))} is typing…` : 'typing…') : null;
  const seenThere = other ? lastSeen[other.id] : undefined;
  const atCourt = !group && seenThere?.place === 'court' && seenThere.courtName && (!seenThere.seenAt || Date.now() - Date.parse(seenThere.seenAt) < 3 * 3_600_000) ? seenThere.courtName : null;
  const upToHit = !group && !!other && (isOpenToHit(other) || (!!seenThere?.openUntil && Date.parse(seenThere.openUntil) > Date.now()));
  const statusLine = typingLine
    ?? (group ? (removed ? null : members === 1 ? 'Just you' : `${members} members`)
      : atCourt ? `At ${atCourt}` : upToHit ? 'Up to hit today' : other ? `@${other.handle}` : null);
  const statusLive = !typingLine && (!!atCourt || upToHit);
  // Every message of the chat is here (nothing older left to load): its start, with who it is with, can show above the first.
  const wholeHistory = noMoreOlder.current || thread.length < MESSAGE_PAGE;
  // The emoji button swaps the phone keyboard for the emoji one and back.
  const toggleEmoji = () => {
    composer.current?.closePlus();
    if (emojiOpen) { room.holdUntilKeyboard(emojiRoom); setEmojiOpen(false); composer.current?.focus(); return; }
    Keyboard.dismiss();
    setEmojiOpen(true);
  };

  /*
   * The court, photo and camera buttons. Each lets go of the box first, so
   * the keyboard goes down behind the sheet or picker as it rises, and stays
   * down when it closes. (Left focused, the phone put the keyboard back on
   * the way out, and the whole bar dropped and rose again.) The emoji
   * keyboard, being part of the page, simply stays open underneath: taking
   * it away would drop the bar in one jump.
   */
  const letGo = () => { composer.current?.blur(); Keyboard.dismiss(); };
  const openCourtPicker = () => {
    composer.current?.closePlus();
    // Picked while answering a message: the court goes as the answer.
    const go = () => router.push({ pathname: '/pick-court', params: { conversation: conversation.id, ...(replyTo && canWrite ? { reply: replyTo.id } : null) } });
    if (Platform.OS === 'ios' && Keyboard.isVisible()) {
      // The sheet opens the moment the keyboard starts down, the bar riding
      // down on it (keyboardLift.ts; once the sheet is in front, the bar only
      // ever goes down, so the sheet's own keyboard never lifts it). Opened
      // any sooner, the bar fell in one jump behind the sheet.
      let done = false;
      const run = () => { if (done) return; done = true; sub.remove(); clearTimeout(timer); go(); };
      const sub = Keyboard.addListener('keyboardWillHide', run);
      const timer = setTimeout(run, 400);
      letGo();
      return;
    }
    letGo();
    go();
  };
  const choosePhotos = () => {
    composer.current?.closePlus();
    const left = MAX_CHAT_PHOTOS - picked.length;
    if (left <= 0) { showToast({ title: `Up to ${MAX_CHAT_PHOTOS} photos at a time`, icon: 'images-outline' }); return; }
    letGo();
    // Straight from the tap: a browser only opens its file box from one.
    pickPhotos(left)
      .then((got) => { if (got?.length) setPicked((now) => [...now, ...got].slice(0, MAX_CHAT_PHOTOS)); })
      .catch((e: unknown) => showToast({ title: 'Couldn’t open your photos', body: e instanceof Error ? e.message : undefined, icon: 'alert-circle-outline' }));
  };
  // The camera button (Instagram's, at the start of the box): one photo, straight into the tray to send.
  const openCamera = () => {
    composer.current?.closePlus();
    if (picked.length >= MAX_CHAT_PHOTOS) { showToast({ title: `Up to ${MAX_CHAT_PHOTOS} photos at a time`, icon: 'images-outline' }); return; }
    letGo();
    takePhoto()
      .then((got) => {
        if (got === 'denied') showToast({ title: 'Camera is off for CourtSide', body: 'Turn it on in your phone’s Settings to take photos here.', icon: 'camera-outline' });
        else if (got) setPicked((now) => [...now, got].slice(0, MAX_CHAT_PHOTOS));
      })
      .catch((e: unknown) => showToast({ title: 'Couldn’t open the camera', body: e instanceof Error ? e.message : undefined, icon: 'alert-circle-outline' }));
  };

  // Editing a message of yours: its words go in the box, and whatever you were writing waits for the edit to end.
  const startEditing = (message: Message) => {
    setReplyTo(null);
    if (!editing) draftBeforeEdit.current = composer.current?.getText() ?? '';
    setEditing(message);
    composer.current?.setText(message.body);
    setTimeout(() => composer.current?.focus(), 60);
  };
  // The edit saved, called off, or given up for a reply: what you were writing comes back.
  const endEditing = () => {
    setEditing(null);
    composer.current?.setText(draftBeforeEdit.current ?? '');
    draftBeforeEdit.current = null;
  };

  const send = (text: string) => {
    if (draftNow.current.trim()) { draftNow.current = ''; lastPing.current = 0; typingLink.current?.stop(); }
    const body = text.trim();
    const answering = replyTo?.id;
    // Picked photos go with whatever is in the box as their caption.
    if (picked.length && !editing) {
      actions.sendPhotos(conversation.id, picked, body, answering);
      setPicked([]);
      composer.current?.setText('');
      setReplyTo(null);
      toNewest(awayRef.current);
      return;
    }
    if (!body) return;
    if (editing) {
      actions.editMessage(editing.id, body);
      endEditing();
      return;
    }
    actions.sendMessage(conversation.id, body, answering);
    composer.current?.setText('');
    setReplyTo(null);
    // Stay in the box so the next message can be typed straight away.
    composer.current?.focus();
    // Your own message always shows: from further up, the list glides down to it.
    toNewest(awayRef.current);
  };
  // A new chat's first hello, one tap from the empty chat (Instagram's wave).
  const sayHi = () => actions.sendMessage(conversation.id, 'Hi 👋');
  // Answering a message: the strip over the box, and the keyboard up to type.
  // Not one still on its way (or not sent): the server would drop the quote.
  const startReply = (message: Message) => {
    if (!canWrite || message.kind === 'system' || message.sending || message.failed) return;
    if (editing) endEditing();
    setReplyTo(message);
    if (!emojiOpen) setTimeout(() => composer.current?.focus(), 40);
  };
  // Reacting: never where nothing can be written, nor to a message the server does not have yet.
  const react = (messageId: ID, emoji?: string) => {
    if (!canWrite) return;
    const m = byId.get(messageId);
    if (!m || m.sending || m.failed) return;
    actions.reactToMessage(messageId, emoji);
  };
  const sendVoiceNote = (got: { uri: string; ms: number }) => {
    actions.sendVoice(conversation.id, got, replyTo?.id);
    setReplyTo(null);
    toNewest(awayRef.current);
  };
  // While you type, the others hear it every couple of seconds, never on every key.
  const pingTyping = (text: string) => {
    const had = draftNow.current.trim();
    draftNow.current = text;
    if (!text.trim()) { if (had) { lastPing.current = 0; typingLink.current?.stop(); } return; }
    const now = Date.now();
    lastKey.current = now;
    if (now - lastPing.current > 2000) { lastPing.current = now; typingLink.current?.ping(); }
  };
  // While a message is on the go, keep saying so, even with the keyboard put
  // away, so the dots hold steady instead of blinking off in a pause. A
  // message left sitting stops counting a minute after the last key.
  useEffect(() => {
    const beat = setInterval(() => {
      const now = Date.now();
      if (draftNow.current.trim() && now - lastKey.current < 60_000 && now - lastPing.current > 2500) { lastPing.current = now; typingLink.current?.ping(); }
    }, 1000);
    return () => clearInterval(beat);
  }, []);
  // Tapping into the words brings the phone keyboard back in the emoji keyboard's place.
  const boxFocused = (on: boolean) => {
    setTypingFocus(on);
    if (on && emojiOpen && !desktopWeb) { room.holdUntilKeyboard(emojiRoom); setEmojiOpen(false); }
  };
  live.current = {
    openMenu,
    startReply,
    react,
    anyEmoji: (m) => setAnyEmojiFor(m),
    copy: (text) => { void Clipboard.setStringAsync(text); haptics.tap(); showToast({ title: 'Copied', icon: 'copy-outline' }); },
    retry: (messageId) => actions.retryMessage(messageId),
    openReactions: (m) => setReactionsOf(m),
    jumpTo: (messageId) => { void jumpTo(messageId); },
    showFolded: (ids) => setShownIds((s) => [...s, ...ids]),
    openPhoto: (m, index, rects) => { Keyboard.dismiss(); setViewing({ message: m, index, rects }); },
    send,
    sendVoice: sendVoiceNote,
    recording: setRecording,
    typed: pingTyping,
    focused: boxFocused,
    toggleEmoji,
    plusToggled: () => { if (emojiOpen) setEmojiOpen(false); },
    camera: openCamera,
    photos: choosePhotos,
    court: openCourtPicker,
    escape: () => { if (editing) endEditing(); else if (replyTo) setReplyTo(null); },
  };

  // Who could have read a message, with when, for its Info sheet; who keeps read receipts off, as that.
  const readersOf = (m: Message) => (group ? people : other ? [other] : [])
    .filter((u) => u.id !== m.senderId && !blockedIds.includes(u.id))
    .map((u) => ({ user: u, at: u.readReceiptsEnabled !== false ? m.readAtBy?.[u.id] : undefined, off: u.readReceiptsEnabled === false }));

  const listHeader = (
    // The list is upside down: its header is the bottom of the chat. Someone typing shows there, under the newest message.
    <View style={styles.listBottom}>
      {typers.length ? (
        <TypingBubble
          styles={styles}
          label={group ? `${typers.map((uid) => firstName(faceOf(uid))).join(', ')} ${typers.length === 1 ? 'is' : 'are'} typing` : undefined}
          // In a group, the first typer's face sits in the same place as a sender's.
          leading={group ? (() => {
            const u = faceOf(typers[0]);
            return u ? <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={FACE} /> : <View style={styles.faceSpace} />;
          })() : undefined}
        />
      ) : null}
    </View>
  );
  const listFooter = (
    // ...and its footer the top: a spinner while older messages load, and, once every message is here, who the chat is with.
    <View style={styles.listTop}>
      {olderLoading ? <View style={styles.olderSpinner}><ActivityIndicator size="small" color={colors.textMuted} /></View> : null}
      {wholeHistory && !olderLoading ? (
        <View style={styles.intro}>
          {group || !other
            ? <GroupAvatar people={people} size={72} photoUrl={conversation.photoUrl} name={title} />
            : <Avatar name={other.name} seed={other.avatarSeed} uri={other.avatarUrl} size={72} />}
          <Text style={styles.helloName} numberOfLines={2}>{title}</Text>
          <Text style={styles.helloLine} numberOfLines={1}>
            {group || !other ? (members === 1 ? 'Just you so far' : `${members} members`) : `@${other.handle}`}
          </Text>
          {!group && other ? (
            <Pressable accessibilityRole="link" onPress={() => router.push(`/user/${other.id}`)} hitSlop={8} style={({ pressed }) => [styles.helloProfile, pressed && styles.pressedDim]}>
              <Text style={styles.helloProfileText}>View profile</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const menuMessage = menu?.message;
  // Not on the server yet (on its way, or not sent): its menu offers only what cannot go wrong.
  const menuPending = !!(menuMessage?.sending || menuMessage?.failed);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* First, so everything else covers it: where the court cards' little maps are drawn. */}
      <CourtMapSnapshots />
      <Wash height={340} strength={0.75} />
      <View style={styles.header}>
        {/* Back to the inbox even when this chat was the first page opened (a link, a reload). */}
        <Pressable onPress={() => goBack('/messages')} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} style={({ pressed }) => [styles.back, pressed && styles.pressedDim]}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        {group || !other ? (
          // A group: its photo (or faces), its name and how many are in it; tapping opens its page.
          <Pressable style={({ pressed }) => [styles.headerUser, pressed && !removed && styles.pressedDim]} accessibilityRole={removed ? undefined : 'button'} accessibilityLabel={removed ? title : `${title}, ${members} members. Group details`} disabled={removed} onPress={openDetails}>
            <GroupAvatar people={people} size={32} photoUrl={conversation.photoUrl} name={title} />
            <View style={styles.headerWords}>
              <View style={styles.headerNameRow}>
                <Text style={[styles.headerName, styles.headerNameShrink]} numberOfLines={1}>{title}</Text>
                {muted ? <Ionicons name="notifications-off-outline" size={13} color={colors.textFaint} accessibilityLabel="Muted" /> : null}
              </View>
              {/* Taken out of it: the count is no longer yours to see (the note at the bottom says why). */}
              {statusLine ? <Text style={[styles.headerStatus, typingLine ? styles.headerTyping : null]} numberOfLines={1} accessibilityLiveRegion="polite">{statusLine}</Text> : null}
            </View>
          </Pressable>
        ) : (
          <Pressable style={({ pressed }) => [styles.headerUser, pressed && styles.pressedDim]} accessibilityRole="link" accessibilityLabel={`${other.name}'s profile`} onPress={() => router.push(`/user/${other.id}`)}>
            <Avatar name={other.name} seed={other.avatarSeed} uri={other.avatarUrl} size={32} />
            <View style={styles.headerWords}>
              <View style={styles.headerNameRow}>
                <PlayerName userId={other.id} style={[styles.headerName, styles.headerNameShrink]} numberOfLines={1}>{other.name}</PlayerName>
                {muted ? <Ionicons name="notifications-off-outline" size={13} color={colors.textFaint} accessibilityLabel="Muted" /> : null}
              </View>
              {statusLine ? (
                <View style={styles.headerStatusRow}>
                  {statusLive ? <View style={styles.liveDot} /> : null}
                  <Text style={[styles.headerStatus, typingLine ? styles.headerTyping : statusLive ? styles.headerLive : null]} numberOfLines={1} accessibilityLiveRegion="polite">{statusLine}</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        )}
        {/* Adding people, one tap from the chat itself (anyone in a group can), beside its details.
            Not on a full group: there would be nobody it could add. */}
        {group && !removed && members < GROUP_CAP ? (
          <Pressable onPress={openAddPeople} accessibilityRole="button" accessibilityLabel="Add people" hitSlop={10} style={({ pressed }) => [styles.headerIcon, pressed && styles.pressedDim]}>
            <Ionicons name="person-add-outline" size={21} color={colors.text} />
          </Pressable>
        ) : null}
        {!removed ? (
          <Pressable onPress={openDetails} accessibilityRole="button" accessibilityLabel={group ? 'Group details' : 'Chat details'} hitSlop={10} style={({ pressed }) => [styles.headerIcon, pressed && styles.pressedDim]}>
            <Ionicons name="information-circle-outline" size={24} color={colors.text} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.listArea}>
        {!thread.length && !olderLoading ? (
          // A new chat with nobody's words in it yet: who it is with, and a first hello one tap away (Instagram's wave).
          <Reanimated.View entering={FadeIn.duration(280)} style={styles.hello}>
            {group || !other
              ? <GroupAvatar people={people} size={84} photoUrl={conversation.photoUrl} name={title} />
              : <Avatar name={other.name} seed={other.avatarSeed} uri={other.avatarUrl} size={84} />}
            <Text style={styles.helloName} numberOfLines={2}>{title}</Text>
            <Text style={styles.helloLine} numberOfLines={1}>
              {group || !other ? (members === 1 ? 'Just you so far' : `${members} members`) : `@${other.handle}`}
            </Text>
            {!group && other ? (
              <Pressable accessibilityRole="link" onPress={() => router.push(`/user/${other.id}`)} hitSlop={8} style={({ pressed }) => [styles.helloProfile, pressed && styles.pressedDim]}>
                <Text style={styles.helloProfileText}>View profile</Text>
              </Pressable>
            ) : null}
            {canWrite ? (
              <View style={styles.helloActions}>
                <Tappable accessibilityLabel="Say hi" onPress={sayHi} scaleTo={0.95} style={styles.helloChip}>
                  <Text style={styles.helloWave}>👋</Text>
                  <Text style={styles.helloChipText}>Say hi</Text>
                </Tappable>
                <Tappable accessibilityLabel="Send a court" onPress={openCourtPicker} scaleTo={0.95} style={styles.helloChip}>
                  <Ionicons name="location-outline" size={16} color={colors.text} />
                  <Text style={styles.helloChipText}>Send a court</Text>
                </Tappable>
                {group && !removed && members < GROUP_CAP ? (
                  <Tappable accessibilityLabel="Add people" onPress={openAddPeople} scaleTo={0.95} style={styles.helloChip}>
                    <Ionicons name="person-add-outline" size={15} color={colors.text} />
                    <Text style={styles.helloChipText}>Add people</Text>
                  </Tappable>
                ) : null}
              </View>
            ) : null}
          </Reanimated.View>
        ) : (
          // Swiping the messages to the left shows when each was sent (iMessage's way); see MessageTimes.
          // Not while a message's menu or a photo is open over the chat.
          <TimeSwipeArea enabled={!menu && !viewing}>
            <FlatList
              ref={listRef}
              inverted
              data={data}
              keyExtractor={(row) => row.key}
              // Each row draws again only when something of its own changes (see renderRow).
              renderItem={renderRow}
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              ListHeaderComponent={listHeader}
              ListFooterComponent={listFooter}
              onEndReached={() => { void loadOlder(); }}
              onEndReachedThreshold={0.6}
              // A new message while you read further up leaves you where you were (the button counts it);
              // at the bottom, the list follows it in.
              maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: NEAR_PX }}
              initialNumToRender={16}
              maxToRenderPerBatch={12}
              windowSize={13}
              onScroll={onScroll}
              scrollEventThrottle={32}
              onScrollToIndexFailed={({ index, averageItemLength }) => {
                listRef.current?.scrollToOffset({ offset: Math.max(0, averageItemLength * index - 200), animated: false });
                setTimeout(() => listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true }), 90);
              }}
              keyboardShouldPersistTaps="handled"
              {...dragDown.props}
            />
          </TimeSwipeArea>
        )}
        <NewMessagesButton visible={(away || unseen > 0) && !menu} count={unseen} onPress={() => toNewest(true)} />
      </View>

      {menu && menuMessage ? (
        <MessageMenu
          target={menu}
          me={currentUserId}
          styles={styles}
          canReply={canWrite}
          canReact={canWrite && !menuPending}
          pending={menuPending}
          canDelete={!onItsWay(menu)}
          onClose={() => setMenu(null)}
          onReact={(emoji) => react(menuMessage.id, emoji)}
          onMoreEmoji={() => { const m = menuMessage; afterMenu(() => setAnyEmojiFor(m)); }}
          onReply={() => startReply(menuMessage)}
          onInfo={() => { const m = menuMessage; afterMenu(() => setInfoOf(m)); }}
          onCopy={() => { void Clipboard.setStringAsync(menuMessage.body); haptics.tap(); showToast({ title: 'Copied', icon: 'copy-outline' }); }}
          onCopyLink={(url) => { void Clipboard.setStringAsync(url); haptics.tap(); showToast({ title: 'Link copied', icon: 'link-outline' }); }}
          onEdit={() => startEditing(menuMessage)}
          // Both ask first; the card comes over the closing menu.
          onUnsend={() => { const messageId = menuMessage.id; confirmAfterMenu({ title: 'Unsend message?', message: "It's removed for everyone in the chat.", confirmLabel: 'Unsend', destructive: true, onConfirm: () => actions.unsendMessage(messageId) }); }}
          onDelete={() => { const messageId = menuMessage.id; confirmAfterMenu({ title: 'Delete message?', message: menuPending ? 'It hasn’t been sent, so it’s simply removed.' : menu.mine ? "It's removed for you. Others in the chat still see it." : "It's removed for you only.", confirmLabel: 'Delete', destructive: true, onConfirm: () => actions.deleteMessageForMe(messageId) }); }}
          // The Send-to sheet, once the menu has gone: pick chats (groups too) and it goes to each as it is.
          onForward={() => { const messageId = menuMessage.id; afterMenu(() => router.push({ pathname: '/share', params: { kind: 'message', id: messageId } })); }}
          doubleTap={defaultReaction}
          onDoubleTap={(emoji) => { actions.setDefaultReaction(emoji); showToast({ title: `Double tap now leaves ${emoji}`, icon: 'heart-outline' }); }}
        />
      ) : null}

      <ReactionsSheet
        message={reactionsOf ? byId.get(reactionsOf.id) ?? null : null}
        users={users}
        me={currentUserId}
        onRemove={(emoji) => { if (reactionsOf) actions.reactToMessage(reactionsOf.id, emoji); }}
        onClose={() => setReactionsOf(null)}
      />
      <EmojiReactSheet visible={!!anyEmojiFor} onPick={(emoji) => { if (anyEmojiFor) react(anyEmojiFor.id, emoji); }} onClose={() => setAnyEmojiFor(null)} />
      <MessageInfoSheet
        message={infoOf ? byId.get(infoOf.id) ?? null : null}
        readers={infoOf ? readersOf(infoOf) : []}
        sender={infoOf ? faceOf(infoOf.senderId) : undefined}
        mine={infoOf?.senderId === currentUserId}
        onClose={() => setInfoOf(null)}
      />

      {viewing ? (
        <PhotoViewer
          photos={viewing.message.photos ?? []}
          start={viewing.index}
          homes={viewing.rects}
          caption={viewing.message.body || undefined}
          who={`${viewing.message.senderId === currentUserId ? 'You' : firstName(faceOf(viewing.message.senderId))} · ${chatStamp(viewing.message.createdAt)}`}
          onClose={() => setViewing(null)}
        />
      ) : null}

      {/* The bar and what sits on it. The messages soften away behind it rather than ending at a hard line. */}
      <View style={styles.dock}>
        <LinearGradient pointerEvents="none" colors={[withAlpha(colors.bg, 0), colors.bg]} style={styles.dockFade} />
        {editing ? (
          <View style={styles.editBar}>
            <Ionicons name="create-outline" size={16} color={colors.brand} />
            <Text style={styles.editLabel} numberOfLines={1}>Editing message</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Stop editing" hitSlop={10} onPress={endEditing}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : null}
        {replyTo && !editing && canWrite ? (
          <ReplyBar to={replyTo} who={replyTo.senderId === currentUserId ? 'yourself' : nameOf(replyTo.senderId)} onClose={() => setReplyTo(null)} />
        ) : null}
        {blockedInGroup.length && !blockedHere && !removed ? (
          // Someone you blocked is in this group: you both stay, their messages fold away, and leaving is one tap.
          <View style={styles.blockedBanner}>
            <Ionicons name="ban-outline" size={15} color={colors.textMuted} />
            <Text style={styles.blockedBannerText} numberOfLines={2}>
              You blocked {listNames(blockedInGroup.map((u) => firstName(u)))}. They’re still in this group.
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Leave this group" hitSlop={8} onPress={leaveGroup}>
              <Text style={styles.blockedBannerLink}>Leave</Text>
            </Pressable>
          </View>
        ) : null}
        {removed ? (
          // Taken out of this group: what was said stays readable, and nothing more can be sent.
          <View style={styles.blockedNote}>
            <Ionicons name="people-outline" size={15} color={colors.textMuted} />
            <Text style={styles.blockedNoteText}>You’re no longer in this group</Text>
          </View>
        ) : blockedHere ? (
          <View style={styles.blockedNote}>
            <Ionicons name="lock-closed-outline" size={15} color={colors.textMuted} />
            <Text style={styles.blockedNoteText}>{group ? 'You can’t send messages in this group.' : "You can't message this account."}</Text>
          </View>
        ) : (
          <>
            {picked.length ? (
              <View style={styles.trayWrap}>
                <PhotoTray photos={picked} max={MAX_CHAT_PHOTOS} onRemove={(i) => setPicked((now) => now.filter((_, j) => j !== i))} onAdd={choosePhotos} />
              </View>
            ) : null}
            <Composer
              ref={composer}
              styles={styles}
              pickedCount={picked.length}
              editingBody={editing ? editing.body : null}
              replyName={replyTo ? nameOf(replyTo.senderId) : null}
              photosOn={photosOn}
              emojiOpen={emojiOpen}
              mentionIds={group ? memberIds : undefined}
              call={calls}
            />
          </>
        )}
      </View>
      {/* The room under the bar: above the home indicator, or the keyboard's height while it is up. */}
      <Reanimated.View pointerEvents="none" style={room.spacer} />
      {emojiOpen && canWrite && !recording ? (
        // Laid over the room under the bar, at the phone keyboard's height, so swapping keyboards leaves the bar where it was.
        <View style={styles.emojiLayer}>
          <EmojiKeyboard height={keyboardHeight.current} bottomInset={insets.bottom} onPick={(emoji) => composer.current?.insert(emoji)} onDelete={() => composer.current?.deleteBack()} />
        </View>
      ) : null}
    </View>
  );
}

/** What the screen can do to the message box from outside it. */
interface ComposerHandle {
  focus: () => void;
  blur: () => void;
  getText: () => string;
  setText: (text: string) => void;
  /** An emoji from the emoji keyboard, where the cursor is. */
  insert: (emoji: string) => void;
  /** The emoji keyboard's delete key: the last character before the cursor (a whole emoji). */
  deleteBack: () => void;
  closePlus: () => void;
}

/**
 * The message box: one soft rounded box with the camera, the words (growing
 * with them), the emoji key, the "+" while it is empty, and the mic, which
 * turns into Send once there is something to send; "@" suggestions and the
 * "+" row sit over it. It keeps its own words, cursor and recording, so a
 * key typed (or a recording's clock ticking) redraws only this, never the
 * chat above it. The screen reaches in through `ref` (focus, set the words,
 * an emoji) and hears back through `call`.
 */
const Composer = memo(function Composer({ ref, styles, pickedCount, editingBody, replyName, photosOn, emojiOpen, mentionIds, call }: {
  ref?: React.Ref<ComposerHandle>;
  styles: Styles;
  pickedCount: number;
  /** Editing a message of yours: its words as they were (Send stays dim until they change). */
  editingBody: string | null;
  /** Answering someone: their first name ("You" for your own). */
  replyName: string | null;
  photosOn: 'on' | 'off' | 'unknown';
  emojiOpen: boolean;
  /** In a group, its people, who come first in "@" suggestions. */
  mentionIds?: string[];
  call: Calls;
}) {
  const [draft, setDraft] = useState('');
  const [caret, setCaret] = useState(0);
  // The "+": photos and courts, one tap away.
  const [plusOpen, setPlusOpen] = useState(false);
  const now = useRef({ draft, caret });
  now.current = { draft, caret };
  const inputRef = useRef<TextInput>(null);
  // "@" in a message offers people, following first, the same as a comment.
  const candidatesFor = useMentionCandidates(mentionIds);
  // Voice notes: the mic sits where Send is while the box is empty. A tap
  // records until Send or the bin; held, it records while held, sends on
  // letting go, and a slide to the left throws it away (WhatsApp's).
  const voice = useVoiceRecorder();
  const [recMode, setRecMode] = useState<'hold' | 'locked'>('locked');
  const recSlide = useSharedValue(0);

  // An emoji goes in where the cursor is, and the cursor moves past it.
  const placeCaret = (at: number) => { setCaret(at); setTimeout(() => inputRef.current?.setNativeProps?.({ selection: { start: at, end: at } }), 0); };
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
    getText: () => now.current.draft,
    setText: (text) => { setDraft(text); placeCaret(text.length); },
    insert: (emoji) => {
      const { draft: d, caret: c } = now.current;
      const at = Math.min(c, d.length);
      setDraft(d.slice(0, at) + emoji + d.slice(at));
      placeCaret(at + emoji.length);
    },
    deleteBack: () => {
      const { draft: d, caret: c } = now.current;
      const at = Math.min(c, d.length);
      if (at === 0) return;
      const before = dropLastCharacter(d.slice(0, at));
      setDraft(before + d.slice(at));
      placeCaret(before.length);
    },
    closePlus: () => setPlusOpen(false),
  }), []);

  const sendRecording = async () => {
    const got = await voice.finish();
    setRecMode('locked');
    if (got) call.sendVoice(got);
  };
  const throwRecording = () => { haptics.untap(); setRecMode('locked'); void voice.finish(); };
  const startRecording = async () => {
    const result = await voice.start();
    if (result === 'denied') showToast({ title: 'Microphone is off for CourtSide', body: 'Turn it on in your phone’s Settings to send voice notes.', icon: 'mic-off-outline' });
    else if (result === 'failed') showToast({ title: 'Couldn’t start recording', body: 'Try again in a moment.', icon: 'alert-circle-outline' });
  };
  useEffect(() => { if (voice.recording && voice.elapsed >= VOICE_LIMIT_MS) void sendRecording(); }, [voice.elapsed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { call.recording(voice.recording); }, [voice.recording, call]);
  // The box going away mid-recording (the chat locked under it): the screen stops waiting on it.
  useEffect(() => () => call.recording(false), [call]);
  // In a browser the box grows with the words as a phone's does (up to a few lines, then it scrolls), and shrinks back once they are sent.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const box = inputRef.current as unknown as HTMLTextAreaElement | null;
    if (!box?.style) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(INPUT_MAX_H, box.scrollHeight)}px`;
  }, [draft]);

  const editing = editingBody !== null;
  const words = draft.trim();
  // The photo and court buttons step aside while there are words (or photos) to send, as Instagram's do, and the box takes the room.
  const tools = !words && !editing && !pickedCount;
  const showSend = !!words || !!pickedCount || editing;
  const sendReady = (!!pickedCount && !editing) || (!!words && (!editing || words !== editingBody));
  const micTip = useTip('hold-to-record', !showSend && !voice.recording && !editing);
  const cameraOn = photosOn === 'on';
  const mention = activeMention(draft, caret);
  const mentionRows = mention ? candidatesFor(mention.query, 5) : [];
  const pickMention = (handle: string) => {
    if (!mention) return;
    const next = applyMention(draft, mention.start, caret, handle);
    setDraft(next.text);
    placeCaret(next.caret);
  };
  const submit = () => { setPlusOpen(false); call.send(now.current.draft); };

  return (
    <>
      {mention && mentionRows.length ? (
        <View style={styles.mentionTray}>
          <MentionSuggestions candidates={mentionRows} onPick={pickMention} />
        </View>
      ) : null}
      {plusOpen && tools && !voice.recording ? (
        // The "+": what else can go in the chat, one tap away (iMessage's apps row).
        <Reanimated.View entering={FadeInDown.duration(160).easing(Easing.out(Easing.cubic))} exiting={FadeOut.duration(100)} style={styles.plusRow}>
          {cameraOn ? (
            <Tappable accessibilityLabel="Send photos" onPress={call.photos} scaleTo={0.95} style={styles.plusChip}>
              <Ionicons name="images-outline" size={17} color={colors.brand} />
              <Text style={styles.plusChipText}>Photos</Text>
            </Tappable>
          ) : null}
          <Tappable accessibilityLabel="Send a court" onPress={call.court} scaleTo={0.95} style={styles.plusChip}>
            <Ionicons name="location-outline" size={17} color={colors.brand} />
            <Text style={styles.plusChipText}>Court</Text>
          </Tappable>
        </Reanimated.View>
      ) : null}
      <View style={styles.composer}>
        <View style={styles.field}>
          {voice.recording ? (
            <RecordingStrip mode={recMode} elapsed={voice.elapsed} slide={recSlide} onThrow={throwRecording} styles={styles} />
          ) : (
            <>
              {cameraOn ? (
                <Tappable immediate accessibilityLabel="Take a photo" onPress={call.camera} scaleTo={0.92} style={[styles.camera, pageIsDark() && styles.sendCircleDark]}>
                  <BrandWash />
                  <Ionicons name="camera" size={18} color={colors.brandInk} />
                </Tappable>
              ) : photosOn === 'unknown' ? <View style={styles.cameraSpace} /> : <View style={styles.fieldStart} />}
              {/* The box's room above and below the words stays put while they scroll inside it (iMessage's way);
                  a tap anywhere in it, padding included, puts the cursor in. */}
              <Pressable accessible={false} onPress={() => inputRef.current?.focus()} style={styles.inputWrap}>
                <TextInput
                  ref={inputRef}
                  value={draft}
                  multiline
                  // A browser's box starts one line tall (it grows with the words in the effect above).
                  {...(Platform.OS === 'web' ? ({ rows: 1 } as object) : null)}
                  onChangeText={(text) => {
                    setCaret((c) => c + (text.length - now.current.draft.length));
                    setDraft(text);
                    call.typed(text);
                    if (text) setPlusOpen(false);
                  }}
                  onSelectionChange={(e) => setCaret(e.nativeEvent.selection.end)}
                  onFocus={() => { setPlusOpen(false); call.focused(true); }}
                  onBlur={() => call.focused(false)}
                  placeholder={pickedCount ? 'Add a caption…' : replyName ? 'Reply…' : 'Message…'}
                  placeholderTextColor={colors.textFaint}
                  style={styles.input}
                  onSubmitEditing={submit}
                  // Return sends (as it always has here); the box still wraps and grows with long messages.
                  submitBehavior="submit"
                  // In a browser a multi-line box would put a new line in: Return sends, Shift+Return is a new line.
                  onKeyPress={Platform.OS === 'web' ? (e) => {
                    const key = e.nativeEvent as unknown as { key: string; shiftKey?: boolean; isComposing?: boolean };
                    if (key.key === 'Enter' && !key.shiftKey && !key.isComposing) { (e as unknown as { preventDefault: () => void }).preventDefault(); submit(); }
                    if (key.key === 'Escape') call.escape();
                  } : undefined}
                  returnKeyType="send"
                  enterKeyHint="send"
                  accessibilityLabel={replyName ? `Reply to ${replyName}` : editing ? 'Edit your message' : 'Message text'}
                />
              </Pressable>
              <ComposerTool label={emojiOpen ? 'Show the keyboard' : 'Add an emoji'} onPress={call.toggleEmoji} styles={styles}>
                {emojiOpen && !desktopWeb
                  ? <KeyboardGlyph size={23} color={colors.textMuted} />
                  : <Ionicons name={emojiOpen ? 'happy' : 'happy-outline'} size={23} color={emojiOpen ? colors.brand : colors.textMuted} />}
              </ComposerTool>
              {tools ? (
                <Reanimated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(90)}>
                  <ComposerTool label={plusOpen ? 'Close' : 'More: photos and courts'} onPress={() => { setPlusOpen((o) => !o); call.plusToggled(); }} styles={styles}>
                    <PlusGlyph open={plusOpen} />
                  </ComposerTool>
                </Reanimated.View>
              ) : null}
            </>
          )}
          {/* Tip (features/tips): the mic records only while held. */}
          <TipBubble tip="hold-to-record" shown={micTip.shown} onClose={micTip.close} pointer="down" style={{ bottom: '100%', right: 0, marginBottom: 8, alignItems: 'flex-end' }} />
          <SendOrMic
            showSend={showSend || (voice.recording && recMode === 'locked')}
            ready={voice.recording ? true : sendReady}
            editing={editing}
            recording={voice.recording}
            holding={voice.recording && recMode === 'hold'}
            slide={recSlide}
            onSend={voice.recording ? () => { void sendRecording(); } : submit}
            onMicDown={() => { learned('hold-to-record'); if (voice.recording) return; setPlusOpen(false); setRecMode('hold'); void startRecording(); }}
            onMicUp={(heldMs, locked) => {
              // Hold to record, let go to send (owner, Oct 3). A quick tap records nothing and says how;
              // a screen reader's tap (which cannot hold) still records until Send or the bin.
              if (locked) { setRecMode('locked'); return; }
              if (heldMs < HOLD_MS || !voice.recording) {
                throwRecording();
                showToast({ title: 'Hold to record', body: 'Keep holding the mic, then let go to send.', icon: 'mic-outline' });
                return;
              }
              void sendRecording();
            }}
            onMicCancel={throwRecording}
            styles={styles}
          />
        </View>
      </View>
    </>
  );
});

/**
 * The keyboard key that swaps the emoji keyboard back for the typing one:
 * Material Design's "keyboard-outline", drawn from its own outline. As a
 * glyph from that icon font it put the whole set's list of names (about 50 KB
 * zipped) into the app's first download, and in a browser it fetched a
 * 1.3 MB font for this one picture.
 */
function KeyboardGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill={color} d="M4,5A2,2 0 0,0 2,7V17A2,2 0 0,0 4,19H20A2,2 0 0,0 22,17V7A2,2 0 0,0 20,5H4M4,7H20V17H4V7M5,8V10H7V8H5M8,8V10H10V8H8M11,8V10H13V8H11M14,8V10H16V8H14M17,8V10H19V8H17M5,11V13H7V11H5M8,11V13H10V11H8M11,11V13H13V11H11M14,11V13H16V11H14M17,11V13H19V11H17M8,14V16H16V14H8Z" />
    </Svg>
  );
}

/** The "+" in the box, turning a quarter into a cross while what it holds is open. */
function PlusGlyph({ open }: { open: boolean }) {
  const turn = useSharedValue(open ? 1 : 0);
  useEffect(() => { turn.value = withSpring(open ? 1 : 0, { damping: 16, stiffness: 260 }); }, [open, turn]);
  const look = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 45}deg` }] }));
  return (
    <Reanimated.View style={look}>
      <Ionicons name="add-circle-outline" size={25} color={open ? colors.brand : colors.textMuted} />
    </Reanimated.View>
  );
}

/** "Dev", "Dev and June", "Dev, June and Mira", "Dev, June and 2 others". */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
}


type RowLook = {
  mine: boolean; gap: Gap; leading?: React.ReactNode; styles: Styles; time?: string;
  /** Swiping it to the right answers it (none where nothing can be sent, or it is not sent yet). */
  onReply?: () => void;
  /** Going to it from a reply: it lights up (a fresh number each time). */
  flash?: number;
};

const noop = () => {};

/**
 * One row of the chat: a message (with its time line, sender's name and
 * read line), an event line, or a folded run. Drawn again only when one of
 * its own values changes (see Thread's renderRow).
 */
const MessageRow = memo(function MessageRow({ item, ctx, original, originalBlocked, held, flashKey, readLine, seenHidden, canWrite }: {
  item: ThreadRow;
  ctx: RowCtx;
  /** The message it answers, when it is here (undefined: gone, or not loaded yet). */
  original?: Message;
  /** That message is from someone you blocked, folded away here. */
  originalBlocked: boolean;
  /** Its menu is open: the lifted copy stands in for it. */
  held: boolean;
  flashKey?: number;
  /** Under your newest message: "Sending…", "Sent" or "Seen". */
  readLine: string | null;
  /** Someone is typing: the seen faces give way to the dots. */
  seenHidden: boolean;
  canWrite: boolean;
}) {
  const { styles, me, group, call } = ctx;
  const { message } = item;
  // Whether it comes in moving: settled the first time it is drawn.
  const [arrive] = useState(() => ctx.arrivalOf(message));
  const mine = message.senderId === me;
  const stamp = item.stamp ? <DayLine iso={message.createdAt} styles={styles} /> : null;
  // An event line ("Mira added Dev", "You named the group…"): a quiet
  // centred sentence, worded for whoever reads it. Nobody sent it, so
  // it takes no reactions and no menu.
  if (message.kind === 'system') {
    return (
      <View>
        {stamp}
        <Text style={styles.event}>{eventText(message, ctx.users, me)}</Text>
      </View>
    );
  }
  const gutter = group && !mine;
  // From someone you blocked: folded to one quiet line per run, until you choose to see it.
  if (item.folded) {
    const run = item.folded;
    return (
      <View>
        {stamp}
        <Row mine={false} gap="plain" leading={<View style={styles.faceSpace} />} styles={styles}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${run.length === 1 ? 'A message' : `${run.length} messages`} from someone you blocked. Show`}
            onPress={() => call.showFolded(run)}
            style={({ pressed }) => [styles.folded, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="eye-off-outline" size={14} color={colors.textFaint} />
            <Text style={styles.foldedText}>
              {run.length === 1 ? 'Message' : `${run.length} messages`} from someone you blocked · <Text style={styles.foldedShow}>Show</Text>
            </Text>
          </Pressable>
        </Row>
      </View>
    );
  }

  // In a group, others' messages carry who sent them: a face by the
  // last bubble of each run, a name over the first. Both open their profile.
  const sender = gutter ? ctx.faceOf(message.senderId) : undefined;
  const leading = !gutter ? undefined : item.face && sender ? (
    <Pressable accessibilityRole="link" accessibilityLabel={`${sender.name}'s profile`} hitSlop={4} onPress={() => router.push(`/user/${sender.id}`)}>
      <Avatar name={sender.name} seed={sender.avatarSeed} uri={sender.avatarUrl} size={FACE} />
    </Pressable>
  ) : <View style={styles.faceSpace} />;
  const who = item.name ? (
    <View style={styles.senderLink}>
      <Pressable accessibilityRole="link" disabled={!sender} onPress={() => sender && router.push(`/user/${sender.id}`)}>
        <Text style={[styles.sender, styles.senderBeside]}>{firstName(sender)}</Text>
      </Pressable>
    </View>
  ) : null;
  const gap: Gap = item.gap;
  // When it was sent: shown at the right edge when the chat is swiped to the left.
  const sentAt = chatTime(message.createdAt);
  // Not on the server yet (on its way, or not sent): nothing can answer it or
  // react to it until it is, or the answer would land without it.
  const pending = !!(message.sending || message.failed);
  const canReact = canWrite && !pending;
  // Swiping it to the right answers it.
  const onReply = canWrite && !pending ? () => call.startReply(message) : undefined;
  const openMenu = (target: MenuTarget) => call.openMenu(target);
  // The message it answers, quoted: inside a bubble of words, on its own over a photo, a court or a voice note.
  const quote = (standalone: boolean) => (message.replyToId ? (
    <ReplyQuote
      original={original}
      blocked={originalBlocked}
      who={original ? ctx.nameOf(original.senderId) : ''}
      mine={mine}
      standalone={standalone}
      onPress={original ? () => call.jumpTo(original.id) : undefined}
    />
  ) : null);
  const quoteAbove = message.replyToId ? <View style={[styles.quoteAbove, mine ? styles.mineAlign : styles.theirsAlign, gutter && styles.quoteBeside]}>{quote(true)}</View> : null;
  const failedMark = mine && message.failed ? (
    <Pressable accessibilityRole="button" accessibilityLabel="Not sent. Tap to try again" hitSlop={8} onPress={() => call.retry(message.id)} style={styles.failedMark}>
      <Ionicons name="alert-circle" size={22} color={colors.danger} />
    </Pressable>
  ) : null;
  const rowProps: RowLook = { mine, gap, leading, styles, time: sentAt, onReply, flash: flashKey };
  // On a computer: React, Reply and More beside a message while the pointer is over it (Messenger's).
  const hover: HoverTools | undefined = desktopWeb ? { mine, styles, reaction: ctx.defaultReaction, onReact: canReact ? () => call.react(message.id) : undefined, onReply } : undefined;
  // How far a court card or photos may reach across the chat: most of its
  // width (less the face beside others' messages in a group), so they never
  // run off the side of a small phone.
  const reach = (beside: boolean) => Math.floor((Math.min(700, ctx.winW) - spacing.lg * 2 - (beside ? FACE + spacing.sm : 0)) * 0.84);
  const notSent = message.failed ? (
    <Pressable accessibilityRole="button" accessibilityLabel="Not sent. Tap to try again" onPress={() => call.retry(message.id)} hitSlop={8} style={styles.notSentWrap}>
      <Text style={[styles.edited, styles.notSent]}>Not sent · Tap to retry</Text>
    </Pressable>
  ) : null;

  // A group invite is a plain message (its words and the group's link), drawn as the group's card.
  const invite = message.kind === 'text' ? readGroupInvite(message.body) : null;

  let body: React.ReactNode;
  if (message.kind === 'voice' && message.audio) {
    const audio = message.audio;
    body = (
      <>
        {quoteAbove}
        <Row {...rowProps}>
          <HoldArea hover={hover} onHold={(rect) => openMenu({ message, mine, rect, copy: <VoiceNote url={audio.url} ms={audio.ms} mine={mine} /> })} style={[{ opacity: message.failed ? 0.5 : message.sending ? 0.82 : 1 }, held && styles.heldAway]}>
            {() => (
              <>
                <VoiceNote url={audio.url} ms={audio.ms} mine={mine} sentAt={sentAt} />
                {failedMark}
              </>
            )}
          </HoldArea>
          {notSent}
          <Reactions message={message} me={me} mine={mine} styles={styles} onOpen={call.openReactions} inline />
        </Row>
      </>
    );
  } else if (message.kind === 'court' && message.place) {
    // A court: a still map of the spot, its name and where it is; the whole card opens the court's page.
    const place = message.place;
    const card = { place, width: Math.min(COURT_CARD_W, reach(gutter)), mine, tail: item.joinBelow, joinTop: gap === 'run', from: ctx.from, sentAt };
    body = (
      <>
        {quoteAbove}
        <Row {...rowProps}>
          {/* Held, the menu draws it lifted and bright above the dimmed chat, so this one steps out of sight. */}
          <HoldArea hover={hover} onHold={(rect) => openMenu({ message, mine, rect, copy: <CourtCard {...card} onPress={() => {}} /> })} style={[styles.cardArea, { opacity: message.sending ? 0.82 : 1 }, held && styles.heldAway]}>
            {(hold) => (
              <>
                <CourtCard
                  {...card}
                  onPress={() => openCourt({ id: place.id, name: place.name, lat: place.lat, lng: place.lng })}
                  onLongPress={hold}
                />
                {failedMark}
              </>
            )}
          </HoldArea>
          {notSent}
          <Reactions message={message} me={me} mine={mine} styles={styles} onOpen={call.openReactions} inline />
        </Row>
      </>
    );
  } else if (message.kind === 'photo' && message.photos?.length) {
    body = (
      <>
        {quoteAbove}
        <PhotoMessage
          message={message}
          rowProps={rowProps}
          joinBottom={item.joinBelow}
          ctx={ctx}
          width={Math.min(PHOTO_W, reach(gutter))}
          held={held}
          canReact={canReact}
          hover={hover}
          onHold={(rect, copy) => openMenu({ message, mine, rect, copy })}
        />
      </>
    );
  } else if (message.kind === 'hit-request') {
    // A "Looking for a hit" post sent into the chat: when, where, how
    // many spots are left; it opens the hit. Once it is gone (called
    // off, or over), the card says so.
    const hit = ctx.hitRequests.find((h) => h.id === message.sharedId && !h.cancelled);
    const left = hit ? Math.max(0, hit.spots - joinedCount(hit)) : 0;
    body = (
      <Row {...rowProps}>
        <HoldArea hover={hover} onHold={(rect) => openMenu({ message, mine, rect })} style={styles.sharedCardArea}>
          {(hold) => (
            <>
              <Tappable
                accessibilityRole="link"
                accessibilityLabel={`${hit ? `Looking for a hit, ${hitWhen(hit.startsAt)}, ${hit.place.name}` : 'This hit is over'}, sent ${sentAt}`}
                scaleTo={0.97}
                onLongPress={hold}
                onPress={() => (hit ? router.push(`/hit-request/${hit.id}`) : undefined)}
                style={[styles.sharedCard, styles.courtCard]}
              >
                <View style={styles.sharedHead}>
                  <HitGlyph size={16} color={hit ? colors.brand : colors.textFaint} />
                  <Text style={[styles.sharedKind, !hit && styles.sharedKindOver]}>{hit ? 'Looking for a hit' : 'Hit'}</Text>
                </View>
                {hit ? (
                  <>
                    <Text numberOfLines={1} style={styles.courtName}>{hitWhen(hit.startsAt)}</Text>
                    <Text numberOfLines={2} style={styles.sharedBody}>{hit.place.name} · {left ? `${left} ${left === 1 ? 'spot' : 'spots'} left` : 'Full'}</Text>
                  </>
                ) : (
                  // Gone (played or called off): a quiet card that says so, not a live-looking one.
                  <>
                    <Text numberOfLines={1} style={[styles.courtName, styles.overTitle]}>This hit is over</Text>
                    <Text style={styles.overBody}>It was played or called off.</Text>
                  </>
                )}
              </Tappable>
              {failedMark}
            </>
          )}
        </HoldArea>
        {notSent}
        <Reactions message={message} me={me} mine={mine} styles={styles} onOpen={call.openReactions} inline />
      </Row>
    );
  } else if (invite) {
    // A group invite (Start a group's last step, or Invite on its page): a plain message (its words and the
    // group's link) drawn as the group's card, with the group's face and name; it opens the group's page.
    body = (
      <>
        {quoteAbove}
        <Row {...rowProps}>
          <HoldArea hover={hover} onHold={(rect) => openMenu({ message, mine, rect })} style={styles.sharedCardArea}>
            {(hold) => <GroupInviteCard groupId={invite.id} name={invite.name} sentAt={sentAt} onLongPress={hold} />}
          </HoldArea>
          {notSent}
          <Reactions message={message} me={me} mine={mine} styles={styles} onOpen={call.openReactions} inline />
        </Row>
      </>
    );
  } else if (message.kind !== 'text' && message.sharedId) {
    body = (
      <Row {...rowProps}>
        <HoldArea hover={hover} onHold={(rect) => openMenu({ message, mine, rect })} style={styles.sharedCardArea}>
          {(hold) => (
            <>
              <SharedCard message={message} posts={ctx.posts} questions={ctx.questions} users={ctx.users} sentAt={sentAt} onLongPress={hold} styles={styles} />
              {failedMark}
            </>
          )}
        </HoldArea>
        {notSent}
        <Reactions message={message} me={me} mine={mine} styles={styles} onOpen={call.openReactions} inline />
      </Row>
    );
  } else {
    body = (
      <Bubble
        message={message}
        rowProps={rowProps}
        joinBottom={item.joinBelow}
        ctx={ctx}
        cardWidth={Math.min(LINK_CARD_W, reach(gutter))}
        held={held}
        quote={quote(false)}
        failedMark={failedMark}
        canReact={canReact}
        hover={hover}
        onHold={(rect, copy) => openMenu({ message, mine, rect, copy })}
      />
    );
  }

  // Under your newest message, at its right edge: "Sending…", "Sent" or "Seen". In a group, the faces of who has read up to here.
  const readUnder = readLine ? (
    <Reanimated.View entering={arrive !== 'none' ? FadeIn.delay(110).duration(260).easing(Easing.out(Easing.cubic)) : undefined}>
      <Slide mine><Text accessibilityLiveRegion="polite" style={styles.readLine}>{readLine}</Text></Slide>
    </Reanimated.View>
  ) : null;
  const seen = item.seenBy?.length && !seenHidden ? (
    <Slide mine={mine}>
      <SeenFaces people={item.seenBy.map((uid) => ctx.faceOf(uid)).filter((u): u is User => !!u)} align="right" />
    </Slide>
  ) : null;

  return (
    <View>
      {stamp}
      {who}
      <Arrive mode={arrive} mine={mine}>{body}</Arrive>
      {readUnder}
      {seen}
    </View>
  );
});

/**
 * One message's line across the chat: yours on the right, theirs on the
 * left. In a group, theirs carries `leading` (the sender's face, or an empty
 * space the same size) beside the message, the face lined up with its bottom.
 * The line slides left when the chat is swiped for its times (and `time`
 * comes into view at the right edge as it does), and right to answer it.
 * (The swipe's wrapper stays whether or not it can answer, so a message
 * that goes from "Sending…" to sent keeps everything inside it as it was.)
 */
function Row({ mine, gap, leading, styles, time, onReply, flash, children }: RowLook & { children: React.ReactNode }) {
  const inner = (
    <Slide time={time} mine={mine} style={[styles.row, mine ? styles.rowMine : styles.rowTheirs, leading !== undefined && styles.rowFace]}>
      {leading !== undefined ? (
        <>
          {leading}
          <View style={styles.faceColumn}>{children}</View>
        </>
      ) : children}
    </Slide>
  );
  return (
    <View style={[styles.row, gap === 'run' ? styles.inRun : gap === 'turn' ? styles.newTurn : styles.plainGap]}>
      {flash ? <Flash key={flash} /> : null}
      <SwipeReply enabled={!!onReply} onReply={onReply ?? noop}>{inner}</SwipeReply>
    </View>
  );
}

/**
 * The reactions under a message, one chip per emoji with a count. Tucked
 * over the bottom corner that faces the other person (Instagram's place)
 * on a bubble; under a card or a voice note (`inline`), a small row of
 * their own. A tap shows who reacted (yours can be taken off there).
 */
function Reactions({ message, me, mine, styles, onOpen, inline = false }: { message: Message; me: string | null; mine: boolean; styles: Styles; onOpen: (m: Message) => void; inline?: boolean }) {
  const reactions = message.reactions ?? {};
  const tally = Object.values(reactions).reduce<Record<string, number>>((acc, emoji) => { acc[emoji] = (acc[emoji] ?? 0) + 1; return acc; }, {});
  if (!Object.keys(tally).length) return null;
  const mark = me ? reactions[me] : undefined;
  return (
    <View style={inline ? [styles.reactionsInline, mine ? styles.mineAlign : styles.theirsAlign] : [styles.reactions, mine ? styles.reactionsMine : styles.reactionsTheirs]}>
      {Object.entries(tally).map(([emoji, count]) => (
        <ReactionChip key={emoji} emoji={emoji} count={count} mine={mark === emoji} onPress={() => onOpen(message)} style={[styles.chip, mark === emoji && styles.chipMine]} />
      ))}
    </View>
  );
}

/** A shared clip, discussion or profile: a small card that opens it (a clip with its picture). */
function SharedCard({ message, posts, questions, users, sentAt, onLongPress, styles }: {
  message: Message; posts: Post[]; questions: Question[]; users: User[]; sentAt: string; onLongPress: () => void; styles: any;
}) {
  const post = message.kind === 'post' ? posts.find((p) => p.id === message.sharedId) : undefined;
  const person = message.kind === 'profile' ? users.find((u) => u.id === message.sharedId) : undefined;
  const question = message.kind === 'question' ? questions.find((q) => q.id === message.sharedId) : undefined;
  const there = post ?? person ?? question;
  const label = !there ? 'This item was removed' : person ? person.name : question ? question.title : (post?.body || 'A clip');
  const kindWord = message.kind === 'profile' ? 'Profile' : message.kind === 'post' ? 'Clip' : 'Discussion';
  const thumb = post ? clipPicture(post) : undefined;
  return (
    <Tappable
      accessibilityRole="link"
      accessibilityLabel={`${kindWord}: ${label}, sent ${sentAt}`}
      scaleTo={0.97}
      onLongPress={onLongPress}
      onPress={() => (there ? router.push(message.kind === 'profile' ? `/user/${message.sharedId}` : message.kind === 'post' ? `/post/${message.sharedId}` : `/question/${message.sharedId}`) : undefined)}
      style={[styles.sharedCard, post && styles.sharedCardClip]}
    >
      {post ? (
        // A clip shows its picture (or a court-coloured stand-in when it has none), with a play mark over it.
        <View style={styles.clipThumb}>
          {thumb ? <Image source={{ uri: thumb }} contentFit="cover" style={StyleSheet.absoluteFill} /> : <LinearGradient colors={[colors.court, colors.hard]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
          <View style={styles.clipPlay}><Ionicons name="play" size={14} color={colors.onMedia} /></View>
        </View>
      ) : null}
      <View style={styles.sharedWords}>
        <View style={styles.sharedHead}>
          <Ionicons name={message.kind === 'profile' ? 'person-outline' : message.kind === 'post' ? 'play-circle-outline' : 'chatbubbles-outline'} size={16} color={colors.brand} />
          <Text style={styles.sharedKind}>{kindWord}</Text>
        </View>
        <Text numberOfLines={3} style={styles.sharedBody}>{label}</Text>
      </View>
    </Tappable>
  );
}

/** A clip's picture for its card in a chat: its cover, or its photo; none for a demo clip (no picture files ship). */
function clipPicture(post: Post): string | undefined {
  const pic = post.thumbnailUrl ?? post.imageUrl;
  return pic && /^(https?:|file:|blob:|data:)/.test(pic) ? pic : undefined;
}

/**
 * What a screen reader offers on a message, in place of the double tap and
 * the hold it cannot make: activating it leaves your reaction (VoiceOver's
 * double tap is a single press here, which never made a double tap), and
 * Reply, another emoji, Copy and the rest of the menu are its actions.
 */
function messageA11y({ who, words, time, reaction, canReact, react, reply, anyEmoji, copy, more }: {
  who: string; words: string; time?: string; reaction: string; canReact: boolean;
  react: () => void; reply?: () => void; anyEmoji: () => void; copy?: () => void; more: () => void;
}) {
  const actionList = [
    ...(canReact ? [{ name: 'activate', label: `React with ${reaction}` }] : []),
    ...(reply ? [{ name: 'reply', label: 'Reply' }] : []),
    ...(canReact ? [{ name: 'react', label: 'React with another emoji' }] : []),
    ...(copy ? [{ name: 'copy', label: 'Copy' }] : []),
    { name: 'more', label: 'More options' },
  ];
  return {
    accessibilityLabel: `${who}: ${words}${time ? `, sent ${time}` : ''}`,
    accessibilityHint: canReact ? `Double tap to react with ${reaction}. More in actions.` : 'More in actions.',
    accessibilityActions: actionList,
    onAccessibilityAction: (e: AccessibilityActionEvent) => {
      switch (e.nativeEvent.actionName) {
        case 'activate': if (canReact) react(); break;
        case 'reply': reply?.(); break;
        case 'react': if (canReact) anyEmoji(); break;
        case 'copy': copy?.(); break;
        case 'more': more(); break;
        default: break;
      }
    },
  };
}

/**
 * One text message.
 *
 * Double tap leaves your default reaction (its chip pops in under the
 * bubble); a long press opens the menu. A reply carries a
 * small quote of what it answers at its top. Links in it light up and open
 * in the in-app browser. A message that is only a link is just its card, as
 * iMessage shows one; words with a link show the card under them once there
 * is something to show on it (a picture or a title).
 */
function Bubble({ message, rowProps, joinBottom, ctx, cardWidth, held = false, quote, failedMark, canReact, hover, onHold }: {
  message: Message; rowProps: RowLook; ctx: RowCtx;
  /** The next message is the same person's, moments later: the corner below on the sender's side is small. */
  joinBottom: boolean;
  /** How wide a link's card may be here. */
  cardWidth: number;
  /** Its menu is open: the lifted copy stands in for it, so it steps out of sight. */
  held?: boolean;
  /** What it answers, quoted at its top. */
  quote: React.ReactNode;
  /** Yours, not sent: the red mark beside it (iMessage's). */
  failedMark: React.ReactNode;
  /** A reaction can be left (it is on the server, and the chat can be written in). */
  canReact: boolean;
  hover?: HoverTools;
  /** A hold: where it sits, and (a message with a link's card) the copy the menu lifts in its place. */
  onHold: (rect: Rect, copy?: React.ReactNode) => void;
}) {
  const styles = rowProps.styles;
  const { mine, gap, time, onReply } = rowProps;
  const { me, defaultReaction, call } = ctx;
  // Double tap leaves the reaction quietly: its chip pops in under the bubble, no big heart over it (Oct 4, owner).
  const react = () => {
    if (!canReact) return;
    haptics.tap();
    call.react(message.id);
  };
  const tap = useDoubleTap(react);
  const reactions = message.reactions ?? {};
  const only = useMemo(() => (message.replyToId ? null : isOnlyLink(message.body)), [message.body, message.replyToId]);
  const link = useMemo(() => only ?? firstLink(message.body), [only, message.body]);
  // Words with a link: its card only once it has something to show (read from the same store the card reads).
  const preview = useLinkPreview(link && !only ? link.url : null);
  const showCard = !!link && (!!only || linkCardShows(link.url, preview));
  const reacted = Object.keys(reactions).length > 0;
  const joinTop = gap === 'run';
  // Corners: small on the sender's side where it joins the message above or below (or its own card under it).
  const corners = [mine ? styles.mine : styles.theirs, joinTop && (mine ? styles.joinMine : styles.joinTheirs), (joinBottom || showCard) && (mine ? styles.joinBelowMine : styles.joinBelowTheirs)];
  const words = (hold?: () => void) => (
    <RichText
      style={[styles.bubbleText, mine && { color: colors.brandInk }]}
      mentionStyle={mine ? { color: colors.brandInk, textDecorationLine: 'underline' } : undefined}
      links={{ style: mine ? styles.linkMine : styles.linkTheirs, onLongPress: hold }}
    >
      {message.body}
    </RichText>
  );
  const card = (still: boolean, hold?: () => void) => (link ? (
    <LinkCard url={link.url} mine={mine} width={cardWidth} joinTop={!only || joinTop} joinBottom={joinBottom} sentAt={time ?? ''} onLongPress={hold} onReact={canReact ? react : undefined} still={still} />
  ) : null);
  // What the menu lifts while a message with a card (or a quote) is held: the same thing, bright, taking no taps.
  const copy = showCard ? (
    <View style={mine ? styles.mineAlign : styles.theirsAlign}>
      {!only ? <View style={[styles.bubble, ...corners, styles.textInCard, mine ? styles.mineAlign : styles.theirsAlign]}>{quote}{words()}</View> : null}
      <View style={[!only && styles.cardUnder, mine ? styles.mineAlign : styles.theirsAlign]}>{card(true)}</View>
    </View>
  ) : message.replyToId ? (
    <View style={[styles.bubble, ...corners, mine ? styles.mineAlign : styles.theirsAlign]}>{quote}{words()}</View>
  ) : undefined;
  const chips = <Reactions message={message} me={me} mine={mine} styles={styles} onOpen={call.openReactions} />;
  const bubbleHover = hover ? { ...hover, onReact: canReact ? react : undefined } : undefined;

  return (
    // The row spans the chat, so the bubble's width limit is a share of the
    // chat itself. (A row that shrank to fit its text made that limit a share
    // of the text's own width, and short messages broke onto a second line.)
    <Row {...rowProps}>
      <HoldArea hover={bubbleHover} onHold={(rect) => onHold(rect, copy)} style={[showCard ? styles.linkWrap : styles.bubbleWrap, showCard && (mine ? styles.mineAlign : styles.theirsAlign), reacted && styles.bubbleWrapReacted, held && { opacity: 0 }]}>
        {(hold) => (
          <>
            {only ? null : (
              <Pressable
                onPress={tap}
                onLongPress={hold}
                delayLongPress={320}
                accessibilityRole="button"
                {...messageA11y({
                  who: mine ? 'You' : ctx.nameOf(message.senderId),
                  words: message.body,
                  time,
                  reaction: defaultReaction,
                  canReact,
                  react,
                  reply: onReply,
                  anyEmoji: () => call.anyEmoji(message),
                  copy: () => call.copy(message.body),
                  more: hold,
                })}
                // Beside a card the words keep a plain bubble's width, so a run's bubbles line up.
                style={[styles.bubble, ...corners, showCard && styles.textInCard, showCard && (mine ? styles.mineAlign : styles.theirsAlign), message.sending && styles.bubbleSending]}
              >
                {quote}
                {words(hold)}
              </Pressable>
            )}
            {showCard ? (
              <View style={[!only && styles.cardUnder, mine ? styles.mineAlign : styles.theirsAlign]}>
                {card(false, hold)}
                {chips}
              </View>
            ) : chips}
            {failedMark}
          </>
        )}
      </HoldArea>
      {message.editedAt ? <Text style={styles.edited}>Edited</Text> : null}
      {message.failed ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Not sent. Tap to try again" onPress={() => call.retry(message.id)} hitSlop={8}>
          <Text style={[styles.edited, styles.notSent]}>Not sent · Tap to retry</Text>
        </Pressable>
      ) : null}
    </Row>
  );
}

/**
 * A photo message: the photos (one at its own shape, several in a grid),
 * then the caption in a bubble of its own under them, as iMessage does. A
 * tap opens a photo full screen; a double tap leaves your reaction (it
 * bursts over the photos), as on a message; a hold opens the menu. While the
 * photos go up, a ring fills over them; one that did not go offers a retry.
 * Its reactions sit on the caption's corner when it has one (on the photos'
 * own when it has none), so a chip never hangs in the air beside a short caption.
 */
function PhotoMessage({ message, rowProps, joinBottom, ctx, width, held = false, canReact, hover, onHold }: {
  message: Message; rowProps: RowLook; ctx: RowCtx;
  /** The next message is the same person's, moments later: the corner below on the sender's side is small. */
  joinBottom: boolean;
  /** How wide the photos sit (narrower on a small phone, and beside a face in a group). */
  width: number;
  /** Its menu is open: the lifted copy stands in for it, so it steps out of sight. */
  held?: boolean;
  canReact: boolean;
  hover?: HoverTools;
  /** A hold: where it sits, and the copy the menu lifts above the dimmed chat. */
  onHold: (rect: Rect, copy: React.ReactNode) => void;
}) {
  const styles = rowProps.styles;
  const { mine, gap, time, onReply } = rowProps;
  const { me, defaultReaction, call } = ctx;
  const progress = useSendProgress(message.id);
  const react = () => { if (!canReact) return; haptics.tap(); call.react(message.id); };
  // A single tap waits out the double-tap window, so a double tap never opens the photo too.
  const tapped = useRef<{ index: number; rects: (TileRect | undefined)[] }>({ index: 0, rects: [] });
  const tap = useDoubleTap(react, () => call.openPhoto(message, tapped.current.index, tapped.current.rects));
  // The caption answers like any message: a double tap leaves your reaction.
  const captionTap = useDoubleTap(react);
  const reacted = Object.keys(message.reactions ?? {}).length > 0;
  const caption = message.body.trim();
  const photos = message.photos ?? [];
  const joinTop = gap === 'run';
  // The caption joins the photos above it, as a run's bubbles join (and the next message below, in a run).
  // With reactions, a little more room under its words, so the chip on its corner never covers the last one.
  const captionStyle = [styles.bubble, mine ? styles.mine : styles.theirs, mine ? styles.joinMine : styles.joinTheirs, joinBottom && (mine ? styles.joinBelowMine : styles.joinBelowTheirs), styles.caption, reacted && styles.captionReacted];
  const captionText = (hold?: () => void) => (
    <RichText style={[styles.bubbleText, mine && { color: colors.brandInk }]} mentionStyle={mine ? { color: colors.brandInk, textDecorationLine: 'underline' } : undefined} links={{ style: mine ? styles.linkMine : styles.linkTheirs, onLongPress: hold }}>{caption}</RichText>
  );
  // What the menu lifts while it is held: the same photos and caption, bright, taking no taps.
  const copy = (
    <View style={mine ? styles.mineAlign : styles.theirsAlign}>
      <PhotoStack photos={photos} width={width} mine={mine} tail={!!caption || joinBottom} joinTop={joinTop} progress={null} idKey={message.id} onTile={() => {}} />
      {caption ? <View style={captionStyle}>{captionText()}</View> : null}
    </View>
  );
  const chips = <Reactions message={message} me={me} mine={mine} styles={styles} onOpen={call.openReactions} />;
  return (
    <Row {...rowProps}>
      <HoldArea hover={hover ? { ...hover, onReact: canReact ? react : undefined } : undefined} onHold={(rect) => onHold(rect, copy)} style={[styles.photoWrap, mine ? styles.mineAlign : styles.theirsAlign, reacted && styles.bubbleWrapReacted, held && styles.heldAway]}>
        {(hold) => (
          <>
            <View style={{ opacity: message.failed ? 0.6 : 1 }}>
              <PhotoStack
                photos={photos}
                width={width}
                mine={mine}
                tail={!!caption || joinBottom}
                joinTop={joinTop}
                progress={progress}
                failed={message.failed}
                idKey={message.id}
                sentAt={time}
                onTile={(index, rects) => { tapped.current = { index, rects }; tap(); }}
                onHold={hold}
              />
            </View>
            {caption ? (
              <View style={[styles.captionWrap, mine ? styles.mineAlign : styles.theirsAlign]}>
                <Pressable
                  onPress={captionTap}
                  onLongPress={hold}
                  delayLongPress={320}
                  accessibilityRole="button"
                  {...messageA11y({
                    who: mine ? 'You' : ctx.nameOf(message.senderId),
                    words: `Photo, ${caption}`,
                    time,
                    reaction: defaultReaction,
                    canReact,
                    react,
                    reply: onReply,
                    anyEmoji: () => call.anyEmoji(message),
                    copy: () => call.copy(caption),
                    more: hold,
                  })}
                  style={captionStyle}
                >
                  {captionText(hold)}
                </Pressable>
                {chips}
              </View>
            ) : chips}
          </>
        )}
      </HoldArea>
      {message.editedAt ? <Text style={styles.edited}>Edited</Text> : null}
      {message.failed && progress === null ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Not sent. Tap to try again" onPress={() => call.retry(message.id)} hitSlop={8}>
          <Text style={[styles.edited, styles.notSent]}>Not sent · Tap to retry</Text>
        </Pressable>
      ) : null}
    </Row>
  );
}

/**
 * A tool beside the message box (emoji, "+"). A press only dims it, the way
 * iOS's own bar buttons answer: no dip, no spring, so the bar stays
 * perfectly still while a sheet or the photo picker opens over it.
 */
function ComposerTool({ label, onPress, disabled = false, styles, children }: { label: string; onPress: () => void; disabled?: boolean; styles: Styles; children: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={(state) => [styles.tool, (state as { hovered?: boolean }).hovered && !disabled && styles.toolHover, state.pressed && styles.toolPressed, disabled && styles.toolOff]}
    >
      {children}
    </Pressable>
  );
}

interface Rect { x: number; y: number; w: number; h: number }
/** A held message: where it sits, and (for photos and court cards) the copy the menu lifts in its place. */
interface MenuTarget { message: Message; mine: boolean; rect: Rect; copy?: React.ReactNode }
/**
 * Your words or court card still "Sending…": its save is already on its way
 * and lands whatever happens here, with an alert on the other phone, so it
 * can't be deleted unseen. Delete comes back if it is not sent.
 */
const onItsWay = ({ message, mine }: MenuTarget) => mine && !!message.sending && !message.failed && (message.kind === 'text' || message.kind === 'court');
/** On a computer, the small bar beside a message under the pointer: React (your double-tap reaction), Reply, More. */
interface HoverTools { mine: boolean; styles: Styles; reaction: string; onReact?: () => void; onReply?: () => void }

/**
 * Wraps a message so a hold can tell the menu exactly where the message sits
 * on screen (and its row where to line up the time a swipe shows). On a
 * computer, a right click opens the same menu, and while the pointer is over
 * the message a small bar beside it offers React, Reply and More, as
 * Messenger's and WhatsApp's do on the web (there is no hold with a mouse).
 */
function HoldArea({ onHold, style, hover, children }: { onHold: (rect: Rect) => void; style?: any; hover?: HoverTools; children: (hold: () => void) => React.ReactNode }) {
  const ref = useRef<View>(null);
  const hold = () => {
    haptics.tap();
    ref.current?.measureInWindow((x, y, w, h) => onHold({ x, y, w, h }));
  };
  const holdNow = useRef(hold);
  holdNow.current = hold;
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (!desktopWeb) return undefined;
    const el = ref.current as unknown as HTMLElement | null;
    if (!el?.addEventListener) return undefined;
    const enter = () => setOver(true);
    const leave = () => setOver(false);
    const menu = (e: MouseEvent) => {
      // A link keeps the browser's own menu (copy its address, open it in a new tab).
      if ((e.target as HTMLElement | null)?.closest?.('a[href]')) return;
      e.preventDefault();
      setOver(false);
      holdNow.current();
    };
    el.addEventListener('mouseenter', enter);
    el.addEventListener('mouseleave', leave);
    el.addEventListener('contextmenu', menu);
    return () => {
      el.removeEventListener('mouseenter', enter);
      el.removeEventListener('mouseleave', leave);
      el.removeEventListener('contextmenu', menu);
    };
  }, []);
  return (
    <TimeAnchor ref={ref} style={style}>
      {children(hold)}
      {hover && over ? <HoverBar tools={hover} onMore={() => { setOver(false); hold(); }} /> : null}
    </TimeAnchor>
  );
}

function HoverBar({ tools, onMore }: { tools: HoverTools; onMore: () => void }) {
  const { styles, mine, reaction, onReact, onReply } = tools;
  const button = (label: string, icon: keyof typeof Ionicons.glyphMap, run: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      // The browser's own little label on the pointer, as every desktop chat has.
      {...({ title: label } as object)}
      onPress={run}
      style={(state) => [styles.hoverTool, (state as { hovered?: boolean }).hovered && styles.hoverToolOn]}
    >
      <Ionicons name={icon} size={17} color={colors.textMuted} />
    </Pressable>
  );
  return (
    // Beside the message on the side away from its sender's edge, the reaction button nearest it.
    <View style={[styles.hoverBar, mine ? styles.hoverBarMine : styles.hoverBarTheirs]}>
      {onReact ? button(`React with ${reaction}`, 'happy-outline', onReact) : null}
      {onReply ? button('Reply', 'arrow-undo-outline', onReply) : null}
      {button('More', 'ellipsis-horizontal', onMore)}
    </View>
  );
}

/**
 * What a held message offers, the way iMessage and Instagram show it: the
 * chat dims, the message stays lifted where it was, the reactions sit above
 * it (with a "+" for any emoji) and the actions below. Reply comes first.
 * Your own message: Reply, Copy, Edit, Forward, Info, Unsend, Delete.
 * Theirs: Reply, Copy, Forward, Info and Delete. Delete only takes it out of
 * your own view; Forward opens the Send-to sheet. One not on the server yet
 * (`pending`: on its way, or not sent) offers only Copy and Delete, and no
 * reactions: an answer, an edit or an unsend could otherwise reach the
 * server before it and be lost.
 */
function MessageMenu({ target, me, styles, canReply, canReact, pending, canDelete, onClose, onReact, onMoreEmoji, onReply, onInfo, onCopy, onCopyLink, onEdit, onForward, onUnsend, onDelete, doubleTap, onDoubleTap }: {
  target: MenuTarget; me: string | null; styles: Styles; canReply: boolean; canReact: boolean; pending: boolean; canDelete: boolean;
  onClose: () => void; onReact: (emoji: string) => void; onMoreEmoji: () => void; onReply: () => void; onInfo: () => void; onCopy: () => void; onCopyLink: (url: string) => void; onEdit: () => void; onForward: () => void; onUnsend: () => void; onDelete: () => void;
  /** The reaction a double tap leaves, and how to change it: the last row turns the reactions above into that choice. */
  doubleTap: string; onDoubleTap: (emoji: string) => void;
}) {
  const [choosing, setChoosing] = useState(false);
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { message, mine, rect } = target;
  // The way it opens (iMessage's): the chat dims and softens, the message
  // lifts a touch with a little give, the reactions grow out of its corner
  // one by one and the actions unfold under it, all on one spring. Closing
  // folds it all back quickly before anything else happens.
  const still = useReducedMotion();
  const p = useSharedValue(still ? 1 : 0);
  const lift = useSharedValue(1);
  useEffect(() => {
    if (still) return;
    p.value = withSpring(1, { damping: 22, stiffness: 340, mass: 0.7 });
    lift.value = withSequence(withTiming(1.055, { duration: 120, easing: Easing.out(Easing.quad) }), withSpring(1.03, { damping: 13, stiffness: 280 }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const leaving = useRef(false);
  const leave = (after: () => void) => {
    if (leaving.current) return;
    leaving.current = true;
    if (still) { after(); return; }
    lift.value = withTiming(1, { duration: 130, easing: Easing.out(Easing.quad) });
    p.value = withTiming(0, { duration: 130, easing: Easing.in(Easing.quad) }, (done) => { if (done) runOnJS(after)(); });
  };
  const dimLook = useAnimatedStyle(() => ({ opacity: Math.min(1, p.value) }));
  const liftLook = useAnimatedStyle(() => ({ transform: [{ scale: lift.value }] }));
  const barLook = useAnimatedStyle(() => ({ opacity: Math.min(1, p.value * 1.4), transform: [{ translateY: (1 - p.value) * 10 }, { scale: 0.55 + 0.45 * p.value }] }));
  const cardLook = useAnimatedStyle(() => ({ opacity: Math.min(1, p.value * 1.4), transform: [{ translateY: (1 - p.value) * -8 }, { scale: 0.82 + 0.18 * p.value }] }));
  const text = message.kind === 'text';
  // A photo's caption can be copied like any message's words.
  const caption = message.kind === 'photo' && !!message.body.trim();
  // A message with a link offers its address on its own; one that is only a link offers just that.
  const link = text || caption ? firstLink(message.body) : null;
  const onlyLink = text && !!isOnlyLink(message.body);
  const actionRows = [
    ...(canReply && !pending && message.kind !== 'system' ? [{ key: 'reply', label: 'Reply', icon: 'arrow-undo-outline' as const, run: onReply }] : []),
    ...((text || caption) && !onlyLink ? [{ key: 'copy', label: caption ? 'Copy caption' : 'Copy', icon: 'copy-outline' as const, run: onCopy }] : []),
    ...(link ? [{ key: 'copy-link', label: 'Copy link', icon: 'link-outline' as const, run: () => onCopyLink(link.url) }] : []),
    ...(!pending && mine && text ? [{ key: 'edit', label: 'Edit', icon: 'create-outline' as const, run: onEdit }] : []),
    // Anything anyone sent can go on to other chats; an event line ("Mira added Dev") is not a message,
    // and photos stay on their own chat's private shelf.
    ...(!pending && message.kind !== 'system' && message.kind !== 'photo' ? [{ key: 'forward', label: 'Forward', icon: 'arrow-redo-outline' as const, run: onForward }] : []),
    ...(!pending ? [{ key: 'info', label: 'Info', icon: 'information-circle-outline' as const, run: onInfo }] : []),
    ...(!pending && mine ? [{ key: 'unsend', label: 'Unsend', icon: 'arrow-undo-circle-outline' as const, run: onUnsend }] : []),
    ...(canDelete ? [{ key: 'delete', label: mine && !pending ? 'Delete for you' : 'Delete', icon: 'trash-outline' as const, run: onDelete, danger: true }] : []),
  ];
  // The "Double tap" row only where a reaction can be left.
  const rows = actionRows.length + (canReact ? 1 : 0);
  const ROW = 44, CARD_W = 220, GAP = 8;
  // No reaction bar where none can be left.
  const BAR_H = canReact ? 46 : 0;
  const BAR_W = (REACTIONS.length + (choosing ? 0 : 1)) * 38 + 12;
  const cardH = rows * ROW;
  const floor = H - insets.bottom - 12;
  const ceiling = insets.top + 12;
  // A tall message (a video's card, several photos) on a small phone: its lifted copy is drawn
  // smaller, so the reactions, the message and every action still fit on the screen.
  const room = floor - ceiling - BAR_H - GAP * 2 - cardH;
  const scale = rect.h > room && room > 80 ? room / rect.h : 1;
  const shown = { x: mine ? rect.x + rect.w * (1 - scale) : rect.x, y: rect.y, w: rect.w * scale, h: rect.h * scale };
  // Reactions above, the message, the actions below; the group slides up or
  // down as one if it would run off the screen, the way iMessage does.
  const top = shown.y - BAR_H - (BAR_H ? GAP : 0);
  const bottom = shown.y + shown.h + GAP + cardH;
  let shift = 0;
  if (bottom > floor) shift = bottom - floor;
  if (top - shift < ceiling) shift = top - ceiling;
  const side = (w: number) => (mine ? { left: Math.max(12, Math.min(W - w - 12, shown.x + shown.w - w)) } : { left: Math.max(12, Math.min(W - w - 12, shown.x)) });
  const mark = me ? message.reactions?.[me] : undefined;
  // In a browser, letting go of a long press lands a click on whatever the menu put under the finger
  // ("Copy link", often): nothing in the menu answers until a moment after it opened.
  const openedAt = useRef(Date.now());
  const settledMenu = () => Date.now() - openedAt.current > 350;
  const close = () => { if (settledMenu()) leave(onClose); };
  const pick = (run: () => void) => { if (!settledMenu()) return; leave(() => { onClose(); run(); }); };
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => leave(onClose)}>
      <View style={StyleSheet.absoluteFill}>
        <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, dimLook]}>
          {Platform.OS === 'ios' ? <BlurView intensity={14} tint="dark" style={StyleSheet.absoluteFill} /> : null}
          <View style={[StyleSheet.absoluteFill, styles.menuBackdrop]} />
        </Reanimated.View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={close} style={StyleSheet.absoluteFill} />
        {target.copy ? (
          // Photos and court cards stay bright above the dimmed chat, lifted where they were, as iMessage keeps a held photo.
          // Drawn smaller (from its top corner on the sender's side) when the screen is too short for it and the menu.
          <Reanimated.View
            pointerEvents="none"
            style={[
              { position: 'absolute', left: rect.x, top: rect.y - shift, width: rect.w },
              scale < 1 ? { transformOrigin: mine ? 'right top' : 'left top', transform: [{ scale }] } : liftLook,
            ]}
          >
            {target.copy}
          </Reanimated.View>
        ) : message.kind === 'text' ? (
          <Reanimated.View pointerEvents="none" style={[styles.bubble, mine ? styles.mine : styles.theirs, styles.lifted, { position: 'absolute', left: rect.x, top: rect.y - shift, width: rect.w, alignSelf: 'auto' }, liftLook]}>
            <RichText style={[styles.bubbleText, mine && { color: colors.brandInk }]}>{message.body}</RichText>
          </Reanimated.View>
        ) : null}
        {canReact ? (
          <Reanimated.View style={[styles.menuReactions, { top: top - shift, height: BAR_H, transformOrigin: mine ? 'right bottom' : 'left bottom' }, side(BAR_W), barLook]}>
            {REACTIONS.map((emoji, i) => (
              <Reanimated.View key={emoji} entering={still ? undefined : ZoomIn.delay(40 + i * 28).springify().damping(13).stiffness(260)}>
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityLabel={choosing ? `Double tap leaves ${emoji}` : `React with ${emoji}`}
                onPress={() => pick(() => (choosing ? onDoubleTap(emoji) : onReact(emoji)))}
                style={[styles.menuReaction, (choosing ? doubleTap === emoji : mark === emoji) && styles.menuReactionOn]}
              >
                <Text style={{ fontSize: 22 }}>{emoji}</Text>
              </Pressable>
              </Reanimated.View>
            ))}
            {!choosing ? (
              // Any emoji at all, from the whole emoji keyboard (Instagram's "+").
              <Reanimated.View entering={still ? undefined : ZoomIn.delay(40 + REACTIONS.length * 28).springify().damping(13).stiffness(260)}>
              <Pressable accessibilityRole="button" accessibilityLabel="React with another emoji" onPress={() => pick(onMoreEmoji)} style={[styles.menuReaction, styles.menuReactionMore]}>
                <Ionicons name="add" size={22} color={colors.textMuted} />
              </Pressable>
              </Reanimated.View>
            ) : null}
          </Reanimated.View>
        ) : null}
        {choosing && canReact ? (
          <Reanimated.View entering={FadeIn.duration(140)} pointerEvents="none" style={[styles.menuHint, { top: top - shift - 30 }, side(BAR_W)]}>
            <Text style={[styles.menuHintText, { color: colors.onMedia }]}>Pick what a double tap leaves</Text>
          </Reanimated.View>
        ) : null}
        <Reanimated.View style={[styles.menuCard, { top: shown.y + shown.h + GAP - shift, width: CARD_W, transformOrigin: mine ? 'right top' : 'left top' }, side(CARD_W), cardLook]}>
          {actionRows.map((a, i) => (
            <Pressable key={a.key} accessibilityRole="button" onPress={() => pick(a.run)} style={({ pressed }) => [styles.menuRow, i > 0 && styles.menuRowRule, pressed && styles.menuRowPressed]}>
              <Text style={[styles.menuLabel, a.danger && { color: colors.danger }]}>{a.label}</Text>
              <Ionicons name={a.icon} size={19} color={a.danger ? colors.danger : colors.text} />
            </Pressable>
          ))}
          {canReact ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Double tap leaves ${doubleTap}. Change it`} accessibilityState={{ selected: choosing }} onPress={() => { if (!settledMenu()) return; haptics.tap(); setChoosing((c) => !c); }} style={({ pressed }) => [styles.menuRow, styles.menuRowRule, (pressed || choosing) && styles.menuRowPressed]}>
              <Text style={styles.menuLabel}>Double tap</Text>
              <Text style={{ fontSize: 19 }}>{doubleTap}</Text>
            </Pressable>
          ) : null}
        </Reanimated.View>
      </View>
    </Modal>
  );
}

const desktopWeb = Platform.OS === 'web' && isDesktopBrowser();

/**
 * The text with its last visible character taken off: an emoji can be several
 * code points (a heart and its colour mark, a thumb and its skin tone, a
 * family joined up), and deleting half of one leaves a broken glyph.
 */
function dropLastCharacter(text: string): string {
  const chars = Array.from(text);
  while (chars.length) {
    const cp = chars.pop()!.codePointAt(0) ?? 0;
    const glued = cp === 0xfe0f || cp === 0x200d || cp === 0x20e3 || (cp >= 0x1f3fb && cp <= 0x1f3ff);
    if (glued) continue;
    if (chars.length && chars[chars.length - 1] === '‍') { chars.pop(); continue; }
    break;
  }
  return chars.join('');
}

/** Offered on a long press. Small on purpose — a wall of emoji slows the choice (the "+" has the rest). */
const REACTIONS = ['❤️', '😂', '🔥', '👏', '😮', '😢', '👍', '🎾'];

/**
 * While a voice note records: held, the time and "Slide to cancel" (the
 * words follow the finger and fade as it nears the bin); tapped, the bin
 * and the time, with Send at the end of the box.
 */
function RecordingStrip({ mode, elapsed, slide, onThrow, styles }: { mode: 'hold' | 'locked'; elapsed: number; slide: SharedValue<number>; onThrow: () => void; styles: any }) {
  const still = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (still) return;
    pulse.value = withRepeat(withSequence(withTiming(0.35, { duration: 520 }), withTiming(1, { duration: 520 })), -1);
    return () => cancelAnimation(pulse);
  }, [still, pulse]);
  const dot = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const hint = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, -slide.value / CANCEL_AT) * 0.8, transform: [{ translateX: slide.value * 0.7 }] }));
  return (
    <Reanimated.View entering={FadeIn.duration(140)} style={styles.recording}>
      {mode === 'locked' ? (
        <ComposerTool label="Throw the recording away" onPress={onThrow} styles={styles}>
          <Ionicons name="trash-outline" size={21} color={colors.danger} />
        </ComposerTool>
      ) : <View style={styles.recLead} />}
      <Reanimated.View style={[styles.recDot, dot]} />
      <Text style={styles.recText}>{clock(elapsed)}</Text>
      {mode === 'hold' ? (
        <Reanimated.View style={[styles.recHint, hint]}>
          <Ionicons name="chevron-back" size={15} color={colors.textMuted} />
          <Text style={styles.recHintText}>Slide to cancel</Text>
        </Reanimated.View>
      ) : <Text style={[styles.recHintText, styles.recHintLocked]}>Recording</Text>}
    </Reanimated.View>
  );
}

/**
 * The end of the typing box: a quiet mic while it is empty, turning into the
 * Send arrow in its brand circle the moment there is something to send, as
 * iMessage's does. The arrow springs in; the mic shrinks away under it. Dim
 * while an edit has not changed.
 *
 * The mic answers a tap (it records until Send or the bin) and a hold (it
 * records while held, grows a little in its own circle, sends on letting
 * go, and a slide to the left throws it away), WhatsApp's and Telegram's
 * way. It stays the same button throughout, so the finger never loses it.
 */
function SendOrMic({ showSend, ready, editing, recording, holding, slide, onSend, onMicDown, onMicUp, onMicCancel, styles }: {
  showSend: boolean; ready: boolean; editing: boolean; recording: boolean; holding: boolean; slide: SharedValue<number>;
  onSend: () => void; onMicDown: () => void; onMicUp: (heldMs: number, locked?: boolean) => void; onMicCancel: () => void; styles: any;
}) {
  const shown = useSharedValue(showSend ? 1 : 0);
  const live = useSharedValue(ready ? 1 : 0);
  const grow = useSharedValue(0);
  useEffect(() => {
    shown.value = showSend ? withSpring(1, { damping: 15, stiffness: 300, mass: 0.8 }) : withTiming(0, { duration: 140, easing: Easing.out(Easing.quad) });
  }, [showSend, shown]);
  useEffect(() => { live.value = withTiming(ready ? 1 : 0, { duration: 140 }); }, [ready, live]);
  useEffect(() => { grow.value = holding ? withSpring(1, { damping: 14, stiffness: 260 }) : withTiming(0, { duration: 160 }); }, [holding, grow]);
  const micLook = useAnimatedStyle(() => ({ opacity: 1 - shown.value, transform: [{ translateX: Math.max(-40, slide.value * 0.25) }, { scale: (1 - 0.4 * shown.value) * (1 + 0.22 * grow.value) }] }));
  const holdDisc = useAnimatedStyle(() => ({ opacity: grow.value, transform: [{ translateX: Math.max(-40, slide.value * 0.25) }, { scale: 0.6 + 0.5 * grow.value }] }));
  const sendLook = useAnimatedStyle(() => ({ opacity: Math.min(1, shown.value) * (0.45 + 0.55 * live.value), transform: [{ scale: 0.4 + 0.6 * shown.value }] }));
  // The latest handlers, so the gesture (made once) always calls the current ones.
  const latest = useRef({ onMicDown, onMicUp, onMicCancel });
  latest.current = { onMicDown, onMicUp, onMicCancel };
  const downAt = useRef(0);
  const thrown = useRef(false);
  const micOn = !showSend;
  const press = useMemo(() => Gesture.Pan()
    .runOnJS(true)
    .enabled(micOn)
    .minDistance(0)
    .shouldCancelWhenOutside(false)
    .onBegin(() => { downAt.current = Date.now(); thrown.current = false; latest.current.onMicDown(); })
    .onUpdate((e) => {
      const dx = Math.min(0, e.translationX);
      slide.value = dx;
      if (dx < -CANCEL_AT && !thrown.current) { thrown.current = true; latest.current.onMicCancel(); }
    })
    .onFinalize(() => {
      slide.value = withSpring(0, { damping: 18, stiffness: 260 });
      if (thrown.current) return;
      latest.current.onMicUp(Date.now() - downAt.current);
    }), [micOn, slide]);
  return (
    <View style={styles.endSlot}>
      <Reanimated.View style={[styles.holdDisc, { pointerEvents: 'none' }, holdDisc]}><BrandWash /></Reanimated.View>
      <GestureDetector gesture={press}>
        <Reanimated.View
          aria-hidden={showSend}
          accessible
          accessibilityRole="button"
          accessibilityLabel={recording ? 'Recording. Let go to send' : 'Record a voice note'}
          accessibilityHint="Hold to record, let go to send"
          onAccessibilityTap={() => { latest.current.onMicDown(); latest.current.onMicUp(0, true); }}
          // Only the layer in front takes touches, and it is drawn in front: in a browser the hidden layer's
          // own insides still caught them through "none" on the layer.
          style={[styles.endLayer, { pointerEvents: showSend ? 'none' : 'auto', zIndex: showSend ? 1 : 2 }, micLook]}
        >
          <Ionicons name={holding ? 'mic' : 'mic-outline'} size={22} color={holding ? colors.brandInk : colors.textMuted} />
        </Reanimated.View>
      </GestureDetector>
      <Reanimated.View aria-hidden={!showSend} style={[styles.endLayer, { pointerEvents: showSend ? 'auto' : 'none', zIndex: showSend ? 2 : 1 }, sendLook]}>
        <Tappable immediate onPress={onSend} disabled={!ready} accessibilityLabel={recording ? 'Send voice note' : editing ? 'Save edit' : 'Send message'} style={[styles.sendCircle, pageIsDark() && styles.sendCircleDark]}>
          <BrandWash />
          <Ionicons name={editing ? 'checkmark' : 'arrow-up'} size={18} color={colors.brandInk} />
        </Tappable>
      </Reanimated.View>
    </View>
  );
}

/** A day line between messages, iMessage's way: the day a little stronger than the time ("Today 9:41 AM"). */
function DayLine({ iso, styles }: { iso: string; styles: any }) {
  const { day, time } = chatStampParts(iso);
  return (
    <Text style={styles.stamp} accessibilityRole="header">
      <Text style={styles.stampDay}>{day}</Text>{'  '}{time}
    </Text>
  );
}

/** A reaction that springs in when it lands, then sits still. A tap shows who reacted. */
function ReactionChip({ emoji, count, mine, onPress, style }: {
  emoji: string; count: number; mine: boolean; onPress: () => void; style: any;
}) {
  const scale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: Platform.OS !== 'web', speed: 20, bounciness: 12 }).start();
  }, [scale]);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable onPress={onPress} accessibilityRole="button" hitSlop={4}
        accessibilityLabel={`${emoji} ${count}${mine ? ', yours' : ''}. Show who reacted`} style={style}>
        <Text style={{ fontSize: 13 }}>{emoji}{count > 1 ? ` ${count}` : ''}</Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * The other person typing: three dots in one of their bubbles, rising and
 * brightening one after another, the way iMessage shows it. Still dots under
 * Reduce Motion. In a group, who it is sits above it, and the first typer's
 * face sits beside it where a sender's face goes (`leading`).
 */
function TypingBubble({ styles, label, leading }: { styles: ReturnType<typeof useThemedStyles<typeof styleDefinitions>>; label?: string; leading?: React.ReactNode }) {
  const dots = (
    <View style={[styles.bubble, styles.theirs, styles.typingBubble]}>
      <TypingDot styles={styles} delay={0} />
      <TypingDot styles={styles} delay={160} />
      <TypingDot styles={styles} delay={320} />
    </View>
  );
  return (
    <Reanimated.View entering={FadeInDown.duration(260).easing(Easing.out(Easing.cubic))} exiting={FadeOut.duration(180).easing(Easing.in(Easing.quad))} style={styles.typingWrap} accessibilityLiveRegion="polite" accessibilityLabel={label ?? 'Typing'}>
      {label ? <Text style={[styles.typingWho, leading !== undefined && styles.typingWhoBeside]} numberOfLines={1}>{label}</Text> : null}
      {leading !== undefined ? <View style={styles.typingRow}>{leading}{dots}</View> : dots}
    </Reanimated.View>
  );
}

function TypingDot({ styles, delay }: { styles: ReturnType<typeof useThemedStyles<typeof styleDefinitions>>; delay: number }) {
  const still = useReducedMotion();
  const v = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    v.value = withDelay(delay, withRepeat(withSequence(
      withTiming(1, { duration: 280, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 280, easing: Easing.in(Easing.quad) }),
      withTiming(0, { duration: 360 }),
    ), -1));
    return () => cancelAnimation(v);
  }, [still, delay, v]);
  const style = useAnimatedStyle(() => ({ opacity: 0.35 + 0.65 * v.value, transform: [{ translateY: -3 * v.value }] }));
  return <Reanimated.View style={[styles.typingDot, style]} />;
}

const styleDefinitions = StyleSheet.create({
  blockedNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: spacing.md, paddingBottom: spacing.xs, maxWidth: 700, width: '100%', alignSelf: 'center' },
  blockedNoteText: { ...typography.small, color: colors.textMuted },
  olderSpinner: { alignItems: 'center', paddingVertical: spacing.md },
  root: { flex: 1, backgroundColor: colors.bg },
  // The header sits on the page's wash; a faint line under it, no band.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: `${colors.border}99`,
  },
  back: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
  pressedDim: { opacity: 0.55 },
  headerUser: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  headerWords: { flex: 1, minWidth: 0, gap: 0 },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minWidth: 0 },
  headerName: { ...font('600'), fontSize: 16, lineHeight: 20, letterSpacing: -0.2, color: colors.text },
  headerNameShrink: { flexShrink: 1 },
  headerStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 },
  headerStatus: { ...font('400'), fontSize: 12, lineHeight: 16, color: colors.textMuted, flexShrink: 1 },
  headerTyping: { ...font('500'), color: colors.brand },
  headerLive: { ...font('500'), color: colors.text },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.open },
  headerIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  // The messages and the "back down" button over them.
  listArea: { flex: 1, minHeight: 0 },
  scroll: { flex: 1 },
  scrollContent: {
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
  },
  // The list is upside down: its header is the bottom of the chat (room for the bar's soft fade), its footer the top.
  listBottom: { paddingBottom: spacing.lg + 6 },
  listTop: { paddingTop: spacing.sm },
  // iMessage's measure: 18 round, 12 by 7 inside.
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
  },
  // Yours in the court's colour (deepened where its ink needed it); theirs a shade deeper than the page,
  // with no outline. Round all over on their own; in a run (Instagram's rule) the corners on the sender's
  // side where they join are small: the first one's below, the middle ones' above and below, the last one's above.
  mine: { alignSelf: 'flex-end', backgroundColor: colors.bubbleMine },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.bubble },
  joinMine: { borderTopRightRadius: 5 },
  joinTheirs: { borderTopLeftRadius: 5 },
  joinBelowMine: { borderBottomRightRadius: 5 },
  joinBelowTheirs: { borderBottomLeftRadius: 5 },
  // Yours on its way: a touch lighter until the server has it.
  bubbleSending: { opacity: 0.82 },
  typingWrap: { alignSelf: 'flex-start', marginTop: 10, gap: 3 },
  typingWho: { ...typography.caption, letterSpacing: 0, color: colors.textFaint, paddingLeft: 4 },
  typingWhoBeside: { paddingLeft: FACE + spacing.sm + 4 },
  typingRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 13, paddingHorizontal: 15 },
  typingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.textMuted },
  // A long address with nowhere to break still wraps inside the bubble in a browser.
  bubbleText: { ...typography.body, color: colors.text, lineHeight: 21, ...(Platform.OS === 'web' ? ({ wordBreak: 'break-word', overflowWrap: 'anywhere' } as object) : null) },
  // Links in the words: the court's link colour on theirs; on yours the bubble's own ink, a touch
  // stronger, with a soft underline in that ink so a link never reads as plain bold words.
  linkTheirs: { color: colors.link, ...font('500') },
  linkMine: { color: colors.brandInk, ...font('600'), textDecorationLine: 'underline', textDecorationColor: `${colors.brandInk}80` },
  bubbleWrap: { maxWidth: '75%' },
  // A message with a link's card reaches as far as a court card does.
  linkWrap: { maxWidth: '86%' },
  // The words over a card keep a plain bubble's reach: 75% of the chat, inside the 86% the card may take.
  textInCard: { maxWidth: `${(75 / 86) * 100}%` as `${number}%` },
  cardUnder: { marginTop: 3 },
  row: { width: '100%' },
  rowMine: { alignItems: 'flex-end' },
  rowTheirs: { alignItems: 'flex-start' },
  // Theirs in a group: the face, then the message beside it, both resting on the same bottom line.
  rowFace: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  faceColumn: { flex: 1, minWidth: 0, alignItems: 'flex-start' },
  faceSpace: { width: FACE, height: FACE },
  sharedCardArea: { maxWidth: '78%' },
  edited: { ...typography.caption, color: colors.textFaint, letterSpacing: 0, marginTop: 3, marginHorizontal: 6 },
  menuBackdrop: { backgroundColor: colors.overlay },
  lifted: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  // A held photo or court card only lifts: a shadow on its see-through frame drew a box around it in a browser.
  liftedCopy: { transform: [{ scale: 1.03 }] },
  menuReactions: { position: 'absolute', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, borderRadius: radius.pill, backgroundColor: colors.bgElevated, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } },
  menuReaction: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  menuReactionOn: { backgroundColor: colors.brandDim },
  menuReactionMore: { backgroundColor: colors.surfaceAlt, width: 32, height: 32, borderRadius: 16, marginLeft: 3 },
  menuHint: { position: 'absolute', alignItems: 'center' },
  // A dark pill over the dimmed chat; its words take the over-a-picture white when drawn (see menuHint).
  menuHintText: { ...typography.smallStrong, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.overlay, overflow: 'hidden' },
  menuCard: { position: 'absolute', borderRadius: radius.lg, backgroundColor: colors.bgElevated, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  menuRow: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  menuRowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  menuRowPressed: { backgroundColor: colors.surfaceAlt },
  menuLabel: { ...typography.body, color: colors.text },
  editBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg + 4, paddingTop: spacing.xs, paddingBottom: 2, maxWidth: 700, width: '100%', alignSelf: 'center' },
  editLabel: { ...typography.smallStrong, color: colors.brand, flex: 1 },
  // Leaves room for the chip that hangs off the bottom of the bubble.
  bubbleWrapReacted: { marginBottom: 15 },
  reactions: { position: 'absolute', bottom: -15, flexDirection: 'row', gap: 3, zIndex: 2 },
  reactionsMine: { left: 10 },
  reactionsTheirs: { right: 10 },
  // Under a card or a voice note: a small row of their own, tucked up against it.
  reactionsInline: { flexDirection: 'row', gap: 3, marginTop: -8, paddingHorizontal: 10, zIndex: 2 },
  chip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    // Ringed in the page colour so it reads as sitting on top of the bubble.
    borderWidth: 2,
    borderColor: colors.bg,
  },
  chipMine: { backgroundColor: colors.brandDim },
  // The tools in the box: a fixed square each, so nothing around them ever shifts.
  tool: { width: 36, height: 44, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  toolHover: { backgroundColor: colors.surfaceAlt },
  toolPressed: { opacity: 0.4 },
  toolOff: { opacity: 0.35 },
  // The camera at the start of the box: Instagram's filled circle, in the brand's colour.
  camera: { width: 34, height: 34, borderRadius: 17, marginLeft: 3, marginBottom: 5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.brand },
  cameraSpace: { width: 37 },
  fieldStart: { width: 10 },
  // A court card or photos take the same reach as a shared card.
  cardArea: { maxWidth: '86%' },
  photoWrap: { maxWidth: '86%' },
  // A held photo or court card: the menu's lifted copy stands in for it.
  heldAway: { opacity: 0 },
  caption: { marginTop: 2 },
  // The caption and the reactions on its corner.
  captionWrap: { maxWidth: '100%' },
  // On a computer, the bar beside a message under the pointer: just past its edge, centred on it.
  hoverBar: { position: 'absolute', top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 2, zIndex: 3 },
  hoverBarMine: { right: '100%', paddingRight: 6, flexDirection: 'row-reverse' },
  hoverBarTheirs: { left: '100%', paddingLeft: 6 },
  hoverTool: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  hoverToolOn: { backgroundColor: colors.surfaceAlt },
  captionReacted: { paddingBottom: 11 },
  notSent: { color: colors.danger },
  notSentWrap: { alignSelf: 'flex-end', marginRight: spacing.xs },
  // Yours, not sent: the red mark just outside the bubble's inner side.
  failedMark: { position: 'absolute', left: -30, top: 0, bottom: 0, justifyContent: 'center' },
  // A reply over a photo, court or voice note: its quote sits just above it.
  quoteAbove: { marginTop: 8, marginBottom: -4 },
  quoteBeside: { marginLeft: FACE + spacing.sm },
  // The photos picked to send, above the box.
  trayWrap: { maxWidth: 700, width: '100%', alignSelf: 'center' },
  mineAlign: { alignSelf: 'flex-end' },
  // Bubbles in one run sit 2 points apart; a new turn gets 10 (iMessage's measure); after a time line or a name, a little.
  inRun: { marginTop: 2 },
  newTurn: { marginTop: 10 },
  plainGap: { marginTop: 4 },
  theirsAlign: { alignSelf: 'flex-start' },
  sharedCard: {
    maxWidth: '100%',
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bubble,
    gap: spacing.sm,
  },
  sharedCardClip: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: 8, paddingRight: spacing.md, minWidth: 230 },
  sharedWords: { flexShrink: 1, gap: 4 },
  clipThumb: { width: 54, height: 72, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  clipPlay: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.overlay },
  sharedHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sharedKind: { ...typography.caption, color: colors.brand },
  sharedKindOver: { color: colors.textFaint },
  overTitle: { color: colors.textMuted },
  overBody: { ...typography.small, color: colors.textFaint, lineHeight: 19 },
  sharedBody: { ...typography.small, color: colors.text, lineHeight: 19 },
  courtCard: { minWidth: 220 },
  courtName: { ...typography.bodyStrong, color: colors.text },
  sender: { ...typography.caption, letterSpacing: 0, color: colors.textMuted, marginLeft: spacing.lg, marginTop: spacing.sm, marginBottom: 2 },
  // A sender's name in a group: over their first bubble, past the face column, and it opens their profile.
  senderLink: { alignSelf: 'flex-start' },
  senderBeside: { marginLeft: FACE + spacing.sm + 6 },
  // An event line: small, muted and centred, between the messages rather than in a bubble.
  event: { ...typography.small, fontSize: 12, lineHeight: 17, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xs, marginTop: 6 },
  // A message from someone you blocked, folded to one quiet line.
  folded: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  foldedText: { ...typography.small, color: colors.textFaint, flexShrink: 1 },
  foldedShow: { ...font('600'), color: colors.textMuted },
  blockedBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, maxWidth: 700, width: '100%', alignSelf: 'center' },
  blockedBannerText: { ...typography.small, color: colors.textMuted, flex: 1 },
  blockedBannerLink: { ...typography.smallStrong, color: colors.danger },
  // "Seen" / "Sent" under your newest message, small, at its right edge.
  readLine: { ...font('500'), fontSize: 11.5, lineHeight: 15, letterSpacing: 0.1, color: colors.textFaint, textAlign: 'right', marginTop: 3, paddingRight: 4 },
  // A day line: small and faint, the day a little stronger than the time, with room above it. (Faint is
  // as quiet as it gets at this size: any fainter fell under 4.5:1.)
  stamp: { ...font('400'), fontSize: 11, lineHeight: 14, color: colors.textFaint, textAlign: 'center', paddingTop: spacing.lg, paddingBottom: 6 },
  stampDay: { ...font('600'), color: colors.textFaint },
  mentionTray: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, maxWidth: 700, width: '100%', alignSelf: 'center' },
  // A new chat with nobody's words in it yet.
  hello: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg, gap: 6 },
  // The same, at the start of a chat with words in it: above the first message, scrolling away with them.
  intro: { alignItems: 'center', paddingTop: spacing.xxl, paddingBottom: spacing.sm, paddingHorizontal: spacing.lg, gap: 4 },
  helloName: { ...typography.title, color: colors.text, textAlign: 'center', marginTop: spacing.md },
  helloLine: { ...typography.small, color: colors.textMuted, textAlign: 'center' },
  // A quiet link, so it never competes with the chips under it.
  helloProfile: { marginTop: 2, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  helloProfileText: { ...typography.smallStrong, color: colors.brand },
  helloActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.xl },
  helloChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 38, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  helloWave: { fontSize: 16 },
  helloChipText: { ...typography.smallStrong, color: colors.text },
  // The bar: on the page's own colour, the messages fading into it above.
  dock: { backgroundColor: colors.bg },
  dockFade: { position: 'absolute', left: 0, right: 0, top: -22, height: 22 },
  // The "+" row: Photos and Court as two soft chips over the box.
  plusRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md + 4, paddingTop: spacing.xs, maxWidth: 700, width: '100%', alignSelf: 'center' },
  plusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...lift },
  plusChipText: { ...typography.smallStrong, color: colors.text },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingTop: 6,
    paddingBottom: spacing.sm,
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
  },
  // One soft rounded box, a little lifted like the floating tab bar.
  field: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: 46,
    borderRadius: 23,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${colors.borderStrong}77`,
    paddingHorizontal: 3,
    ...lift,
  },
  // Around the words: the room above and below them, which never scrolls away.
  inputWrap: {
    flex: 1,
    // A browser's text box keeps a width of its own unless told it may shrink,
    // which pushed the mic off the edge of the smallest phones.
    minWidth: 0,
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: Platform.OS === 'ios' ? 11 : 10,
    paddingLeft: 4,
  },
  input: {
    minWidth: 0,
    maxHeight: INPUT_MAX_H + (Platform.OS === 'ios' ? 4 : 0),
    paddingHorizontal: 4,
    paddingTop: Platform.OS === 'ios' ? 2 : 0,
    paddingBottom: Platform.OS === 'ios' ? 2 : 0,
    color: colors.text,
    ...typography.body,
    fontSize: 16,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', resize: 'none', lineHeight: INPUT_LINE } as object) : null),
  },
  // The mic and the Send arrow share one spot at the end of the box.
  endSlot: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  endLayer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  // Holding the mic: it sits in a brand circle a little larger than Send.
  holdDisc: { position: 'absolute', width: 40, height: 40, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.brand },
  sendCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brand, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  // On a dark court the button's own colour as a shadow reads as a glow; the page's own dark shade just lifts it.
  sendCircleDark: { shadowColor: colors.overlay, shadowOpacity: 0.9 },
  recording: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingRight: 6, overflow: 'hidden' },
  recLead: { width: 10 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  recText: { ...typography.body, ...font('600'), color: colors.text, fontVariant: ['tabular-nums'] },
  recHint: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  recHintText: { ...typography.small, color: colors.textMuted },
  recHintLocked: { flex: 1 },
  // The emoji keyboard, laid over the room under the bar.
  emojiLayer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});

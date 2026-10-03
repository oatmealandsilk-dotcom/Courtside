import { useThemedStyles } from '@/theme/ThemeProvider';
import { Wash } from '@/components/Wash';
import { PlayerName } from '@/components/PlayerName';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@/lib/useIsFocused';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

import { Avatar, BrandWash, EmptyState } from '@/components/ui';
import { GROUP_CAP, GroupAvatar, eventText, groupName, isGroupChat, isMuted, leaveGroupMessage, othersIn, seenByLabel } from '@/features/messages/groups';
import { HitGlyph } from '@/components/HitGlyph';
import { hitWhen } from '@/features/hits/format';
import { goBack } from '@/lib/goBack';
import { VoiceNote } from '@/components/VoiceNote';
import { EmojiKeyboard } from '@/components/EmojiKeyboard';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { VOICE_LIMIT_MS, clock, useVoiceRecorder } from '@/features/voice/useVoiceRecorder';
import { openCourt } from '@/features/players/courtLink';
import { COURT_CARD_W, CourtCard } from '@/features/messages/CourtCard';
import { CourtMapSnapshots } from '@/components/map/CourtMapThumb';
import { PHOTO_W, PhotoStack, PhotoTray, PhotoViewer, type TileRect, type TrayPhoto } from '@/features/messages/ChatPhotoViews';
import { MAX_CHAT_PHOTOS, useChatPhotosReady, useSendProgress } from '@/features/messages/chatPhotos';
import { pickPhotos } from '@/components/MediaPicker';
import { Tappable, useDoubleTap } from '@/components/Tappable';
import { GroupInviteCard } from '@/features/groups/GroupInviteCard';
import { chatStamp, chatTime } from '@/lib/format';
import { Slide, TimeAnchor, TimeSwipeArea } from '@/features/messages/MessageTimes';
import { RichText } from '@/components/RichText';
import { useApp } from '@/store/AppContext';
import { MESSAGE_PAGE } from '@/data/remote';
import { MentionSuggestions } from '@/components/MentionSuggestions';
import { useMentionCandidates } from '@/features/mentions/useMentionCandidates';
import { activeMention, applyMention } from '@/lib/mentions';
import { show as showToast } from '@/lib/toast';
import { afterMenu, confirm, confirmAfterMenu } from '@/lib/confirm';
import * as haptics from '@/lib/haptics';
import type { Message, User } from '@/data/types';
import Reanimated, { Easing, FadeIn, FadeInDown, FadeInUp, FadeOut, LinearTransition, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { colors, radius, spacing, typography, font } from '@/theme';

/** Two messages from the same person this close together read as one run: tighter, one tail. */
const GROUP_GAP_MS = 2 * 60_000;

/** Quiet for this long between two messages and the next one gets a time line. */
const STAMP_GAP_MS = 20 * 60_000;

/**
 * In a group, others' messages sit beside a small face (Instagram and
 * Messenger do this): the sender's picture by the last bubble of each run,
 * and an empty space of the same width by the rest, so the bubbles line up.
 */
const FACE = 28;

/** One conversation. Bubbles, shared-item cards, and a composer bar. */
export default function Thread() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const { conversations, messages, users, posts, questions, hitRequests, currentUserId, currentUser, detectedCoords, defaultReaction, actions, blockedIds } = useApp();
  const [draft, setDraft] = useState('');
  // Photos picked from the camera roll, waiting above the box for Send (the box becomes their caption).
  const [picked, setPicked] = useState<TrayPhoto[]>([]);
  // A photo opened full screen: which message, which of its photos, and where it sits in the chat.
  const [viewing, setViewing] = useState<{ message: Message; index: number; rects: (TileRect | undefined)[] } | null>(null);
  // The photo button only shows once the server can keep chat photos (migration 61).
  const photosOn = useChatPhotosReady();
  // Holding a message opens its menu over the chat; Edit puts its words back in the box.
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // A phone browser's keyboard covers the bottom of the page without telling the layout; the visible-area size says how much.
  const [keyboardInset, setKeyboardInset] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => setKeyboardInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    vv.addEventListener('resize', update); vv.addEventListener('scroll', update);
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, []);
  // The emoji keyboard takes the phone keyboard's place at the phone keyboard's
  // height, so switching between them leaves the typing bar where it was.
  const keyboardHeight = useRef(Platform.OS === 'web' ? 260 : 300);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Keyboard.addListener('keyboardDidShow', (e) => { keyboardHeight.current = Math.max(220, e.endCoordinates.height - insets.bottom); });
    return () => sub.remove();
  }, [insets.bottom]);
  const scrollRef = useRef<ScrollView | null>(null);
  // Only messages that arrive after the first paint rise in; the history just appears.
  const settled = useRef(false);
  useEffect(() => { const t = setTimeout(() => { settled.current = true; }, 400); return () => clearTimeout(t); }, []);
  const inputRef = useRef<TextInput>(null);
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  // On iPhone the keyboard slides down over about a quarter of a second, but
  // the chat's room for it (the KeyboardAvoidingView below) is given back in
  // one go the moment it starts: the bar dropped to the bottom and the
  // keyboard uncovered it. Given the keyboard's own timing, the bar and the
  // messages ride down with the keyboard instead.
  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    const sub = Keyboard.addListener('keyboardWillHide', (e) => {
      if (!focusedRef.current) return;
      const duration = Math.max(10, e.duration || 250);
      LayoutAnimation.configureNext({ duration, update: { duration, type: LayoutAnimation.Types[e.easing] ?? LayoutAnimation.Types.keyboard } });
    });
    return () => sub.remove();
  }, []);

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
  const people = conversation ? othersIn(conversation, users, currentUserId) : [];
  // Someone you blocked who is in this group with you. Instagram's way: you
  // both stay and can both still write; their messages fold away on your
  // side, and a line over the box says they are here.
  const blockedInGroup = group ? people.filter((u) => blockedIds.includes(u.id)) : [];
  // Folded messages you chose to see, by id, for as long as the chat is open.
  const [shownIds, setShownIds] = useState<string[]>([]);
  useEffect(() => { setShownIds([]); setPicked([]); setViewing(null); }, [id]);
  // The picked photos' row takes room from the bottom of the chat: the newest message stays in view above it.
  const hasTray = picked.length > 0;
  useEffect(() => { if (hasTray) requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true })); }, [hasTray]);

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
  const thread = useMemo(
    () =>
      (conversation?.messageIds ?? [])
        .map((mid) => pool.find((m) => m.id === mid))
        .filter((m): m is NonNullable<typeof m> => Boolean(m)),
    [conversation, pool],
  );

  // "Typing…": who else in this chat is typing right now. Heard straight from
  // their phone (nothing is stored); it lapses 4 seconds after the last word
  // of it, and their message arriving ends it at once.
  const [typing, setTyping] = useState<Record<string, number>>({});
  const typingLink = useRef<{ ping: () => void; off: () => void } | null>(null);
  useEffect(() => {
    if (!id || removed) return;
    setTyping({});
    const link = actions.watchTyping(id, (uid) => setTyping((t) => ({ ...t, [uid]: Date.now() })));
    typingLink.current = link;
    return () => { link.off(); typingLink.current = null; };
  }, [id, actions, removed]);
  useEffect(() => {
    if (!Object.keys(typing).length) return;
    const t = setInterval(() => setTyping((cur) => {
      const now = Date.now();
      const next = Object.fromEntries(Object.entries(cur).filter(([, at]) => now - at < 4000));
      return Object.keys(next).length === Object.keys(cur).length ? cur : next;
    }), 1000);
    return () => clearInterval(t);
  }, [typing]);
  const lastMessage = thread[thread.length - 1];
  // Your newest message's photos still going up: its line says "Sending…", not "Sent".
  const lastRealId = useMemo(() => [...thread].reverse().find((m) => m.kind !== 'system')?.id ?? '', [thread]);
  const lastSending = useSendProgress(lastRealId) !== null;
  useEffect(() => {
    if (!lastMessage) return;
    setTyping((cur) => { if (!cur[lastMessage.senderId]) return cur; const next = { ...cur }; delete next[lastMessage.senderId]; return next; });
  }, [lastMessage?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const typers = Object.keys(typing).filter((uid) => uid !== currentUserId && !blockedIds.includes(uid));
  // While you type, the others hear it every couple of seconds, never on every key.
  const lastPing = useRef(0);
  const pingTyping = (text: string) => {
    if (!text.trim()) return;
    const now = Date.now();
    if (now - lastPing.current > 2000) { lastPing.current = now; typingLink.current?.ping(); }
  };

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

  // Scrolling up to the top loads the page of messages before the oldest
  // here, like Instagram; the view stays on the message you were reading
  // instead of jumping. A small spinner shows at the top while it loads.
  const [olderLoading, setOlderLoading] = useState(false);
  const noMoreOlder = useRef(false);
  const scrollY = useRef(0);
  const contentHeight = useRef(0);
  const holdPlace = useRef<{ height: number; y: number } | null>(null);
  useEffect(() => { noMoreOlder.current = false; }, [id]);
  const loadOlder = async () => {
    if (olderLoading || noMoreOlder.current || !conversation || removed) return;
    setOlderLoading(true);
    holdPlace.current = { height: contentHeight.current, y: scrollY.current };
    const came = await actions.loadOlderMessages(conversation.id);
    if (came < MESSAGE_PAGE) noMoreOlder.current = true;
    setOlderLoading(false);
    // Nothing older came: nothing will grow, so the next new message scrolls down as usual.
    if (!came) holdPlace.current = null;
  };

  // "@" in a message offers people, following first, the same as a comment.
  // (These hooks sit above the early return below: a thread that loads a
  // moment after the page would otherwise change the hook count and crash.)
  const [caret, setCaret] = useState(0);
  // In a group, its own people come first: they are who you are talking to.
  const memberKey = conversation?.participantIds.join(',') ?? '';
  const memberIds = useMemo(() => (memberKey ? memberKey.split(',').filter((p) => p !== currentUserId) : []), [memberKey, currentUserId]);
  const candidatesFor = useMentionCandidates(group ? memberIds : undefined);
  // Voice notes: the mic sits where Send is while the box is empty.
  const voice = useVoiceRecorder();
  const sendRecording = async () => {
    const got = await voice.finish();
    if (got && conversation) { actions.sendVoice(conversation.id, got); requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true })); }
  };
  const startRecording = async () => {
    const result = await voice.start();
    if (result === 'denied') showToast({ title: 'Microphone is off for CourtSide', body: 'Turn it on in your phone’s Settings to send voice notes.', icon: 'mic-off-outline' });
    else if (result === 'failed') showToast({ title: 'Couldn’t start recording', body: 'Try again in a moment.', icon: 'alert-circle-outline' });
  };
  useEffect(() => { if (voice.recording && voice.elapsed >= VOICE_LIMIT_MS) void sendRecording(); }, [voice.elapsed]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const openMenu = (target: MenuTarget) => { if (!removed) setMenu(target); };
  const leaveGroup = () => confirm({
    title: 'Leave this group?',
    message: leaveGroupMessage(conversation, hitRequests, currentUserId),
    confirmLabel: 'Leave',
    destructive: true,
    onConfirm: () => { actions.leaveGroup(conversation.id); router.replace('/messages'); },
  });
  // The read line goes under your newest message (event lines aside): "Read"
  // or "Sent" in a one-to-one chat, "Seen by Mira, Dev" or "Seen by
  // everyone" in a group, counting only people who let read receipts show.
  const lastReal = [...thread].reverse().find((m) => m.kind !== 'system');
  const readLine = !typers.length && lastReal && lastReal.senderId === currentUserId && !lastReal.failed
    ? lastSending ? 'Sending…' : group
      ? seenByLabel(lastReal, conversation, users, currentUserId)
      : other && other.readReceiptsEnabled !== false && lastReal.readAtBy?.[other.id] ? 'Read' : 'Sent'
    : null;
  const firstName = (u?: User) => u?.name.trim().split(/\s+/)[0] ?? 'Someone';
  const faceOf = (uid: string) => users.find((u) => u.id === uid);
  // How far a court card or photos may reach across the chat: most of its
  // width (less the face beside others' messages in a group), so they never
  // run off the side of a small phone.
  const reach = (beside: boolean) => Math.floor((Math.min(700, winW) - spacing.lg * 2 - (beside ? FACE + spacing.sm : 0)) * 0.84);
  // An emoji goes in where the cursor is, and the cursor moves past it.
  const placeCaret = (at: number) => { setCaret(at); setTimeout(() => inputRef.current?.setNativeProps?.({ selection: { start: at, end: at } }), 0); };
  const insertEmoji = (emoji: string) => {
    const at = Math.min(caret, draft.length);
    setDraft(draft.slice(0, at) + emoji + draft.slice(at));
    placeCaret(at + emoji.length);
  };
  const deleteBack = () => {
    const at = Math.min(caret, draft.length);
    if (at === 0) return;
    const before = dropLastCharacter(draft.slice(0, at));
    setDraft(before + draft.slice(at));
    placeCaret(before.length);
  };
  // The emoji button swaps the phone keyboard for the emoji one and back.
  const toggleEmoji = () => {
    if (emojiOpen) { setEmojiOpen(false); inputRef.current?.focus(); return; }
    Keyboard.dismiss();
    setEmojiOpen(true);
  };
  const mention = activeMention(draft, caret);
  const mentionRows = mention ? candidatesFor(mention.query, 5) : [];
  const pickMention = (handle: string) => {
    if (!mention) return;
    const next = applyMention(draft, mention.start, caret, handle);
    setDraft(next.text);
    setCaret(next.caret);
    setTimeout(() => inputRef.current?.setNativeProps?.({ selection: { start: next.caret, end: next.caret } }), 0);
  };

  /*
   * The court and photo buttons. Each lets go of the box first, so the
   * keyboard goes down behind the sheet or picker as it rises, and stays
   * down when it closes. (Left focused, the phone put the keyboard back on
   * the way out, and the whole bar dropped and rose again.) The emoji
   * keyboard, being part of the page, simply stays open underneath: taking
   * it away would drop the bar in one jump.
   */
  const letGo = () => { inputRef.current?.blur(); Keyboard.dismiss(); };
  const openCourtPicker = () => {
    const go = () => router.push({ pathname: '/pick-court', params: { conversation: conversation.id } });
    if (Platform.OS === 'ios' && Keyboard.isVisible()) {
      // The sheet opens the moment the keyboard starts down, together with the
      // bar riding down with it (above). Opened any sooner, the chat stopped
      // making room for the keyboard before the keyboard knew it was going,
      // and the bar fell in one jump behind the sheet.
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
    const room = MAX_CHAT_PHOTOS - picked.length;
    if (room <= 0) { showToast({ title: `Up to ${MAX_CHAT_PHOTOS} photos at a time`, icon: 'images-outline' }); return; }
    letGo();
    // Straight from the tap: a browser only opens its file box from one.
    pickPhotos(room)
      .then((got) => { if (got?.length) setPicked((now) => [...now, ...got].slice(0, MAX_CHAT_PHOTOS)); })
      .catch((e: unknown) => showToast({ title: 'Couldn’t open your photos', body: e instanceof Error ? e.message : undefined, icon: 'alert-circle-outline' }));
  };

  const send = () => {
    const body = draft.trim();
    // Picked photos go with whatever is in the box as their caption.
    if (picked.length && !editing) {
      actions.sendPhotos(conversation.id, picked, body);
      setPicked([]);
      setDraft('');
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
      return;
    }
    if (!body) return;
    if (editing) {
      actions.editMessage(editing.id, body);
      setEditing(null);
      setDraft('');
      return;
    }
    actions.sendMessage(conversation.id, body);
    setDraft('');
    // Stay in the box so the next message can be typed straight away.
    inputRef.current?.focus();
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  return (
    // Only while the chat is the page in front: the court sheet's own search box
    // brings the keyboard up over it, and the bar here must not rise and fall under the sheet.
    <KeyboardAvoidingView style={[styles.root, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} enabled={focused}>
      {/* First, so everything else covers it: where the court cards' little maps are drawn. */}
      <CourtMapSnapshots />
      <Wash height={320} strength={0.7} />
      <View style={styles.header}>
        {/* Back to the inbox even when this chat was the first page opened (a link, a reload). */}
        <Pressable onPress={() => goBack('/messages')} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        {group || !other ? (
          // A group: its photo (or faces), its name and how many are in it; tapping opens its page.
          <Pressable style={styles.headerUser} accessibilityRole={removed ? undefined : 'button'} accessibilityLabel={removed ? title : `${title}, ${members} members. Group details`} disabled={removed} onPress={openDetails}>
            <GroupAvatar people={people} size={36} photoUrl={conversation.photoUrl} name={title} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.headerNameRow}>
                <Text style={[styles.headerName, styles.headerNameShrink]} numberOfLines={1}>{title}</Text>
                {muted ? <Ionicons name="notifications-off-outline" size={13} color={colors.textFaint} accessibilityLabel="Muted" /> : null}
              </View>
              {/* Taken out of it: the count is no longer yours to see (the note at the bottom says why). */}
              {!removed ? <Text style={styles.headerHandle}>{members === 1 ? 'Just you' : `${members} members`}</Text> : null}
            </View>
          </Pressable>
        ) : (
        <Pressable
          style={styles.headerUser}
          accessibilityRole="link"
          onPress={() => router.push(`/user/${other.id}`)}
        >
          <Avatar name={other.name} seed={other.avatarSeed} uri={other.avatarUrl} size={34} />
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <View style={styles.headerNameRow}>
              <PlayerName userId={other.id} style={styles.headerName}>{other.name}</PlayerName>
              {muted ? <Ionicons name="notifications-off-outline" size={13} color={colors.textFaint} accessibilityLabel="Muted" /> : null}
            </View>
            <PlayerName userId={other.id} style={styles.headerHandle}>@{other.handle}</PlayerName>
          </View>
        </Pressable>
        )}
        {/* Adding people, one tap from the chat itself (anyone in a group can), beside its details.
            Not on a full group: there would be nobody it could add. */}
        {group && !removed && members < GROUP_CAP ? (
          <Pressable onPress={openAddPeople} accessibilityRole="button" accessibilityLabel="Add people" hitSlop={10}>
            <Ionicons name="person-add-outline" size={22} color={colors.text} />
          </Pressable>
        ) : null}
        {!removed ? (
          <Pressable onPress={openDetails} accessibilityRole="button" accessibilityLabel={group ? 'Group details' : 'Chat details'} hitSlop={10}>
            <Ionicons name="information-circle-outline" size={24} color={colors.text} />
          </Pressable>
        ) : null}
      </View>

      {/* Swiping the messages to the left shows when each was sent (iMessage's way); see MessageTimes.
          Not while a message's menu or a photo is open over the chat. */}
      <TimeSwipeArea enabled={!menu && !viewing}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        onContentSizeChange={(_w, h) => {
          const hold = holdPlace.current;
          if (hold && h > hold.height) {
            // Older messages went in above: keep the same message in view.
            scrollRef.current?.scrollTo({ y: hold.y + (h - hold.height), animated: false });
            holdPlace.current = null;
          } else if (!hold) {
            scrollRef.current?.scrollToEnd({ animated: settled.current });
          }
          contentHeight.current = h;
        }}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
          if (settled.current && scrollY.current < 80) void loadOlder();
        }}
        scrollEventThrottle={64}
        keyboardShouldPersistTaps="handled"
      >
        {olderLoading ? (
          // Floats over the top of the chat, so it never pushes the messages around.
          <View pointerEvents="none" style={styles.olderSpinner}><ActivityIndicator size="small" color={colors.textMuted} /></View>
        ) : null}
        {thread.map((message, i) => {
          const mine = message.senderId === currentUserId;
          // A time line above the first message and after any quiet stretch,
          // as chats on Instagram and TikTok do.
          const prev = thread[i - 1];
          const stamp = !prev || Date.parse(message.createdAt) - Date.parse(prev.createdAt) > STAMP_GAP_MS
            ? <Text style={styles.stamp}>{chatStamp(message.createdAt)}</Text>
            : null;

          // An event line ("Mira added Dev", "You named the group…"): a quiet
          // centred sentence, worded for whoever reads it. Nobody sent it, so
          // it takes no reactions and no menu.
          if (message.kind === 'system') {
            return (
              <React.Fragment key={message.id}>
                {stamp}
                <Text style={styles.event}>{eventText(message, users, currentUserId)}</Text>
              </React.Fragment>
            );
          }

          const next = thread[i + 1];
          // An event line breaks a run, the way a time line does.
          const runsOn = (a?: Message, b?: Message) => !!a && !!b && a.kind !== 'system' && b.kind !== 'system' && a.senderId === b.senderId && Date.parse(b.createdAt) - Date.parse(a.createdAt) <= GROUP_GAP_MS;
          // In a run only the last bubble keeps its tail, and the gap between them closes up.
          const inRun = runsOn(prev, message) && !stamp;
          const lastOfRun = !runsOn(message, next);
          // A new message rises out of the composer and settles with a small spring.
          const arrive = settled.current ? FadeInUp.duration(150).easing(Easing.out(Easing.cubic)) : undefined;
          // Under your newest message: "Read" / "Sent", or "Seen by …" in a group.
          const readUnder = readLine && message.id === lastReal?.id
            ? <Text accessibilityLiveRegion="polite" style={styles.timestamp}>{readLine}</Text>
            : null;

          // In a group, others' messages carry who sent them: a face by the
          // last bubble of each run, a name over the first. Both open their profile.
          const gutter = group && !mine;
          const sender = gutter ? faceOf(message.senderId) : undefined;
          const leading = !gutter ? undefined : lastOfRun && sender ? (
            <Pressable accessibilityRole="link" accessibilityLabel={`${sender.name}'s profile`} hitSlop={4} onPress={() => router.push(`/user/${sender.id}`)}>
              <Avatar name={sender.name} seed={sender.avatarSeed} uri={sender.avatarUrl} size={FACE} />
            </Pressable>
          ) : <View style={styles.faceSpace} />;

          // From someone you blocked: folded to one quiet line per run, until you choose to see it.
          if (gutter && blockedIds.includes(message.senderId) && !shownIds.includes(message.id)) {
            if (inRun && prev && !shownIds.includes(prev.id)) return null;
            const run = [message.id];
            for (let j = i + 1; j < thread.length && runsOn(thread[j - 1], thread[j]); j += 1) run.push(thread[j].id);
            return (
              <React.Fragment key={message.id}>
                {stamp}
                <Row mine={false} inRun={false} arrive={arrive} leading={<View style={styles.faceSpace} />} styles={styles}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${run.length === 1 ? 'A message' : `${run.length} messages`} from someone you blocked. Show`}
                    onPress={() => setShownIds((s) => [...s, ...run])}
                    style={({ pressed }) => [styles.folded, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons name="eye-off-outline" size={14} color={colors.textFaint} />
                    <Text style={styles.foldedText}>
                      {run.length === 1 ? 'Message' : `${run.length} messages`} from someone you blocked · <Text style={styles.foldedShow}>Show</Text>
                    </Text>
                  </Pressable>
                </Row>
              </React.Fragment>
            );
          }

          const who = gutter && !inRun ? (
            <Pressable accessibilityRole="link" disabled={!sender} onPress={() => sender && router.push(`/user/${sender.id}`)} style={styles.senderLink}>
              <Text style={[styles.sender, styles.senderBeside]}>{firstName(sender)}</Text>
            </Pressable>
          ) : null;
          // When it was sent: shown at the right edge when the chat is swiped to the left.
          const sentAt = chatTime(message.createdAt);

          let body: React.ReactNode;
          if (message.kind === 'voice' && message.audio) {
            body = (
              <>
                <Row mine={mine} inRun={inRun} arrive={arrive} leading={leading} styles={styles} time={sentAt}>
                  <TimeAnchor style={{ opacity: message.failed ? 0.5 : 1 }}><VoiceNote url={message.audio.url} ms={message.audio.ms} mine={mine} sentAt={sentAt} /></TimeAnchor>
                </Row>
                {message.failed ? <Slide mine><Text style={[styles.sender, { alignSelf: 'flex-end', marginRight: spacing.lg, color: colors.danger }]}>Not sent</Text></Slide> : null}
              </>
            );
          } else if (message.kind === 'court' && message.place) {
            // A court: a still map of the spot, its name and where it is; the whole card opens the court's page.
            const place = message.place;
            const card = { place, width: Math.min(COURT_CARD_W, reach(gutter)), mine, tail: lastOfRun, from: detectedCoords ?? currentUser?.cityAt ?? null, sentAt };
            body = (
              <>
                <Row mine={mine} inRun={inRun} arrive={arrive} leading={leading} styles={styles} time={sentAt}>
                  {/* Held, the menu draws it lifted and bright above the dimmed chat, so this one steps out of sight. */}
                  <HoldArea onHold={(rect) => openMenu({ message, mine, rect, copy: <CourtCard {...card} onPress={() => {}} /> })} style={[styles.cardArea, menu?.message.id === message.id && styles.heldAway]}>
                    {(hold) => (
                      <CourtCard
                        {...card}
                        onPress={() => openCourt({ id: place.id, name: place.name, lat: place.lat, lng: place.lng })}
                        onLongPress={hold}
                      />
                    )}
                  </HoldArea>
                </Row>
                {message.failed ? (
                  <Slide mine>
                    <Pressable accessibilityRole="button" accessibilityLabel="Not sent. Tap to try again" onPress={() => actions.retryMessage(message.id)} hitSlop={8} style={styles.notSentWrap}>
                      <Text style={[styles.edited, styles.notSent]}>Not sent · Tap to retry</Text>
                    </Pressable>
                  </Slide>
                ) : null}
              </>
            );
          } else if (message.kind === 'photo' && message.photos?.length) {
            body = (
              <PhotoMessage
                message={message}
                mine={mine}
                inRun={inRun}
                tail={lastOfRun}
                arrive={arrive}
                leading={leading}
                styles={styles}
                me={currentUserId}
                time={sentAt}
                width={Math.min(PHOTO_W, reach(gutter))}
                held={menu?.message.id === message.id}
                onHold={(rect, copy) => openMenu({ message, mine, rect, copy })}
                onReact={(emoji) => { if (!removed) actions.reactToMessage(message.id, emoji); }}
                onRetry={() => actions.retryMessage(message.id)}
                onOpen={(index, rects) => { Keyboard.dismiss(); setViewing({ message, index, rects }); }}
              />
            );
          } else if (message.kind === 'hit-request') {
            // A "Looking for a hit" post sent into the chat: when, where, how
            // many spots are left; it opens the hit. Once it is gone (called
            // off, or over), the card says so.
            const hit = hitRequests.find((h) => h.id === message.sharedId && !h.cancelled);
            const left = hit ? Math.max(0, hit.spots - hit.joinedIds.length) : 0;
            body = (
              <Row mine={mine} inRun={inRun} arrive={arrive} leading={leading} styles={styles} time={sentAt}>
                <HoldArea onHold={(rect) => openMenu({ message, mine, rect })} style={styles.sharedCardArea}>
                  {(hold) => (
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
                  )}
                </HoldArea>
              </Row>
            );
          } else if (message.kind === 'group' && message.sharedId) {
            // A group invite (Start a group's last step): the group's face and name; it opens the group's page.
            const groupId = message.sharedId;
            body = (
              <Row mine={mine} inRun={inRun} arrive={arrive} leading={leading} styles={styles} time={sentAt}>
                <HoldArea onHold={(rect) => openMenu({ message, mine, rect })} style={styles.sharedCardArea}>
                  {(hold) => <GroupInviteCard groupId={groupId} words={message.body} sentAt={sentAt} onLongPress={hold} />}
                </HoldArea>
              </Row>
            );
          } else if (message.kind !== 'text' && message.sharedId) {
            const shared =
              message.kind === 'profile' ? users.find(u=>u.id===message.sharedId) : message.kind === 'post'
                ? posts.find((p) => p.id === message.sharedId)
                : questions.find((q) => q.id === message.sharedId);
            const label = shared
              ? message.kind === 'profile' ? (shared as {name:string}).name : message.kind === 'post'
                ? (shared as { body: string }).body
                : (shared as { title: string }).title
              : 'This item was removed';
            body = (
              <Row mine={mine} inRun={inRun} arrive={arrive} leading={leading} styles={styles} time={sentAt}>
              <HoldArea onHold={(rect) => openMenu({ message, mine, rect })} style={styles.sharedCardArea}>
              {(hold) => (
              <Tappable
                accessibilityRole="link"
                accessibilityLabel={`${message.kind === 'profile' ? 'Profile' : message.kind === 'post' ? 'Clip' : 'Discussion'}: ${label}, sent ${sentAt}`}
                scaleTo={0.97}
                onLongPress={hold}
                onPress={() =>
                  shared
                    ? router.push(
                        message.kind === 'profile' ? `/user/${message.sharedId}` : message.kind === 'post'
                          ? `/post/${message.sharedId}`
                          : `/question/${message.sharedId}`,
                      )
                    : undefined
                }
                style={styles.sharedCard}
              >
                <View style={styles.sharedHead}>
                  <Ionicons
                    name={message.kind === 'profile' ? 'person-outline' : message.kind === 'post' ? 'play-circle-outline' : 'chatbubbles-outline'}
                    size={16}
                    color={colors.brand}
                  />
                  <Text style={styles.sharedKind}>
                    {message.kind === 'profile' ? 'Profile' : message.kind === 'post' ? 'Clip' : 'Discussion'}
                  </Text>
                </View>
                <Text numberOfLines={3} style={styles.sharedBody}>
                  {label}
                </Text>
              </Tappable>
              )}
              </HoldArea>
              </Row>
            );
          } else {
            body = (
              <Bubble
                message={message}
                mine={mine}
                inRun={inRun}
                tail={lastOfRun}
                arrive={arrive}
                leading={leading}
                styles={styles}
                me={currentUserId}
                time={sentAt}
                held={menu?.message.id === message.id}
                onHold={(rect) => openMenu({ message, mine, rect })}
                onReact={(emoji) => { if (!removed) actions.reactToMessage(message.id, emoji); }}
                onRetry={() => actions.retryMessage(message.id)}
              />
            );
          }

          return (
            <React.Fragment key={message.id}>
            {stamp}
            {who}
            {body}
            {readUnder}
            </React.Fragment>
          );
        })}
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
      </ScrollView>
      </TimeSwipeArea>

      {menu ? (
        <MessageMenu
          target={menu}
          me={currentUserId}
          styles={styles}
          onClose={() => setMenu(null)}
          onReact={(emoji) => actions.reactToMessage(menu.message.id, emoji)}
          onCopy={() => { void Clipboard.setStringAsync(menu.message.body); haptics.tap(); showToast({ title: 'Copied', icon: 'copy-outline' }); }}
          onEdit={() => { setEditing(menu.message); setDraft(menu.message.body); setCaret(menu.message.body.length); setTimeout(() => inputRef.current?.focus(), 60); }}
          // Both ask first; the card comes over the closing menu.
          onUnsend={() => { const messageId = menu.message.id; confirmAfterMenu({ title: 'Unsend message?', message: "It's removed for everyone in the chat.", confirmLabel: 'Unsend', destructive: true, onConfirm: () => actions.unsendMessage(messageId) }); }}
          onDelete={() => { const messageId = menu.message.id; confirmAfterMenu({ title: 'Delete message?', message: menu.mine ? "It's removed for you. Others in the chat still see it." : "It's removed for you only.", confirmLabel: 'Delete', destructive: true, onConfirm: () => actions.deleteMessageForMe(messageId) }); }}
          // The Send-to sheet, once the menu has gone: pick chats (groups too) and it goes to each as it is.
          onForward={() => { const messageId = menu.message.id; afterMenu(() => router.push({ pathname: '/share', params: { kind: 'message', id: messageId } })); }}
          doubleTap={defaultReaction}
          onDoubleTap={(emoji) => { actions.setDefaultReaction(emoji); showToast({ title: `Double tap now leaves ${emoji}`, icon: 'heart-outline' }); }}
        />
      ) : null}

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

      {editing ? (
        <View style={styles.editBar}>
          <Ionicons name="create-outline" size={16} color={colors.brand} />
          <Text style={styles.editLabel} numberOfLines={1}>Editing message</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Stop editing" hitSlop={10} onPress={() => { setEditing(null); setDraft(''); }}>
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {mention && mentionRows.length ? (
        <View style={styles.mentionTray}>
          <MentionSuggestions candidates={mentionRows} onPick={pickMention} />
        </View>
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
        <View style={[styles.blockedNote, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Ionicons name="people-outline" size={15} color={colors.textMuted} />
          <Text style={styles.blockedNoteText}>You’re no longer in this group</Text>
        </View>
      ) : blockedHere ? (
        <View style={[styles.blockedNote, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Ionicons name="lock-closed-outline" size={15} color={colors.textMuted} />
          <Text style={styles.blockedNoteText}>{group ? 'You can’t send messages in this group.' : "You can't message this account."}</Text>
        </View>
      ) : (
      voice.recording ? (
      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.md) + keyboardInset }]}>
        <Tappable accessibilityLabel="Throw the recording away" onPress={() => { void voice.finish(); }} style={styles.emojiToggle}>
          <Ionicons name="trash-outline" size={22} color={colors.danger} />
        </Tappable>
        <View style={styles.recording}>
          <View style={styles.recDot} />
          <Text style={styles.recText}>Recording · {clock(voice.elapsed)}</Text>
        </View>
        <Tappable immediate onPress={() => { void sendRecording(); }} accessibilityLabel="Send voice note" style={styles.send}>
          <BrandWash />
          <Ionicons name="arrow-up" size={19} color={colors.brandInk} />
        </Tappable>
      </View>
      ) : (
      <>
      {picked.length ? (
        <View style={styles.trayWrap}>
          <PhotoTray photos={picked} max={MAX_CHAT_PHOTOS} onRemove={(i) => setPicked((now) => now.filter((_, j) => j !== i))} onAdd={choosePhotos} />
        </View>
      ) : null}
      <View style={[styles.composer, picked.length ? styles.composerUnderTray : null, { paddingBottom: emojiOpen ? spacing.sm : Math.max(insets.bottom, spacing.md) + keyboardInset }]}>
        {/* The tools sit still: a press only dims them, nothing moves or grows. */}
        <ComposerTool label={emojiOpen ? 'Show the keyboard' : 'Add an emoji'} onPress={toggleEmoji} styles={styles}>
          {emojiOpen && !desktopWeb
            ? <KeyboardGlyph size={24} color={colors.textMuted} />
            : <Ionicons name={emojiOpen ? 'happy' : 'happy-outline'} size={23} color={emojiOpen ? colors.brand : colors.textMuted} />}
        </ComposerTool>
        {photosOn === 'on' ? (
          <ComposerTool label="Send photos" onPress={choosePhotos} disabled={!!editing} styles={styles}>
            <Ionicons name="image-outline" size={23} color={colors.textMuted} />
          </ComposerTool>
        ) : photosOn === 'unknown' ? (
          // Its room is kept while the server is asked (first start only), so the court button never moves.
          <View style={styles.tool} />
        ) : null}
        <ComposerTool label="Send a court" onPress={openCourtPicker} disabled={!!editing} styles={styles}>
          <Ionicons name="location-outline" size={23} color={colors.textMuted} />
        </ComposerTool>
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={(text) => { setDraft(text); setCaret((c) => c + (text.length - draft.length)); pingTyping(text); }}
          onSelectionChange={(e) => setCaret(e.nativeEvent.selection.end)}
          // Tapping into the words brings the phone keyboard back in the emoji keyboard's place.
          onFocus={() => { if (emojiOpen && !desktopWeb) setEmojiOpen(false); }}
          placeholder={picked.length ? 'Add a caption…' : 'Message…'}
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          onSubmitEditing={send}
          // Without this the field blurs on submit and every message needs a fresh click.
          blurOnSubmit={false}
          submitBehavior="submit"
          returnKeyType="send"
          accessibilityLabel="Message text"
        />
        {!draft.trim() && !editing && !picked.length ? (
          <Tappable immediate onPress={() => { void startRecording(); }} accessibilityLabel="Record a voice note" style={styles.mic}>
            <Ionicons name="mic-outline" size={21} color={colors.text} />
          </Tappable>
        ) : <SendButton ready={(!!picked.length && !editing) || (!!draft.trim() && (!editing || draft.trim() !== editing.body))} editing={!!editing} onPress={send} styles={styles} />}
      </View>
      {emojiOpen ? <EmojiKeyboard height={keyboardHeight.current} bottomInset={insets.bottom} onPick={insertEmoji} onDelete={deleteBack} /> : null}
      </>
      ))}
    </KeyboardAvoidingView>
  );
}

/** "Dev", "Dev and June", "Dev, June and Mira", "Dev, June and 2 others". */
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

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
}

/**
 * One message's line across the chat: yours on the right, theirs on the
 * left. In a group, theirs carries `leading` (the sender's face, or an empty
 * space the same size) beside the message, the face lined up with its bottom.
 * The line slides left when the chat is swiped for its times, and `time`
 * (when it was sent) comes into view at the right edge as it does.
 */
function Row({ mine, inRun, arrive, leading, styles, time, children }: {
  mine: boolean; inRun: boolean; arrive?: FadeInUp; leading?: React.ReactNode; styles: any; time?: string; children: React.ReactNode;
}) {
  return (
    <Reanimated.View entering={arrive} layout={LinearTransition.duration(120)} style={[styles.row, inRun && styles.inRun]}>
      <Slide time={time} mine={mine} style={[styles.row, mine ? styles.rowMine : styles.rowTheirs, leading !== undefined && styles.rowFace]}>
        {leading !== undefined ? (
          <>
            {leading}
            <View style={styles.faceColumn}>{children}</View>
          </>
        ) : children}
      </Slide>
    </Reanimated.View>
  );
}

/**
 * One text message.
 *
 * Double tap leaves your default reaction; a long press opens the picker for a
 * different one. Reactions sit under the bubble and are tappable to remove.
 */
function Bubble({ message, mine, inRun, tail, arrive, leading, styles, me, time, held = false, onHold, onReact, onRetry }: {
  message: Message; mine: boolean; inRun: boolean; tail: boolean; arrive?: FadeInUp; styles: any; me: string | null;
  /** When it was sent ("9:41 AM"), for the swipe that shows it. */
  time: string;
  /** In a group, the sender's face (or its empty space) beside their message. */
  leading?: React.ReactNode;
  /** Its menu is open: the lifted copy stands in for it, so it steps out of sight. */
  held?: boolean;
  onHold: (rect: Rect) => void; onReact: (emoji?: string) => void; onRetry?: () => void;
}) {
  const tap = useDoubleTap(() => onReact());
  const reactions = message.reactions ?? {};
  const mineMark = me ? reactions[me] : undefined;

  // Collapse to one chip per emoji with a count.
  const tally = Object.values(reactions).reduce<Record<string, number>>((acc, emoji) => {
    acc[emoji] = (acc[emoji] ?? 0) + 1;
    return acc;
  }, {});

  const reacted = Object.keys(tally).length > 0;

  return (
    // The row spans the chat, so the bubble's width limit is a share of the
    // chat itself. (A row that shrank to fit its text made that limit a share
    // of the text's own width, and short messages broke onto a second line.)
    <Row mine={mine} inRun={inRun} arrive={arrive} leading={leading} styles={styles} time={time}>
      {/* The chip is anchored to the bubble, not the row, so it sits on the
          bubble's bottom inner corner however wide the message is. */}
      <HoldArea onHold={onHold} style={[styles.bubbleWrap, reacted && styles.bubbleWrapReacted, held && { opacity: 0 }]}>
        {(hold) => (
          <>
            <Pressable
              onPress={tap}
              onLongPress={hold}
              delayLongPress={320}
              accessibilityRole="button"
              accessibilityLabel={`Message: ${message.body}, sent ${time}. Double tap to react, hold for more.`}
              style={[styles.bubble, mine ? styles.mine : styles.theirs, !tail && styles.noTail]}
            >
              <RichText style={[styles.bubbleText, mine && { color: colors.brandInk }]} mentionStyle={mine ? { color: colors.brandInk, textDecorationLine: 'underline' } : undefined}>{message.body}</RichText>
            </Pressable>

            {reacted ? (
              // Instagram placement: tucked over the bottom corner that faces the
              // other person — bottom-left on yours, bottom-right on theirs.
              <View style={[styles.reactions, mine ? styles.reactionsMine : styles.reactionsTheirs]}>
                {Object.entries(tally).map(([emoji, count]) => (
                  <ReactionChip
                    key={emoji}
                    emoji={emoji}
                    count={count}
                    mine={mineMark === emoji}
                    onPress={() => onReact(emoji)}
                    style={[styles.chip, mineMark === emoji && styles.chipMine]}
                  />
                ))}
              </View>
            ) : null}
          </>
        )}
      </HoldArea>
      {message.editedAt ? <Text style={styles.edited}>Edited</Text> : null}
      {message.failed ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Not sent. Tap to try again" onPress={onRetry} hitSlop={8}>
          <Text style={[styles.edited, { color: colors.danger }]}>Not sent · Tap to retry</Text>
        </Pressable>
      ) : null}
    </Row>
  );
}

/**
 * A photo message: the photos (one at its own shape, several in a grid),
 * then the caption in a bubble of its own under them, as iMessage does. A
 * tap opens a photo full screen; a double tap leaves your reaction, as on a
 * message; a hold opens the menu. While the photos go up, a ring fills over
 * them; one that did not go offers a retry.
 */
function PhotoMessage({ message, mine, inRun, tail, arrive, leading, styles, me, time, width, held = false, onHold, onReact, onRetry, onOpen }: {
  message: Message; mine: boolean; inRun: boolean; tail: boolean; arrive?: FadeInUp; leading?: React.ReactNode; styles: any; me: string | null;
  /** When it was sent ("9:41 AM"), for the swipe that shows it. */
  time: string;
  /** How wide the photos sit (narrower on a small phone, and beside a face in a group). */
  width: number;
  /** Its menu is open: the lifted copy stands in for it, so it steps out of sight. */
  held?: boolean;
  /** A hold: where it sits, and the copy the menu lifts above the dimmed chat. */
  onHold: (rect: Rect, copy: React.ReactNode) => void; onReact: (emoji?: string) => void; onRetry: () => void; onOpen: (index: number, rects: (TileRect | undefined)[]) => void;
}) {
  const progress = useSendProgress(message.id);
  // A single tap waits out the double-tap window, so a double tap never opens the photo too.
  const tapped = useRef<{ index: number; rects: (TileRect | undefined)[] }>({ index: 0, rects: [] });
  const tap = useDoubleTap(() => onReact(), () => onOpen(tapped.current.index, tapped.current.rects));
  // The caption answers like any message: a double tap leaves your reaction.
  const captionTap = useDoubleTap(() => onReact());
  const reactions = message.reactions ?? {};
  const mineMark = me ? reactions[me] : undefined;
  const tally = Object.values(reactions).reduce<Record<string, number>>((acc, emoji) => { acc[emoji] = (acc[emoji] ?? 0) + 1; return acc; }, {});
  const reacted = Object.keys(tally).length > 0;
  const caption = message.body.trim();
  const photos = message.photos ?? [];
  const captionStyle = [styles.bubble, mine ? styles.mine : styles.theirs, styles.caption, !tail && styles.noTail];
  const captionText = <RichText style={[styles.bubbleText, mine && { color: colors.brandInk }]} mentionStyle={mine ? { color: colors.brandInk, textDecorationLine: 'underline' } : undefined}>{caption}</RichText>;
  // What the menu lifts while it is held: the same photos and caption, bright, taking no taps.
  const copy = (
    <View style={mine ? styles.mineAlign : styles.theirsAlign}>
      <PhotoStack photos={photos} width={width} mine={mine} tail={tail && !caption} progress={null} idKey={message.id} onTile={() => {}} />
      {caption ? <View style={captionStyle}>{captionText}</View> : null}
    </View>
  );
  return (
    <Row mine={mine} inRun={inRun} arrive={arrive} leading={leading} styles={styles} time={time}>
      <HoldArea onHold={(rect) => onHold(rect, copy)} style={[styles.photoWrap, mine ? styles.mineAlign : styles.theirsAlign, reacted && styles.bubbleWrapReacted, held && styles.heldAway]}>
        {(hold) => (
          <>
            <View style={{ opacity: message.failed ? 0.6 : 1 }}>
              <PhotoStack
                photos={photos}
                width={width}
                mine={mine}
                tail={tail && !caption}
                progress={progress}
                failed={message.failed}
                idKey={message.id}
                sentAt={time}
                onTile={(index, rects) => { tapped.current = { index, rects }; tap(); }}
                onHold={hold}
              />
            </View>
            {caption ? (
              <Pressable onPress={captionTap} onLongPress={hold} delayLongPress={320} accessibilityRole="button" accessibilityLabel={`Caption: ${caption}, sent ${time}. Double tap to react, hold for more.`} style={captionStyle}>
                {captionText}
              </Pressable>
            ) : null}
            {reacted ? (
              <View style={[styles.reactions, mine ? styles.reactionsMine : styles.reactionsTheirs]}>
                {Object.entries(tally).map(([emoji, count]) => (
                  <ReactionChip key={emoji} emoji={emoji} count={count} mine={mineMark === emoji} onPress={() => onReact(emoji)} style={[styles.chip, mineMark === emoji && styles.chipMine]} />
                ))}
              </View>
            ) : null}
          </>
        )}
      </HoldArea>
      {message.editedAt ? <Text style={styles.edited}>Edited</Text> : null}
      {message.failed && progress === null ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Not sent. Tap to try again" onPress={onRetry} hitSlop={8}>
          <Text style={[styles.edited, styles.notSent]}>Not sent · Tap to retry</Text>
        </Pressable>
      ) : null}
    </Row>
  );
}

/**
 * A tool beside the message box (emoji, photos, court). A press only dims
 * it, the way iOS's own bar buttons answer: no dip, no spring, so the bar
 * stays perfectly still while a sheet or the photo picker opens over it.
 */
function ComposerTool({ label, onPress, disabled = false, styles, children }: { label: string; onPress: () => void; disabled?: boolean; styles: any; children: React.ReactNode }) {
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
 * Wraps a message so a hold can tell the menu exactly where the message sits
 * on screen (and its row where to line up the time a swipe shows).
 */
function HoldArea({ onHold, style, children }: { onHold: (rect: Rect) => void; style?: any; children: (hold: () => void) => React.ReactNode }) {
  const ref = useRef<View>(null);
  const hold = () => {
    haptics.tap();
    ref.current?.measureInWindow((x, y, w, h) => onHold({ x, y, w, h }));
  };
  return <TimeAnchor ref={ref} style={style}>{children(hold)}</TimeAnchor>;
}

/**
 * What a held message offers, the way iMessage and Instagram show it: the
 * chat dims, the message stays lifted where it was, the reactions sit above
 * it and the actions below. Your own message: Copy, Edit, Forward, Unsend,
 * Delete. Theirs: Copy, Forward and Delete. Delete only takes it out of your
 * own view; Forward opens the Send-to sheet.
 */
function MessageMenu({ target, me, styles, onClose, onReact, onCopy, onEdit, onForward, onUnsend, onDelete, doubleTap, onDoubleTap }: {
  target: MenuTarget; me: string | null; styles: any;
  onClose: () => void; onReact: (emoji: string) => void; onCopy: () => void; onEdit: () => void; onForward: () => void; onUnsend: () => void; onDelete: () => void;
  /** The reaction a double tap leaves, and how to change it: the last row turns the reactions above into that choice. */
  doubleTap: string; onDoubleTap: (emoji: string) => void;
}) {
  const [choosing, setChoosing] = useState(false);
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { message, mine, rect } = target;
  const text = message.kind === 'text';
  // A photo's caption can be copied like any message's words.
  const caption = message.kind === 'photo' && !!message.body.trim();
  const actions = [
    ...(text || caption ? [{ key: 'copy', label: caption ? 'Copy caption' : 'Copy', icon: 'copy-outline' as const, run: onCopy }] : []),
    ...(mine && text ? [{ key: 'edit', label: 'Edit', icon: 'create-outline' as const, run: onEdit }] : []),
    // Anything anyone sent can go on to other chats; an event line ("Mira added Dev") is not a message,
    // and photos stay on their own chat's private shelf.
    ...(message.kind !== 'system' && message.kind !== 'photo' ? [{ key: 'forward', label: 'Forward', icon: 'arrow-redo-outline' as const, run: onForward }] : []),
    ...(mine ? [{ key: 'unsend', label: 'Unsend', icon: 'arrow-undo-outline' as const, run: onUnsend }] : []),
    { key: 'delete', label: mine ? 'Delete for you' : 'Delete', icon: 'trash-outline' as const, run: onDelete, danger: true },
  ];
  const rows = actions.length + 1;
  const ROW = 46, CARD_W = 220, BAR_H = 46, GAP = 8;
  const cardH = rows * ROW;
  // Reactions above, the message, the actions below; the group slides up or
  // down as one if it would run off the screen, the way iMessage does.
  const top = rect.y - BAR_H - GAP;
  const bottom = rect.y + rect.h + GAP + cardH;
  const floor = H - insets.bottom - 12;
  const ceiling = insets.top + 12;
  let shift = 0;
  if (bottom > floor) shift = bottom - floor;
  if (top - shift < ceiling) shift = top - ceiling;
  const side = (w: number) => (mine ? { left: Math.max(12, Math.min(W - w - 12, rect.x + rect.w - w)) } : { left: Math.max(12, Math.min(W - w - 12, rect.x)) });
  const mark = me ? message.reactions?.[me] : undefined;
  const pick = (run: () => void) => { onClose(); run(); };
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Reanimated.View entering={FadeIn.duration(140)} style={StyleSheet.absoluteFill}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose} style={[StyleSheet.absoluteFill, styles.menuBackdrop]} />
        {target.copy ? (
          // Photos and court cards stay bright above the dimmed chat, lifted where they were, as iMessage keeps a held photo.
          <View pointerEvents="none" style={[styles.liftedCopy, { position: 'absolute', left: rect.x, top: rect.y - shift, width: rect.w }]}>
            {target.copy}
          </View>
        ) : message.kind === 'text' ? (
          <View pointerEvents="none" style={[styles.bubble, mine ? styles.mine : styles.theirs, styles.lifted, { position: 'absolute', left: rect.x, top: rect.y - shift, width: rect.w, alignSelf: 'auto' }]}>
            <RichText style={[styles.bubbleText, mine && { color: colors.brandInk }]}>{message.body}</RichText>
          </View>
        ) : null}
        <Reanimated.View entering={FadeInDown.duration(160).easing(Easing.out(Easing.cubic))} style={[styles.menuReactions, { top: top - shift, height: BAR_H }, side(REACTIONS.length * 38 + 12)]}>
          {REACTIONS.map((emoji) => (
            <Pressable
              key={emoji}
              accessibilityRole="button"
              accessibilityLabel={choosing ? `Double tap leaves ${emoji}` : `React with ${emoji}`}
              onPress={() => pick(() => (choosing ? onDoubleTap(emoji) : onReact(emoji)))}
              style={[styles.menuReaction, (choosing ? doubleTap === emoji : mark === emoji) && styles.menuReactionOn]}
            >
              <Text style={{ fontSize: 22 }}>{emoji}</Text>
            </Pressable>
          ))}
        </Reanimated.View>
        {choosing ? (
          <Reanimated.View entering={FadeIn.duration(140)} pointerEvents="none" style={[styles.menuHint, { top: top - shift - 30 }, side(REACTIONS.length * 38 + 12)]}>
            <Text style={styles.menuHintText}>Pick what a double tap leaves</Text>
          </Reanimated.View>
        ) : null}
        <Reanimated.View entering={FadeInUp.duration(160).easing(Easing.out(Easing.cubic))} style={[styles.menuCard, { top: rect.y + rect.h + GAP - shift, width: CARD_W }, side(CARD_W)]}>
          {actions.map((a, i) => (
            <Pressable key={a.key} accessibilityRole="button" onPress={() => pick(a.run)} style={({ pressed }) => [styles.menuRow, i > 0 && styles.menuRowRule, pressed && styles.menuRowPressed]}>
              <Text style={[styles.menuLabel, a.danger && { color: colors.danger }]}>{a.label}</Text>
              <Ionicons name={a.icon} size={19} color={a.danger ? colors.danger : colors.text} />
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" accessibilityLabel={`Double tap leaves ${doubleTap}. Change it`} accessibilityState={{ selected: choosing }} onPress={() => { haptics.tap(); setChoosing((c) => !c); }} style={({ pressed }) => [styles.menuRow, styles.menuRowRule, (pressed || choosing) && styles.menuRowPressed]}>
            <Text style={styles.menuLabel}>Double tap</Text>
            <Text style={{ fontSize: 19 }}>{doubleTap}</Text>
          </Pressable>
        </Reanimated.View>
      </Reanimated.View>
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
    if (chars.length && chars[chars.length - 1] === '\u200d') { chars.pop(); continue; }
    break;
  }
  return chars.join('');
}

/** Offered on a long press. Small on purpose — a wall of emoji slows the choice. */
const REACTIONS = ['❤️', '😂', '🔥', '👏', '😮', '😢', '👍', '🎾'];


/** The send arrow: dim and small with nothing to send, springing up to full size as you type. */
function SendButton({ ready, editing = false, onPress, styles }: { ready: boolean; editing?: boolean; onPress: () => void; styles: any }) {
  const on = useSharedValue(ready ? 1 : 0);
  useEffect(() => { on.value = ready ? withSpring(1, { damping: 14, stiffness: 260 }) : withTiming(0, { duration: 160 }); }, [ready, on]);
  const style = useAnimatedStyle(() => ({ opacity: 0.4 + 0.6 * on.value, transform: [{ scale: 0.86 + 0.14 * on.value }] }));
  return (
    <Reanimated.View style={style}>
      <Tappable immediate onPress={onPress} disabled={!ready} accessibilityLabel={editing ? 'Save edit' : 'Send message'} style={[styles.send]}>
        <BrandWash />
        <Ionicons name={editing ? 'checkmark' : 'arrow-up'} size={19} color={colors.brandInk} />
      </Tappable>
    </Reanimated.View>
  );
}

/** A reaction that springs in when it lands, then sits still. */
function ReactionChip({ emoji, count, mine, onPress, style }: {
  emoji: string; count: number; mine: boolean; onPress: () => void; style: any;
}) {
  const scale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 12 }).start();
  }, [scale]);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable onPress={onPress} accessibilityRole="button"
        accessibilityLabel={`${emoji} ${count}${mine ? ', yours' : ''}`} style={style}>
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
    <Reanimated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(150)} style={styles.typingWrap} accessibilityLiveRegion="polite" accessibilityLabel={label ?? 'Typing'}>
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
  blockedNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  blockedNoteText: { ...typography.small, color: colors.textMuted },
  olderSpinner: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerUser: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minWidth: 0 },
  headerName: { ...typography.bodyStrong, ...font('500'), fontSize: 16, color: colors.text },
  headerNameShrink: { flexShrink: 1 },
  headerHandle: { ...typography.small, color: colors.textMuted },
  scroll: { flex: 1 },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.sm,
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
    // A short conversation should rest on the composer, not hang from the top.
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  bubble: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
  },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.brand, borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 6 },
  typingWrap: { alignSelf: 'flex-start', marginTop: 4, gap: 3 },
  typingWho: { ...typography.caption, letterSpacing: 0, color: colors.textFaint, paddingLeft: 4 },
  typingWhoBeside: { paddingLeft: FACE + spacing.sm + 4 },
  typingRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 14, paddingHorizontal: 16 },
  typingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.textMuted },
  bubbleText: { ...typography.body, color: colors.text, lineHeight: 21 },
  bubbleWrap: { maxWidth: '78%' },
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
  lifted: { transform: [{ scale: 1.03 }], shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  // A held photo or court card only lifts: a shadow on its see-through frame drew a box around it in a browser.
  liftedCopy: { transform: [{ scale: 1.03 }] },
  menuReactions: { position: 'absolute', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, borderRadius: radius.pill, backgroundColor: colors.bgElevated, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } },
  menuReaction: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  menuReactionOn: { backgroundColor: colors.brandDim },
  menuHint: { position: 'absolute', alignItems: 'center' },
  menuHintText: { ...typography.smallStrong, color: 'white', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.55)', overflow: 'hidden' },
  menuCard: { position: 'absolute', borderRadius: radius.lg, backgroundColor: colors.bgElevated, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  menuRow: { height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  menuRowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  menuRowPressed: { backgroundColor: colors.surfaceAlt },
  menuLabel: { ...typography.body, color: colors.text },
  editBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, maxWidth: 700, width: '100%', alignSelf: 'center' },
  editLabel: { ...typography.smallStrong, color: colors.brand, flex: 1 },
  // Leaves room for the chip that hangs off the bottom of the bubble.
  bubbleWrapReacted: { marginBottom: 12 },
  reactions: { position: 'absolute', bottom: -11, flexDirection: 'row', gap: 3, zIndex: 2 },
  reactionsMine: { left: 10 },
  reactionsTheirs: { right: 10 },
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
  emojiToggle: { padding: 4 },
  // The tools beside the box: a fixed square each, so nothing around them ever shifts.
  tool: { width: 34, height: 40, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  toolHover: { backgroundColor: colors.surfaceAlt },
  toolPressed: { opacity: 0.4 },
  toolOff: { opacity: 0.35 },
  // A court card or photos take the same reach as a shared card.
  cardArea: { maxWidth: '86%' },
  photoWrap: { maxWidth: '86%' },
  // A held photo or court card: the menu's lifted copy stands in for it.
  heldAway: { opacity: 0 },
  caption: { marginTop: 3 },
  notSent: { color: colors.danger },
  notSentWrap: { alignSelf: 'flex-end', marginRight: spacing.xs },
  // The photos picked to send, above the box; the line the box usually carries moves up to sit over them.
  trayWrap: { maxWidth: 700, width: '100%', alignSelf: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  composerUnderTray: { borderTopWidth: 0, paddingTop: spacing.sm },
  mineAlign: { alignSelf: 'flex-end' },
  // Bubbles in one run sit closer than the list's usual gap.
  inRun: { marginTop: -4 },
  noTail: { borderBottomRightRadius: radius.xl, borderBottomLeftRadius: radius.xl },
  theirsAlign: { alignSelf: 'flex-start' },
  sharedCard: {
    maxWidth: '78%',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
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
  event: { ...typography.small, fontSize: 12, lineHeight: 17, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xs },
  // A message from someone you blocked, folded to one quiet line.
  folded: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  foldedText: { ...typography.small, color: colors.textFaint, flexShrink: 1 },
  foldedShow: { ...font('600'), color: colors.textMuted },
  blockedBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, maxWidth: 700, width: '100%', alignSelf: 'center' },
  blockedBannerText: { ...typography.small, color: colors.textMuted, flex: 1 },
  blockedBannerLink: { ...typography.smallStrong, color: colors.danger },
  timestamp: { ...typography.caption, color: colors.textFaint, textAlign: 'center', paddingTop: spacing.md },
  stamp: { ...typography.caption, fontSize: 12, letterSpacing: 0, color: colors.textFaint, textAlign: 'center', paddingTop: spacing.xl, paddingBottom: spacing.md },
  mentionTray: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
  },
  input: {
    flex: 1,
    // A browser's text box keeps a width of its own unless told it may shrink,
    // which pushed the mic off the edge of the smallest phones.
    minWidth: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    color: colors.text,
    ...typography.body,
  },
  mic: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  recording: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, paddingHorizontal: spacing.lg, borderRadius: 22, backgroundColor: colors.surface },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  recText: { ...typography.body, ...font('600'), color: colors.text, fontVariant: ['tabular-nums'] },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brand, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  },
});

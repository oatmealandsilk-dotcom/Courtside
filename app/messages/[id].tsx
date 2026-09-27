import { useThemedStyles } from '@/theme/ThemeProvider';
import { Wash } from '@/components/Wash';
import { PlayerName } from '@/components/PlayerName';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
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
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

import { Avatar, EmptyState } from '@/components/ui';
import { GroupAvatar, groupName, isGroupChat, othersIn } from '@/features/messages/groups';
import { VoiceNote } from '@/components/VoiceNote';
import { EmojiKeyboard } from '@/components/EmojiKeyboard';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { VOICE_LIMIT_MS, clock, useVoiceRecorder } from '@/features/voice/useVoiceRecorder';
import { openInMaps } from '@/features/players/openInMaps';
import { Tappable, useDoubleTap } from '@/components/Tappable';
import { chatStamp } from '@/lib/format';
import { RichText } from '@/components/RichText';
import { useApp } from '@/store/AppContext';
import { MESSAGE_PAGE } from '@/data/remote';
import { MentionSuggestions } from '@/components/MentionSuggestions';
import { useMentionCandidates } from '@/features/mentions/useMentionCandidates';
import { activeMention, applyMention } from '@/lib/mentions';
import { show as showToast } from '@/lib/toast';
import * as haptics from '@/lib/haptics';
import type { Message } from '@/data/types';
import Reanimated, { Easing, FadeIn, FadeInDown, FadeInUp, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { colors, radius, spacing, typography, font } from '@/theme';

/** Two messages from the same person this close together read as one run: tighter, one tail. */
const GROUP_GAP_MS = 2 * 60_000;

/** Quiet for this long between two messages and the next one gets a time line. */
const STAMP_GAP_MS = 20 * 60_000;

/** One conversation. Bubbles, shared-item cards, and a composer bar. */
export default function Thread() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { conversations, messages, users, posts, questions, currentUserId, defaultReaction, actions, blockedIds } = useApp();
  const [draft, setDraft] = useState('');
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

  const conversation = conversations.find((c) => c.id === id);
  const other = users.find(
    (u) => u.id === conversation?.participantIds.find((p) => p !== currentUserId),
  );
  const group = !!conversation && isGroupChat(conversation);
  const people = conversation ? othersIn(conversation, users, currentUserId) : [];

  useEffect(() => {
    const mark = () => {
      if (focused && conversation && (typeof document === 'undefined' || document.visibilityState === 'visible')) actions.markConversationRead(conversation.id);
    };
    mark();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', mark);
      return () => document.removeEventListener('visibilitychange', mark);
    }
  }, [focused, conversation?.id, messages, currentUserId, actions]);

  const thread = useMemo(
    () =>
      (conversation?.messageIds ?? [])
        .map((mid) => messages.find((m) => m.id === mid))
        .filter((m): m is NonNullable<typeof m> => Boolean(m)),
    [conversation, messages],
  );

  // A chat with someone you are blocked with (either of you blocked the other)
  // can still be read, but not written in: the box gives way to a note.
  const [chatBlocked, setChatBlocked] = useState(false);
  const checkBlocked = actions.isChatBlocked;
  useEffect(() => {
    let on = true;
    if (conversation?.id) void checkBlocked(conversation.id).then((b) => { if (on) setChatBlocked(b); });
    return () => { on = false; };
  }, [conversation?.id, checkBlocked, blockedIds]);
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
    if (olderLoading || noMoreOlder.current || !conversation) return;
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
  const candidatesFor = useMentionCandidates();
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

  if (!conversation || !other) {
    return (
      <View style={styles.root}>
        <Wash height={320} strength={0.7} />
        <EmptyState title="Conversation not found" body="It may have been removed." />
      </View>
    );
  }
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

  const send = () => {
    const body = draft.trim();
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
    <KeyboardAvoidingView style={[styles.root, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Wash height={320} strength={0.7} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        {group ? (
          // A group: its faces and name; tapping opens who is in it, and the name, add and leave.
          <Pressable style={styles.headerUser} accessibilityRole="button" accessibilityLabel="Group details" onPress={() => router.push({ pathname: '/messages/group', params: { id: conversation.id } })}>
            <GroupAvatar people={people} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.headerName} numberOfLines={1}>{groupName(conversation, users, currentUserId)}</Text>
              <Text style={styles.headerHandle}>{people.length + 1} people</Text>
            </View>
          </Pressable>
        ) : (
        <Pressable
          style={styles.headerUser}
          accessibilityRole="link"
          onPress={() => router.push(`/user/${other.id}`)}
        >
          <Avatar name={other.name} seed={other.avatarSeed} uri={other.avatarUrl} size={34} />
          <View>
            <PlayerName userId={other.id} style={styles.headerName}>{other.name}</PlayerName>
            <PlayerName userId={other.id} style={styles.headerHandle}>@{other.handle}</PlayerName>
          </View>
        </Pressable>
        )}
      </View>

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
          const next = thread[i + 1];
          const runsOn = (a?: Message, b?: Message) => !!a && !!b && a.senderId === b.senderId && Date.parse(b.createdAt) - Date.parse(a.createdAt) <= GROUP_GAP_MS;
          // In a run only the last bubble keeps its tail, and the gap between them closes up.
          const inRun = runsOn(prev, message) && !stamp;
          const lastOfRun = !runsOn(message, next);
          // A new message rises out of the composer and settles with a small spring.
          const arrive = settled.current ? FadeInUp.duration(150).easing(Easing.out(Easing.cubic)) : undefined;

          // In a group, the sender's name over the first of their run of messages.
          const who = group && !mine && !inRun ? <Text style={styles.sender}>{users.find((u) => u.id === message.senderId)?.name.split(' ')[0] ?? 'Someone'}</Text> : null;

          if (message.kind === 'voice' && message.audio) {
            return (
              <React.Fragment key={message.id}>
              {stamp}
              {who}
              <Reanimated.View entering={arrive} layout={LinearTransition.duration(120)} style={[styles.row, mine ? styles.rowMine : styles.rowTheirs, inRun && styles.inRun]}>
                <View style={{ opacity: message.failed ? 0.5 : 1 }}><VoiceNote url={message.audio.url} ms={message.audio.ms} mine={mine} /></View>
              </Reanimated.View>
              {message.failed ? <Text style={[styles.sender, { alignSelf: 'flex-end', marginRight: spacing.lg, color: colors.danger }]}>Not sent</Text> : null}
              </React.Fragment>
            );
          }

          if (message.kind === 'court' && message.place) {
            const place = message.place;
            return (
              <React.Fragment key={message.id}>
              {stamp}
              {who}
              <Reanimated.View entering={arrive} layout={LinearTransition.duration(120)} style={[styles.row, mine ? styles.rowMine : styles.rowTheirs, inRun && styles.inRun]}>
                <Tappable accessibilityRole="link" accessibilityLabel={`${place.name}. Open in Maps`} scaleTo={0.97} onPress={() => openInMaps(place)} style={[styles.sharedCard, styles.courtCard]}>
                  <View style={styles.sharedHead}>
                    <Ionicons name="location" size={16} color={colors.brand} />
                    <Text style={styles.sharedKind}>Court</Text>
                  </View>
                  <Text numberOfLines={2} style={styles.courtName}>{place.name}</Text>
                  <Text style={styles.courtOpen}>Open in Maps</Text>
                </Tappable>
              </Reanimated.View>
              </React.Fragment>
            );
          }

          if (message.kind !== 'text' && message.sharedId) {
            const shared =
              message.kind === 'profile' ? users.find(u=>u.id===message.sharedId) : message.kind === 'post'
                ? posts.find((p) => p.id === message.sharedId)
                : questions.find((q) => q.id === message.sharedId);
            const label = shared
              ? message.kind === 'profile' ? (shared as {name:string}).name : message.kind === 'post'
                ? (shared as { body: string }).body
                : (shared as { title: string }).title
              : 'This item was removed';
            return (
              <React.Fragment key={message.id}>
              {stamp}
              <Reanimated.View entering={arrive} layout={LinearTransition.duration(120)} style={[styles.row, mine ? styles.rowMine : styles.rowTheirs, inRun && styles.inRun]}>
              <HoldArea onHold={(rect) => setMenu({ message, mine, rect })} style={styles.sharedCardArea}>
              {(hold) => (
              <Tappable
                accessibilityRole="link"
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
              </Reanimated.View>
              </React.Fragment>
            );
          }

          return (
            <React.Fragment key={message.id}>
            {stamp}
            {who}
            <Bubble
              message={message}
              mine={mine}
              inRun={inRun}
              tail={lastOfRun}
              arrive={arrive}
              styles={styles}
              me={currentUserId}
              held={menu?.message.id === message.id}
              onHold={(rect) => setMenu({ message, mine, rect })}
              onReact={(emoji) => actions.reactToMessage(message.id, emoji)}
              onRetry={() => actions.retryMessage(message.id)}
            />
            </React.Fragment>
          );
        })}
        {thread.length > 0 && thread[thread.length - 1].senderId === currentUserId && !thread[thread.length - 1].failed && <Text accessibilityLiveRegion="polite" style={styles.timestamp}>
          {other.readReceiptsEnabled !== false && thread[thread.length - 1].readAtBy?.[other.id] ? 'Read' : 'Sent'}
        </Text>}
      </ScrollView>

      {menu ? (
        <MessageMenu
          target={menu}
          me={currentUserId}
          styles={styles}
          onClose={() => setMenu(null)}
          onReact={(emoji) => actions.reactToMessage(menu.message.id, emoji)}
          onCopy={() => { void Clipboard.setStringAsync(menu.message.body); haptics.tap(); showToast({ title: 'Copied', icon: 'copy-outline' }); }}
          onEdit={() => { setEditing(menu.message); setDraft(menu.message.body); setCaret(menu.message.body.length); setTimeout(() => inputRef.current?.focus(), 60); }}
          onUnsend={() => actions.unsendMessage(menu.message.id)}
          onDelete={() => actions.deleteMessageForMe(menu.message.id)}
          doubleTap={defaultReaction}
          onDoubleTap={(emoji) => { actions.setDefaultReaction(emoji); showToast({ title: `Double tap now leaves ${emoji}`, icon: 'heart-outline' }); }}
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
      {blockedHere ? (
        <View style={[styles.blockedNote, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Ionicons name="lock-closed-outline" size={15} color={colors.textMuted} />
          <Text style={styles.blockedNoteText}>You can't message this account.</Text>
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
          <Ionicons name="arrow-up" size={19} color={colors.brandInk} />
        </Tappable>
      </View>
      ) : (
      <>
      <View style={[styles.composer, { paddingBottom: emojiOpen ? spacing.sm : Math.max(insets.bottom, spacing.md) + keyboardInset }]}>
        <Tappable
          accessibilityLabel={emojiOpen ? 'Show the keyboard' : 'Add an emoji'}
          onPress={toggleEmoji}
          style={styles.emojiToggle}
        >
          {emojiOpen && !desktopWeb
            ? <MaterialCommunityIcons name="keyboard-outline" size={24} color={colors.textMuted} />
            : <Ionicons name={emojiOpen ? 'happy' : 'happy-outline'} size={23} color={emojiOpen ? colors.brand : colors.textMuted} />}
        </Tappable>
        <Tappable accessibilityLabel="Send a court" onPress={() => router.push({ pathname: '/pick-court', params: { conversation: conversation.id } })} style={styles.emojiToggle}>
          <Ionicons name="location-outline" size={23} color={colors.textMuted} />
        </Tappable>
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={(text) => { setDraft(text); setCaret((c) => c + (text.length - draft.length)); }}
          onSelectionChange={(e) => setCaret(e.nativeEvent.selection.end)}
          // Tapping into the words brings the phone keyboard back in the emoji keyboard's place.
          onFocus={() => { if (emojiOpen && !desktopWeb) setEmojiOpen(false); }}
          placeholder="Message…"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          onSubmitEditing={send}
          // Without this the field blurs on submit and every message needs a fresh click.
          blurOnSubmit={false}
          submitBehavior="submit"
          returnKeyType="send"
          accessibilityLabel="Message text"
        />
        {!draft.trim() && !editing ? (
          <Tappable immediate onPress={() => { void startRecording(); }} accessibilityLabel="Record a voice note" style={styles.mic}>
            <Ionicons name="mic-outline" size={21} color={colors.text} />
          </Tappable>
        ) : <SendButton ready={!!draft.trim() && (!editing || draft.trim() !== editing.body)} editing={!!editing} onPress={send} styles={styles} />}
      </View>
      {emojiOpen ? <EmojiKeyboard height={keyboardHeight.current} bottomInset={insets.bottom} onPick={insertEmoji} onDelete={deleteBack} /> : null}
      </>
      ))}
    </KeyboardAvoidingView>
  );
}

/**
 * One text message.
 *
 * Double tap leaves your default reaction; a long press opens the picker for a
 * different one. Reactions sit under the bubble and are tappable to remove.
 */
function Bubble({ message, mine, inRun, tail, arrive, styles, me, held = false, onHold, onReact, onRetry }: {
  message: Message; mine: boolean; inRun: boolean; tail: boolean; arrive?: FadeInUp; styles: any; me: string | null;
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
    <Reanimated.View entering={arrive} layout={LinearTransition.duration(120)} style={[styles.row, mine ? styles.rowMine : styles.rowTheirs, inRun && styles.inRun]}>
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
              accessibilityLabel={`Message: ${message.body}. Double tap to react, hold for more.`}
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
    </Reanimated.View>
  );
}

interface Rect { x: number; y: number; w: number; h: number }
interface MenuTarget { message: Message; mine: boolean; rect: Rect }

/** Wraps a message so a hold can tell the menu exactly where the message sits on screen. */
function HoldArea({ onHold, style, children }: { onHold: (rect: Rect) => void; style?: any; children: (hold: () => void) => React.ReactNode }) {
  const ref = useRef<View>(null);
  const hold = () => {
    haptics.tap();
    ref.current?.measureInWindow((x, y, w, h) => onHold({ x, y, w, h }));
  };
  return <View ref={ref} collapsable={false} style={style}>{children(hold)}</View>;
}

/**
 * What a held message offers, the way iMessage and Instagram show it: the
 * chat dims, the message stays lifted where it was, the reactions sit above
 * it and the actions below. Your own message: Copy, Edit, Unsend, Delete.
 * Theirs: Copy and Delete. Delete only takes it out of your own view.
 */
function MessageMenu({ target, me, styles, onClose, onReact, onCopy, onEdit, onUnsend, onDelete, doubleTap, onDoubleTap }: {
  target: MenuTarget; me: string | null; styles: any;
  onClose: () => void; onReact: (emoji: string) => void; onCopy: () => void; onEdit: () => void; onUnsend: () => void; onDelete: () => void;
  /** The reaction a double tap leaves, and how to change it: the last row turns the reactions above into that choice. */
  doubleTap: string; onDoubleTap: (emoji: string) => void;
}) {
  const [choosing, setChoosing] = useState(false);
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { message, mine, rect } = target;
  const text = message.kind === 'text';
  const actions = [
    ...(text ? [{ key: 'copy', label: 'Copy', icon: 'copy-outline' as const, run: onCopy }] : []),
    ...(mine && text ? [{ key: 'edit', label: 'Edit', icon: 'create-outline' as const, run: onEdit }] : []),
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
        {message.kind === 'text' ? (
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
  headerName: { ...typography.bodyStrong, ...font('500'), fontSize: 16, color: colors.text },
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
  bubbleText: { ...typography.body, color: colors.text, lineHeight: 21 },
  bubbleWrap: { maxWidth: '78%' },
  row: { width: '100%' },
  rowMine: { alignItems: 'flex-end' },
  rowTheirs: { alignItems: 'flex-start' },
  sharedCardArea: { maxWidth: '78%' },
  edited: { ...typography.caption, color: colors.textFaint, letterSpacing: 0, marginTop: 3, marginHorizontal: 6 },
  menuBackdrop: { backgroundColor: colors.overlay },
  lifted: { transform: [{ scale: 1.03 }], shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
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
  sharedBody: { ...typography.small, color: colors.text, lineHeight: 19 },
  courtCard: { minWidth: 220 },
  courtName: { ...typography.bodyStrong, color: colors.text },
  courtOpen: { ...typography.smallStrong, color: colors.brand },
  sender: { ...typography.caption, letterSpacing: 0, color: colors.textMuted, marginLeft: spacing.lg, marginTop: spacing.sm, marginBottom: 2 },
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

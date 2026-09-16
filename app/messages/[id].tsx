import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@/lib/useIsFocused';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, EmptyState } from '@/components/ui';
import { Tappable, useDoubleTap } from '@/components/Tappable';
import { chatStamp } from '@/lib/format';
import { RichText } from '@/components/RichText';
import { useApp } from '@/store/AppContext';
import { MentionSuggestions } from '@/components/MentionSuggestions';
import { useMentionCandidates } from '@/features/mentions/useMentionCandidates';
import { activeMention, applyMention } from '@/lib/mentions';
import type { Message } from '@/data/types';
import { CHAT_THEMES, loadChatTheme, saveChatTheme, type ChatTheme } from '@/features/messaging/chatTheme';
import Reanimated, { FadeIn, FadeInUp, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '@/theme';

/** Two messages from the same person this close together read as one run: tighter, one tail. */
const GROUP_GAP_MS = 2 * 60_000;

/** Quiet for this long between two messages and the next one gets a time line. */
const STAMP_GAP_MS = 20 * 60_000;

/** One conversation. Bubbles, shared-item cards, and a composer bar. */
export default function Thread() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { conversations, messages, users, posts, questions, currentUserId, defaultReaction, actions } = useApp();
  const [draft, setDraft] = useState('');
  const [picking, setPicking] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // The chat's colour: your bubbles and the send button. Picked from the palette button, kept per conversation.
  const [themeId, setThemeId] = useState<string | null>(null);
  const [themeOpen, setThemeOpen] = useState(false);
  useEffect(() => { let live = true; if (id) void loadChatTheme(id).then((t) => { if (live) setThemeId(t); }); return () => { live = false; }; }, [id]);
  const chatTheme: ChatTheme | null = CHAT_THEMES.find((t) => t.id === themeId) ?? null;
  const pickTheme = (next: string | null) => { setThemeId(next); if (id) void saveChatTheme(id, next); };
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

  // "@" in a message offers people, following first, the same as a comment.
  // (These hooks sit above the early return below: a thread that loads a
  // moment after the page would otherwise change the hook count and crash.)
  const [caret, setCaret] = useState(0);
  const candidatesFor = useMentionCandidates();

  if (!conversation || !other) {
    return (
      <View style={styles.root}>
        <EmptyState title="Conversation not found" body="It may have been removed." />
      </View>
    );
  }
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
    actions.sendMessage(conversation.id, body);
    setDraft('');
    // Stay in the box so the next message can be typed straight away.
    inputRef.current?.focus();
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  return (
    <KeyboardAvoidingView style={[styles.root, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Pressable
          style={styles.headerUser}
          accessibilityRole="link"
          onPress={() => router.push(`/user/${other.id}`)}
        >
          <Avatar name={other.name} seed={other.avatarSeed} size={34} />
          <View>
            <PlayerName userId={other.id} style={styles.headerName}>{other.name}</PlayerName>
            <PlayerName userId={other.id} style={styles.headerHandle}>@{other.handle}</PlayerName>
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={themeOpen ? 'Hide chat colours' : 'Change chat colour'} hitSlop={8} onPress={() => setThemeOpen((o) => !o)} style={styles.paletteButton}>
          <Ionicons name={themeOpen ? 'color-palette' : 'color-palette-outline'} size={22} color={chatTheme?.mine ?? colors.brand} />
        </Pressable>
      </View>
      {themeOpen ? (
        <Reanimated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={styles.paletteRow}>
          {[{ id: null as string | null, label: 'Default', mine: colors.brand }, ...CHAT_THEMES].map((t) => {
            const on = (t.id ?? null) === (chatTheme?.id ?? null);
            return (
              <Pressable key={t.id ?? 'default'} accessibilityRole="button" accessibilityLabel={`${t.label} chat colour`} accessibilityState={{ selected: on }} onPress={() => pickTheme(t.id)} style={styles.swatchHit}>
                <View style={[styles.swatch, { backgroundColor: t.mine }, on && styles.swatchOn]}>{on ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}</View>
                <Text style={[styles.swatchLabel, on && { color: colors.text }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </Reanimated.View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: settled.current })}
        keyboardShouldPersistTaps="handled"
      >
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
          const arrive = settled.current ? FadeInUp.duration(220).springify().damping(24).stiffness(220) : undefined;

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
              <Reanimated.View entering={arrive} layout={LinearTransition.duration(180)} style={[mine ? styles.mineAlign : styles.theirsAlign, inRun && styles.inRun]}>
              <Tappable
                accessibilityRole="link"
                scaleTo={0.97}
                onPress={() =>
                  shared
                    ? router.push(
                        message.kind === 'profile' ? `/user/${message.sharedId}` : message.kind === 'post'
                          ? `/post/${message.sharedId}`
                          : `/question/${message.sharedId}`,
                      )
                    : undefined
                }
                style={[styles.sharedCard, mine ? styles.mineAlign : styles.theirsAlign]}
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
              </Reanimated.View>
              </React.Fragment>
            );
          }

          return (
            <React.Fragment key={message.id}>
            {stamp}
            <Bubble
              message={message}
              mine={mine}
              inRun={inRun}
              tail={lastOfRun}
              arrive={arrive}
              tint={chatTheme}
              styles={styles}
              me={currentUserId}
              picking={picking === message.id}
              onPick={(open) => setPicking(open ? message.id : null)}
              onReact={(emoji) => actions.reactToMessage(message.id, emoji)}
            />
            </React.Fragment>
          );
        })}
        {thread.length > 0 && thread[thread.length - 1].senderId === currentUserId && <Text accessibilityLiveRegion="polite" style={styles.timestamp}>
          {other.readReceiptsEnabled !== false && thread[thread.length - 1].readAtBy?.[other.id] ? 'Read' : 'Sent'}
        </Text>}
      </ScrollView>

      {emojiOpen ? (
        <Reanimated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={styles.emojiTray}>
          <View style={styles.defaultRow}>
            <Text style={styles.defaultHint}>Double tap a message to leave</Text>
            {REACTIONS.map((emoji) => (
              <Tappable
                key={emoji}
                accessibilityLabel={`Use ${emoji} when you double tap a message`}
                accessibilityState={{ selected: defaultReaction === emoji }}
                onPress={() => actions.setDefaultReaction(emoji)}
                style={[styles.defaultKey, defaultReaction === emoji && styles.defaultKeyOn]}
              >
                <Text style={{ fontSize: 17 }}>{emoji}</Text>
              </Tappable>
            ))}
          </View>
          {EMOJI.map((emoji) => (
            <Tappable
              key={emoji}
              accessibilityLabel={`Add ${emoji}`}
              onPress={() => { setDraft((d) => d + emoji); inputRef.current?.focus(); }}
              style={styles.emojiKey}
            >
              <Text style={{ fontSize: 22 }}>{emoji}</Text>
            </Tappable>
          ))}
        </Reanimated.View>
      ) : null}

      {mention && mentionRows.length ? (
        <View style={styles.mentionTray}>
          <MentionSuggestions candidates={mentionRows} onPick={pickMention} />
        </View>
      ) : null}
      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Tappable
          accessibilityLabel={emojiOpen ? 'Hide emoji' : 'Add an emoji'}
          onPress={() => setEmojiOpen((open) => !open)}
          style={styles.emojiToggle}
        >
          <Ionicons
            name={emojiOpen ? 'happy' : 'happy-outline'}
            size={23}
            color={emojiOpen ? colors.brand : colors.textMuted}
          />
        </Tappable>
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={(text) => { setDraft(text); setCaret((c) => c + (text.length - draft.length)); }}
          onSelectionChange={(e) => setCaret(e.nativeEvent.selection.end)}
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
        <SendButton ready={!!draft.trim()} onPress={send} styles={styles} tint={chatTheme} />
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * One text message.
 *
 * Double tap leaves your default reaction; a long press opens the picker for a
 * different one. Reactions sit under the bubble and are tappable to remove.
 */
function Bubble({ message, mine, inRun, tail, arrive, tint, styles, me, picking, onPick, onReact }: {
  message: Message; mine: boolean; inRun: boolean; tail: boolean; arrive?: FadeInUp; tint: ChatTheme | null; styles: any; me: string | null;
  picking: boolean; onPick: (open: boolean) => void; onReact: (emoji?: string) => void;
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
    <Reanimated.View entering={arrive} layout={LinearTransition.duration(180)} style={[mine ? styles.mineAlign : styles.theirsAlign, inRun && styles.inRun]}>
      {/* The chip is anchored to the bubble, not the row, so it sits on the
          bubble's bottom inner corner however wide the message is. */}
      <View style={[styles.bubbleWrap, mine ? styles.mineAlign : styles.theirsAlign, reacted && styles.bubbleWrapReacted]}>
        <Pressable
          onPress={tap}
          onLongPress={() => onPick(true)}
          delayLongPress={280}
          accessibilityRole="button"
          accessibilityLabel={`Message: ${message.body}. Double tap to react, hold to choose a reaction.`}
          style={[styles.bubble, mine ? styles.mine : styles.theirs, mine && tint && { backgroundColor: tint.mine }, !tail && styles.noTail]}
        >
          <RichText style={[styles.bubbleText, mine && { color: tint?.ink ?? colors.brandInk }]} mentionStyle={mine ? { color: tint?.ink ?? colors.brandInk, textDecorationLine: 'underline' } : undefined}>{message.body}</RichText>
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
      </View>

      {picking ? (
        <View style={[styles.pickerRow, mine ? styles.theirsAlign : styles.mineAlign]}>
          {REACTIONS.map((emoji) => (
            <Tappable
              key={emoji}
              accessibilityLabel={`React with ${emoji}`}
              onPress={() => { onReact(emoji); onPick(false); }}
              style={[styles.pickerItem, mineMark === emoji && styles.pickerItemOn]}
            >
              <Text style={{ fontSize: 19 }}>{emoji}</Text>
            </Tappable>
          ))}
        </View>
      ) : null}
    </Reanimated.View>
  );
}

/** Offered on a long press. Small on purpose — a wall of emoji slows the choice. */
const REACTIONS = ['❤️', '😂', '🔥', '👏', '😮', '😢', '👍', '🎾'];

/** For the composer. Tennis first, then the ones people actually reach for. */
const EMOJI = [
  '🎾', '🔥', '💪', '🏆', '⚡️', '🎯', '👏', '🙌',
  '❤️', '😂', '😅', '😮', '😭', '🫡', '👍', '👎',
  '🤝', '😤', '🥵', '🧊', '✅', '❌', '⏱️', '🙏',
];

/** The send arrow: dim and small with nothing to send, springing up to full size as you type. */
function SendButton({ ready, onPress, styles, tint }: { ready: boolean; onPress: () => void; styles: any; tint: ChatTheme | null }) {
  const on = useSharedValue(ready ? 1 : 0);
  useEffect(() => { on.value = ready ? withSpring(1, { damping: 14, stiffness: 260 }) : withTiming(0, { duration: 160 }); }, [ready, on]);
  const style = useAnimatedStyle(() => ({ opacity: 0.4 + 0.6 * on.value, transform: [{ scale: 0.86 + 0.14 * on.value }] }));
  return (
    <Reanimated.View style={style}>
      <Tappable onPress={onPress} disabled={!ready} accessibilityLabel="Send message" style={[styles.send, tint && { backgroundColor: tint.mine }]}>
        <Ionicons name="arrow-up" size={19} color={tint?.ink ?? colors.brandInk} />
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
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerUser: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  paletteButton: { padding: 4 },
  paletteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.bgElevated },
  swatchHit: { alignItems: 'center', gap: 4, width: 52 },
  swatch: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  swatchOn: { borderColor: colors.text },
  swatchLabel: { ...typography.caption, color: colors.textFaint, letterSpacing: 0 },
  headerName: { ...typography.bodyStrong, color: colors.text },
  headerHandle: { ...typography.small, color: colors.textFaint },
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.xl,
  },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.brand, borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surfaceAlt, borderBottomLeftRadius: 6 },
  bubbleText: { ...typography.body, color: colors.text, lineHeight: 21 },
  bubbleWrap: { maxWidth: '78%' },
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
  pickerRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 4,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerItem: { paddingHorizontal: 5, paddingVertical: 3, borderRadius: radius.pill },
  pickerItemOn: { backgroundColor: colors.brandDim },
  emojiTray: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  emojiKey: { padding: 6, borderRadius: radius.sm },
  defaultRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 2,
    paddingBottom: spacing.sm,
    marginBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  defaultHint: { ...typography.caption, color: colors.textFaint, letterSpacing: 0, marginRight: spacing.xs },
  defaultKey: { paddingHorizontal: 5, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: 'transparent' },
  defaultKeyOn: { borderColor: colors.brand, backgroundColor: colors.brandDim },
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
  timestamp: { ...typography.caption, color: colors.textFaint, textAlign: 'center', paddingTop: spacing.md },
  stamp: { ...typography.caption, color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.md },
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 15,
  },
  send: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

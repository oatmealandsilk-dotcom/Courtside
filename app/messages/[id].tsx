import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, EmptyState } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/** One conversation. Bubbles, shared-item cards, and a composer bar. */
export default function Thread() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { conversations, messages, users, posts, questions, currentUserId, actions } = useApp();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView | null>(null);
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

  if (!conversation || !other) {
    return (
      <View style={styles.root}>
        <EmptyState title="Conversation not found" body="It may have been removed." />
      </View>
    );
  }

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    actions.sendMessage(conversation.id, body);
    setDraft('');
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
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
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        keyboardShouldPersistTaps="handled"
      >
        {thread.map((message) => {
          const mine = message.senderId === currentUserId;

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
              <Pressable
                key={message.id}
                accessibilityRole="link"
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
                    {message.kind === 'profile' ? 'Profile' : message.kind === 'post' ? 'Reel' : 'Discussion'}
                  </Text>
                </View>
                <Text numberOfLines={3} style={styles.sharedBody}>
                  {label}
                </Text>
              </Pressable>
            );
          }

          return (
            <View
              key={message.id}
              style={[styles.bubble, mine ? styles.mine : styles.theirs]}
            >
              <Text style={[styles.bubbleText, mine && { color: colors.brandInk }]}>
                {message.body}
              </Text>
            </View>
          );
        })}
        {thread.length > 0 && thread[thread.length - 1].senderId === currentUserId && <Text accessibilityLiveRegion="polite" style={styles.timestamp}>
          {other.readReceiptsEnabled !== false && thread[thread.length - 1].readAtBy?.[other.id] ? 'Read' : 'Sent'}
        </Text>}
        <Text style={styles.timestamp}>{relativeTime(conversation.updatedAt)}</Text>
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message…"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          onSubmitEditing={send}
          returnKeyType="send"
          accessibilityLabel="Message text"
        />
        <Pressable
          onPress={send}
          disabled={!draft.trim()}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          style={[styles.send, !draft.trim() && { opacity: 0.4 }]}
        >
          <Ionicons name="arrow-up" size={19} color={colors.brandInk} />
        </Pressable>
      </View>
    </View>
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
  headerName: { ...typography.bodyStrong, color: colors.text },
  headerHandle: { ...typography.small, color: colors.textFaint },
  scroll: { flex: 1 },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.sm,
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.xl,
  },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.brand, borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surfaceAlt, borderBottomLeftRadius: 6 },
  bubbleText: { ...typography.body, color: colors.text, lineHeight: 21 },
  mineAlign: { alignSelf: 'flex-end' },
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

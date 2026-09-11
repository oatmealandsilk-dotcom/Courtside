import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, EmptyState, Field, Screen } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';

/** DM inbox — threads newest first, unread dot, search by name. */
export default function Inbox() {
  const styles = useThemedStyles(styleDefinitions);
  const { conversations, messages, users, currentUserId } = useApp();
  const [search, setSearch] = useState('');

  const threads = useMemo(() => {
    return conversations
      .map((conversation) => {
        const otherId = conversation.participantIds.find((id) => id !== currentUserId);
        const other = users.find((u) => u.id === otherId);
        const last = [...conversation.messageIds]
          .reverse()
          .map((id) => messages.find((m) => m.id === id))
          .find(Boolean);
        return { conversation, other, last };
      })
      .filter((t) => Boolean(t.other))
      .filter((t) =>
        `${t.other?.name} ${t.other?.handle}`.toLowerCase().includes(search.trim().toLowerCase()),
      )
      .sort((a, b) => Date.parse(b.conversation.updatedAt) - Date.parse(a.conversation.updatedAt));
  }, [conversations, messages, users, currentUserId, search]);

  const preview = (kind?: string, body?: string) => {
    if (kind === 'post') return 'Sent a reel';
    if (kind === 'question') return 'Sent a discussion';
    if (kind === 'profile') return 'Shared a profile';
    return body || 'Say hello';
  };

  return (
    <Screen
      title="Messages"
      compactTitle
      onBack={() => router.back()}
      right={
        <Pressable
          onPress={() => router.push('/messages/new')}
          accessibilityRole="button"
          accessibilityLabel="Start a new message"
        >
          <Ionicons name="create-outline" size={23} color={colors.text} />
        </Pressable>
      }
    >
      <View style={styles.searchWrap}>
        <Field value={search} onChangeText={setSearch} placeholder="Search" autoCapitalize="none" />
      </View>

      {threads.length === 0 ? (
        <EmptyState
          icon="chatbubble-ellipses-outline"
          title="No messages yet"
          body="Find a player in Community and start a conversation."
        />
      ) : (
        threads.map(({ conversation, other, last }) => (
          <Pressable
            key={conversation.id}
            accessibilityRole="link"
            accessibilityLabel={`Open conversation with ${other?.name}`}
            onPress={() => router.push(`/messages/${conversation.id}`)}
            style={styles.row}
          >
            <Avatar name={other?.name ?? '?'} seed={other?.avatarSeed ?? conversation.id} size={54} />
            <View style={styles.rowBody}>
              <Text style={[styles.name, conversation.unreadCount > 0 && styles.unreadName]}>
                {other?.name}
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.preview, conversation.unreadCount > 0 && styles.unreadPreview]}
              >
                {preview(last?.kind, last?.body)} · {relativeTime(conversation.updatedAt)}
              </Text>
            </View>
            {conversation.unreadCount > 0 ? <View style={styles.dot} /> : null}
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  searchWrap: { paddingBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  rowBody: { flex: 1, gap: 3 },
  name: { ...typography.body, color: colors.text },
  unreadName: { fontWeight: '700' },
  preview: { ...typography.small, color: colors.textFaint },
  unreadPreview: { color: colors.text },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand },
});

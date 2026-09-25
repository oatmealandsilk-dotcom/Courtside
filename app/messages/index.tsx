import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, Chip, EmptyState, Screen } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography, font, radius } from '@/theme';

type Section = 'all' | 'coaches' | 'clients';

/**
 * DM inbox — threads newest first, unread dot, search by name.
 *
 * Players get a Coaches section for the people they are paying or asking;
 * coaches get a Clients section for the players who came to them.
 */
export default function Inbox() {
  const styles = useThemedStyles(styleDefinitions);
  const { conversations, messages, users, currentUserId, currentUser, blockedIds } = useApp();
  const [search, setSearch] = useState('');
  const [section, setSection] = useState<Section>('all');
  const isCoach = Boolean(currentUser?.isCoach);

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
      .filter((t) => Boolean(t.other) && !blockedIds.includes(t.other!.id))
      .filter((t) =>
        section === 'coaches' ? Boolean(t.other?.isCoach)
        : section === 'clients' ? !t.other?.isCoach
        : true,
      )
      .filter((t) =>
        `${t.other?.name} ${t.other?.handle}`.toLowerCase().includes(search.trim().toLowerCase()),
      )
      .sort((a, b) => Date.parse(b.conversation.updatedAt) - Date.parse(a.conversation.updatedAt));
  }, [conversations, messages, users, currentUserId, search, section, blockedIds]);

  const emptyCopy =
    section === 'coaches' ? { title: 'No coach conversations', body: 'Message a coach from their page and it will show up here.' }
    : section === 'clients' ? { title: 'No clients yet', body: 'Players who message you about coaching land here.' }
    : { title: 'No messages yet', body: 'Find a player in Community and start a conversation.' };

  const preview = (kind?: string, body?: string) => {
    if (kind === 'post') return 'Sent a clip';
    if (kind === 'question') return 'Sent a discussion';
    if (kind === 'profile') return 'Shared a profile';
    return body || 'Say hello';
  };

  return (
    <Screen
      title="Messages"
      wash
      compactTitle
      onBack={() => goBack()}
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
        <Ionicons name="search" size={17} color={colors.textFaint} style={styles.searchIcon} />
        <TextInput
          accessibilityLabel="Search messages"
          value={search}
          onChangeText={setSearch}
          placeholder="Search"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          style={styles.search}
        />
      </View>
      <View style={styles.sections}>
        {([{ value: 'all', label: 'All' }, isCoach ? { value: 'clients', label: 'Clients' } : { value: 'coaches', label: 'Coaches' }] as { value: Section; label: string }[]).map((seg) => (
          <Chip key={seg.value} label={seg.label} selected={section === seg.value} tint={colors.text} ink={colors.brandInk} onPress={() => setSection(seg.value)} />
        ))}
      </View>

      {threads.length === 0 ? (
        <EmptyState icon="chatbubble-ellipses-outline" title={emptyCopy.title} body={emptyCopy.body} />
      ) : (
        <View style={styles.list}>
          {threads.map(({ conversation, other, last }, index) => {
            const unread = conversation.unreadCount > 0;
            return (
              <Pressable
                key={conversation.id}
                accessibilityRole="link"
                accessibilityLabel={`Open conversation with ${other?.name}`}
                onPress={() => router.push(`/messages/${conversation.id}`)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <Avatar name={other?.name ?? '?'} seed={other?.avatarSeed ?? conversation.id} size={50} />
                <View style={[styles.rowBody, index > 0 && styles.rowLine]}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.name, unread && styles.unreadName]} numberOfLines={1}>{other?.name}</Text>
                    <Text style={[styles.time, unread && styles.unreadTime]}>{relativeTime(conversation.updatedAt)}</Text>
                  </View>
                  <View style={styles.rowBottom}>
                    <Text numberOfLines={1} style={[styles.preview, unread && styles.unreadPreview]}>
                      {preview(last?.kind, last?.body)}
                    </Text>
                    {unread ? <View style={styles.dot} /> : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  searchWrap: { position: 'relative', justifyContent: 'center', marginBottom: spacing.md },
  searchIcon: { position: 'absolute', left: 16, zIndex: 1 },
  search: {
    ...typography.body, fontSize: 16, color: colors.text,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill,
    paddingLeft: 42, paddingRight: spacing.lg, paddingVertical: 12,
  },
  sections: { flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.sm },
  list: { marginHorizontal: -spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingLeft: spacing.lg },
  rowPressed: { backgroundColor: colors.bgElevated },
  // The hairline runs from the words, not the picture — the way a phone's own inbox draws it.
  rowBody: { flex: 1, gap: 4, minWidth: 0, paddingVertical: 15, paddingRight: spacing.lg },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...typography.body, ...font('500'), fontSize: 16, color: colors.text, flexShrink: 1 },
  unreadName: { ...font('600') },
  time: { ...typography.small, color: colors.textFaint, flexShrink: 0 },
  unreadTime: { color: colors.brand, ...font('500') },
  preview: { ...typography.small, fontSize: 14, color: colors.textMuted, flex: 1 },
  unreadPreview: { color: colors.text },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
});

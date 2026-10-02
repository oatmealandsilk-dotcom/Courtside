import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import Ionicons from '@expo/vector-icons/Ionicons';

import { GroupAvatar, eventText, groupName, hasGroupControls, isGroupChat, isMuted, leaveGroupMessage, messageSummary, othersIn } from '@/features/messages/groups';
import { ChatSheet, type SheetOption } from '@/features/messages/ChatSheet';
import { MUTE_CHOICES, muteUntil } from '@/features/messages/mute';
import { Avatar, Chip, EmptyState, Screen } from '@/components/ui';
import { confirmAfterMenu } from '@/lib/confirm';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import type { Conversation, Message } from '@/data/types';
import { colors, spacing, typography, font, radius } from '@/theme';
import { isDesktopBrowser } from '@/lib/browserDevice';

type Section = 'all' | 'groups' | 'coaches' | 'clients';

/**
 * DM inbox — threads newest first, unread dot, search by name.
 *
 * Players get a Coaches section for the people they are paying or asking;
 * coaches get a Clients section for the players who came to them. Groups
 * get a section of their own (Snapchat's filter), and stay out of the other
 * two: a group is nobody's coach.
 *
 * A muted chat keeps its place but goes quiet: a small bell-off after the
 * time, and a grey dot instead of a green one. Holding a row offers Mute (or
 * Unmute) and, for a group, Leave.
 */
export default function Inbox() {
  const styles = useThemedStyles(styleDefinitions);
  const { conversations, messages, users, currentUserId, currentUser, blockedIds, hitRequests, actions } = useApp();
  const [search, setSearch] = useState('');
  const [section, setSection] = useState<Section>('all');
  // The row being held, and which of its two lists is showing.
  const [held, setHeld] = useState<{ conversation: Conversation; name: string; step: 'menu' | 'mute' } | null>(null);
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
        const group = isGroupChat(conversation);
        return { conversation, other, last, group, muted: isMuted(conversation), name: group ? groupName(conversation, users, currentUserId) : other?.name ?? '', people: othersIn(conversation, users, currentUserId) };
      })
      // A group stays even when everyone else has gone (or is not loaded yet);
      // a one-to-one needs the other person, and goes when they are blocked.
      .filter((t) => t.group || (Boolean(t.other) && !blockedIds.includes(t.other!.id)))
      .filter((t) =>
        section === 'groups' ? t.group
        : section === 'coaches' ? !t.group && Boolean(t.other?.isCoach)
        : section === 'clients' ? !t.group && !t.other?.isCoach
        : true,
      )
      .filter((t) =>
        `${t.name} ${t.group ? t.people.map((p) => p.name).join(' ') : t.other?.handle}`.toLowerCase().includes(search.trim().toLowerCase()),
      )
      .sort((a, b) => Date.parse(b.conversation.updatedAt) - Date.parse(a.conversation.updatedAt));
  }, [conversations, messages, users, currentUserId, search, section, blockedIds]);

  const emptyCopy =
    section === 'groups' ? { title: 'No group chats yet', body: 'Start one from New message: pick two or more people.' }
    : section === 'coaches' ? { title: 'No coach conversations', body: 'Message a coach from their page and it will show up here.' }
    : section === 'clients' ? { title: 'No clients yet', body: 'Players who message you about coaching land here.' }
    : { title: 'No messages yet', body: 'Find a player in Community and start a conversation.' };

  /** What the last message was, in a few words (the message banner says it the same way). */
  const said = messageSummary;
  /**
   * The row's second line. In a group it says whose it was ("Mira: see you
   * at 9", "You: on my way"); an event line ("Mira added Dev") reads as it
   * is; and words from someone you blocked are never shown.
   */
  const preview = (group: boolean, last?: Message) => {
    if (!last) return said(last);
    if (last.kind === 'system') return eventText(last, users, currentUserId);
    if (!group) return said(last);
    if (last.senderId === currentUserId) return `You: ${said(last)}`;
    if (blockedIds.includes(last.senderId)) return 'Message from someone you blocked';
    return `${users.find((u) => u.id === last.senderId)?.name.split(' ')[0] ?? 'Someone'}: ${said(last)}`;
  };

  const sections: { value: Section; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'groups', label: 'Groups' },
    isCoach ? { value: 'clients', label: 'Clients' } : { value: 'coaches', label: 'Coaches' },
  ];

  // What a held row offers: mute (which asks for how long) or unmute, and
  // leaving a group. A group from a database without mute yet (before
  // migration 54) offers only leaving.
  const sheetOptions: SheetOption[] = !held ? [] : held.step === 'mute'
    ? MUTE_CHOICES.map((choice) => ({ key: choice.key, label: choice.label, onPress: () => actions.muteChat(held.conversation.id, muteUntil(choice.ms)) }))
    : [
      ...(!hasGroupControls(held.conversation) ? [] : isMuted(held.conversation)
        ? [{ key: 'unmute', label: 'Unmute', icon: 'notifications-outline' as const, onPress: () => actions.muteChat(held.conversation.id, null) }]
        : [{ key: 'mute', label: 'Mute messages', icon: 'notifications-off-outline' as const, onPress: () => setHeld({ ...held, step: 'mute' }) }]),
      ...(isGroupChat(held.conversation)
        ? [{
          key: 'leave', label: 'Leave group', icon: 'exit-outline' as const, danger: true,
          onPress: () => {
            const conversationId = held.conversation.id;
            const message = leaveGroupMessage(held.conversation, hitRequests, currentUserId);
            confirmAfterMenu({ title: 'Leave this group?', message, confirmLabel: 'Leave', destructive: true, onConfirm: () => actions.leaveGroup(conversationId) });
          },
        }]
        : []),
    ];

  return (
    <Screen
      onRefresh={isDesktopBrowser() ? undefined : actions.refresh}
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
        {sections.map((seg) => (
          <Chip key={seg.value} label={seg.label} selected={section === seg.value} tint={colors.text} ink={colors.brandInk} onPress={() => setSection(seg.value)} />
        ))}
      </View>

      {threads.length === 0 ? (
        <EmptyState icon="chatbubble-ellipses-outline" title={emptyCopy.title} body={emptyCopy.body} action={{ label: 'New message', onPress: () => router.push('/messages/new') }} />
      ) : (
        <View style={styles.list}>
          {threads.map(({ conversation, other, last, group, muted, name, people }, index) => {
            const unread = conversation.unreadCount > 0;
            return (
              <Pressable
                key={conversation.id}
                accessibilityRole="link"
                accessibilityLabel={`${group ? `Open ${name}` : `Open conversation with ${name}`}${muted ? ', muted' : ''}${unread ? ', new messages' : ''}`}
                accessibilityHint="Hold for mute and more"
                onPress={() => router.push(`/messages/${conversation.id}`)}
                onLongPress={() => setHeld({ conversation, name, step: 'menu' })}
                delayLongPress={400}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                {group ? <GroupAvatar people={people} size={50} photoUrl={conversation.photoUrl} name={name} /> : <Avatar name={other?.name ?? '?'} seed={other?.avatarSeed ?? conversation.id} uri={other?.avatarUrl} size={50} />}
                <View style={[styles.rowBody, index > 0 && styles.rowLine]}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.name, unread && styles.unreadName]} numberOfLines={1}>{name}</Text>
                    <View style={styles.when}>
                      {/* A muted chat's news is still news, but not in the brand's colour. */}
                      <Text style={[styles.time, unread && !muted && styles.unreadTime]}>{relativeTime(conversation.updatedAt)}</Text>
                      {muted ? <Ionicons name="notifications-off-outline" size={13} color={colors.textFaint} accessibilityLabel="Muted" /> : null}
                    </View>
                  </View>
                  <View style={styles.rowBottom}>
                    <Text numberOfLines={1} style={[styles.preview, unread && styles.unreadPreview]}>
                      {preview(group, last)}
                    </Text>
                    {unread ? <View style={[styles.dot, muted && styles.dotMuted]} /> : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
      <ChatSheet
        visible={!!held}
        title={held?.step === 'mute' ? 'Mute messages' : held?.name}
        options={sheetOptions}
        onClose={() => setHeld(null)}
      />
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
  when: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 0 },
  time: { ...typography.small, color: colors.textFaint, flexShrink: 0 },
  unreadTime: { color: colors.brand, ...font('500') },
  preview: { ...typography.small, fontSize: 14, color: colors.textMuted, flex: 1 },
  unreadPreview: { color: colors.text },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  dotMuted: { backgroundColor: colors.textFaint },
});

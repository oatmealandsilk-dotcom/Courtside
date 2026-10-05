import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';
import Ionicons from '@expo/vector-icons/Ionicons';

import { GroupAvatar, MAX_PINNED_CHATS, eventText, findDirectChat, groupName, hasGroupControls, isGroupChat, isMuted, leaveGroupMessage, messageSummary, othersIn } from '@/features/messages/groups';
import { ChatSheet, type SheetOption } from '@/features/messages/ChatSheet';
import { SwipeRow } from '@/features/messages/SwipeRow';
import { MUTE_CHOICES, muteUntil } from '@/features/messages/mute';
import { useLinkPreview } from '@/features/messages/linkPreview';
import { isOpenToHit } from '@/features/players/openToHit';
import { Avatar, Chip, EmptyState, Screen } from '@/components/ui';
import { confirm, confirmAfterMenu } from '@/lib/confirm';
import { relativeTime } from '@/lib/format';
import { isOnlyLink } from '@/lib/links';
import { useApp } from '@/store/AppContext';
import type { Conversation, Message, User } from '@/data/types';
import { colors, spacing, typography, font, radius } from '@/theme';
import { isDesktopBrowser } from '@/lib/browserDevice';

type Section = 'all' | 'groups' | 'coaches' | 'clients';

interface Thread {
  conversation: Conversation;
  other?: User;
  last?: Message;
  group: boolean;
  muted: boolean;
  unread: boolean;
  name: string;
  people: User[];
}

/**
 * DM inbox — threads newest first, pinned ones on top, unread in bold, search by name.
 *
 * Players get a Coaches section for the people they are paying or asking;
 * coaches get a Clients section for the players who came to them. Groups
 * get a section of their own (Snapchat's filter), and stay out of the other
 * two: a group is nobody's coach.
 *
 * Each row slides, as iMessage's, WhatsApp's and Telegram's do: to the left
 * for Mute and Delete, to the right (pulled and let go) to mark it read or
 * unread. Holding a row offers the same and Pin (up to three chats sit at the
 * top) and, for a group, Leave. A muted chat keeps its place but goes quiet:
 * a small bell-off after the time, and a grey dot instead of a green one.
 *
 * Above the chats, the people you can message who are up to hit today, a
 * tap from a chat with them.
 */
export default function Inbox() {
  const styles = useThemedStyles(styleDefinitions);
  const { conversations, messages, users, currentUserId, currentUser, blockedIds, hitRequests, actions, lastSeen } = useApp();
  const [search, setSearch] = useState('');
  // Opened from the Coaching tab's chats button: straight onto Coaches (or Clients, for a coach).
  const { section: askedSection } = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState<Section>(askedSection === 'coaches' || askedSection === 'clients' ? askedSection : 'all');
  // The row being held, and which of its two lists is showing.
  const [held, setHeld] = useState<{ conversation: Conversation; name: string; step: 'menu' | 'mute' } | null>(null);
  // The one row slid open to its actions.
  const [openRow, setOpenRow] = useState<string | null>(null);
  // "typing…" in a row while someone types in that chat (Oct 4, owner). Heard
  // straight from their phone; it holds while they have a message on the go and goes when they send.
  const [typingIn, setTypingIn] = useState<Record<string, { userId: string; at: number }>>({});
  useEffect(() => actions.watchInboxTyping((conversationId, userId, stopped) => setTypingIn((t) => {
    if (!stopped) return { ...t, [conversationId]: { userId, at: Date.now() } };
    if (t[conversationId]?.userId !== userId) return t;
    const next = { ...t }; delete next[conversationId]; return next;
  })), [actions]);
  useEffect(() => {
    if (!Object.keys(typingIn).length) return;
    const timer = setInterval(() => setTypingIn((cur) => {
      const now = Date.now();
      const next = Object.fromEntries(Object.entries(cur).filter(([, v]) => now - v.at < 7000));
      return Object.keys(next).length === Object.keys(cur).length ? cur : next;
    }), 1000);
    return () => clearInterval(timer);
  }, [typingIn]);
  const isCoach = Boolean(currentUser?.isCoach);

  // Every message by its id, once: each row's last message is looked up here, not searched for.
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const all = useMemo<Thread[]>(() => conversations
    // A chat you deleted from your inbox stays away until someone writes in it again.
    .filter((c) => !c.hiddenAt || Date.parse(c.updatedAt) > Date.parse(c.hiddenAt))
    .map((conversation) => {
      const otherId = conversation.participantIds.find((id) => id !== currentUserId);
      const other = otherId ? usersById.get(otherId) : undefined;
      let last: Message | undefined;
      for (let i = conversation.messageIds.length - 1; i >= 0 && !last; i -= 1) last = byId.get(conversation.messageIds[i]);
      const group = isGroupChat(conversation);
      return {
        conversation, other, last, group, muted: isMuted(conversation),
        unread: conversation.unreadCount > 0 || !!conversation.markedUnread,
        name: group ? groupName(conversation, users, currentUserId) : other?.name ?? '',
        people: othersIn(conversation, users, currentUserId),
      };
    })
    // A group stays even when everyone else has gone (or is not loaded yet);
    // a one-to-one needs the other person, and goes when they are blocked.
    // One with nothing in it yet is not listed (Instagram's way): a chat opened
    // and left without a word is only a chat once someone writes in it.
    .filter((t) => t.group || (Boolean(t.other) && !blockedIds.includes(t.other!.id) && t.conversation.messageIds.length > 0)),
  [conversations, byId, usersById, users, currentUserId, blockedIds]);

  const threads = useMemo(() => {
    const words = search.trim().toLowerCase();
    return all
      .filter((t) =>
        section === 'groups' ? t.group
        : section === 'coaches' ? !t.group && Boolean(t.other?.isCoach)
        : section === 'clients' ? !t.group && !t.other?.isCoach
        : true,
      )
      .filter((t) => !words || `${t.name} ${t.group ? t.people.map((p) => p.name).join(' ') : t.other?.handle}`.toLowerCase().includes(words))
      // Pinned chats first, in the order they were pinned (iMessage's); then newest first.
      .sort((a, b) => {
        const pa = a.conversation.pinnedAt, pb = b.conversation.pinnedAt;
        if (pa || pb) return !pa ? 1 : !pb ? -1 : Date.parse(pa) - Date.parse(pb);
        return Date.parse(b.conversation.updatedAt) - Date.parse(a.conversation.updatedAt);
      });
  }, [all, search, section]);

  // Up to hit today: people you can message (or already talk to) who said so today, never someone blocked.
  const upToday = useMemo(() => {
    if (!currentUserId) return [];
    const talking = new Set(all.filter((t) => !t.group && t.other).map((t) => t.other!.id));
    const now = Date.now();
    // Up for it by their own word today, or by the map's ring (the same "open" a player wears there).
    const open = (u: User) => isOpenToHit(u) || (!!lastSeen[u.id]?.openUntil && Date.parse(lastSeen[u.id].openUntil!) > now);
    return users
      .filter((u) => u.id !== currentUserId && open(u) && !blockedIds.includes(u.id) && (talking.has(u.id) || actions.canMessage(u.id)))
      // The people you already talk to first.
      .sort((a, b) => Number(talking.has(b.id)) - Number(talking.has(a.id)))
      .slice(0, 12);
  }, [users, all, currentUserId, blockedIds, actions, lastSeen]);
  const openWith = (u: User) => {
    const chat = currentUserId ? findDirectChat(conversations, currentUserId, u.id) : undefined;
    router.push(`/messages/${chat ? chat.id : actions.openConversationWith(u.id)}`);
  };

  const emptyCopy =
    section === 'groups' ? { title: 'No group chats yet', body: 'Start one from New message: pick two or more people.' }
    : section === 'coaches' ? { title: 'No coach conversations', body: 'Message a coach from their page and it will show up here.' }
    : section === 'clients' ? { title: 'No clients yet', body: 'Players who message you about coaching land here.' }
    : { title: 'No messages yet', body: 'Find a player in Community and start a conversation.' };

  /**
   * The row's second line. In a group it says whose it was ("Mira: see you
   * at 9", "You: on my way"); an event line ("Mira added Dev") reads as it
   * is; and words from someone you blocked are never shown.
   */
  const preview = (group: boolean, last: Message | undefined, said: string) => {
    if (!last) return said;
    if (last.kind === 'system') return eventText(last, users, currentUserId);
    if (last.senderId === currentUserId) return `You: ${said}`;
    // Hidden by your Hidden words (migration 117): its words stay out of the inbox too.
    const words = last.hiddenByWords ? 'Hidden message' : said;
    if (!group) return words;
    if (blockedIds.includes(last.senderId)) return 'Message from someone you blocked';
    return `${usersById.get(last.senderId)?.name.split(' ')[0] ?? 'Someone'}: ${words}`;
  };

  const sections: { value: Section; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'groups', label: 'Groups' },
    isCoach ? { value: 'clients', label: 'Clients' } : { value: 'coaches', label: 'Coaches' },
  ];

  // Only the pinned chats the inbox shows count (a chat with someone you blocked is not one of them).
  const pinnedCount = all.filter((t) => t.conversation.pinnedAt).length;
  const askDelete = (conversation: Conversation, after = false) => (after ? confirmAfterMenu : confirm)({
    title: 'Delete this chat?',
    message: 'It leaves your inbox, and what was said so far is cleared for you. Nobody else’s copy changes, and a new message brings the chat back.',
    confirmLabel: 'Delete',
    destructive: true,
    onConfirm: () => actions.hideChat(conversation.id),
  });

  // What a held row offers: pin, read or unread, mute (which asks for how
  // long) or unmute, delete, and leaving a group. A group from a database
  // without mute yet (before migration 54) offers no mute.
  const sheetOptions: SheetOption[] = !held ? [] : held.step === 'mute'
    ? MUTE_CHOICES.map((choice) => ({ key: choice.key, label: choice.label, onPress: () => actions.muteChat(held.conversation.id, muteUntil(choice.ms)) }))
    : [
      held.conversation.pinnedAt
        ? { key: 'unpin', label: 'Unpin', icon: 'pin-outline' as const, onPress: () => actions.pinChat(held.conversation.id, false) }
        : { key: 'pin', label: 'Pin to the top', icon: 'pin-outline' as const, disabled: pinnedCount >= MAX_PINNED_CHATS, detail: pinnedCount >= MAX_PINNED_CHATS ? `Up to ${MAX_PINNED_CHATS} chats. Unpin one first.` : undefined, onPress: () => actions.pinChat(held.conversation.id, true) },
      held.conversation.unreadCount > 0 || held.conversation.markedUnread
        ? { key: 'read', label: 'Mark as read', icon: 'checkmark-done-outline' as const, onPress: () => actions.markChatUnread(held.conversation.id, false) }
        : { key: 'unread', label: 'Mark as unread', icon: 'mail-unread-outline' as const, onPress: () => actions.markChatUnread(held.conversation.id, true) },
      ...(!hasGroupControls(held.conversation) ? [] : isMuted(held.conversation)
        ? [{ key: 'unmute', label: 'Unmute', icon: 'notifications-outline' as const, onPress: () => actions.muteChat(held.conversation.id, null) }]
        : [{ key: 'mute', label: 'Mute messages', icon: 'notifications-off-outline' as const, onPress: () => setHeld({ ...held, step: 'mute' }) }]),
      { key: 'delete', label: 'Delete chat', icon: 'trash-outline' as const, danger: true, onPress: () => askDelete(held.conversation, true) },
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
          hitSlop={8}
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
      {upToday.length && !search.trim() ? (
        // Instagram has notes here; CourtSide has who is up to hit today. A tap opens the chat with them.
        <View style={styles.upToday}>
          <Text style={styles.upTodayTitle}>Up to hit today</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.upTodayRow} style={styles.upTodayScroll}>
            {upToday.map((u) => (
              <Pressable key={u.id} accessibilityRole="button" accessibilityLabel={`${u.name} is up to hit today. Message them`} onPress={() => openWith(u)} style={({ pressed }) => [styles.face, pressed && { opacity: 0.6 }]}>
                <View style={styles.faceRing}>
                  <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={54} />
                </View>
                <Text style={styles.faceName} numberOfLines={1}>{u.name.split(' ')[0]}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      <View style={styles.sections}>
        {sections.map((seg) => (
          <Chip key={seg.value} label={seg.label} selected={section === seg.value} tint={colors.text} ink={colors.brandInk} onPress={() => setSection(seg.value)} />
        ))}
      </View>

      {threads.length === 0 ? (
        <EmptyState icon="chatbubble-ellipses-outline" title={emptyCopy.title} body={emptyCopy.body} action={{ label: 'New message', onPress: () => router.push('/messages/new') }} />
      ) : (
        <View style={styles.list}>
          {threads.map((t, index) => {
            const { conversation, muted, unread, name } = t;
            // Their message arriving ends it at once.
            const typer = typingIn[conversation.id];
            const typing = typer && !blockedIds.includes(typer.userId) && !(t.last && t.last.senderId === typer.userId && Date.parse(t.last.createdAt) >= typer.at - 1000)
              ? (t.group ? `${usersById.get(typer.userId)?.name.split(' ')[0] ?? 'Someone'} is typing…` : 'typing…') : undefined;
            // Mute only where the database has it (the hold menu's rule too).
            const canMute = hasGroupControls(conversation);
            const toggleMute = () => { if (muted) actions.muteChat(conversation.id, null); else setHeld({ conversation, name, step: 'mute' }); };
            const actionsUnder = (
              <>
                {canMute ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={muted ? `Unmute ${name}` : `Mute ${name}`}
                    onPress={() => { setOpenRow(null); toggleMute(); }}
                    style={[styles.action, styles.actionQuiet]}
                  >
                    <Ionicons name={muted ? 'notifications-outline' : 'notifications-off-outline'} size={21} color={colors.text} />
                    <Text style={styles.actionText}>{muted ? 'Unmute' : 'Mute'}</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete chat with ${name}`}
                  onPress={() => { setOpenRow(null); askDelete(conversation); }}
                  style={[styles.action, styles.actionDanger]}
                >
                  {/* Dark on the two dark courts, where white on their lighter red fell short. */}
                  <Ionicons name="trash-outline" size={21} color={colors.onDanger} />
                  <Text style={[styles.actionText, { color: colors.onDanger }]}>Delete</Text>
                </Pressable>
              </>
            );
            // What the swipes and the hold menu offer, for a screen reader (which cannot swipe a row).
            const rowActions: RowAction[] = [
              // Pin only while there is room for another (up to MAX_PINNED_CHATS).
              ...(conversation.pinnedAt
                ? [{ name: 'unpin', label: 'Unpin', run: () => actions.pinChat(conversation.id, false) }]
                : pinnedCount < MAX_PINNED_CHATS ? [{ name: 'pin', label: 'Pin to the top', run: () => actions.pinChat(conversation.id, true) }] : []),
              unread
                ? { name: 'read', label: 'Mark as read', run: () => actions.markChatUnread(conversation.id, false) }
                : { name: 'unread', label: 'Mark as unread', run: () => actions.markChatUnread(conversation.id, true) },
              ...(canMute ? [{ name: 'mute', label: muted ? 'Unmute' : 'Mute messages', run: toggleMute }] : []),
              { name: 'delete', label: 'Delete chat', run: () => askDelete(conversation) },
              ...(t.group ? [{
                name: 'leave', label: 'Leave group',
                run: () => confirm({ title: 'Leave this group?', message: leaveGroupMessage(conversation, hitRequests, currentUserId), confirmLabel: 'Leave', destructive: true, onConfirm: () => actions.leaveGroup(conversation.id) }),
              }] : []),
            ];
            const mark = (
              <View style={styles.markDisc}>
                <Ionicons name={unread ? 'checkmark-done' : 'mail-unread'} size={20} color={colors.brandInk} />
              </View>
            );
            return (
              <SwipeRow
                key={conversation.id}
                actions={actionsUnder}
                actionCount={canMute ? 2 : 1}
                mark={mark}
                onMark={() => actions.markChatUnread(conversation.id, !unread)}
                open={openRow === conversation.id}
                // Any swipe closes whichever row was open before.
                onOpen={(o) => setOpenRow(o ? conversation.id : null)}
              >
                <InboxRow
                  thread={t}
                  first={index === 0}
                  styles={styles}
                  line={(said) => preview(t.group, t.last, said)}
                  typing={typing}
                  onOpen={() => { if (openRow) { setOpenRow(null); return; } router.push(`/messages/${conversation.id}`); }}
                  onHold={() => { setOpenRow(null); setHeld({ conversation, name, step: 'menu' }); }}
                  rowActions={rowActions}
                />
              </SwipeRow>
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

/**
 * One chat in the inbox: its picture, its name (bold while there is
 * something new), when it last moved, and its last message (in full ink
 * while new). A link reads as its title once it is known.
 */
/** Something a row offers a screen reader: what the swipes and the hold menu do. */
interface RowAction { name: string; label: string; run: () => void }

function InboxRow({ thread, first, styles, line, typing, onOpen, onHold, rowActions }: {
  thread: Thread; first: boolean; styles: any; line: (said: string) => string; typing?: string; onOpen: () => void; onHold: () => void; rowActions: RowAction[];
}) {
  const { conversation, other, last, group, muted, unread, name, people } = thread;
  const link = last?.kind === 'text' ? isOnlyLink(last.body) : null;
  // Read so the line changes from "Sent a link" to the page's title as soon as it is known.
  useLinkPreview(link ? link.url : null);
  const said = messageSummary(last);
  const pinned = !!conversation.pinnedAt;
  // A muted chat's news is still news, but quiet: no bold, no brand colour.
  const loud = unread && !muted;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${group ? `Open ${name}` : `Open conversation with ${name}`}${pinned ? ', pinned' : ''}${muted ? ', muted' : ''}${unread ? ', new messages' : ''}`}
      accessibilityHint="Swipe or hold for pin, mute and more"
      accessibilityActions={rowActions.map(({ name, label }) => ({ name, label }))}
      onAccessibilityAction={(e) => rowActions.find((a) => a.name === e.nativeEvent.actionName)?.run()}
      onPress={onOpen}
      onLongPress={onHold}
      delayLongPress={400}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {group ? <GroupAvatar people={people} size={52} photoUrl={conversation.photoUrl} name={name} /> : <Avatar name={other?.name ?? '?'} seed={other?.avatarSeed ?? conversation.id} uri={other?.avatarUrl} size={52} />}
      <View style={[styles.rowBody, !first && styles.rowLine]}>
        <View style={styles.rowTop}>
          <Text style={[styles.name, loud && styles.unreadName]} numberOfLines={1}>{name}</Text>
          <View style={styles.when}>
            {pinned ? <Ionicons name="pin" size={12} color={colors.textFaint} accessibilityLabel="Pinned" /> : null}
            <Text style={[styles.time, loud && styles.unreadTime]}>{relativeTime(conversation.updatedAt)}</Text>
            {muted ? <Ionicons name="notifications-off-outline" size={13} color={colors.textFaint} accessibilityLabel="Muted" /> : null}
          </View>
        </View>
        <View style={styles.rowBottom}>
          <Text numberOfLines={1} style={[styles.preview, loud && styles.unreadPreview, typing && styles.typingPreview]} accessibilityLiveRegion="polite">
            {typing ?? line(said)}
          </Text>
          {unread ? <View style={[styles.dot, muted && styles.dotMuted]} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  searchWrap: { position: 'relative', justifyContent: 'center', marginBottom: spacing.md },
  searchIcon: { position: 'absolute', left: 16, zIndex: 1 },
  search: {
    ...typography.body, fontSize: 16, color: colors.text,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill,
    paddingLeft: 42, paddingRight: spacing.lg, paddingVertical: 11,
  },
  // Who is up to hit today: a row of faces in the live green ring.
  upToday: { marginBottom: spacing.sm },
  upTodayTitle: { ...typography.caption, color: colors.textFaint, marginBottom: spacing.sm },
  upTodayScroll: { marginHorizontal: -spacing.lg },
  upTodayRow: { paddingHorizontal: spacing.lg, gap: spacing.md },
  face: { width: 64, alignItems: 'center', gap: 5 },
  faceRing: { padding: 2, borderRadius: 32, borderWidth: 2, borderColor: colors.open },
  faceName: { ...typography.small, fontSize: 12, lineHeight: 15, color: colors.text, maxWidth: 64 },
  sections: { flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.sm },
  list: { marginHorizontal: -spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingLeft: spacing.lg, backgroundColor: colors.bg },
  rowPressed: { backgroundColor: colors.bgElevated },
  // The hairline runs from the words, not the picture — the way a phone's own inbox draws it.
  rowBody: { flex: 1, gap: 3, minWidth: 0, paddingVertical: 13, paddingRight: spacing.lg },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...typography.body, ...font('500'), fontSize: 16, color: colors.text, flexShrink: 1 },
  unreadName: { ...font('700') },
  when: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 0 },
  time: { ...typography.small, color: colors.textFaint, flexShrink: 0 },
  unreadTime: { color: colors.brand, ...font('600') },
  preview: { ...typography.small, fontSize: 14, color: colors.textMuted, flex: 1 },
  typingPreview: { color: colors.brand, fontStyle: 'italic' },
  unreadPreview: { color: colors.text, ...font('500') },
  dot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: colors.brand },
  dotMuted: { backgroundColor: colors.textFaint },
  // Under a row slid to the left: Mute, then Delete.
  action: { width: 78, alignItems: 'center', justifyContent: 'center', gap: 3 },
  actionQuiet: { backgroundColor: colors.surfaceAlt },
  actionDanger: { backgroundColor: colors.danger },
  actionText: { ...typography.smallStrong, fontSize: 12, color: colors.text },
  // Under a row slid to the right: read or unread.
  markDisc: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand },
});

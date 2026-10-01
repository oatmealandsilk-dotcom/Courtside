import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar, EmptyState, Screen } from '@/components/ui';
import { GroupAvatar, groupName, othersIn } from '@/features/messages/groups';
import { confirm } from '@/lib/confirm';
import { goBack } from '@/lib/goBack';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, spacing, typography } from '@/theme';

/**
 * A group chat's details: its name (anyone in it can change it), who is in
 * it, adding someone, and leaving. The way Instagram's group info reads.
 */
export default function GroupInfo() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { conversations, users, currentUserId, currentUser, blockedIds, actions } = useApp();
  const conversation = conversations.find((c) => c.id === id);
  const [title, setTitle] = useState(conversation?.title ?? '');
  useEffect(() => { setTitle(conversation?.title ?? ''); }, [conversation?.title]);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const nameBox = useRef<TextInput>(null);

  if (!conversation) {
    return <Screen title="Group" compactTitle onBack={() => goBack('/messages')}><EmptyState icon="people-outline" title="This group is gone" body="You may have left it." /></Screen>;
  }
  const people = othersIn(conversation, users, currentUserId);
  const saveTitle = () => { if ((conversation.title ?? '') !== title.trim()) actions.renameGroup(conversation.id, title); };
  const term = query.trim().replace(/^@/, '').toLowerCase();
  const candidates = users
    .filter((u) => u.id !== currentUserId && !conversation.participantIds.includes(u.id) && !blockedIds.includes(u.id) && `${u.name} ${u.handle}`.toLowerCase().includes(term))
    .slice(0, 20);
  const add = (userId: string, name: string) => {
    if (!actions.canMessage(userId)) { showToast({ title: `Only people ${name.split(' ')[0]} follows can message them`, icon: 'lock-closed-outline' }); return; }
    if (conversation.participantIds.length >= 16) { showToast({ title: 'A group can have up to 16 people', icon: 'people-outline' }); return; }
    actions.addToGroup(conversation.id, userId);
    setQuery('');
  };
  const leave = () => confirm({ title: 'Leave this group?', message: 'You stop getting its messages. Someone in it can add you back.', confirmLabel: 'Leave', destructive: true, onConfirm: () => {
    actions.leaveGroup(conversation.id);
    router.replace('/messages');
  } });

  return (
    <Screen title="Group" compactTitle onBack={() => goBack(`/messages/${conversation.id}`)}>
      <View style={styles.top}>
        <GroupAvatar people={people} size={72} />
        {/* A small pencil says the name can be changed, in place of a sentence saying so.
            An empty spacer on the other side keeps the name centred under the picture. */}
        <View style={styles.nameRow}>
          <View style={styles.pencil} />
          <TextInput
            ref={nameBox}
            value={title}
            onChangeText={(v) => setTitle(v.slice(0, 60))}
            onBlur={saveTitle}
            onSubmitEditing={saveTitle}
            placeholder={groupName({ ...conversation, title: undefined }, users, currentUserId)}
            placeholderTextColor={colors.textFaint}
            style={styles.title}
            accessibilityLabel="Group name"
            returnKeyType="done"
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Rename the group" hitSlop={10} onPress={() => nameBox.current?.focus()} style={styles.pencil}>
            <Ionicons name="pencil" size={15} color={colors.textFaint} />
          </Pressable>
        </View>
      </View>

      <Text style={styles.section}>{people.length + 1} people</Text>
      <View style={styles.group}>
        {currentUser ? (
          <View style={styles.row}>
            <Avatar name={currentUser.name} seed={currentUser.avatarSeed} uri={currentUser.avatarUrl} size={40} />
            <View style={styles.words}><Text style={styles.name}>{currentUser.name}</Text><Text style={styles.meta}>You</Text></View>
          </View>
        ) : null}
        {people.map((u) => (
          <Pressable key={u.id} accessibilityRole="link" onPress={() => router.push(`/user/${u.id}`)} style={({ pressed }) => [styles.row, styles.line, pressed && { backgroundColor: colors.surfaceAlt }]}>
            <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={40} />
            <View style={styles.words}><Text style={styles.name} numberOfLines={1}>{u.name}</Text><Text style={styles.meta} numberOfLines={1}>@{u.handle}</Text></View>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" onPress={() => setAdding((a) => !a)} style={({ pressed }) => [styles.row, styles.line, pressed && { backgroundColor: colors.surfaceAlt }]}>
          <View style={styles.addIcon}><Ionicons name="person-add-outline" size={18} color={colors.brand} /></View>
          <Text style={styles.addText}>Add people</Text>
        </Pressable>
      </View>

      {adding ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          <TextInput value={query} onChangeText={setQuery} placeholder="Search" placeholderTextColor={colors.textFaint} autoFocus autoCapitalize="none" autoCorrect={false} style={styles.search} accessibilityLabel="Find someone to add" />
          <View style={styles.group}>
            {candidates.map((u, i) => (
              <Pressable key={u.id} accessibilityRole="button" accessibilityLabel={`Add ${u.name}`} onPress={() => add(u.id, u.name)} style={({ pressed }) => [styles.row, i > 0 && styles.line, pressed && { backgroundColor: colors.surfaceAlt }]}>
                <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={36} />
                <View style={styles.words}><Text style={styles.name} numberOfLines={1}>{u.name}</Text><Text style={styles.meta} numberOfLines={1}>@{u.handle}</Text></View>
                <Ionicons name="add-circle" size={22} color={colors.brand} />
              </Pressable>
            ))}
            {!candidates.length ? <Text style={[styles.meta, { padding: spacing.lg }]}>No one else to add.</Text> : null}
          </View>
        </View>
      ) : null}

      <Pressable accessibilityRole="button" onPress={leave} style={({ pressed }) => [styles.leave, pressed && { opacity: 0.8 }]}>
        <Text style={styles.leaveText}>Leave group</Text>
      </Pressable>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  top: { alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.lg },
  title: { ...typography.title, color: colors.text, textAlign: 'center', minWidth: 200, flexShrink: 1, paddingVertical: 4, outlineStyle: 'none' } as object,
  // A long name narrows rather than pushing the pencil off the screen.
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, maxWidth: '100%' },
  pencil: { width: 18, alignItems: 'center' },
  section: { ...typography.smallStrong, color: colors.textMuted, paddingHorizontal: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.sm },
  group: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 11, paddingHorizontal: spacing.lg },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  words: { flex: 1, minWidth: 0, gap: 1 },
  name: { ...typography.body, ...font('600'), color: colors.text },
  meta: { ...typography.small, color: colors.textMuted },
  addIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  addText: { ...typography.bodyStrong, color: colors.brand },
  search: { ...typography.body, color: colors.text, height: 44, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surface, outlineStyle: 'none' } as object,
  leave: { marginTop: spacing.xl, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, ...lift },
  leaveText: { ...typography.bodyStrong, color: colors.danger },
});

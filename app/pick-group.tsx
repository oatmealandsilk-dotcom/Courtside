import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { DragSheet } from '@/components/DragSheet';
import { SheetTitle } from '@/components/sheet/SheetForm';
import { Avatar, Field } from '@/components/ui';
import { GROUP_CAP, GroupAvatar, groupName, isGroupChat, othersIn } from '@/features/messages/groups';
import { confirm } from '@/lib/confirm';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, typography } from '@/theme';

/** More groups than this and a search box helps find the one. */
const SEARCH_FROM = 7;

/**
 * "Add to group", Instagram's and Snapchat's way: from someone's profile or
 * their card on the map (`?user=<id>`), pick one of your groups and they are
 * in. A group they are already in, or one that is full (GROUP_CAP people),
 * can't be picked. "New group with Mira" starts a fresh one with them
 * already ticked. Anyone in a group can add people; someone who only gets
 * messages from people they follow (a teen account) can only be added by
 * those people, the same rule as a one-to-one chat.
 */
export default function PickGroup() {
  const styles = useThemedStyles(styleDefinitions);
  const { user: userId = '' } = useLocalSearchParams<{ user?: string }>();
  const { users, conversations, currentUserId, blockedIds, actions } = useApp();
  const [closeSignal, setCloseSignal] = useState(0);
  const dismiss = () => setCloseSignal((n) => n + 1);
  const [search, setSearch] = useState('');
  // The group they are being added to, and whether the server agreed, for the note once this sheet has gone.
  const added = useRef<{ id: string; name: string; done: Promise<boolean> } | null>(null);

  const person = users.find((u) => u.id === userId && u.id !== currentUserId);
  const first = person?.name.split(' ')[0] ?? 'them';
  const blocked = !!person && blockedIds.includes(person.id);
  // The one-to-one rule: a teen account can only be added by people it follows.
  const locked = !!person && !blocked && !actions.canMessage(person.id);

  const groups = useMemo(() => {
    if (!currentUserId) return [];
    return conversations
      .filter((c) => isGroupChat(c) && c.participantIds.includes(currentUserId))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .map((c) => {
        const people = othersIn(c, users, currentUserId);
        const name = groupName(c, users, currentUserId);
        return { conversation: c, people, name, words: `${name} ${people.map((p) => `${p.name} ${p.handle}`).join(' ')}`.toLowerCase() };
      });
  }, [conversations, users, currentUserId]);
  const term = search.trim().replace(/^@/, '').toLowerCase();
  const shown = term ? groups.filter((g) => g.words.includes(term)) : groups;

  const add = (conversationId: string, name: string) => {
    if (!person) return;
    confirm({
      title: `Add ${first} to ${name}?`,
      message: `Everyone in it will see that you added ${first}.`,
      confirmLabel: 'Add',
      onConfirm: () => {
        added.current = { id: conversationId, name, done: actions.addGroupMembers(conversationId, [person.id]) };
        dismiss();
      },
    });
  };

  // Away first, then the note, so a tap on it (it opens the group) never lands on this sheet on its way out.
  // "Added to …" only once the server has agreed; if it says no, the store puts it back and says why.
  const done = () => {
    router.back();
    const pending = added.current;
    if (pending) void pending.done.then((ok) => { if (ok) showToast({ title: `Added to ${pending.name}`, icon: 'people-outline', href: `/messages/${pending.id}` }); });
  };

  // Starting a group goes to New message with them ticked; this sheet makes way for it.
  const newGroup = () => { if (person) router.replace({ pathname: '/messages/new', params: { with: person.id } }); };

  return (
    <DragSheet
      fitContent
      closeSignal={closeSignal}
      onDismissed={done}
      peekFraction={0.62}
      header={<SheetTitle title={person ? `Add ${first} to a group` : 'Add to a group'} line={person ? 'Pick one of your groups' : undefined} onClose={dismiss} />}
    >
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {!person ? (
          <Text style={styles.note}>This player isn’t on CourtSide any more.</Text>
        ) : blocked ? (
          <Text style={styles.note}>You blocked {first}. Unblock them first to add them to a group.</Text>
        ) : (
          <>
            {locked ? (
              <View style={styles.lockedNote}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
                <Text style={styles.lockedText}>Only people {first} follows can add them to a group.</Text>
              </View>
            ) : null}

            {groups.length >= SEARCH_FROM ? (
              <Field value={search} onChangeText={setSearch} placeholder="Search your groups" autoCapitalize="none" autoCorrect={false} />
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`New group with ${person.name}`}
              disabled={locked}
              onPress={newGroup}
              style={(state) => [styles.row, ((state as { hovered?: boolean }).hovered || state.pressed) && styles.rowOn, locked && styles.rowOff]}
            >
              <View style={styles.newFace}>
                <Avatar name={person.name} seed={person.avatarSeed} uri={person.avatarUrl} size={44} />
                <View style={styles.plus}><Ionicons name="add" size={13} color={colors.brandInk} /></View>
              </View>
              <View style={styles.words}>
                <Text style={styles.name} numberOfLines={1}>New group with {first}</Text>
                <Text style={styles.sub} numberOfLines={1}>Pick who else, and give it a name</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </Pressable>

            {shown.map(({ conversation, people, name }) => {
              const already = conversation.participantIds.includes(person.id);
              const full = conversation.participantIds.length >= GROUP_CAP;
              const off = already || full || locked;
              const sub = already ? `${first} is already in it`
                : full ? `Full · ${GROUP_CAP} people`
                // A named group says who is in it; an unnamed one is already called by its people.
                : conversation.title && people.length ? people.map((p) => p.name.split(' ')[0]).join(', ')
                : `${conversation.participantIds.length} people`;
              return (
                <Pressable
                  key={conversation.id}
                  accessibilityRole="button"
                  accessibilityLabel={off ? `${name}. ${sub}` : `Add ${first} to ${name}`}
                  accessibilityState={{ disabled: off }}
                  disabled={off}
                  onPress={() => add(conversation.id, name)}
                  style={(state) => [styles.row, ((state as { hovered?: boolean }).hovered || state.pressed) && styles.rowOn, off && styles.rowOff]}
                >
                  <GroupAvatar people={people} size={44} photoUrl={conversation.photoUrl} name={name} />
                  <View style={styles.words}>
                    <Text style={styles.name} numberOfLines={1}>{name}</Text>
                    <Text style={styles.sub} numberOfLines={1}>{sub}</Text>
                  </View>
                  {already ? <Ionicons name="checkmark" size={18} color={colors.textFaint} /> : off ? null : <Ionicons name="add-circle-outline" size={22} color={colors.brand} />}
                </Pressable>
              );
            })}

            {!groups.length ? <Text style={styles.note}>You’re not in any groups yet. Start one with {first}.</Text> : null}
            {groups.length > 0 && !shown.length ? <Text style={styles.note}>No group matches “{search.trim()}”.</Text> : null}
          </>
        )}
      </ScrollView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.xs },
  note: { ...typography.small, color: colors.textMuted, lineHeight: 19, paddingVertical: spacing.md },
  lockedNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.bgElevated, marginBottom: spacing.sm },
  lockedText: { ...typography.small, color: colors.textMuted, flex: 1, lineHeight: 19 },
  // The same rows as New message's list: a face, two lines, and a soft highlight under a finger or the mouse.
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  rowOn: { backgroundColor: colors.surfaceAlt },
  rowOff: { opacity: 0.5 },
  newFace: { width: 44, height: 44 },
  plus: {
    position: 'absolute', right: -3, bottom: -3, width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.brand, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center',
  },
  words: { flex: 1, minWidth: 0, gap: 1 },
  name: { ...typography.body, ...font('600'), color: colors.text },
  sub: { ...typography.small, color: colors.textMuted },
});

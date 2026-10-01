import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar, EmptyState, Screen } from '@/components/ui';
import { GROUP_CAP, GroupAvatar, groupName, isGroupChat, othersIn } from '@/features/messages/groups';
import { goBack } from '@/lib/goBack';
import { show as showToast } from '@/lib/toast';
import { useResponsive } from '@/lib/useResponsive';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, spacing, typography } from '@/theme';


/**
 * Starting a chat. On a computer it is a small box over your inbox, the way
 * Instagram's is: "To", the people you talk to most, and one click opens the
 * chat. On a phone it is its own page. Never suggests someone blocked.
 *
 * Instagram's way for groups: tick two or more people (up to GROUP_CAP in
 * all, you included), give it a name if you like, then Create group. Your
 * groups are listed first, so an existing one is one tap away, and picking
 * exactly the people of an unnamed group you already have opens that group
 * instead of making a second one (iMessage does the same).
 *
 * `?with=<id>` opens with that person already picked: "Create a group with
 * Mira" from a one-to-one chat's details.
 */
export default function NewMessage() {
  const styles = useThemedStyles(styleDefinitions);
  const { isPhone } = useResponsive();
  const params = useLocalSearchParams<{ with?: string }>();
  const { users, conversations, currentUserId, blockedIds, actions } = useApp();
  const [query, setQuery] = useState('');
  // Instagram's way: tick people, then Chat (one) or Create group (two or more).
  const [picked, setPicked] = useState<string[]>(() => {
    const first = params.with;
    return first && first !== currentUserId && !blockedIds.includes(first) && users.some((u) => u.id === first) ? [first] : [];
  });
  const [title, setTitle] = useState('');
  const term = query.trim().replace(/^@/, '').toLowerCase();
  const recent = [...conversations].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).flatMap((c) => c.participantIds.filter((id) => id !== currentUserId));
  const matches = users
    .filter((u) => u.id !== currentUserId && !blockedIds.includes(u.id) && `${u.name} ${u.handle}`.toLowerCase().includes(term))
    .sort((a, b) => (recent.includes(a.id) ? recent.indexOf(a.id) : 999) - (recent.includes(b.id) ? recent.indexOf(b.id) : 999))
    .slice(0, 50);
  // Your groups, newest first, found by their name or anyone in them. Only
  // while nobody is ticked: once you are picking people, a tap on a group
  // would throw the picking away.
  const groups = picked.length || !currentUserId ? [] : conversations
    .filter((c) => isGroupChat(c) && c.participantIds.includes(currentUserId))
    .map((c) => ({ conversation: c, name: groupName(c, users, currentUserId), people: othersIn(c, users, currentUserId) }))
    .filter(({ name, people }) => !term || `${name} ${people.map((p) => `${p.name} ${p.handle}`).join(' ')}`.toLowerCase().includes(term))
    .sort((a, b) => Date.parse(b.conversation.updatedAt) - Date.parse(a.conversation.updatedAt))
    .slice(0, term ? 20 : 5);
  // The same people, with no new name: the unnamed group you already have.
  const sameGroup = picked.length > 1 && !title.trim() && currentUserId
    ? conversations.find((c) => {
      if (!isGroupChat(c) || c.title || c.participantIds.length !== picked.length + 1) return false;
      return c.participantIds.includes(currentUserId) && picked.every((id) => c.participantIds.includes(id));
    })
    : undefined;
  // On a computer the box arrives on its own (the inbox behind never moves or
  // flashes): the backdrop darkens and blurs, the box rises and settles.
  const backdrop = useRef<View>(null);
  const box = useRef<View>(null);
  const closing = useRef(false);
  const node = (r: React.RefObject<View | null>) => r.current as unknown as HTMLElement | null;
  useEffect(() => {
    if (isPhone || Platform.OS !== 'web') return;
    node(backdrop)?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
    node(box)?.animate?.([{ opacity: 0, transform: 'translateY(8px) scale(0.97)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }, [isPhone]);
  const close = () => {
    if (isPhone || Platform.OS !== 'web') { goBack('/messages'); return; }
    if (closing.current) return;
    closing.current = true;
    node(box)?.animate?.([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.97)' }], { duration: 140, easing: 'ease-in', fill: 'forwards' });
    const out = node(backdrop)?.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease-in', fill: 'forwards' });
    if (out) out.onfinish = () => goBack('/messages'); else goBack('/messages');
  };
  const toggle = (id: string, name: string) => {
    if (picked.includes(id)) { setPicked((p) => p.filter((x) => x !== id)); return; }
    // A teen can only be messaged, or put in a group, by people they follow.
    if (!actions.canMessage(id)) { showToast({ title: `Only people ${name.split(' ')[0]} follows can message them`, icon: 'lock-closed-outline' }); return; }
    if (picked.length >= GROUP_CAP - 1) { showToast({ title: `A group can have up to ${GROUP_CAP} people`, icon: 'people-outline' }); return; }
    setPicked((p) => [...p, id]);
    setQuery('');
  };
  const start = () => {
    if (!picked.length) return;
    const id = picked.length === 1 ? actions.openConversationWith(picked[0]) : sameGroup?.id ?? actions.createGroup(picked, title);
    if (!id) return;
    router.replace(`/messages/${id}`);
  };
  const pickedUsers = picked.map((id) => users.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => !!u);
  const chips = pickedUsers.length ? (
    <View style={styles.chips}>
      {pickedUsers.map((u) => (
        <Pressable key={u.id} accessibilityRole="button" accessibilityLabel={`Remove ${u.name}`} onPress={() => setPicked((p) => p.filter((x) => x !== u.id))} style={styles.chip}>
          <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={20} />
          <Text style={styles.chipText} numberOfLines={1}>{u.name.split(' ')[0]}</Text>
          <Ionicons name="close" size={13} color={colors.brand} />
        </Pressable>
      ))}
    </View>
  ) : null;
  const footer = picked.length ? (
    <View style={styles.footer}>
      {picked.length > 1 ? (
        <TextInput value={title} onChangeText={(v) => setTitle(v.slice(0, 60))} placeholder="Group name (optional)" placeholderTextColor={colors.textFaint} style={styles.groupName} accessibilityLabel="Group name" />
      ) : null}
      <Pressable accessibilityRole="button" onPress={start} style={({ pressed }) => [styles.start, pressed && { opacity: 0.85 }]}>
        <Text style={styles.startText}>{picked.length === 1 ? 'Chat' : sameGroup ? 'Open group' : `Create group · ${picked.length + 1}`}</Text>
      </Pressable>
    </View>
  ) : null;

  const list = (
    <>
      {groups.length ? (
        <>
          <Text style={styles.label}>Groups</Text>
          {groups.map(({ conversation, name, people }) => (
            <Pressable
              key={conversation.id}
              accessibilityRole="link"
              accessibilityLabel={`Open ${name}`}
              onPress={() => router.replace(`/messages/${conversation.id}`)}
              style={(state) => [styles.row, ((state as { hovered?: boolean }).hovered || state.pressed) && styles.rowOn]}
            >
              <GroupAvatar people={people} size={44} photoUrl={conversation.photoUrl} name={name} />
              <View style={styles.words}>
                <Text style={styles.name} numberOfLines={1}>{name}</Text>
                {/* A named group says who is in it; an unnamed one is already called by its people. */}
                <Text style={styles.handle} numberOfLines={1}>
                  {conversation.title && people.length ? people.map((p) => p.name.split(' ')[0]).join(', ') : `${conversation.participantIds.length} members`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </Pressable>
          ))}
        </>
      ) : null}
      {matches.length ? <Text style={styles.label}>{groups.length ? (term ? 'People' : 'Suggested') : term ? 'Results' : 'Suggested'}</Text> : null}
      {matches.map((user) => (
        <Pressable
          key={user.id}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: picked.includes(user.id) }}
          accessibilityLabel={user.name}
          onPress={() => toggle(user.id, user.name)}
          style={(state) => [styles.row, ((state as { hovered?: boolean }).hovered || state.pressed) && styles.rowOn]}
        >
          <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={44} />
          <View style={styles.words}>
            <Text style={styles.name} numberOfLines={1}>{user.name}</Text>
            <Text style={styles.handle} numberOfLines={1}>@{user.handle}</Text>
          </View>
          <View style={[styles.tick, picked.includes(user.id) && styles.tickOn]}>{picked.includes(user.id) ? <Ionicons name="checkmark" size={15} color={colors.brandInk} /> : null}</View>
        </Pressable>
      ))}
      {!matches.length && !groups.length ? <EmptyState title="No players found" body="Try their name or username." /> : null}
    </>
  );

  if (isPhone) {
    return (
      <View style={{ flex: 1 }}>
        <Screen title="New message" compactTitle onBack={close}>
          <View style={styles.toRow}>
            <Text style={styles.to}>To</Text>
            <TextInput value={query} onChangeText={setQuery} placeholder="Search" placeholderTextColor={colors.textFaint} autoCapitalize="none" autoCorrect={false} autoFocus style={styles.toInput} accessibilityLabel="To" />
          </View>
          {chips}
          {list}
          <View style={{ height: picked.length ? 140 : 0 }} />
        </Screen>
        {footer}
      </View>
    );
  }

  return (
    <View ref={backdrop} style={styles.backdrop}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={StyleSheet.absoluteFill} />
      <View ref={box} style={styles.box} accessibilityViewIsModal>
        <View style={styles.head}>
          <View style={styles.headSide} />
          <Text style={styles.title}>New message</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} hitSlop={8} style={styles.headSide}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.toRow}>
          <Text style={styles.to}>To</Text>
          <TextInput value={query} onChangeText={setQuery} placeholder="Search" placeholderTextColor={colors.textFaint} autoCapitalize="none" autoCorrect={false} autoFocus style={styles.toInput} accessibilityLabel="To" />
        </View>
        {chips}
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollBody, picked.length ? { paddingBottom: 150 } : null]}>{list}</ScrollView>
        {footer}
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  // Dark and blurred behind the box, so the inbox recedes instead of reading as a second copy of the list.
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.overlay, padding: spacing.xl, backdropFilter: 'blur(10px) saturate(0.8)', WebkitBackdropFilter: 'blur(10px) saturate(0.8)' } as object,
  box: { ...lift, width: '100%', maxWidth: 480, height: '72%', maxHeight: 640, borderRadius: 20, backgroundColor: colors.bg, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, height: 52, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  headSide: { width: 32, alignItems: 'flex-end' },
  title: { ...typography.bodyStrong, color: colors.text },
  toRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, height: 50, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  to: { ...typography.bodyStrong, color: colors.text },
  toInput: { flex: 1, ...typography.body, color: colors.text, paddingVertical: 0, outlineStyle: 'none' } as object,
  scroll: { flex: 1 },
  scrollBody: { paddingBottom: spacing.lg },
  label: { ...typography.smallStrong, color: colors.textMuted, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, paddingHorizontal: spacing.lg },
  rowOn: { backgroundColor: colors.surfaceAlt },
  words: { flex: 1, minWidth: 0, gap: 1 },
  name: { ...typography.body, ...font('600'), color: colors.text },
  handle: { ...typography.small, color: colors.textMuted },
  tick: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  // The face sits 5px in from the pill's round end, so the pill hugs it.
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 5, paddingRight: 9, height: 30, borderRadius: 15, backgroundColor: colors.brandDim },
  chipText: { ...typography.smallStrong, color: colors.brand, maxWidth: 120 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.xl, backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  groupName: { ...typography.body, color: colors.text, height: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.bgElevated, outlineStyle: 'none' } as object,
  start: { height: 48, borderRadius: 24, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  startText: { ...typography.bodyStrong, color: colors.brandInk },
});

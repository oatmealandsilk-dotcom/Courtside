import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar, EmptyState, Screen } from '@/components/ui';
import { GROUP_CAP, GroupAvatar, chatLockNote, groupLockNote, groupName, isGroupChat, named, othersIn } from '@/features/messages/groups';
import { LockBadge, LockNote } from '@/features/messages/LockNote';
import type { User } from '@/data/types';
import { goBack } from '@/lib/goBack';
import { useResponsive } from '@/lib/useResponsive';
import { useApp, type GroupOutcome } from '@/store/AppContext';
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
 *
 * Someone you can't reach shows a small lock on their face (the Send-to
 * sheet's look). Tapping them first asks the server again (they may have
 * followed you since the app opened), then either ticks them or says why in
 * a note above the button that stays until things change, never in a toast
 * that is gone before it is read. On its own a lock follows the one-to-one
 * rule; once someone is ticked, the group rule, which has no "already
 * chatting" exception.
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
  // Why the last tap or Create group did not go through, until the picks change.
  const [note, setNote] = useState<{ text: string; alert?: boolean } | null>(null);
  // Waiting on the server's yes for a new group (a real account only).
  const [busy, setBusy] = useState(false);
  // Opening: ask the server again whether the locked people follow you now,
  // so the locks shown are today's rather than from when the app opened.
  // Only people already known to be locked: nobody new is asked about here.
  useEffect(() => {
    const locked = actions.lockedNow(users.filter((u) => u.id !== currentUserId && !blockedIds.includes(u.id)).map((u) => u.id));
    if (locked.length) void actions.recheckFollows(locked);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
  const firstName = (u?: User) => u?.name.trim().split(/\s+/)[0] ?? 'They';
  // How notes name people: a first name, with the @handle when it's shared.
  const namesOf = (ids: string[]) => ids.map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u).map((u) => named(u, users));
  // With nobody ticked, a tap starts a one-to-one chat; with anyone ticked, it makes a group.
  const lockedFor = (id: string) => !picked.includes(id) && (picked.length ? !actions.canAddToGroup(id) : !actions.canMessage(id));
  // Ticked people who can't be put in a new group: one you chat with, say,
  // who doesn't follow you. A group you already have with them just opens.
  const blockers = picked.length > 1 && !sameGroup ? picked.filter((id) => !actions.canAddToGroup(id)) : [];
  const toggle = async (id: string) => {
    if (picked.includes(id)) { setPicked((p) => p.filter((x) => x !== id)); setNote(null); return; }
    // Locked, unless they have followed you since the app opened (or the server says otherwise now): ask before saying no.
    if (lockedFor(id) && !(await actions.reachNow(id))) {
      const [who] = namesOf([id]);
      setNote({ text: picked.length ? groupLockNote(who ? [who] : []) : chatLockNote(who) });
      return;
    }
    if (picked.length >= GROUP_CAP - 1) { setNote({ text: `A group can have up to ${GROUP_CAP} people, you included.` }); return; }
    setNote(null);
    setPicked((p) => (p.includes(id) ? p : [...p, id]));
    setQuery('');
  };
  // The server's no, in words that name who when the app can tell.
  const refusal = (outcome: Extract<GroupOutcome, { ok: false }>) => {
    switch (outcome.why) {
      case 'teen': return groupLockNote(namesOf(outcome.who), true);
      case 'blocked': return 'Some of the people you picked can’t be in a group together. Take someone out and try again.';
      case 'full': return `A group can have up to ${GROUP_CAP} people, you included.`;
      default: return 'That group didn’t start. Check your connection and try again.';
    }
  };
  const start = async () => {
    if (!picked.length || busy || blockers.length) return;
    if (picked.length === 1) { router.replace(`/messages/${actions.openConversationWith(picked[0])}`); return; }
    if (sameGroup) { router.replace(`/messages/${sameGroup.id}`); return; }
    setBusy(true);
    const outcome = await actions.createGroup(picked, title);
    setBusy(false);
    if (!outcome) return;
    if (outcome.ok) { router.replace(`/messages/${outcome.id}`); return; }
    // Stay here with the picks as they were, so whoever is in the way can be taken out.
    setNote({ text: refusal(outcome), alert: true });
  };
  const pickedUsers = picked.map((id) => users.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => !!u);
  const chips = pickedUsers.length ? (
    <View style={styles.chips}>
      {pickedUsers.map((u) => {
        // Someone ticked who can't be in the group shows the lock here too, beside the way to take them out.
        const stuck = blockers.includes(u.id);
        return (
          <Pressable key={u.id} accessibilityRole="button" accessibilityLabel={`Remove ${u.name}`} onPress={() => { void toggle(u.id); }} style={[styles.chip, stuck && styles.chipStuck]}>
            <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={20} />
            {stuck ? <Ionicons name="lock-closed" size={11} color={colors.textMuted} /> : null}
            <Text style={[styles.chipText, stuck && styles.chipTextStuck]} numberOfLines={1}>{firstName(u)}</Text>
            <Ionicons name="close" size={13} color={stuck ? colors.textMuted : colors.brand} />
          </Pressable>
        );
      })}
    </View>
  ) : null;
  // The notes sit above the button, pinned with it, so they are on screen wherever the list is scrolled.
  const blockersText = blockers.length ? groupLockNote(namesOf(blockers), true) : null;
  const notes = [blockersText, note && note.text !== blockersText ? note.text : null].filter((t): t is string => !!t);
  const held = !!blockers.length || busy;
  const footer = picked.length || notes.length ? (
    <View style={styles.footer}>
      {notes.map((text) => (
        <LockNote key={text} text={text} tone={note?.alert && text === note.text ? 'alert' : 'lock'} onClose={text === note?.text ? () => setNote(null) : undefined} />
      ))}
      {picked.length > 1 ? (
        <TextInput value={title} onChangeText={(v) => setTitle(v.slice(0, 60))} placeholder="Group name (optional)" placeholderTextColor={colors.textFaint} style={styles.groupName} accessibilityLabel="Group name" />
      ) : null}
      {picked.length ? (
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: held, busy }} disabled={held} onPress={() => { void start(); }} style={({ pressed }) => [styles.start, picked.length > 1 && styles.startGroup, held && styles.startHeld, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}>
          {/* Two or more ticked: the group is the point now, so the button says so with its people. */}
          {picked.length > 1 && !sameGroup ? <Ionicons name="people" size={19} color={colors.brandInk} /> : null}
          <Text style={styles.startText}>{picked.length === 1 ? 'Chat' : sameGroup ? 'Open group' : busy ? 'Creating group…' : `Create group · ${picked.length + 1} people`}</Text>
        </Pressable>
      ) : null}
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
      {matches.map((user) => {
        const on = picked.includes(user.id);
        const locked = lockedFor(user.id);
        return (
          <Pressable
            key={user.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={locked ? `${user.name}. Locked` : user.name}
            accessibilityHint={locked ? `Shows why you can’t ${picked.length ? 'add' : 'message'} ${firstName(user)}` : undefined}
            onPress={() => { void toggle(user.id); }}
            style={(state) => [styles.row, ((state as { hovered?: boolean }).hovered || state.pressed) && styles.rowOn]}
          >
            <View style={locked && styles.locked}>
              <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={44} />
              {locked ? <LockBadge /> : null}
            </View>
            <View style={[styles.words, locked && styles.locked]}>
              <Text style={styles.name} numberOfLines={1}>{user.name}</Text>
              <Text style={styles.handle} numberOfLines={1}>@{user.handle}</Text>
            </View>
            {locked ? null : <View style={[styles.tick, on && styles.tickOn]}>{on ? <Ionicons name="checkmark" size={15} color={colors.brandInk} /> : null}</View>}
          </Pressable>
        );
      })}
      {!matches.length && !groups.length ? <EmptyState title="No players found" body="Try their name or username." /> : null}
    </>
  );

  if (isPhone) {
    return (
      <View style={{ flex: 1 }}>
        <Screen
          title="New message"
          compactTitle
          onBack={close}
          // "To" and the people picked stay pinned under the title while the list scrolls (Instagram's).
          headerWrapper={(header) => (
            <>
              {header}
              <View style={styles.toPinned}>
                <View style={styles.toRow}>
                  <Text style={styles.to}>To</Text>
                  <TextInput value={query} onChangeText={setQuery} placeholder="Search" placeholderTextColor={colors.textFaint} autoCapitalize="none" autoCorrect={false} autoFocus style={styles.toInput} accessibilityLabel="To" />
                </View>
                {chips}
              </View>
            </>
          )}
        >
          <View style={styles.phoneList}>{list}</View>
          {/* Room under the list for the footer pinned over it (taller with a note in it). */}
          <View style={{ height: picked.length || notes.length ? 140 + notes.length * 90 : 0 }} />
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
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollBody, picked.length || notes.length ? { paddingBottom: 150 + notes.length * 90 } : null]}>{list}</ScrollView>
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
  // A ticked person who can't be in the group: greyed, with the lock.
  chipStuck: { backgroundColor: colors.surfaceAlt },
  chipTextStuck: { color: colors.textMuted },
  // Someone you can't pick right now, dimmed the way the Send-to sheet's locked tiles are.
  locked: { opacity: 0.45 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.xl, backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  groupName: { ...typography.body, color: colors.text, height: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.bgElevated, outlineStyle: 'none' } as object,
  start: { height: 50, borderRadius: 25, backgroundColor: colors.brand, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  startGroup: { boxShadow: '0px 6px 18px rgba(0, 0, 0, 0.16)' },
  toPinned: { paddingBottom: spacing.xs },
  // The list under the pinned "To" runs edge to edge, as the rows draw their own room.
  phoneList: { marginHorizontal: -spacing.lg },
  startHeld: { opacity: 0.5 },
  startText: { ...typography.bodyStrong, color: colors.brandInk },
});

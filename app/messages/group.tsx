import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar, EmptyState, Screen, Toggle } from '@/components/ui';
import { HitGlyph } from '@/components/HitGlyph';
import { ProfilePhotoPicker } from '@/components/ProfilePhotoPicker';
import type { User } from '@/data/types';
import { ChatSheet, type SheetOption } from '@/features/messages/ChatSheet';
import { GROUP_CAP, GroupAvatar, groupLockNote, groupName, hasGroupControls, holdsHitSpot, isGroupAdmin, isGroupChat, isMuted, leaveGroupMessage, named, othersIn, removeMemberMessage } from '@/features/messages/groups';
import { LockBadge, LockNote } from '@/features/messages/LockNote';
import { MUTE_CHOICES, mutedLabel, muteUntil } from '@/features/messages/mute';
import { hitWhen } from '@/features/hits/format';
import { confirm, confirmAfterMenu, confirmBlock } from '@/lib/confirm';
import { goBack } from '@/lib/goBack';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

const first = (u?: User) => u?.name.trim().split(/\s+/)[0] ?? 'They';

/**
 * A note on the add-people page that stays until the picks change: 'room'
 * when a tick would go past the room left; 'filled' when the server found
 * the group full (people were added from elsewhere meanwhile); otherwise
 * why the server said no, in words.
 */
type Notice = { kind: 'room' } | { kind: 'filled' } | { kind: 'said'; text: string };

/**
 * A chat's details, opened from the (i) in its header, the way Instagram's
 * read.
 *
 * A group: its photo and name (anyone in it can change either), Mute, the
 * hit it is for if it is a hit's chat, then "Add people" (anyone in it can;
 * several at once, up to GROUP_CAP in all) and who is in it (admins first;
 * tap someone for their profile, a message, and, for an admin, making them
 * an admin). An admin sees a Remove button on everyone else's row, so taking
 * someone out is never hidden behind a tap on their face. Report, and Leave.
 *
 * `?add=1` is the add-people page on its own: the search box and the list at
 * the top, Add in the header, nothing else, so a phone's keyboard never
 * covers the people being picked. Both the "Add people" row here and the
 * button in a group chat's header open it; once they're in, it goes back.
 *
 * Someone who can't be added shows a lock on their face; tapping them first
 * asks the server again (they may have followed you since the app opened),
 * then either ticks them or says why under their row, in a note that stays.
 * A refusal from the server is said at the top with the picks still ticked,
 * so the one in the way can be taken out.
 *
 * A one-to-one chat: the other person, Mute, their profile, starting a group
 * with them, Report and Block.
 */
export default function ChatDetails() {
  const styles = useThemedStyles(styleDefinitions);
  const { id, add } = useLocalSearchParams<{ id?: string; add?: string }>();
  const { conversations, users, currentUserId, currentUser, blockedIds, followingIds, hitRequests, actions } = useApp();
  const conversation = conversations.find((c) => c.id === id);
  const navigation = useNavigation();
  // The add-people page (see above); only ever for a group.
  const addOnly = add === '1' && !!conversation && isGroupChat(conversation);
  const [title, setTitle] = useState(conversation?.title ?? '');
  useEffect(() => { setTitle(conversation?.title ?? ''); }, [conversation?.title]);
  const [query, setQuery] = useState('');
  // People ticked to add, added together with one tap.
  const [picks, setPicks] = useState<string[]>([]);
  // Someone in the group whose choices are open (profile, message, admin, remove).
  const [member, setMember] = useState<User | null>(null);
  // "How long?" after Mute is switched on.
  const [askMute, setAskMute] = useState(false);
  // Someone locked whose row was tapped: why they can't be added shows under it.
  const [explain, setExplain] = useState<string | null>(null);
  // Waiting on the server's yes for the people picked, and the note about the last try.
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const nameBox = useRef<TextInput>(null);
  // Opening the add-people page: ask the server again whether the locked
  // people in the list follow you now, so the locks shown are today's.
  useEffect(() => {
    if (!addOnly || !conversation) return;
    // Only people already known to be locked: nobody new is asked about here.
    const locked = actions.lockedNow(users.filter((u) => u.id !== currentUserId && !conversation.participantIds.includes(u.id)).map((u) => u.id));
    if (locked.length) void actions.recheckFollows(locked);
  }, [addOnly, conversation?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!conversation) {
    return <Screen title="Details" compactTitle onBack={() => goBack('/messages')}><EmptyState icon="chatbubbles-outline" title="This chat is gone" body="You may have left it." /></Screen>;
  }
  const group = isGroupChat(conversation);
  const muted = isMuted(conversation);
  const back = () => goBack(`/messages/${conversation.id}`);
  // Left or blocked: back to the inbox, with this chat's own screens (Details,
  // the chat under it) taken off too. With no inbox further back (the chat
  // was opened from an alert, a profile, a hit…), it is opened fresh.
  const toInbox = () => {
    const routes = navigation.getState()?.routes ?? [];
    if (routes.some((r) => r.name === 'messages/index')) { router.dismissTo('/messages'); return; }
    let ours = 0;
    while (ours < routes.length) {
      const r = routes[routes.length - 1 - ours];
      if ((r.name !== 'messages/group' && r.name !== 'messages/[id]') || (r.params as { id?: string } | undefined)?.id !== conversation.id) break;
      ours += 1;
    }
    if (ours < routes.length) { if (ours) router.dismiss(ours); router.push('/messages'); return; }
    // Nothing else under them: the bottom one becomes the inbox.
    if (ours > 1) router.dismiss(ours - 1);
    router.replace('/messages');
  };
  // Mute, the group photo, removing people and admins need a database that
  // has them (migration 54). A group from one that does not has no admin
  // list at all, and those controls are left out rather than refused.
  const controls = hasGroupControls(conversation);
  // How notes name someone: a first name, with the @handle when it's shared.
  const nm = (u: User) => named(u, users);
  const namesOf = (ids: string[]) => ids.map((uid) => users.find((u) => u.id === uid)).filter((u): u is User => !!u).map(nm);
  // Before a lock is final, the server is asked again whether they follow
  // you now (the app's copy is from when it opened) and what it says of
  // them (migration 64). True once you may add them.
  const followsNow = (uid: string) => actions.reachNow(uid);
  // Message someone from here; locked, it says why in a note that stays to be read.
  const message = async (u: User) => {
    const lock = await actions.messageLock(u.id);
    if (lock) { showToast({ title: lock, icon: 'lock-closed-outline', long: true }); return; }
    router.push(`/messages/${actions.openConversationWith(u.id)}`);
  };

  // Mute is the same for a group and a one-to-one chat: switching it on asks for how long.
  const muteCard = (
    <View style={styles.group}>
      <View style={styles.row}>
        <View style={styles.lead}><Ionicons name={muted ? 'notifications-off-outline' : 'notifications-outline'} size={20} color={colors.text} /></View>
        <View style={styles.words}>
          <Text style={styles.label}>Mute messages</Text>
          {muted ? <Text style={styles.meta}>{mutedLabel(conversation.mutedUntil)}</Text> : null}
        </View>
        <Toggle value={muted} onChange={(on) => (on ? setAskMute(true) : actions.muteChat(conversation.id, null))} accessibilityLabel="Mute messages" />
      </View>
    </View>
  );
  const muteSheet = (
    <ChatSheet
      visible={askMute}
      title="Mute messages"
      options={MUTE_CHOICES.map((choice) => ({ key: choice.key, label: choice.label, onPress: () => actions.muteChat(conversation.id, muteUntil(choice.ms)) }))}
      onClose={() => setAskMute(false)}
    />
  );

  /* ------------------------------ One-to-one ------------------------------ */

  if (!group) {
    const other = users.find((u) => u.id === conversation.participantIds.find((p) => p !== currentUserId));
    const blocked = !!other && blockedIds.includes(other.id);
    const groupLocked = !!other && !actions.canAddToGroup(other.id);
    // Nothing sent yet: the chat is only on this phone, so there is nothing
    // on the server to mute, and a report is about them, not the chat.
    const draft = actions.isDraftChat(conversation.id);
    return (
      <Screen title="Details" compactTitle onBack={back}>
        {other ? (
          <Pressable accessibilityRole="link" accessibilityLabel={`${other.name}'s profile`} onPress={() => router.push(`/user/${other.id}`)} style={styles.top}>
            <Avatar name={other.name} seed={other.avatarSeed} uri={other.avatarUrl} size={88} />
            <Text style={styles.personName} numberOfLines={1}>{other.name}</Text>
            <Text style={styles.meta}>@{other.handle}</Text>
          </Pressable>
        ) : null}
        {draft ? null : muteCard}
        {other ? (
          <>
            <View style={[styles.group, styles.gap]}>
              <Pressable accessibilityRole="link" onPress={() => router.push(`/user/${other.id}`)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <View style={styles.lead}><Ionicons name="person-outline" size={20} color={colors.text} /></View>
                <Text style={[styles.label, styles.words]}>View profile</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </Pressable>
              {!blocked ? (
                // Instagram's way: a group that starts with the two of you, the rest picked next.
                // Chatting here doesn't make it allowed: the group rule still asks that they follow you.
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint={groupLocked ? `Shows why you can’t add ${first(other)} to a group` : undefined}
                  onPress={async () => {
                    if (groupLocked && !(await followsNow(other.id))) { setExplain((e) => (e === other.id ? null : other.id)); return; }
                    router.push({ pathname: '/messages/new', params: { with: other.id } });
                  }}
                  style={({ pressed }) => [styles.row, styles.line, pressed && styles.pressed]}
                >
                  <View style={[styles.lead, groupLocked && styles.off]}><Ionicons name="people-outline" size={20} color={colors.text} /></View>
                  <Text style={[styles.label, styles.words, groupLocked && styles.off]} numberOfLines={1}>Create a group with {first(other)}</Text>
                  <Ionicons name={groupLocked ? 'lock-closed-outline' : 'chevron-forward'} size={16} color={colors.textFaint} />
                </Pressable>
              ) : null}
              {groupLocked && explain === other.id ? <LockNote text={groupLockNote([nm(other)])} onClose={() => setExplain(null)} style={styles.rowNote} /> : null}
            </View>
            <View style={[styles.group, styles.gap]}>
              <Pressable
                accessibilityRole="button"
                onPress={() => confirm({
                  title: `Report ${first(other)}?`,
                  message: draft ? `A person at CourtSide will look at ${first(other)}’s profile. ${first(other)} isn’t told it was you.` : `A person at CourtSide will look at this chat. ${first(other)} isn’t told it was you.`,
                  confirmLabel: 'Report',
                  // Reported as the chat, naming them, so the admin can read it and act on it (Oct 5).
                  // The thanks only once it is filed; otherwise a note to try again.
                  // A chat with nothing in it yet isn't on the server: their profile is reported, as from their page.
                  onConfirm: () => {
                    if (draft) { actions.reportUser(other.id, 'profile'); showToast({ title: 'Thanks — a person will review this', icon: 'flag-outline' }); return; }
                    void actions.reportChat(conversation.id, 'one-to-one chat', other.id).then((filed) => showToast(filed ? { title: 'Thanks — a person will review this', icon: 'flag-outline' } : { title: 'Your report didn’t send', body: 'Check your connection and try again.', icon: 'alert-circle-outline' })); },
                })}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={styles.lead}><Ionicons name="flag-outline" size={20} color={colors.danger} /></View>
                <Text style={[styles.label, styles.words, { color: colors.danger }]}>Report</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                // Blocking takes the one-to-one chat away, so this page goes back to the inbox.
                onPress={() => (blocked ? actions.toggleBlock(other.id) : confirmBlock(other, () => { if (!actions.isBlocked(other.id)) actions.toggleBlock(other.id); toInbox(); }))}
                style={({ pressed }) => [styles.row, styles.line, pressed && styles.pressed]}
              >
                <View style={styles.lead}><Ionicons name={blocked ? 'checkmark-circle-outline' : 'ban-outline'} size={20} color={colors.danger} /></View>
                <Text style={[styles.label, styles.words, { color: colors.danger }]}>{blocked ? 'Unblock' : 'Block'}</Text>
              </Pressable>
            </View>
          </>
        ) : null}
        {muteSheet}
      </Screen>
    );
  }

  /* --------------------------------- Group -------------------------------- */

  const people = othersIn(conversation, users, currentUserId);
  const name = groupName(conversation, users, currentUserId);
  const iAmAdmin = isGroupAdmin(conversation, currentUserId);
  const memberCount = conversation.participantIds.length;
  const room = GROUP_CAP - memberCount;
  // Everyone in it, you included: admins first, then by name.
  const everyone = [...(currentUser ? [currentUser] : []), ...people].sort((a, b) => {
    const admin = Number(isGroupAdmin(conversation, b.id)) - Number(isGroupAdmin(conversation, a.id));
    return admin || a.name.localeCompare(b.name);
  });
  // The hit this is the chat for, if it is one.
  const hit = hitRequests.find((h) => h.conversationId === conversation.id && !h.cancelled);
  const hitAuthor = hit ? users.find((u) => u.id === hit.authorId) : undefined;
  const hitLabel = !hit ? '' : hit.authorId === currentUserId ? 'The chat for your hit' : hitAuthor ? `The chat for ${first(hitAuthor)}’s hit` : 'The chat for a hit';

  const saveTitle = () => { if ((conversation.title ?? '') !== title.trim()) actions.renameGroup(conversation.id, title); };

  // Who can be added: people you follow first, then people you talk to, then
  // everyone else. Never someone blocked, or already in it.
  const term = query.trim().replace(/^@/, '').toLowerCase();
  const recent = [...conversations].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).flatMap((c) => c.participantIds);
  const rank = (uid: string) => (followingIds.includes(uid) ? 0 : recent.includes(uid) ? 1 : 2);
  const candidates = users
    .filter((u) => u.id !== currentUserId && !conversation.participantIds.includes(u.id) && !blockedIds.includes(u.id) && `${u.name} ${u.handle}`.toLowerCase().includes(term))
    .sort((a, b) => rank(a.id) - rank(b.id) || (rank(a.id) === 1 ? recent.indexOf(a.id) - recent.indexOf(b.id) : a.name.localeCompare(b.name)))
    .slice(0, 30);
  const pickedUsers = picks.map((p) => users.find((u) => u.id === p)).filter((u): u is User => !!u);
  // Ticked people who can't be added after all (the server said one of them
  // no longer follows you, and the app has just re-checked): Add waits until
  // they are taken out.
  const stuck = picks.filter((p) => !actions.canAddToGroup(p));
  const togglePick = async (u: User) => {
    setNotice(null);
    if (picks.includes(u.id)) { setPicks((p) => p.filter((x) => x !== u.id)); return; }
    // Locked: unless they follow you now, say why under their row (a second tap puts the note away).
    if (!actions.canAddToGroup(u.id) && !(await followsNow(u.id))) { setExplain((e) => (e === u.id ? null : u.id)); return; }
    setExplain(null);
    if (picks.length >= room) { setNotice({ kind: 'room' }); return; }
    setPicks((p) => (p.includes(u.id) ? p : [...p, u.id]));
    setQuery('');
  };
  const canAdd = picks.length > 0 && !busy && !stuck.length && picks.length <= room;
  const addPicked = async () => {
    if (!canAdd) return;
    setBusy(true);
    setNotice(null);
    const outcome = await actions.addGroupMembers(conversation.id, picks);
    setBusy(false);
    // In: back to where Add people was opened from (the chat says "You added …").
    if (outcome.ok) { setPicks([]); back(); return; }
    // Otherwise the picks stay ticked and the reason shows at the top.
    if (outcome.why === 'full') { setNotice({ kind: 'filled' }); return; }
    const [one] = picks.length === 1 ? namesOf(picks) : [];
    const [blocked] = outcome.who.length === 1 ? namesOf(outcome.who) : [];
    setNotice({
      kind: 'said',
      text: outcome.why === 'teen' ? groupLockNote(namesOf(outcome.who), true)
        : outcome.why === 'blocked' ? (blocked ? `${blocked.label} can’t be added to this group.` : 'One of the people you picked can’t be in this group. Try adding them one at a time.')
        : one ? `${one.label} wasn’t added. Check your connection and try again.` : 'Nobody was added. Check your connection and try again.',
    });
  };
  const fullText = `This group is full (${GROUP_CAP} people).`;
  const noticeText = !notice ? null
    : notice.kind === 'said' ? notice.text
    : room <= 0 ? fullText
    : notice.kind === 'filled' ? `This group filled up while you were picking. There’s room for ${room} more now.`
    : `There’s only room for ${room} more in this group.`;
  // Taking someone out, asked first. `fromMenu`: asked from the ⋯ sheet, which closes as it comes.
  const removeMember = (u: User, fromMenu = false) => (fromMenu ? confirmAfterMenu : confirm)({
    title: `Remove ${nm(u).label}?`,
    message: removeMemberMessage(nm(u), holdsHitSpot(hitRequests, conversation.id, u.id)),
    confirmLabel: 'Remove',
    destructive: true,
    onConfirm: () => actions.removeGroupMember(conversation.id, u.id),
  });

  // What tapping someone in the group offers.
  const memberOptions: SheetOption[] = !member ? [] : [
    { key: 'profile', label: 'View profile', icon: 'person-outline', onPress: () => router.push(`/user/${member.id}`) },
    ...(!blockedIds.includes(member.id) ? [{
      key: 'message', label: 'Message', icon: 'chatbubble-outline' as const,
      onPress: () => { void message(member); },
    }] : []),
    ...(iAmAdmin && controls ? [
      isGroupAdmin(conversation, member.id)
        ? { key: 'admin', label: 'Remove as admin', icon: 'shield-outline' as const, onPress: () => actions.setGroupAdmin(conversation.id, member.id, false) }
        : { key: 'admin', label: 'Make admin', icon: 'shield-checkmark-outline' as const, onPress: () => actions.setGroupAdmin(conversation.id, member.id, true) },
      { key: 'remove', label: 'Remove from group', icon: 'person-remove-outline' as const, danger: true, onPress: () => removeMember(member, true) },
    ] : []),
  ];

  const leave = () => confirm({
    title: 'Leave this group?',
    message: leaveGroupMessage(conversation, hitRequests, currentUserId),
    confirmLabel: 'Leave',
    destructive: true,
    onConfirm: () => {
      actions.leaveGroup(conversation.id);
      toInbox();
    },
  });
  const report = () => confirm({
    title: 'Report this group?',
    message: 'A person at CourtSide will look at it. Nobody in the group is told.',
    confirmLabel: 'Report',
    onConfirm: () => { void actions.reportChat(conversation.id, 'group chat').then((filed) => showToast(filed ? { title: 'Thanks — a person will review this', icon: 'flag-outline' } : { title: 'Your report didn’t send', body: 'Check your connection and try again.', icon: 'alert-circle-outline' })); },
  });
  const removePhoto = () => confirm({
    title: 'Remove the group photo?',
    message: 'Everyone in the group sees the change.',
    confirmLabel: 'Remove',
    destructive: true,
    onConfirm: () => actions.setGroupPhoto(conversation.id, null),
  });

  /* ---------------------------- Add people page --------------------------- */

  if (addOnly) {
    return (
      <Screen
        title="Add people"
        compactTitle
        onBack={back}
        // Add sits in the header, where a phone's keyboard never covers it.
        right={room > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={picks.length ? `Add ${picks.length} to the group` : 'Add'}
            accessibilityState={{ disabled: !canAdd, busy }}
            disabled={!canAdd}
            hitSlop={8}
            onPress={() => { void addPicked(); }}
            style={({ pressed }) => [styles.headAdd, !canAdd && styles.headAddOff, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.headAddText}>{busy ? 'Adding…' : picks.length ? `Add (${picks.length})` : 'Add'}</Text>
          </Pressable>
        ) : undefined}
      >
        <Text style={styles.addTo} numberOfLines={1}>{room > 0 ? `To ${name} · room for ${room} more` : `To ${name}`}</Text>
        {room <= 0 ? <LockNote text={fullText} tone="alert" /> : (
          <View style={styles.adding}>
            <TextInput value={query} onChangeText={setQuery} placeholder="Search" placeholderTextColor={colors.textFaint} autoCapitalize="none" autoCorrect={false} style={styles.search} accessibilityLabel="Find people to add" />
            {pickedUsers.length ? (
              <View style={styles.chips}>
                {pickedUsers.map((u) => {
                  const locked = stuck.includes(u.id);
                  return (
                    <Pressable key={u.id} accessibilityRole="button" accessibilityLabel={`Don’t add ${u.name}`} onPress={() => { void togglePick(u); }} style={[styles.chip, locked && styles.chipStuck]}>
                      <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={20} />
                      {locked ? <Ionicons name="lock-closed" size={11} color={colors.textMuted} /> : null}
                      <Text style={[styles.chipText, locked && styles.chipTextStuck]} numberOfLines={1}>{first(u)}</Text>
                      <Ionicons name="close" size={13} color={locked ? colors.textMuted : colors.brand} />
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {/* Notes sit up here, under the picks they are about, where they're seen with the keyboard up. */}
            {stuck.length && !notice ? <LockNote text={groupLockNote(namesOf(stuck), true)} /> : null}
            {noticeText ? <LockNote text={noticeText} tone="alert" onClose={() => setNotice(null)} /> : null}
            <View style={styles.group}>
              {candidates.map((u, i) => {
                // Not known to be an adult and doesn't follow you: only people they follow can add them (the server's rule).
                const allowed = actions.canAddToGroup(u.id);
                const on = picks.includes(u.id);
                return (
                  <View key={u.id}>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={allowed ? u.name : `${u.name}. Locked`}
                      accessibilityHint={allowed ? undefined : `Shows why you can’t add ${first(u)}`}
                      onPress={() => { void togglePick(u); }}
                      style={({ pressed }) => [styles.row, i > 0 && styles.line, pressed && styles.pressed]}
                    >
                      <View style={!allowed && styles.off}>
                        <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={36} />
                        {!allowed ? <LockBadge size={20} /> : null}
                      </View>
                      <View style={[styles.words, !allowed && styles.off]}>
                        <Text style={styles.name} numberOfLines={1}>{u.name}</Text>
                        <Text style={styles.meta} numberOfLines={1}>@{u.handle}</Text>
                      </View>
                      {allowed ? <View style={[styles.tick, on && styles.tickOn]}>{on ? <Ionicons name="checkmark" size={15} color={colors.brandInk} /> : null}</View> : null}
                    </Pressable>
                    {!allowed && explain === u.id ? <LockNote text={groupLockNote([nm(u)])} onClose={() => setExplain(null)} style={styles.rowNote} /> : null}
                  </View>
                );
              })}
              {!candidates.length ? <Text style={[styles.meta, { padding: spacing.lg }]}>{term ? 'Nobody by that name.' : 'No one else to add.'}</Text> : null}
            </View>
          </View>
        )}
      </Screen>
    );
  }

  /* ------------------------------- Group page ------------------------------ */

  return (
    <Screen title="Group" compactTitle onBack={back}>
      <View style={styles.top}>
        {/* Anyone in the group can set its photo; until then it shows its people. */}
        {controls ? (
          <ProfilePhotoPicker
            value={conversation.photoUrl}
            name={name}
            label={conversation.photoUrl ? 'Change group photo' : 'Add a group photo'}
            preview={<GroupAvatar people={people} size={88} photoUrl={conversation.photoUrl} name={name} />}
            onChange={(uri) => actions.setGroupPhoto(conversation.id, uri)}
          />
        ) : <GroupAvatar people={people} size={88} photoUrl={conversation.photoUrl} name={name} />}
        {controls && conversation.photoUrl ? (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={removePhoto} style={styles.removePhoto}>
            <Text style={styles.removePhotoText}>Remove photo</Text>
          </Pressable>
        ) : null}
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

      {controls ? muteCard : null}

      {hit ? (
        <View style={[styles.group, styles.gap]}>
          <Pressable accessibilityRole="link" onPress={() => router.push(`/hit-request/${hit.id}`)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <View style={styles.lead}><HitGlyph size={20} color={colors.text} /></View>
            <View style={styles.words}>
              <Text style={styles.label}>{hitLabel}</Text>
              <Text style={styles.meta} numberOfLines={1}>{hitWhen(hit.startsAt)} · {hit.place.name}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.section}>{memberCount === 1 ? 'Just you' : `${memberCount} members`}</Text>
      {/* Adding people comes first, above everyone in it, where it's seen without scrolling.
          It opens the add-people page (see ?add=1 above). */}
      <View style={styles.group}>
        <Pressable
          accessibilityRole="link"
          accessibilityState={{ disabled: room <= 0 }}
          disabled={room <= 0}
          onPress={() => router.push({ pathname: '/messages/group', params: { id: conversation.id, add: '1' } })}
          style={({ pressed }) => [styles.row, pressed && styles.pressed, room <= 0 && styles.off]}
        >
          <View style={styles.addIcon}><Ionicons name="person-add-outline" size={18} color={colors.brand} /></View>
          <View style={styles.words}>
            <Text style={styles.addText}>Add people</Text>
            <Text style={styles.meta}>{room <= 0 ? `Full · ${GROUP_CAP} people` : `Room for ${room} more`}</Text>
          </View>
          {room > 0 ? <Ionicons name="chevron-forward" size={16} color={colors.textFaint} /> : null}
        </Pressable>
      </View>

      <View style={[styles.group, styles.gap]}>
        {everyone.map((u, i) => {
          const me = u.id === currentUserId;
          const admin = isGroupAdmin(conversation, u.id);
          const blocked = blockedIds.includes(u.id);
          const meta = [me ? 'You' : `@${u.handle}`, admin ? 'Admin' : '', blocked ? 'Blocked' : ''].filter(Boolean).join(' · ');
          // Admins can take anyone else out, in one visible tap (it still asks first).
          const canRemove = iAmAdmin && controls && !me;
          // The row and its Remove button sit side by side, not one inside the
          // other (a button can't hold a button, and a tap on Remove must
          // never also open the person's options).
          return (
            <View key={u.id} style={[styles.memberRow, i > 0 && styles.line]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${u.name}, ${meta}`}
                // Your own row has nothing to offer you.
                disabled={me}
                onPress={() => setMember(u)}
                style={({ pressed }) => [styles.row, styles.memberMain, canRemove && styles.memberMainBeforeRemove, pressed && styles.pressed]}
              >
                <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={40} />
                <View style={styles.words}>
                  <Text style={styles.name} numberOfLines={1}>{u.name}</Text>
                  <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
                </View>
                {!me && !canRemove ? <Ionicons name="ellipsis-horizontal" size={18} color={colors.textFaint} /> : null}
              </Pressable>
              {canRemove ? (
                <>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${u.name} from the group`} hitSlop={6} onPress={() => removeMember(u)} style={({ pressed }) => [styles.remove, pressed && styles.removePressed]}>
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`More for ${u.name}`} hitSlop={8} onPress={() => setMember(u)} style={({ pressed }) => [styles.more, pressed && styles.removePressed]}>
                    <Ionicons name="ellipsis-horizontal" size={18} color={colors.textFaint} />
                  </Pressable>
                </>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={[styles.group, styles.gap]}>
        <Pressable accessibilityRole="button" onPress={report} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <View style={styles.lead}><Ionicons name="flag-outline" size={20} color={colors.danger} /></View>
          <Text style={[styles.label, styles.words, { color: colors.danger }]}>Report group</Text>
        </Pressable>
      </View>

      <Pressable accessibilityRole="button" onPress={leave} style={({ pressed }) => [styles.leave, pressed && { opacity: 0.8 }]}>
        <Text style={styles.leaveText}>Leave group</Text>
      </Pressable>

      <ChatSheet visible={!!member} title={member?.name} options={memberOptions} onClose={() => setMember(null)} />
      {muteSheet}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  top: { alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.lg },
  title: { ...typography.title, color: colors.text, textAlign: 'center', minWidth: 200, flexShrink: 1, paddingVertical: 4, outlineStyle: 'none' } as object,
  // A long name narrows rather than pushing the pencil off the screen.
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, maxWidth: '100%' },
  pencil: { width: 18, alignItems: 'center' },
  // The picker leaves room under its link; this tucks the second link up beside it.
  removePhoto: { marginTop: -spacing.md, paddingBottom: spacing.xs },
  removePhotoText: { ...typography.smallStrong, color: colors.textMuted },
  personName: { ...typography.title, color: colors.text, marginTop: spacing.xs },
  section: { ...typography.smallStrong, color: colors.textMuted, paddingHorizontal: spacing.sm, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  // The grouped list of Settings: a shade off the page, rows on hairlines.
  group: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  gap: { marginTop: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 11, paddingHorizontal: spacing.lg, minHeight: 50 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { backgroundColor: colors.surfaceAlt },
  off: { opacity: 0.45 },
  // A member: the row itself, then (for an admin) Remove and ⋯ beside it.
  memberRow: { flexDirection: 'row', alignItems: 'center' },
  memberMain: { flex: 1, minWidth: 0 },
  memberMainBeforeRemove: { paddingRight: spacing.sm },
  more: { paddingLeft: spacing.sm, paddingRight: spacing.lg, height: 50, justifyContent: 'center' },
  // A note under the row it is about, inset to the row's own edges.
  rowNote: { marginHorizontal: spacing.md, marginBottom: spacing.md },
  // Remove, on each row an admin sees: plain words in a soft pill, in the
  // page's own text colour. Red is kept for the confirm's Remove button, so
  // a full group reads as a list of people, not a list of things to delete
  // (and the words stay easy to read on every court theme's grey).
  remove: { paddingHorizontal: 12, height: 30, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  removePressed: { opacity: 0.6 },
  removeText: { ...typography.smallStrong, color: colors.text },
  lead: { width: 26, alignItems: 'center' },
  words: { flex: 1, minWidth: 0, gap: 1 },
  label: { ...typography.body, color: colors.text },
  name: { ...typography.body, ...font('600'), color: colors.text },
  meta: { ...typography.small, color: colors.textMuted },
  addIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  addText: { ...typography.bodyStrong, color: colors.brand },
  adding: { gap: spacing.sm, marginTop: spacing.sm },
  // Which group the add-people page adds to, and the room left in it.
  addTo: { ...typography.small, color: colors.textMuted, paddingHorizontal: spacing.sm, paddingTop: spacing.xs },
  // Add, in the add-people page's header: a small pill in the brand colour.
  headAdd: { paddingHorizontal: 14, height: 32, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  headAddOff: { opacity: 0.4 },
  headAddText: { ...typography.smallStrong, color: colors.brandInk },
  search: { ...typography.body, color: colors.text, height: 44, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surface, outlineStyle: 'none' } as object,
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 5, paddingRight: 9, height: 30, borderRadius: 15, backgroundColor: colors.brandDim },
  chipText: { ...typography.smallStrong, color: colors.brand, maxWidth: 120 },
  // A ticked person who can't be added after all: greyed, with the lock.
  chipStuck: { backgroundColor: colors.surfaceAlt },
  chipTextStuck: { color: colors.textMuted },
  tick: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  leave: { marginTop: spacing.xl, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, ...lift },
  leaveText: { ...typography.bodyStrong, color: colors.danger },
});

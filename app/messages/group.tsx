import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar, EmptyState, Screen, Toggle } from '@/components/ui';
import { HitGlyph } from '@/components/HitGlyph';
import { ProfilePhotoPicker } from '@/components/ProfilePhotoPicker';
import type { User } from '@/data/types';
import { ChatSheet, type SheetOption } from '@/features/messages/ChatSheet';
import { GROUP_CAP, GroupAvatar, groupName, hasGroupControls, holdsHitSpot, isGroupAdmin, isGroupChat, isMuted, leaveGroupMessage, othersIn } from '@/features/messages/groups';
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
 * A chat's details, opened from the (i) in its header, the way Instagram's
 * read.
 *
 * A group: its photo and name (anyone in it can change either), Mute, who is
 * in it (admins first; tap someone for their profile, a message, and, for an
 * admin, making them an admin or taking them out), adding people (several at
 * once, up to GROUP_CAP in all), the hit it is for if it is a hit's chat,
 * Report, and Leave.
 *
 * A one-to-one chat: the other person, Mute, their profile, starting a group
 * with them, Report and Block.
 */
export default function ChatDetails() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { conversations, users, currentUserId, currentUser, blockedIds, followingIds, hitRequests, actions } = useApp();
  const conversation = conversations.find((c) => c.id === id);
  const [title, setTitle] = useState(conversation?.title ?? '');
  useEffect(() => { setTitle(conversation?.title ?? ''); }, [conversation?.title]);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  // People ticked to add, added together with one tap.
  const [picks, setPicks] = useState<string[]>([]);
  // Someone in the group whose choices are open (profile, message, admin, remove).
  const [member, setMember] = useState<User | null>(null);
  // "How long?" after Mute is switched on.
  const [askMute, setAskMute] = useState(false);
  const nameBox = useRef<TextInput>(null);

  if (!conversation) {
    return <Screen title="Details" compactTitle onBack={() => goBack('/messages')}><EmptyState icon="chatbubbles-outline" title="This chat is gone" body="You may have left it." /></Screen>;
  }
  const group = isGroupChat(conversation);
  const muted = isMuted(conversation);
  const back = () => goBack(`/messages/${conversation.id}`);
  // Mute, the group photo, removing people and admins need a database that
  // has them (migration 54). A group from one that does not has no admin
  // list at all, and those controls are left out rather than refused.
  const controls = hasGroupControls(conversation);

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
    return (
      <Screen title="Details" compactTitle onBack={back}>
        {other ? (
          <Pressable accessibilityRole="link" accessibilityLabel={`${other.name}'s profile`} onPress={() => router.push(`/user/${other.id}`)} style={styles.top}>
            <Avatar name={other.name} seed={other.avatarSeed} uri={other.avatarUrl} size={88} />
            <Text style={styles.personName} numberOfLines={1}>{other.name}</Text>
            <Text style={styles.meta}>@{other.handle}</Text>
          </Pressable>
        ) : null}
        {muteCard}
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
                <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/messages/new', params: { with: other.id } })} style={({ pressed }) => [styles.row, styles.line, pressed && styles.pressed]}>
                  <View style={styles.lead}><Ionicons name="people-outline" size={20} color={colors.text} /></View>
                  <Text style={[styles.label, styles.words]} numberOfLines={1}>Create a group with {first(other)}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                </Pressable>
              ) : null}
            </View>
            <View style={[styles.group, styles.gap]}>
              <Pressable
                accessibilityRole="button"
                onPress={() => confirm({
                  title: `Report ${first(other)}?`,
                  message: 'A person at CourtSide will look at this chat. They aren’t told who reported it.',
                  confirmLabel: 'Report',
                  onConfirm: () => { actions.reportUser(other.id, 'messages'); showToast({ title: 'Thanks — a person will review this', icon: 'flag-outline' }); },
                })}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={styles.lead}><Ionicons name="flag-outline" size={20} color={colors.danger} /></View>
                <Text style={[styles.label, styles.words, { color: colors.danger }]}>Report</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                // Blocking takes the one-to-one chat away, so this page goes back to the inbox.
                onPress={() => (blocked ? actions.toggleBlock(other.id) : confirmBlock(other, () => { actions.toggleBlock(other.id); router.replace('/messages'); }))}
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
  const togglePick = (u: User) => {
    if (picks.includes(u.id)) { setPicks((p) => p.filter((x) => x !== u.id)); return; }
    if (picks.length >= room) {
      showToast({ title: room > 0 ? `There’s room for ${room} more` : `A group can have up to ${GROUP_CAP} people`, icon: 'people-outline' });
      return;
    }
    setPicks((p) => [...p, u.id]);
    setQuery('');
  };
  const addPicked = () => {
    if (!picks.length) return;
    void actions.addGroupMembers(conversation.id, picks);
    setPicks([]);
    setQuery('');
    setAdding(false);
  };

  // What tapping someone in the group offers.
  const memberOptions: SheetOption[] = !member ? [] : [
    { key: 'profile', label: 'View profile', icon: 'person-outline', onPress: () => router.push(`/user/${member.id}`) },
    ...(!blockedIds.includes(member.id) ? [{
      key: 'message', label: 'Message', icon: 'chatbubble-outline' as const,
      onPress: () => {
        if (!actions.canMessage(member.id)) { showToast({ title: `Only people ${first(member)} follows can message them`, icon: 'lock-closed-outline' }); return; }
        router.push(`/messages/${actions.openConversationWith(member.id)}`);
      },
    }] : []),
    ...(iAmAdmin && controls ? [
      isGroupAdmin(conversation, member.id)
        ? { key: 'admin', label: 'Remove as admin', icon: 'shield-outline' as const, onPress: () => actions.setGroupAdmin(conversation.id, member.id, false) }
        : { key: 'admin', label: 'Make admin', icon: 'shield-checkmark-outline' as const, onPress: () => actions.setGroupAdmin(conversation.id, member.id, true) },
      {
        key: 'remove', label: 'Remove from group', icon: 'person-remove-outline' as const, danger: true,
        onPress: () => confirmAfterMenu({
          title: `Remove ${first(member)}?`,
          message: 'They won’t get new messages. Someone in the group can add them back.',
          confirmLabel: 'Remove',
          destructive: true,
          onConfirm: () => actions.removeGroupMember(conversation.id, member.id),
        }),
      },
    ] : []),
  ];

  const leave = () => confirm({
    title: 'Leave this group?',
    message: leaveGroupMessage(holdsHitSpot(hitRequests, conversation.id, currentUserId)),
    confirmLabel: 'Leave',
    destructive: true,
    onConfirm: () => {
      actions.leaveGroup(conversation.id);
      router.replace('/messages');
    },
  });
  const report = () => confirm({
    title: 'Report this group?',
    message: 'A person at CourtSide will look at it. Nobody in the group is told.',
    confirmLabel: 'Report',
    onConfirm: () => { actions.reportChat(conversation.id, 'group chat'); showToast({ title: 'Thanks — a person will review this', icon: 'flag-outline' }); },
  });
  const removePhoto = () => confirm({
    title: 'Remove the group photo?',
    message: 'Everyone in the group sees the change.',
    confirmLabel: 'Remove',
    destructive: true,
    onConfirm: () => actions.setGroupPhoto(conversation.id, null),
  });

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
      <View style={styles.group}>
        {everyone.map((u, i) => {
          const me = u.id === currentUserId;
          const admin = isGroupAdmin(conversation, u.id);
          const blocked = blockedIds.includes(u.id);
          const meta = [me ? 'You' : `@${u.handle}`, admin ? 'Admin' : '', blocked ? 'Blocked' : ''].filter(Boolean).join(' · ');
          return (
            <Pressable
              key={u.id}
              accessibilityRole="button"
              accessibilityLabel={`${u.name}, ${meta}`}
              // Your own row has nothing to offer you.
              disabled={me}
              onPress={() => setMember(u)}
              style={({ pressed }) => [styles.row, i > 0 && styles.line, pressed && styles.pressed]}
            >
              <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={40} />
              <View style={styles.words}>
                <Text style={styles.name} numberOfLines={1}>{u.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
              </View>
              {!me ? <Ionicons name="ellipsis-horizontal" size={18} color={colors.textFaint} /> : null}
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: adding }}
          disabled={room <= 0}
          onPress={() => { setAdding((a) => !a); setPicks([]); setQuery(''); }}
          style={({ pressed }) => [styles.row, everyone.length > 0 && styles.line, pressed && styles.pressed, room <= 0 && styles.off]}
        >
          <View style={styles.addIcon}><Ionicons name="person-add-outline" size={18} color={colors.brand} /></View>
          <View style={styles.words}>
            <Text style={styles.addText}>Add people</Text>
            {room <= 0 ? <Text style={styles.meta}>This group is full ({GROUP_CAP})</Text> : null}
          </View>
        </Pressable>
      </View>

      {adding && room > 0 ? (
        <View style={styles.adding}>
          <TextInput value={query} onChangeText={setQuery} placeholder="Search" placeholderTextColor={colors.textFaint} autoFocus autoCapitalize="none" autoCorrect={false} style={styles.search} accessibilityLabel="Find people to add" />
          {pickedUsers.length ? (
            <View style={styles.chips}>
              {pickedUsers.map((u) => (
                <Pressable key={u.id} accessibilityRole="button" accessibilityLabel={`Don’t add ${u.name}`} onPress={() => togglePick(u)} style={styles.chip}>
                  <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={20} />
                  <Text style={styles.chipText} numberOfLines={1}>{first(u)}</Text>
                  <Ionicons name="close" size={13} color={colors.brand} />
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={styles.group}>
            {candidates.map((u, i) => {
              // A teen can only be put in a group by someone they follow (the same rule as a one-to-one chat).
              const allowed = actions.canMessage(u.id);
              const on = picks.includes(u.id);
              return (
                <Pressable
                  key={u.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled: !allowed }}
                  accessibilityLabel={u.name}
                  disabled={!allowed}
                  onPress={() => togglePick(u)}
                  style={({ pressed }) => [styles.row, i > 0 && styles.line, pressed && styles.pressed]}
                >
                  <View style={!allowed && styles.off}><Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={36} /></View>
                  <View style={[styles.words, !allowed && styles.off]}>
                    <Text style={styles.name} numberOfLines={1}>{u.name}</Text>
                    <Text style={styles.meta} numberOfLines={1}>{allowed ? `@${u.handle}` : `Only people ${first(u)} follows can add them`}</Text>
                  </View>
                  {allowed ? <View style={[styles.tick, on && styles.tickOn]}>{on ? <Ionicons name="checkmark" size={15} color={colors.brandInk} /> : null}</View> : <Ionicons name="lock-closed-outline" size={16} color={colors.textFaint} />}
                </Pressable>
              );
            })}
            {!candidates.length ? <Text style={[styles.meta, { padding: spacing.lg }]}>No one else to add.</Text> : null}
          </View>
          <Pressable accessibilityRole="button" disabled={!picks.length} onPress={addPicked} style={({ pressed }) => [styles.addButton, !picks.length && styles.addButtonOff, pressed && { opacity: 0.85 }]}>
            <Text style={styles.addButtonText}>{picks.length ? `Add (${picks.length})` : 'Add'}</Text>
          </Pressable>
        </View>
      ) : null}

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
  lead: { width: 26, alignItems: 'center' },
  words: { flex: 1, minWidth: 0, gap: 1 },
  label: { ...typography.body, color: colors.text },
  name: { ...typography.body, ...font('600'), color: colors.text },
  meta: { ...typography.small, color: colors.textMuted },
  addIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  addText: { ...typography.bodyStrong, color: colors.brand },
  adding: { gap: spacing.sm, marginTop: spacing.lg },
  search: { ...typography.body, color: colors.text, height: 44, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surface, outlineStyle: 'none' } as object,
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 5, paddingRight: 9, height: 30, borderRadius: 15, backgroundColor: colors.brandDim },
  chipText: { ...typography.smallStrong, color: colors.brand, maxWidth: 120 },
  tick: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  addButton: { height: 48, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', shadowColor: colors.brand, shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  addButtonOff: { opacity: 0.5 },
  addButtonText: { ...typography.bodyStrong, color: colors.brandInk },
  leave: { marginTop: spacing.xl, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, ...lift },
  leaveText: { ...typography.bodyStrong, color: colors.danger },
});

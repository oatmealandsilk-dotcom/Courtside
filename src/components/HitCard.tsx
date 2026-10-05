import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar } from '@/components/ui';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import type { HitRequest } from '@/data/types';
import { audienceLine, isHitOpen, joinedCount } from '@/features/hits/audience';
import { FORMAT_LABEL, hitWhen, levelText } from '@/features/hits/format';
import { openCourt } from '@/features/players/courtLink';
import { formatMiles } from '@/features/players/geo';
import { confirm, confirmReport } from '@/lib/confirm';
import { goBack } from '@/lib/goBack';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

/**
 * A "Looking for a hit" post: who, when, where, what level and format, and
 * how many spots are left. "I'm in" joins and opens the hit's group chat,
 * where the details get sorted. The poster sees who is in and can call it off.
 * The paper plane sends the hit into any of your chats or groups, for the
 * friends who might want the spot. The place opens its court's page; with
 * `miles` (Find Players near you, the map) it says how far that is.
 *
 * A hit that is not out for everyone yet (Invite first or Only people I
 * invite, migration 76) says so in a box under its details: to its poster,
 * when it opens ("Opens to everyone at 5:30 PM"), who was invited, and
 * "Open to everyone now"; to an invited player, that they were. It has no
 * paper plane until it opens: sending it on would reach people it is not
 * for (they could not open it).
 *
 * Someone else's hit has a flag to report it (its note is their own words),
 * and their picture and name open their profile, where Block is. `linked`
 * (the default) opens the hit's own page on a tap; that page passes false,
 * so a tap there no longer opens the same page again on top.
 */
export function HitCard({ hit, miles, linked = true }: { hit: HitRequest; miles?: number; linked?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const { users, currentUserId, actions } = useApp();
  const [busy, setBusy] = useState(false);
  const author = users.find((u) => u.id === hit.authorId);
  const joined = hit.joinedIds.map((id) => users.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => !!u);
  const mine = hit.authorId === currentUserId;
  const inIt = !!currentUserId && hit.joinedIds.includes(currentUserId);
  // Everyone in takes a spot, those this account is not shown included (joinedCount).
  const total = joinedCount(hit);
  const left = Math.max(0, hit.spots - total);
  const open = isHitOpen(hit);
  const line = audienceLine(hit, currentUserId);
  const invited = mine ? (hit.invitedIds ?? []).map((id) => users.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => !!u) : [];
  const invitedText = invited.length === 0 ? (hit.includeGroups ? 'Your groups are invited' : null)
    : `${invited.length === 1 ? invited[0].name.split(' ')[0] : invited.length === 2 ? `${invited[0].name.split(' ')[0]} and ${invited[1].name.split(' ')[0]}` : `${invited[0].name.split(' ')[0]} and ${invited.length - 1} more`} invited${hit.includeGroups ? ', and your groups' : ''}`;
  const openChat = () => { if (hit.conversationId) router.push(`/messages/${hit.conversationId}`); };
  // Someone else's: their profile from their picture and name, and a flag to report the hit.
  const theirs = !mine && !!currentUserId;
  const openPoster = theirs && author ? () => router.push(`/user/${author.id}`) : undefined;
  // Reported, it leaves your screens at once (the hit's own page goes back, as a reported thread's does).
  const report = () => confirmReport('hit', () => {
    actions.reportUser(hit.authorId, `hit-request:${hit.id}`);
    showToast({ title: 'Thanks — a person will review this', icon: 'flag-outline' });
    if (!linked) goBack('/discuss');
  });
  const join = async () => {
    if (busy) return;
    setBusy(true);
    const result = await actions.joinHit(hit.id);
    setBusy(false);
    if (result.error) { showToast({ title: result.error, icon: 'alert-circle-outline' }); return; }
    if (result.conversationId) router.push(`/messages/${result.conversationId}`);
    else showToast({ title: 'You’re in', body: `${author?.name.split(' ')[0] ?? 'They'} will see it.`, icon: 'checkmark-circle-outline' });
  };
  return (
    <Pressable accessibilityRole={linked ? 'link' : undefined} disabled={!linked} onPress={linked ? () => router.push(`/hit-request/${hit.id}`) : undefined} style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}>
      <View style={styles.head}>
        <Pressable accessibilityRole={openPoster ? 'link' : undefined} accessibilityLabel={openPoster ? `Open ${author!.name}'s profile` : undefined} disabled={!openPoster} onPress={(e) => { e.stopPropagation?.(); openPoster?.(); }}>
          <Avatar name={author?.name ?? '?'} seed={author?.avatarSeed ?? hit.id} uri={author?.avatarUrl} size={36} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Pressable accessibilityRole={openPoster ? 'link' : undefined} disabled={!openPoster} onPress={(e) => { e.stopPropagation?.(); openPoster?.(); }} style={styles.whoPress}>
            <Text style={styles.who} numberOfLines={1}>{mine ? 'Your hit' : author?.name ?? 'A player'}{mine ? null : <Text style={styles.wants}> is looking for a hit</Text>}</Text>
          </Pressable>
          <Text style={styles.when}>{hitWhen(hit.startsAt)}</Text>
        </View>
        {open ? <Pressable accessibilityRole="button" accessibilityLabel="Send this hit to a chat" hitSlop={8} onPress={(e) => { e.stopPropagation?.(); router.push({ pathname: '/share', params: { kind: 'hit-request', id: hit.id } }); }} style={({ pressed }) => [styles.send, pressed && { opacity: 0.6 }]}>
          <Ionicons name="paper-plane-outline" size={18} color={colors.textMuted} />
        </Pressable> : null}
        {theirs ? <Pressable accessibilityRole="button" accessibilityLabel="Report this hit" hitSlop={8} onPress={(e) => { e.stopPropagation?.(); report(); }} style={({ pressed }) => [styles.send, pressed && { opacity: 0.6 }]}>
          <Ionicons name="flag-outline" size={17} color={colors.textMuted} />
        </Pressable> : null}
      </View>
      <Pressable accessibilityRole="link" accessibilityLabel={`${hit.place.name}${miles !== undefined ? `, ${formatMiles(miles)}` : ''}. See the court`} disabled={hit.place.lat === undefined} onPress={(e) => { e.stopPropagation?.(); if (hit.place.lat !== undefined && hit.place.lng !== undefined) openCourt({ id: hit.place.id, name: hit.place.name, lat: hit.place.lat, lng: hit.place.lng }); }} style={styles.place}>
        <CourtGlyph size={13} color={colors.brand} />
        <Text style={styles.placeText} numberOfLines={1}>{hit.place.name}{miles !== undefined ? <Text style={styles.placeMiles}>{` · ${formatMiles(miles)}`}</Text> : null}</Text>
      </Pressable>
      {/* One quiet line, not three chips: the format, the level, and how many can still join. */}
      <Text style={styles.details} numberOfLines={1}>
        {FORMAT_LABEL[hit.format]} · {levelText(hit, author?.profile.skillSystem)} · <Text style={left ? styles.detailsLeft : undefined}>{left ? `${left} ${left === 1 ? 'spot' : 'spots'} left` : 'Full'}</Text>
      </Text>
      {hit.note ? <Text style={styles.note} numberOfLines={3}>{hit.note}</Text> : null}
      {line ? (
        <View style={styles.audience}>
          <View style={styles.audienceRow}>
            <Ionicons name={hit.audience === 'invite_only' ? 'lock-closed-outline' : 'time-outline'} size={15} color={colors.brand} />
            <Text style={styles.audienceText}>{line}</Text>
          </View>
          {invitedText ? (
            <View style={styles.audienceRow}>
              {invited.slice(0, 4).map((u, i) => <Avatar key={u.id} name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={20} style={[styles.faceSmall, { marginLeft: i ? -6 : 0 }]} />)}
              <Text style={styles.invitedText} numberOfLines={1}>{invitedText}</Text>
            </View>
          ) : null}
          {mine && hit.audience === 'invite_first' && left > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Open to everyone now" onPress={(e) => { e.stopPropagation?.(); confirm({ title: 'Open to everyone now?', message: 'It goes on Find Players and the map for players nearby, not just the people you invited.', confirmLabel: 'Open it', onConfirm: () => { void actions.openHitNow(hit.id); } }); }} style={({ pressed }) => [styles.openNow, pressed && { opacity: 0.7 }]}>
              <Ionicons name="earth-outline" size={15} color={colors.text} />
              <Text style={styles.secondaryText}>Open to everyone now</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={styles.foot}>
        <View style={styles.joined}>
          {joined.slice(0, 4).map((u, i) => <Avatar key={u.id} name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={24} style={[styles.face, { marginLeft: i ? -8 : 0 }]} />)}
          <Text style={styles.joinedText}>{total ? `${total} in` : 'No one in yet'}</Text>
        </View>
        {mine ? (
          <View style={styles.actions}>
            {hit.conversationId ? <Pressable accessibilityRole="button" onPress={(e) => { e.stopPropagation?.(); openChat(); }} style={styles.secondary}><Text style={styles.secondaryText}>Chat</Text></Pressable> : null}
            <Pressable accessibilityRole="button" onPress={(e) => { e.stopPropagation?.(); confirm({ title: 'Call off this hit?', message: 'It comes off Find Players. Anyone who joined still has the chat.', confirmLabel: 'Call it off', destructive: true, onConfirm: () => actions.cancelHit(hit.id) }); }} style={styles.secondary}><Text style={[styles.secondaryText, { color: colors.danger }]}>Call off</Text></Pressable>
          </View>
        ) : inIt ? (
          <Pressable accessibilityRole="button" onPress={(e) => { e.stopPropagation?.(); openChat(); }} style={styles.secondary}><Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.text} /><Text style={styles.secondaryText}>You’re in · Chat</Text></Pressable>
        ) : (
          <Pressable accessibilityRole="button" disabled={!left || busy} onPress={(e) => { e.stopPropagation?.(); void join(); }} style={[styles.primary, (!left || busy) && { opacity: 0.45 }]}><Text style={styles.primaryText}>{busy ? 'Joining…' : 'I’m in'}</Text></Pressable>
        )}
      </View>
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  card: { ...lift, gap: spacing.md, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated },
  whoPress: { alignSelf: 'flex-start', maxWidth: '100%' },
  who: { ...typography.bodyStrong, color: colors.text },
  wants: { ...typography.body, color: colors.textMuted },
  when: { ...typography.title, fontSize: 20, color: colors.text, marginTop: 2 },
  place: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.brandDim, maxWidth: '100%' },
  placeText: { ...typography.smallStrong, color: colors.brand, flexShrink: 1 },
  placeMiles: { ...typography.small, color: colors.brand },
  details: { ...typography.small, ...font('600'), color: colors.textMuted },
  detailsLeft: { color: colors.brand },
  note: { ...typography.body, color: colors.text, lineHeight: 21 },
  audience: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.bgElevated },
  audienceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  audienceText: { ...typography.smallStrong, color: colors.brand, flex: 1 },
  invitedText: { ...typography.small, color: colors.textMuted, flex: 1 },
  faceSmall: { borderWidth: 1.5, borderColor: colors.bgElevated, borderRadius: 11 },
  openNow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: 18, backgroundColor: colors.surface, ...lift },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  joined: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  face: { borderWidth: 2, borderColor: colors.surface, borderRadius: 14 },
  joinedText: { ...typography.small, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: spacing.sm },
  primary: { height: 38, paddingHorizontal: 20, borderRadius: 19, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  primaryText: { ...typography.bodyStrong, fontSize: 15, color: colors.brandInk },
  secondary: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: colors.bgElevated, justifyContent: 'center' },
  secondaryText: { ...typography.smallStrong, color: colors.text },
});

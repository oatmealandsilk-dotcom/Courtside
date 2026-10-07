import React, { useRef, useState, type RefObject } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar } from '@/components/ui';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { TipBubble } from '@/components/TipBubble';
import type { HitRequest } from '@/data/types';
import { audienceLine, isHitOpen, joinedCount } from '@/features/hits/audience';
import { FORMAT_LABEL, hitWhen, levelText } from '@/features/hits/format';
import type { HitTip } from '@/features/hits/hitTips';
import { learned, tipWaiting, useTip } from '@/features/tips/tips';
import { useOnScreen } from '@/lib/useOnScreen';
import { openCourt } from '@/features/players/courtLink';
import { formatMiles } from '@/features/players/geo';
import { confirm, confirmReport } from '@/lib/confirm';
import { goBack } from '@/lib/goBack';
import { show as showToast } from '@/lib/toast';
import { afterReport } from '@/features/moderation/reportThanks';
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
 *
 * Oct 7 refinement (the same card; owner: "I really like these cards"): the
 * court is a line of its own that wraps to two lines instead of a pill cut
 * short; the game and level share one line with whether there is room as a
 * tag at its end (a grey "Full" when there is none, and then no faded I'm in
 * at all); the paper plane and the flag are bare icons, so the time leads;
 * who's in is their faces overlapping and their names ("You and Sam are
 * in"); and every button at the foot is the same height and weight. On
 * review: "Full" is an empty, outlined tag (a grey fill read the same as the
 * green one on the cream and Melbourne courts), a long court name wraps
 * inside itself with its distance held to its last word, and your own hit
 * with people in it gives who's in a line of its own above Chat and Call off.
 *
 * A hit you are in has "Can't make it" beside Chat, the same pair the poster
 * has (Oct 7, audit item 2): it gives your spot back, takes you out of the
 * hit's chat and tells the poster, after a short "Free your spot?". Only
 * while the hit is still on the lists; one already played keeps its Chat. Calling
 * off your own hit tells everyone in it (the server's, migration 150).
 *
 * `tip` (the list's pick, one card at most): a just-in-time tip inside the
 * card, just above the thing it is about, once the card is in view. On
 * someone else's hit, "Tap I'm in to join" pointing at I'm in; on the hit
 * you just posted, "We'll tell you when someone's in" pointing at who's in.
 * `tipReady` is the list's own moment (its page on show, no tutorial up).
 */
export function HitCard({ hit, miles, linked = true, tip, tipReady = false }: { hit: HitRequest; miles?: number; linked?: boolean; tip?: HitTip; tipReady?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const { users, currentUserId, actions } = useApp();
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<View>(null);
  const author = users.find((u) => u.id === hit.authorId);
  const posterFirst = author?.name.split(' ')[0] ?? 'The poster';
  const joined = hit.joinedIds.map((id) => users.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => !!u);
  const mine = hit.authorId === currentUserId;
  const inIt = !!currentUserId && hit.joinedIds.includes(currentUserId);
  // "Can't make it" while the hit is still on the lists (until an hour after its start, openHits),
  // the same window in which the server tells the poster. A hit already played, opened on its
  // own page, keeps just its chat.
  const canLeave = inIt && !mine && Date.parse(hit.startsAt) > Date.now() - 3_600_000;
  // Everyone in takes a spot, those this account is not shown included (joinedCount).
  const total = joinedCount(hit);
  const left = Math.max(0, hit.spots - total);
  const full = left === 0;
  // Full, and neither yours nor one you are in: nothing to do here but look, so it reads that way.
  const quiet = full && !mine && !inIt;
  // Yours with people in it (Chat, Call off), or one you are in (Chat, Can't make it): two things to do, so the foot takes two lines (see the foot).
  const twoLine = (mine && !!hit.conversationId) || canLeave;
  const open = isHitOpen(hit);
  const line = audienceLine(hit, currentUserId);
  const invited = mine ? (hit.invitedIds ?? []).map((id) => users.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => !!u) : [];
  const invitedText = invited.length === 0 ? (hit.includeGroups ? 'Your groups are invited' : null)
    : `${invited.length === 1 ? invited[0].name.split(' ')[0] : invited.length === 2 ? `${invited[0].name.split(' ')[0]} and ${invited[1].name.split(' ')[0]}` : `${invited[0].name.split(' ')[0]} and ${invited.length - 1} more`} invited${hit.includeGroups ? ', and your groups' : ''}`;
  const openChat = () => { if (hit.conversationId) router.push(`/messages/${hit.conversationId}`); };
  // Someone else's: their profile from their picture and name, and a flag to report the hit.
  const theirs = !mine && !!currentUserId;
  const openPoster = theirs && author ? () => router.push(`/user/${author.id}`) : undefined;
  const canOpenCourt = hit.place.lat !== undefined && hit.place.lng !== undefined;
  // Reported, it leaves your screens at once (the hit's own page goes back, as a reported thread's does).
  const report = () => confirmReport('hit', () => {
    afterReport(actions.reportUser(hit.authorId, `hit-request:${hit.id}`), author, actions);
    if (!linked) goBack('/discuss');
  });
  const join = async () => {
    if (busy) return;
    // Tapping it is knowing it: the tip about it never shows now.
    learned('join-hit');
    setBusy(true);
    const result = await actions.joinHit(hit.id);
    setBusy(false);
    if (result.error) { showToast({ title: result.error, icon: 'alert-circle-outline' }); return; }
    if (result.conversationId) router.push(`/messages/${result.conversationId}`);
    else showToast({ title: 'You’re in', body: `${author?.name.split(' ')[0] ?? 'They'} will see it.`, icon: 'checkmark-circle-outline' });
  };
  // "Can't make it": your spot back, out of the chat, and a note to the poster (see leaveHit).
  const cantMakeIt = () => confirm({
    title: 'Free your spot?',
    message: `${posterFirst} gets a note, and you leave the hit’s chat.`,
    confirmLabel: 'Can’t make it',
    destructive: true,
    onConfirm: async () => {
      const ok = await actions.leaveHit(hit.id);
      showToast(ok
        ? { title: 'Your spot is free', body: `${posterFirst} knows you can’t make it.`, icon: 'checkmark-circle-outline' }
        : { title: 'That didn’t go through. You’re still in.', icon: 'alert-circle-outline' });
    },
  });
  return (
    <Pressable ref={cardRef} accessible={linked} accessibilityRole={linked ? 'link' : undefined} disabled={!linked} onPress={linked ? () => router.push(`/hit-request/${hit.id}`) : undefined} style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}>
      {/* Who, with the paper plane and the flag beside the name; when, under it, across the
          card's full width, so "Tomorrow 9:00 AM" stays on one line on a small phone and the
          name is never cut to "Sam Ortiz is lookin…" (Oct 5). The section says it is a hit.
          The two icons are bare (Oct 7), in faint ink with no disc behind them, so the time is
          what the eye lands on; a press still shows the disc. */}
      <View style={styles.head}>
        <Pressable accessibilityRole={openPoster ? 'link' : undefined} accessibilityLabel={openPoster ? `Open ${author!.name}'s profile` : undefined} disabled={!openPoster} onPress={(e) => { e.stopPropagation?.(); openPoster?.(); }}>
          <Avatar name={author?.name ?? '?'} seed={author?.avatarSeed ?? hit.id} uri={author?.avatarUrl} size={40} />
        </Pressable>
        <View style={styles.headWords}>
          <View style={styles.whoRow}>
            <Pressable accessibilityRole={openPoster ? 'link' : undefined} accessibilityLabel={openPoster ? `${author!.name} is looking for a hit. Open profile` : undefined} disabled={!openPoster} onPress={(e) => { e.stopPropagation?.(); openPoster?.(); }} style={styles.whoPress}>
              <Text style={[styles.who, mine && styles.whoMine]} numberOfLines={1}>{mine ? 'Your hit' : author?.name ?? 'A player'}</Text>
            </Pressable>
            <View style={styles.spacer} />
            {open ? <Pressable accessibilityRole="button" accessibilityLabel="Send this hit to a chat" hitSlop={6} onPress={(e) => { e.stopPropagation?.(); router.push({ pathname: '/share', params: { kind: 'hit-request', id: hit.id } }); }} style={({ pressed }) => [styles.icon, pressed && styles.iconPressed]}>
              <Ionicons name="paper-plane-outline" size={18} color={colors.textFaint} />
            </Pressable> : null}
            {theirs ? <Pressable accessibilityRole="button" accessibilityLabel="Report this hit" hitSlop={6} onPress={(e) => { e.stopPropagation?.(); report(); }} style={({ pressed }) => [styles.icon, pressed && styles.iconPressed]}>
              <Ionicons name="flag-outline" size={17} color={colors.textFaint} />
            </Pressable> : null}
          </View>
          <Text style={[styles.when, quiet && styles.whenQuiet]} numberOfLines={1}>{hitWhen(hit.startsAt)}</Text>
        </View>
      </View>
      <View style={styles.facts}>
        {/* Where: a line of its own that wraps, so "Country Club at Wakefield Plantation" is never cut short. */}
        <Pressable accessibilityRole="link" accessibilityLabel={`${hit.place.name}${miles !== undefined ? `, ${formatMiles(miles)}` : ''}. See the court`} disabled={!canOpenCourt} onPress={(e) => { e.stopPropagation?.(); if (hit.place.lat !== undefined && hit.place.lng !== undefined) openCourt({ id: hit.place.id, name: hit.place.name, lat: hit.place.lat, lng: hit.place.lng }); }} style={({ pressed }) => [styles.place, pressed && canOpenCourt && { opacity: 0.6 }]}>
          <View style={styles.placeTile}><CourtGlyph size={12} color={colors.brand} /></View>
          {/* The distance is held to the name's last word by no-break spaces, so a long name
              wraps inside itself ("Country Club at Wakefield / Plantation · 2.6 mi") and never
              leaves a dot dangling at a line's end or the distance alone on the second line. */}
          <Text style={styles.placeText} numberOfLines={2}>{hit.place.name}{miles !== undefined ? <Text style={styles.placeMiles}>{` · ${formatMiles(miles).replace(/ /g, ' ')}`}</Text> : null}</Text>
        </Pressable>
        {/* What, then whether there is room, as a tag at the line's end: a grey "Full" once there is none. */}
        <View style={styles.metaRow}>
          <Text style={styles.details} numberOfLines={1}>
            <Text style={styles.detailsFormat}>{FORMAT_LABEL[hit.format]}</Text>{` · ${levelText(hit, author?.profile.skillSystem)}`}
          </Text>
          <View style={[styles.tag, full && styles.tagFull]}>
            <Text style={[styles.tagText, full && styles.tagTextFull]}>{full ? 'Full' : `${left} ${left === 1 ? 'spot' : 'spots'} left`}</Text>
          </View>
        </View>
      </View>
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
              <Text style={styles.openNowText}>Open to everyone now</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {/* The list's tip, if this card carries it: in the card's flow just above the foot,
          pointing down at I'm in (someone else's hit) or at who's in (the hit you just posted). */}
      {tip && (tip === 'hit-posted' ? mine && total === 0 : !mine && !inIt && !full) ? <CardTip tip={tip} ready={tipReady} cardRef={cardRef} /> : null}
      {/* Who's in, as their faces overlapping and in words; then the one thing to do. Every
          button here is the same height, border and label weight, so none reads heavier by accident.
          Your own hit with people in it has two things to do (Chat, Call off): who's in takes the
          foot's first line in full, and the two buttons share the line under it, so neither the
          names nor a button is ever squeezed (review, Oct 7: "Sam and …" on a 375pt phone). */}
      <View style={[styles.foot, twoLine && styles.footTwoLine]}>
        <View style={styles.joined}>
          {joined.length ? (
            <View style={styles.faces}>
              {joined.slice(0, 3).map((u, i) => <Avatar key={u.id} name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={26} style={[styles.face, { marginLeft: i ? -10 : 0, zIndex: 3 - i }]} />)}
            </View>
          ) : null}
          <Text style={[styles.joinedText, inIt && styles.joinedTextMine]} numberOfLines={2}>{whoIsIn(joined, total, currentUserId, twoLine)}</Text>
        </View>
        {mine ? (
          <View style={[styles.actions, twoLine && styles.actionsTwoLine]}>
            {hit.conversationId ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Chat with who’s in" onPress={(e) => { e.stopPropagation?.(); openChat(); }} style={({ pressed }) => [styles.button, styles.secondary, twoLine && styles.buttonWide, pressed && styles.buttonPressed]}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.text} />
                <Text style={styles.secondaryText}>Chat</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" onPress={(e) => { e.stopPropagation?.(); confirm({ title: 'Call off this hit?', message: total ? `It comes off Find Players, and ${total === 1 ? 'the player who’s in gets' : `the ${total} players who are in get`} a note.` : 'It comes off Find Players.', confirmLabel: 'Call it off', destructive: true, onConfirm: () => actions.cancelHit(hit.id) }); }} style={({ pressed }) => [styles.button, styles.quietButton, twoLine && styles.buttonWide, pressed && styles.buttonPressed]}>
              <Text style={styles.dangerText}>Call off</Text>
            </Pressable>
          </View>
        ) : canLeave ? (
          // In it: the chat, and the way out of it, sharing the line under who's in (the poster's own pair).
          <View style={[styles.actions, styles.actionsTwoLine]}>
            {hit.conversationId ? (
              <Pressable accessibilityRole="button" accessibilityLabel="You’re in. Open the hit’s chat" onPress={(e) => { e.stopPropagation?.(); openChat(); }} style={({ pressed }) => [styles.button, styles.secondary, styles.buttonWide, pressed && styles.buttonPressed]}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.text} />
                <Text style={styles.secondaryText}>Chat</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityLabel={`Can’t make it. Free your spot in ${posterFirst}’s hit`} onPress={(e) => { e.stopPropagation?.(); cantMakeIt(); }} style={({ pressed }) => [styles.button, styles.quietButton, styles.buttonWide, pressed && styles.buttonPressed]}>
              <Text style={styles.dangerText}>Can’t make it</Text>
            </Pressable>
          </View>
        ) : inIt ? (
          // In a hit already played: just its chat.
          <Pressable accessibilityRole="button" accessibilityLabel="You’re in. Open the hit’s chat" onPress={(e) => { e.stopPropagation?.(); openChat(); }} style={({ pressed }) => [styles.button, styles.secondary, pressed && styles.buttonPressed]}>
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.text} />
            <Text style={styles.secondaryText}>Chat</Text>
          </Pressable>
        ) : full ? null : (
          <Pressable accessibilityRole="button" disabled={busy} onPress={(e) => { e.stopPropagation?.(); void join(); }} style={({ pressed }) => [styles.button, styles.primary, busy && { opacity: 0.6 }, pressed && styles.buttonPressed]}>
            <Text style={styles.primaryText}>{busy ? 'Joining…' : 'I’m in'}</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

/**
 * A hit tip inside its card (see HitCard's `tip`). It waits for the card to
 * come into view, so a card far down the page never uses up the visit's one
 * tip unseen. Drawn only on the card that carries it: a tip's hook lets go of
 * the tip when it unmounts, so every card asking would let it go too.
 */
function CardTip({ tip, ready, cardRef }: { tip: HitTip; ready: boolean; cardRef: RefObject<View | null> }) {
  const seen = useOnScreen(cardRef, ready && tipWaiting(tip));
  // "We'll tell you when someone's in" answers the post just made, so it may follow another tip this visit.
  const shown = useTip(tip, ready && seen, tip === 'hit-posted');
  return (
    <TipBubble
      tip={tip}
      shown={shown.shown}
      onClose={shown.close}
      pointer="down"
      inline
      on="page"
      // Someone else's hit: at I'm in, on the right. Yours: at "No one in yet", on the left.
      {...(tip === 'join-hit' ? { pointerRight: JOIN_POINTER, style: { alignItems: 'flex-end' as const } } : { pointerInset: 26, style: { alignItems: 'flex-start' as const } })}
    />
  );
}
/** From the card's right edge to the middle of I'm in, less half the pointer. */
const JOIN_POINTER = 38;

/**
 * Who's in, in words, you first: "You’re in", "Sam is in", "You and Sam are
 * in", "Sam and 2 others are in". With `roomy` (a line of its own) three are
 * named: "Sam, Marcus and Priya are in". People this account is not shown
 * (hiddenJoins) are counted, never named: "2 players in" when none can be.
 */
export function whoIsIn(people: { id: string; name: string }[], total: number, me: string | null, roomy = false): string {
  if (!total) return 'No one in yet';
  if (!people.length) return `${total} ${total === 1 ? 'player' : 'players'} in`;
  const ordered = [...people].sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : 0));
  const word = (u: { id: string; name: string }) => (u.id === me ? 'You' : u.name.split(' ')[0]);
  const others = total - 1;
  if (!others) return ordered[0].id === me ? 'You’re in' : `${word(ordered[0])} is in`;
  if (others === 1 && ordered.length === 2) return `${word(ordered[0])} and ${word(ordered[1])} are in`;
  if (roomy && others === 2 && ordered.length === 3) return `${word(ordered[0])}, ${word(ordered[1])} and ${word(ordered[2])} are in`;
  return `${word(ordered[0])} and ${others} ${others === 1 ? 'other' : 'others'} are in`;
}

const styleDefinitions = StyleSheet.create({
  card: { ...lift, gap: spacing.md, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headWords: { flex: 1, minWidth: 0 },
  whoRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  // 32 drawn, 44 to the finger; bare until pressed.
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  iconPressed: { backgroundColor: colors.bgElevated },
  whoPress: { flexShrink: 1, minWidth: 0 },
  spacer: { flex: 1 },
  who: { ...typography.bodyStrong, color: colors.text },
  whoMine: { color: colors.brand },
  when: { ...typography.title, fontSize: 20, color: colors.text, marginTop: -2 },
  whenQuiet: { color: colors.textMuted },
  facts: { gap: spacing.sm },
  place: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', maxWidth: '100%' },
  placeTile: { width: 26, height: 26, borderRadius: 8, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  placeText: { ...typography.body, ...font('500'), color: colors.text, lineHeight: 20, letterSpacing: -0.15, flexShrink: 1 },
  placeMiles: { ...typography.body, color: colors.textMuted, letterSpacing: 0 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  details: { ...typography.small, color: colors.textMuted, flexShrink: 1 },
  detailsFormat: { ...font('600'), color: colors.text },
  // Room left: a small tag, not a pill (only what can be pressed is fully round). Ink on Dim Green, so it reads on every court.
  // "Full" is the same tag emptied out: no fill, a hairline and muted words. A grey fill was all but the
  // same colour as Dim Green on the cream and Melbourne courts, so open and full looked alike (review, Oct 7).
  tag: { marginLeft: 'auto', paddingHorizontal: 8, height: 22, borderRadius: 6, borderWidth: 1, borderColor: colors.brandDim, justifyContent: 'center', backgroundColor: colors.brandDim },
  tagFull: { backgroundColor: 'transparent', borderColor: colors.borderStrong },
  tagText: { ...typography.caption, fontSize: 12, letterSpacing: 0, color: colors.text },
  tagTextFull: { color: colors.textMuted },
  note: { ...typography.body, color: colors.text, lineHeight: 21 },
  audience: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.bgElevated },
  audienceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  audienceText: { ...typography.smallStrong, color: colors.brand, flex: 1 },
  invitedText: { ...typography.small, color: colors.textMuted, flex: 1 },
  faceSmall: { borderWidth: 1.5, borderColor: colors.bgElevated, borderRadius: 11 },
  openNow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: 18, backgroundColor: colors.surface, ...lift },
  openNowText: { ...typography.smallStrong, color: colors.text },
  // The foot: who's in and the one thing to do, under a hairline.
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  joined: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  faces: { flexDirection: 'row', alignItems: 'center' },
  face: { borderWidth: 2, borderColor: colors.surface, borderRadius: 15 },
  joinedText: { ...typography.small, color: colors.textMuted, flexShrink: 1 },
  joinedTextMine: { ...font('600'), color: colors.text },
  actions: { flexDirection: 'row', gap: spacing.sm },
  // Your hit with people in it: who's in on the first line, the two buttons sharing the second.
  // On a phone they fill it; on a computer's wide card they stop at 180 and sit at the right, where
  // every other card's button is, rather than stretching into a bar.
  footTwoLine: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.md },
  actionsTwoLine: { alignSelf: 'stretch', justifyContent: 'flex-end' },
  buttonWide: { flex: 1, maxWidth: 180 },
  // One button, three looks: the same height, border and label weight.
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, paddingHorizontal: 16, borderRadius: 19, borderWidth: 1 },
  buttonPressed: { transform: [{ scale: 0.97 }] },
  primary: { paddingHorizontal: 22, backgroundColor: colors.brand, borderColor: colors.brand },
  primaryText: { ...typography.bodyStrong, color: colors.brandInk },
  secondary: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
  secondaryText: { ...typography.bodyStrong, color: colors.text },
  // Destructive, so quiet: an outline in the hairline and the word in red, never a filled or tinted pill.
  quietButton: { backgroundColor: 'transparent', borderColor: colors.border },
  dangerText: { ...typography.bodyStrong, color: colors.danger },
});

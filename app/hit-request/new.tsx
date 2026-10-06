import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import { DragSheet } from '@/components/DragSheet';
import { CourtSearch } from '@/components/CourtSearch';
import { Field } from '@/components/ui';
import { ChipStrip, Chips, Fine, Section, SheetTitle, Submit, Tiles, formBody } from '@/components/sheet/SheetForm';
import type { HitAudience, HitRequest, ID } from '@/data/types';
import { opensAtFor } from '@/features/hits/audience';
import { AudienceCards, GroupsCard, InviteRow } from '@/features/hits/WhoSeesFirst';
import { isMapCourtId } from '@/features/places/courtName';
import { fetchCourts, isClosedCourt, type Court } from '@/features/players/courts';
import { notKnownAdult } from '@/features/players/age';
import { milesBetween } from '@/features/players/geo';
import { clockWords, hitsWithinLine } from '@/features/players/openToHit';
import { homeFor } from '@/features/players/positions';
import { useMyCity } from '@/features/players/useMyCity';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
/**
 * "6pm", "6:30pm", "noon": a time the way people say it, and the way its
 * sibling sheet, Open to hit (opened from the same map), writes its times.
 */
const timeLabel = (h: number, half = false) => { const d = new Date(); d.setHours(h, half ? 30 : 0, 0, 0); return clockWords(d); };
const FORMAT_LABEL: Record<HitRequest['format'], string> = { singles: 'Singles', doubles: 'Doubles', hit: 'Just hitting' };

/**
 * Looking for a hit: when (a day and an hour), where (a court near you, or
 * typed), what level, singles or doubles or just hitting, and how many spots.
 * It goes up on Find Players; whoever says "I'm in" lands in a chat with you.
 * Once it is up, a note offers to send it into your chats and groups too,
 * for the friends who might want the spot. Opened from a court ("Play
 * here"), that court is already where. Opened from "Ask to hit" (?ask=…),
 * the hit also goes straight into your chat with each of those players; it
 * is still an open hit, so the sheet says so: anyone nearby may take the
 * spot first, unless "Who sees it first" says otherwise (migration 76):
 * Invite first gives the players you tick (and, with My groups, the people
 * in your groups) the first go, and it opens to everyone an hour after
 * posting or three hours before it starts, whichever is sooner; Only people
 * I invite never opens. Either way each one ticked gets it in your chat and
 * is told. "Rematch?" on a match (Oct 4) opens it the same way with
 * ?audience=, ?format= and ?note= set (only them, singles, the last score):
 * all of it can still be changed before Post.
 */
export default function NewHit() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, detectedCoords, users, openness, feedGroups, lastSeen, actions } = useApp();
  const [closeSignal, setCloseSignal] = useState(0);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d; }), []);
  // Late in the evening there is no hour left today: start on tomorrow.
  const [day, setDay] = useState(new Date().getHours() >= 21 ? 1 : 0);
  const nextHour = Math.min(21, Math.max(6, new Date().getHours() + 1));
  const [hour, setHourOnly] = useState(nextHour);
  // Courts book on the half hour too: picking an hour offers its :30 underneath, on the hour until chosen.
  const [half, setHalf] = useState(false);
  const setHour = (h: number) => { setHourOnly(h); setHalf(false); };
  // "Play here" on a court's page or card: that court is chosen, its map id kept
  // (when it has one) so the hit shows on the court's page.
  const params = useLocalSearchParams<{ courtId?: string; courtName?: string; lat?: string; lng?: string; ask?: string; audience?: string; format?: string; note?: string; rematch?: string }>();
  // "Ask to hit": the players it also goes to, in your chat with each. Only people you may message (an adult, or a teen who follows you).
  // Worked out again once the server has said who may be messaged (openness, migration 64).
  const asked = useMemo(() => (params.ask ?? '').split(',').filter((id, i, all) => !!id && all.indexOf(id) === i && id !== currentUser?.id && actions.canMessage(id))
    .flatMap((id) => { const u = users.find((x) => x.id === id); return u ? [u] : []; }).slice(0, 5), [params.ask, users, currentUser?.id, actions, openness]);
  const namesOf = (list: { name: string }[]) => (list.length === 1 ? list[0].name.split(' ')[0] : list.length === 2 ? `${list[0].name.split(' ')[0]} and ${list[1].name.split(' ')[0]}` : `${list.length} players`);
  const askedNames = namesOf(asked);
  // Who sees it first: everyone (as before), or the people you invite first, or only them.
  // A rematch starts as an invite for the one player (any of the three can still be picked).
  const [audience, setAudience] = useState<HitAudience>(params.audience === 'invite_first' || params.audience === 'invite_only' ? params.audience : 'everyone');
  const inviting = audience !== 'everyone';
  const askedIds = useMemo(() => asked.map((u) => u.id), [asked]);
  const [picked, setPicked] = useState<ID[]>([]);
  // The players from "Ask to hit" start ticked, once they are known.
  const seeded = useRef(false);
  useEffect(() => { if (!seeded.current && askedIds.length) { seeded.current = true; setPicked(askedIds); } }, [askedIds]);
  const pickedUsers = picked.flatMap((id) => { const u = users.find((x) => x.id === id); return u ? [u] : []; });
  const [withGroups, setWithGroups] = useState(false);
  const groupCount = feedGroups.length;
  const groupsOn = inviting && withGroups && groupCount > 0;
  // Who gets the hit's card in your chat: the ticked when inviting, the asked otherwise.
  const recipients = inviting ? pickedUsers : asked;
  const recipientNames = namesOf(recipients);
  const [place, setPlace] = useState<HitRequest['place'] | null>(() => {
    const name = params.courtName?.trim();
    const lat = Number(params.lat); const lng = Number(params.lng);
    if (!name || !params.lat || !params.lng || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { ...(isMapCourtId(params.courtId) ? { id: params.courtId } : {}), name: name.slice(0, 120), lat, lng };
  });
  const [typed, setTyped] = useState('');
  const [courts, setCourts] = useState<Court[]>([]);
  // A typed town ("Cary, NC") is looked up first, as the map does, so the courts are never another city's in the same state.
  // Not known to be an adult: a hit reaches only the people who follow you (hits/visible), and the sheet says so.
  const forFriends = !!currentUser && notKnownAdult(currentUser);
  const { town, pending: townPending } = useMyCity(currentUser);
  const home = useMemo(() => (currentUser && !(townPending && !detectedCoords) ? homeFor(currentUser, detectedCoords, town) : null), [currentUser, detectedCoords, town, townPending]);
  // Members-only and private courts are never suggested for a hit (a search by name still finds them).
  useEffect(() => {
    if (!home) return undefined;
    let on = true;
    fetchCourts(home).then((list) => { if (on) setCourts(list.filter((c) => !isClosedCourt(c))); }).catch(() => { if (on) setCourts([]); });
    return () => { on = false; };
  }, [home]);
  // Asking one player who'd rather hit nearer than you are (migration 120): the same friendly line as their card, where you pick the court.
  const farLine = useMemo(() => {
    const them = asked.length === 1 ? asked[0] : null;
    const spot = them ? lastSeen[them.id] : undefined;
    if (!them || !spot || !home) return null;
    return hitsWithinLine(them, milesBetween(home, spot), spot.city || them.location);
  }, [asked, lastSeen, home]);
  const rating = currentUser?.profile.rating;
  const [level, setLevel] = useState<'any' | 'mine'>(rating ? 'mine' : 'any');
  // The rating may arrive a moment after the sheet: default to your level once it does.
  const levelSet = React.useRef(!!rating);
  useEffect(() => { if (rating && !levelSet.current) { levelSet.current = true; setLevel('mine'); } }, [rating]);
  // Today only offers the hours still ahead, so the first one is the default.
  const hours = day === 0 ? HOURS.filter((h) => h >= new Date().getHours() + 1) : HOURS;
  useEffect(() => { if (hours.length && !hours.includes(hour)) setHour(hours[0]); }, [day]); // eslint-disable-line react-hooks/exhaustive-deps
  const [format, setFormat] = useState<HitRequest['format']>(params.format === 'doubles' || params.format === 'hit' ? params.format : 'singles');
  const [spots, setSpots] = useState(1);
  // A rematch's note says the last score ("Rematch? Last time 6–4 3–6 10–7").
  const [note, setNote] = useState(() => (params.note ?? '').slice(0, 280));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // The hit just posted, so the note after the sheet has gone can offer to send it.
  const posted = useRef<string | null>(null);
  const sentTo = useRef<typeof asked>([]);

  const start = new Date(days[day]); start.setHours(hour, half ? 30 : 0, 0, 0);
  const past = start.getTime() < Date.now() - 30 * 60_000;
  // Only a chosen court, or a place you chose to use as typed: half a word in the box is not a place yet.
  const where = place;
  const needsInvite = inviting && !pickedUsers.length && !groupsOn;
  const ready = !!where && !past && !saving && !needsInvite;
  // When an invite-first hit goes out to everyone, said as it will be.
  const opensAt = audience === 'invite_first' ? new Date(opensAtFor(start.toISOString())) : null;
  // Starting within 3 hours, that time has already passed: it is on Find Players straight away (as the server opens it).
  const opensNow = !!opensAt && opensAt.getTime() <= Date.now() + 60_000;
  // "at 5:30pm" today, "Sat at 5:30pm" another day: the same words as the times above.
  const opensText = opensAt ? `${opensAt.toDateString() === new Date().toDateString() ? '' : `${opensAt.toLocaleDateString([], { weekday: 'short' })} `}at ${clockWords(opensAt)}` : '';
  // The invite as it will read, updated as you choose.
  const dayWord = day === 0 ? 'Today' : day === 1 ? 'Tomorrow' : days[day].toLocaleDateString([], { weekday: 'long' });
  const summary = [FORMAT_LABEL[format], `${dayWord} at ${timeLabel(hour, half)}`, where?.name].filter(Boolean).join(' · ');

  const post = async () => {
    if (!ready || !where) return;
    setSaving(true);
    setError('');
    try {
      const step = currentUser?.profile.skillSystem === 'UTR' ? 1 : 0.5;
      posted.current = await actions.postHit({
        startsAt: start.toISOString(), place: where, format, spots, note: note.trim() || undefined,
        levelMin: level === 'mine' && rating ? Math.max(1, rating - step) : undefined,
        // The database keeps levels from 1 to 16.5 (a UTR of 15.6 or more would go past it, and fail to post).
        levelMax: level === 'mine' && rating ? Math.min(16.5, rating + step) : undefined,
        ...(inviting ? { audience, includeGroups: groupsOn, invitedIds: pickedUsers.map((u) => u.id) } : {}),
      });
      sentTo.current = recipients;
      // Asked or invited: it lands in your chat with each of them, as the hit's own card.
      if (recipients.length) actions.shareToChats({ userIds: recipients.map((u) => u.id) }, { kind: 'hit-request', id: posted.current });
      setCloseSignal((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t post. Try again.');
      setSaving(false);
    }
  };

  // Away first, then the note: its "Send to a chat" opens the Send-to sheet over the page, never over this sheet on its way out.
  const done = () => {
    router.back();
    const id = posted.current;
    if (!id) return;
    const to = sentTo.current;
    if (to.length || inviting) {
      const one = to.length === 1 ? to[0] : null;
      showToast({
        title: to.length ? `Sent to ${namesOf(to)}` : 'Your hit is up',
        body: audience === 'invite_only' ? 'Only the people you invited can see it'
          : audience === 'invite_first' ? (opensNow ? 'It’s on Find Players too' : `It opens to everyone ${opensText}`)
          : 'It’s on Find Players too',
        icon: 'paper-plane-outline',
        ...(one ? { action: { label: 'Open chat', onPress: () => router.push(`/messages/${actions.openConversationWith(one.id)}`) } } : {}),
      });
      return;
    }
    showToast({
      title: 'Your hit is up',
      // Short enough to sit beside "Send to a chat" on a phone without being cut off.
      body: forFriends ? 'Your followers can see it.' : 'Players nearby can see it.',
      icon: 'checkmark-circle-outline',
      action: { label: 'Send to a chat', onPress: () => router.push({ pathname: '/share', params: { kind: 'hit-request', id } }) },
    });
  };

  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={done} peekFraction={0.86}
      header={<SheetTitle title={asked.length ? (params.rematch === '1' && asked.length === 1 ? `Rematch with ${askedNames}?` : `Ask ${askedNames} to hit`) : 'Looking for a hit'} line={summary} onClose={() => setCloseSignal((n) => n + 1)} />}>
      <ScrollView contentContainerStyle={formBody} keyboardShouldPersistTaps="handled">
        {/* Asked: said first, before anything is picked, so "Ask Sam" never reads as a private invite. */}
        {asked.length && !inviting ? (
          <View style={styles.openNote}>
            <Ionicons name="people-outline" size={16} color={colors.textMuted} />
            <Text style={styles.openNoteText}>It’s an open hit: {askedNames} {asked.length === 1 ? 'gets' : 'get'} it in your chat, and anyone nearby can take the spot.</Text>
          </View>
        ) : null}
        <Section title="When">
          <Tiles scroll value={day} onChange={setDay} options={days.map((d, i) => ({ value: i, top: i === 0 ? 'Today' : d.toLocaleDateString([], { weekday: 'short' }), main: String(d.getDate()), label: d.toDateString() }))} />
          <ChipStrip value={hour} onChange={setHour} options={hours.map((h) => ({ value: h, label: timeLabel(h) }))} />
          {/* The chosen hour, on the hour or at half past: chips the same size as the hours, sliding in under them. */}
          <Animated.View key={hour} entering={FadeInDown.duration(200)}>
            <ChipStrip value={half ? 30 : 0} onChange={(m) => setHalf(m === 30)} options={[{ value: 0, label: timeLabel(hour) }, { value: 30, label: timeLabel(hour, true) }]} />
          </Animated.View>
        </Section>

        <Section title="Where" hint={farLine ?? undefined}>
          <CourtSearch home={home} nearby={courts} chosen={place} onChoose={setPlace} typed={typed} onType={(t) => { setTyped(t); setPlace(null); }} />
        </Section>

        <Section title="Game">
          <Chips value={format} onChange={(f) => { if (!f) return; setFormat(f); setSpots(f === 'doubles' ? 3 : 1); }} options={[{ value: 'singles', label: 'Singles' }, { value: 'doubles', label: 'Doubles' }, { value: 'hit', label: 'Just hitting' }]} />
        </Section>

        {/* Level and how many, side by side: two small choices, one line. */}
        <View style={styles.pair}>
          <View style={{ flex: 1 }}>
            <Section title="Level">
              <Chips value={level} onChange={(v) => { if (v) setLevel(v); }} options={[{ value: 'mine', label: rating ? `Around ${rating.toFixed(1)}` : 'My level' }, { value: 'any', label: 'Any' }]} />
            </Section>
          </View>
          <Section title="Players needed" hint="Not counting you">
            <View style={styles.stepper}>
              <Pressable accessibilityRole="button" accessibilityLabel="One fewer" disabled={spots <= 1} onPress={() => setSpots((n) => Math.max(1, n - 1))} style={[styles.step, spots <= 1 && { opacity: 0.35 }]}>
                <Ionicons name="remove" size={16} color={colors.text} />
              </Pressable>
              <Text style={styles.stepValue} accessibilityLiveRegion="polite">{spots}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="One more" disabled={spots >= 3} onPress={() => setSpots((n) => Math.min(3, n + 1))} style={[styles.step, spots >= 3 && { opacity: 0.35 }]}>
                <Ionicons name="add" size={16} color={colors.text} />
              </Pressable>
            </View>
          </Section>
        </View>

        <Section title="Who sees it first">
          <AudienceCards value={audience} onChange={setAudience} forFriends={forFriends} />
        </Section>
        {inviting ? (
          <Section title="Invite" hint={pickedUsers.length ? `${pickedUsers.length} picked · each gets it in your chat` : 'Tick who gets it in your chat'}>
            <InviteRow picked={picked} onPicked={setPicked} first={askedIds} />
            {groupCount ? <GroupsCard on={withGroups} onChange={setWithGroups} count={groupCount} /> : null}
            {audience === 'invite_first' ? (
              <View style={styles.openNote}>
                <Ionicons name="time-outline" size={16} color={colors.brand} />
                <Text style={styles.openNoteText}>{opensNow ? 'It starts within 3 hours, so it goes on Find Players straight away.' : `Opens to everyone ${opensText}, unless it’s full by then.`}</Text>
              </View>
            ) : null}
          </Section>
        ) : null}

        <Field soft value={note} onChangeText={(v) => setNote(v.slice(0, 280))} placeholder="Anything else? (optional)" multiline minHeight={56} />
        {past ? <Text style={styles.error}>That time has passed. Pick a later one.</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Submit label="Post" onPress={post} disabled={!ready} busy={saving} waiting={past ? 'Pick a later time' : !where ? 'Choose where to play' : 'Pick who to invite'} />
        <Fine>{audience === 'invite_only'
          ? `Only ${recipients.length ? recipientNames : 'the people you invite'}${groupsOn ? ' and your groups' : ''} can see it. It never shows on Find Players.`
          : audience === 'invite_first' && opensNow
            ? `It starts within 3 hours, so it goes on Find Players straight away.${recipients.length ? ` ${recipientNames} still ${recipients.length === 1 ? 'gets' : 'get'} it in your chat.` : ''}`
          : audience === 'invite_first'
            ? `${recipients.length ? recipientNames : 'Your groups'} ${recipients.length === 1 && !groupsOn ? 'gets' : 'get'} the first go${groupsOn && recipients.length ? ', with your groups' : ''}. If there’s still a spot ${opensText}, it goes on Find Players.`
            : asked.length
              ? `It goes to ${askedNames} in your chat. It’s an open hit, so it shows on Find Players too, and someone nearby may take the spot first.`
              : forFriends
                ? 'Friends who follow you see it. Whoever joins gets a chat with you.'
                : 'Players nearby see it on Find Players. Whoever joins gets a chat with you.'}</Fine>
      </ScrollView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  error: { ...typography.small, color: colors.danger },
  // "It's an open hit": one plain line on the sheet's quiet tint, above When.
  openNote: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.bgElevated },
  openNoteText: { ...typography.small, color: colors.text, flex: 1, lineHeight: 19 },
  pair: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 34 },
  step: { ...lift, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 14, textAlign: 'center', fontSize: 16, ...font('600'), color: colors.text, fontVariant: ['tabular-nums'] },
});

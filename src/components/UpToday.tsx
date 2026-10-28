import { PRESS_DIM } from '@/theme/press';
import React, { memo, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { Avatar } from '@/components/ui';
import { OpenRing } from '@/components/map/OpenRing';
import { TipBubble } from '@/components/TipBubble';
import type { ID, LastSeen, User } from '@/data/types';
import { FillDivider, FilledFace } from '@/features/cityBoard/BoardBits';
import type { FillFace } from '@/features/cityBoard/fill';
import { formatSpotMiles, milesBetween, spotMilesKey } from '@/features/players/geo';
import { IN_TOWN_MILES } from '@/features/players/mapModel';
import { isOpenToHit, laterUntil, tillLabel } from '@/features/players/openToHit';
import { isRoughSpot, type LatLng } from '@/features/players/positions';
import { useOpenClock } from '@/features/players/useOpenClock';
import { learned, useTip } from '@/features/tips/tips';
import { show as showToast } from '@/lib/toast';
import { eatClickAfterHold } from '@/lib/eatClick';
import * as haptics from '@/lib/haptics';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';

const FACE = 52;
/** Every face's slot, yours included, so the faces sit on one even rhythm (yours used to be wider). Wide enough for "Free today" and its dot. */
const ITEM = 86;
/** The row's own padding: it runs out to the screen's edges, the faces starting a little in from the page's margin. */
const ROW_PAD = spacing.lg - 6;
/** Your own face's middle, from the page's left margin: the row's own padding, then half your item, less the margin the row runs out into. */
const MINE_CENTER = ROW_PAD + ITEM / 2 - spacing.lg;
/**
 * Room above the faces for their green halo, which the sideways scroller
 * would otherwise cut off flat. The scroller reaches up into the gap under
 * the heading by as much, so nothing on the page moves.
 */
const HALO = 12;
/** Room below the row, the same way, so nothing under the faces is cut off. Less than the page's 16 between parts, so it never reaches the next one. */
const BELOW = 12;
/** The ring's drawn box (OpenRing: face, gap, ring), a name's line and a caption's. */
const RING_BOX = FACE + 13;
const NAME_LINE = 16;
const META_LINE = 14;
/** A player's item (ring, name, how far, until when): yours is held at the same height, so the row never jumps as you turn on or off. */
const MINE_H = 2 + RING_BOX + 3 + 2 + NAME_LINE + 2 * (3 + META_LINE) + 2;

const NO_FILL: FillFace[] = [];

/** Someone open to hit, near you: who, how far (if we know where you are), when they were last there, and until when they are open. */
interface Up { user: User; miles?: number; rough: boolean; seenAt?: string; until?: string; /** Free today in your town (not a friend's check-in): their profile's town, never a spot or a distance. */ town?: string }

/**
 * The people near you who are up for a hit today, from the map's own pins
 * and nothing else: someone the map may not show you is never here, and
 * nobody is placed by the city on their profile. Up today means their own
 * "open to hit" is on (the map's `open_until`, or their profile). Nearest
 * first, as the distances read, within the map's "in town" reach of `from`:
 * the same spot Near you measures from (where you are, else your profile's
 * city), so the two never disagree. With no spot at all there is no "near",
 * so nobody is listed (and the row says how to fix that).
 */
export function useUpToday({ users, lastSeen, me, from, blockedIds, myTown = '', friendsOnly = false }: { users: User[]; lastSeen: Record<ID, LastSeen>; me: ID | null; from: LatLng | null; blockedIds: ID[]; /** Your profile's town ("Raleigh"), for players free today there. */ myTown?: string; /** A teen: friends only, never strangers. */ friendsOnly?: boolean }): Up[] {
  // Every "open until" the row could show, so it looks again the moment the soonest one ends (someone's "till 6pm" goes at 6pm).
  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const ends = useMemo(() => [...Object.values(lastSeen).flatMap((row) => (row.userId === me ? [] : [row.openUntil, byId.get(row.userId)?.openToHitUntil])), ...users.flatMap((u) => (u.id !== me && u.openToHitUntil ? [u.openToHitUntil] : []))], [lastSeen, byId, users, me]);
  const now = useOpenClock(ends);
  return useMemo(() => {
    if (!from) return [];
    const list: Up[] = [];
    for (const row of Object.values(lastSeen)) {
      if (row.userId === me || blockedIds.includes(row.userId)) continue;
      const user = byId.get(row.userId);
      if (!user) continue;
      const mapUntil = row.openUntil && Date.parse(row.openUntil) > now ? row.openUntil : undefined;
      const up = isOpenToHit(user) || !!mapUntil;
      if (!up) continue;
      const miles = milesBetween(from, row);
      if (miles > IN_TOWN_MILES) continue;
      list.push({ user, miles, rough: isRoughSpot(row), seenAt: row.seenAt, until: laterUntil(isOpenToHit(user) ? user.openToHitUntil : undefined, mapUntil) });
    }
    // Free today in your town (Oct 26, owner: "free to hit in this city"): a player who turned on
    // "I'm free" themselves today, shown by the town on their profile, never a spot or a distance
    // (migration 189: a stranger's live position never reaches the phone). A teen's ring is private
    // to their friends (keep_open_to_hit_private), so never here; a teen sees friends only.
    if (!friendsOnly) {
      const listed = new Set(list.map((u) => u.user.id));
      const mine = myTown.trim().toLowerCase();
      for (const user of users) {
        if (user.id === me || listed.has(user.id) || blockedIds.includes(user.id) || !isOpenToHit(user)) continue;
        const town = user.location.split(',')[0].trim();
        if (!town) continue;
        const inTown = user.cityAt ? milesBetween(from, user.cityAt) <= IN_TOWN_MILES : !!mine && town.toLowerCase() === mine;
        if (inTown) list.push({ user, rough: true, town, until: user.openToHitUntil });
      }
    }
    // Friends checked in first, in the order the distances read (a rough "~1 mi" never before "0.8 mi"); on a tie,
    // a pin on a court or exact first, then the most recent. Then those free today in town, soonest to end last.
    return list.sort((a, b) => Number(!!a.town) - Number(!!b.town) || spotMilesKey(a.miles ?? 0, a.rough) - spotMilesKey(b.miles ?? 0, b.rough)
      || Number(a.rough) - Number(b.rough) || (b.seenAt ?? '').localeCompare(a.seenAt ?? '') || (b.until ?? '').localeCompare(a.until ?? ''));
  }, [byId, users, lastSeen, me, from?.lat, from?.lng, blockedIds, now, myTown, friendsOnly]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * "Open to hit" (Oct 5, owner; was "Who's up today"), under the Find Players
 * map: your own "I’m free" first (one tap puts your green ring on until
 * midnight, the same switch as your card on the map; it never turns Location
 * on), then a face for each player near you who is open, with how far and
 * until when ("till 8pm"). A face opens the map on them, their card up.
 *
 * Once on, one line under your ring: "Free today" (Oct 24, owner: "Instead
 * of your open just one line that says free today"). Your time and
 * distance: hold your ring, or tap that line. Either opens the sheet. The first tap on your ring shows
 * the tip about holding, but never alongside the "Turn on Location" note:
 * one thing on screen at a time, so with that note up the tip waits for a
 * later tap.
 *
 * For a teen (migration 78) it is the same row, between friends only: the
 * faces are friends who follow each other with them, and their own ring is
 * seen only by those friends; the words say so.
 */
export const UpToday = memo(function UpToday({ me, people, teen = false, locationOn, checkedIn = false, finding = false, onLocation, onCheckIn, onToggle, fill = NO_FILL, fillTitle }: { me: User; people: Up[];
  /** City boards (migration 196; round 3 of the approved design): your home city's regulars after the ringed faces, so the row never looks empty. Empty while city boards are off for you. */ fill?: FillFace[];
  /** The row's title while nobody is up and the regulars fill it ("Most active in Los Angeles"). */ fillTitle?: string; /** Not known to be an adult, with the map's teen rule on: friends only. */ teen?: boolean; locationOn: boolean; /** Checked in on the map (migration 189): your ring shows there, for friends. */ checkedIn?: boolean; /** Location is on, but this phone has no spot yet: the row says it is looking. */ finding?: boolean; /** Location off and no spot of yours: the way to give one. */ onLocation?: () => void; /** Not checked in: the "Check in" on the note that says your ring is not on the map yet. */ onCheckIn?: () => void; /** Resolves false when the ring did not go on (a teen who closed "Who can see you?" without an answer). */ onToggle: (on: boolean) => Promise<boolean> }) {
  const styles = useThemedStyles(styleDefinitions);
  // Your ring goes out by itself at the time you picked.
  useOpenClock([me.openToHitUntil]);
  const up = isOpenToHit(me);
  const till = up ? tillLabel(me.openToHitUntil) : null;
  // A tap on your own ring brings the tip (holding it is how you edit), unless the Location note is up then.
  const [tapped, setTapped] = useState(false);
  const holdTip = useTip('hold-to-edit', tapped);
  const flip = () => {
    const next = !up;
    haptics.tap();
    // Up, but not on the map (not checked in, migration 189): say so, with the one tap that fixes it. Only once the ring is really on.
    const noting = next && !checkedIn;
    if (!noting) setTapped(true);
    void onToggle(next).then((on) => {
      if (on && noting) {
        showToast({
          title: 'You’re open to hit',
          body: 'Friends see it on the map once you check in.',
          icon: 'navigate-outline',
          ...(onCheckIn ? { action: { label: 'Check in', onPress: onCheckIn } } : {}),
        });
      }
    });
  };
  // Holding it, or its "Free today": until when, and how far.
  const edit = () => {
    haptics.tap();
    learned('hold-to-edit');
    router.push('/open-to-hit');
  };
  const held = () => {
    // In a browser the lifted finger clicks whatever is under it by then: never the sheet that just opened.
    eatClickAfterHold();
    edit();
  };
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.title}>{!people.length && fill.length && fillTitle ? fillTitle : 'Open to hit'}</Text>
        {people.length ? <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.count}>{people.length} near you</Text> : null}
      </View>
      <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroll}>
        {/* Your own: the ring is the switch; once on, the "Free today" under it opens the sheet. Two presses one above the other, never one inside the other. */}
        <View style={[styles.item, styles.mine]}>
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: up }} accessibilityLabel={up ? `You’re open to hit${till ? ` ${till}` : ''}. Turn off` : 'I’m free. Turn on open to hit'} accessibilityHint="Hold to edit your time and distance" accessibilityActions={[{ name: 'longpress', label: 'Edit your time and distance' }]} onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'longpress') edit(); }} onPress={flip} onLongPress={held} delayLongPress={400} style={({ pressed }) => [styles.face, pressed && styles.pressed]}>
            <View>
              <OpenRing open={up} size={FACE} hairline halo="small"><Avatar name={me.name} seed={me.avatarSeed} uri={me.avatarUrl} size={FACE} /></OpenRing>
              {up ? null : <Animated.View entering={FadeIn.duration(160)} style={styles.plus}><Ionicons name="add" size={14} color={colors.bg} /></Animated.View>}
            </View>
            {up ? null : <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={1}>I’m free</Text>}
          </Pressable>
          {/* On: one line where a player's name sits, ink words after a small green dot (green words were too faint on the court palettes).
              44pt to tap, all of it below the switch, so a near miss never turns your ring off. */}
          {up ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Free today${till ? `, ${till}` : ''}. Change your time and distance`} hitSlop={{ left: 8, right: 8 }} onPress={edit} style={({ pressed }) => [styles.freeLink, pressed && styles.pressed]}>
              <View style={styles.freeLine}>
                <Animated.View entering={FadeIn.duration(160)} style={styles.dot} />
                <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.name, styles.nameIn]} numberOfLines={1}>Free today</Text>
              </View>
            </Pressable>
          ) : null}
        </View>
        {people.map((p) => {
          const theirs = tillLabel(p.until);
          // A friend's check-in: how far. Anyone else: only the town they chose ("Raleigh"), never a distance.
          const far = p.town ? p.town : p.miles !== undefined ? formatSpotMiles(p.miles, p.rough) : null;
          return (
            <Animated.View key={p.user.id} entering={FadeIn.duration(220)} layout={LinearTransition.duration(220)}>
              <Pressable accessibilityRole="link" accessibilityLabel={p.town ? `${p.user.name}, free today in ${p.town}${theirs ? `, ${theirs}` : ''}. Open profile` : `${p.user.name}, open to hit${theirs ? ` ${theirs}` : ''}${far ? `, ${far}` : ''}. Show on the map`} onPress={() => (p.town ? router.push(`/user/${p.user.id}`) : router.push({ pathname: '/map', params: { user: p.user.id } }))} style={({ pressed }) => [styles.item, styles.face, pressed && styles.pressed]}>
                <OpenRing open size={FACE} halo="small"><Avatar name={p.user.name} seed={p.user.avatarSeed} uri={p.user.avatarUrl} size={FACE} ring={p.user.isCoach} /></OpenRing>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={1}>{p.user.name.split(' ')[0]}</Text>
                {/* How far, then until when ("till 8pm"): two short lines, so neither is cut off. */}
                {far ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{far}</Text> : null}
                {theirs ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{theirs}</Text> : null}
              </Pressable>
            </Animated.View>
          );
        })}
        {/* City boards (round 3): then your city's regulars, plain (the ring only ever means up today), each with when they usually play. A tap opens their profile. */}
        {fill.length ? <FillDivider size={FACE} /> : null}
        {fill.map((f) => <FilledFace key={f.user.id} face={f} size={FACE} width={ITEM} onPress={() => router.push(`/user/${f.user.id}`)} />)}
        {!people.length && !fill.length ? (
          <View style={styles.empty}>
            {onLocation ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`${teen ? 'See which friends are up' : 'See who’s up near you'}. Turn on Location`} onPress={onLocation} hitSlop={6} style={({ pressed }) => pressed && styles.pressed}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.emptyText}>{teen ? 'See which friends are up.' : 'See who’s up near you.'}</Text>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.emptyLink}>Turn on Location</Text>
              </Pressable>
            ) : finding ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.emptyText}>Finding you…</Text>
              // Who is missing, in the section's own words, then (your ring off) what the "+" on your face is for.
              : (
                <>
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.emptyText}>{teen ? 'No friends open near you yet' : 'No one’s open near you yet'}</Text>
                  {up ? null : <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.emptyHint}>Tap I’m free when you want a hit</Text>}
                </>
              )}
          </View>
        ) : null}
      </ScrollView>
      {/* Over the row, pointing down at your own face (the hand that tapped it is below). */}
      <TipBubble tip="hold-to-edit" shown={holdTip.shown} onClose={holdTip.close} pointer="down" pointerInset={MINE_CENTER - 6} on="page" style={styles.tip} />
      </View>
    </View>
  );
});

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: spacing.xs },
  title: { ...typography.title, color: colors.text, flexShrink: 1 },
  count: { ...typography.small, color: colors.textMuted },
  // Runs to the screen's edges, the way the stories rail does, and a little above and below the
  // faces' line (into the gaps around it), so the halos and your "Free today" are never cut off.
  scroll: { marginHorizontal: -spacing.lg, marginTop: -HALO, marginBottom: -BELOW },
  row: { paddingHorizontal: ROW_PAD, paddingTop: HALO, paddingBottom: BELOW, gap: 2, alignItems: 'flex-start' },
  item: { width: ITEM, alignItems: 'center', paddingVertical: 2 },
  face: { alignItems: 'center', gap: 3 },
  pressed: { opacity: PRESS_DIM },
  plus: { position: 'absolute', right: 2, bottom: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.text, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  // Your item, held at a player's height (MINE_H).
  mine: { minHeight: MINE_H },
  // "Free today": one centred line where a player's name sits; its 44pt runs on down inside your item.
  freeLink: { marginTop: 5, height: 44, marginBottom: NAME_LINE - 44, alignItems: 'center' },
  freeLine: { flexDirection: 'row', alignItems: 'center', gap: 4, height: NAME_LINE, maxWidth: ITEM },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.open },
  name: { ...typography.smallStrong, color: colors.text, marginTop: 2, flexShrink: 1 },
  nameIn: { marginTop: 0 },
  meta: { ...typography.caption, letterSpacing: 0, color: colors.textMuted, ...font('500') },
  empty: { justifyContent: 'center', height: FACE + 18, paddingLeft: spacing.sm, maxWidth: 210 },
  emptyText: { ...typography.small, ...font('500'), color: colors.text },
  emptyHint: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  emptyLink: { ...typography.smallStrong, color: colors.brand, marginTop: 2 },
  tip: { bottom: '100%', left: 0, right: 0, alignItems: 'flex-start' },
});

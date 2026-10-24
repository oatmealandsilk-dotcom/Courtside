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
import { OPEN_LABELS } from '@/components/openToHitLook';

const FACE = 52;
/** Every face's slot, yours included, so the faces sit on one even rhythm (yours used to be wider). Wide enough for "You’re open" and its dot. */
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
/**
 * Room below the row, the same way, for the bottom of the "till midnight"
 * under your face: a full 44pt to tap without the browser's help (it has no
 * hitSlop). Less than the page's 16 between parts, so it never reaches the next one.
 */
const BELOW = 12;
/** "till midnight": drawn as one small line, tapped as 44pt, all of it below your ring's switch (never over it). */
const TILL_LINE = 14;
const TILL_PAD_TOP = 2;
const TILL_PAD_BOTTOM = 44 - TILL_LINE - TILL_PAD_TOP;
/**
 * The room it takes in the row: two of those lines, so your item is as tall
 * as a player's beside it (a name, how far, until when) and the row is one
 * height whether or not anyone is open. The rest of its 44pt hangs below.
 */
const TILL_ROOM = 2 * TILL_LINE + 6;
/** The looks in openToHitLook.ts: the ring's drawn box (OpenRing: face, gap, ring), a name's line and a caption's. */
const RING_BOX = FACE + 13;
const NAME_LINE = 16;
const META_LINE = 14;
/** A player's item: ring, name, how far, until when. */
const MINE_H = 2 + RING_BOX + 3 + 2 + NAME_LINE + 2 * (3 + META_LINE) + 2;
/** B's pill: how tall, and how far up it reaches over the ring's bottom edge. */
const PILL_H = 16;
const PILL_UP = 11;

/** Someone open to hit, near you: who, how far (if we know where you are), when they were last there, and until when they are open. */
interface Up { user: User; miles?: number; rough: boolean; seenAt?: string; until?: string }

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
export function useUpToday({ users, lastSeen, me, from, blockedIds }: { users: User[]; lastSeen: Record<ID, LastSeen>; me: ID | null; from: LatLng | null; blockedIds: ID[] }): Up[] {
  // Every "open until" the row could show, so it looks again the moment the soonest one ends (someone's "till 6pm" goes at 6pm).
  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const ends = useMemo(() => Object.values(lastSeen).flatMap((row) => (row.userId === me ? [] : [row.openUntil, byId.get(row.userId)?.openToHitUntil])), [lastSeen, byId, me]);
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
    // In the order the distances read (a rough "~1 mi" never before "0.8 mi"); on a tie, a pin on a court or exact first, then the most recent.
    return list.sort((a, b) => spotMilesKey(a.miles ?? 0, a.rough) - spotMilesKey(b.miles ?? 0, b.rough)
      || Number(a.rough) - Number(b.rough) || (b.seenAt ?? '').localeCompare(a.seenAt ?? ''));
  }, [byId, lastSeen, me, from?.lat, from?.lng, blockedIds, now]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * "Open to hit" (Oct 5, owner; was "Who's up today"), under the Find Players
 * map: your own "I’m free" first (one tap puts your green ring on until
 * midnight, the same switch as your card on the map; it never turns Location
 * on), then a face for each player near you who is open, with how far and
 * until when ("till 8pm"). A face opens the map on them, their card up.
 *
 * Your time and distance: hold your ring, or tap the "till midnight" under
 * it once it is on. Either opens the sheet. The first tap on your ring shows
 * the tip about holding, but never alongside the "Turn on Location" note:
 * one thing on screen at a time, so with that note up the tip waits for a
 * later tap.
 *
 * For a teen (migration 78) it is the same row, between friends only: the
 * faces are friends who follow each other with them, and their own ring is
 * seen only by those friends; the words say so.
 */
export const UpToday = memo(function UpToday({ me, people, teen = false, locationOn, finding = false, onLocation, onTurnOnLocation, onToggle }: { me: User; people: Up[]; /** Not known to be an adult, with the map's teen rule on: friends only. */ teen?: boolean; locationOn: boolean; /** Location is on, but this phone has no spot yet: the row says it is looking. */ finding?: boolean; /** Location off and no spot of yours: the way to give one. */ onLocation?: () => void; /** Location off: the "Turn on" on the note that says your ring is not on the map yet. */ onTurnOnLocation?: () => void; /** Resolves false when the ring did not go on (a teen who closed "Who can see you?" without an answer). */ onToggle: (on: boolean) => Promise<boolean> }) {
  const styles = useThemedStyles(styleDefinitions);
  // Your ring goes out by itself at the time you picked.
  useOpenClock([me.openToHitUntil]);
  const up = isOpenToHit(me);
  const look = OPEN_LABELS;
  const till = up ? tillLabel(me.openToHitUntil, look !== 'now') : null;
  // A/B/C: the words inside the switch, under your ring. Off, "I’m free"; on, only what the time line does not already say.
  const switchWords = !up ? 'I’m free' : look === 'C' || !till ? (look === 'B' ? 'You' : 'You’re open') : null;
  // A tap on your own ring brings the tip (holding it is how you edit), unless the Location note is up then.
  const [tapped, setTapped] = useState(false);
  const holdTip = useTip('hold-to-edit', tapped);
  const flip = () => {
    const next = !up;
    haptics.tap();
    // Up, but not on the map: say so, with the one tap that fixes it. Only once the ring is really on.
    const noting = next && !locationOn;
    if (!noting) setTapped(true);
    void onToggle(next).then((on) => {
      if (on && noting) {
        showToast({
          title: 'You’re open to hit',
          body: teen ? 'Friends see it once Location is on.' : 'Off the map until Location is on.',
          icon: 'navigate-outline',
          ...(onTurnOnLocation ? { action: { label: 'Turn on', onPress: onTurnOnLocation } } : {}),
        });
      }
    });
  };
  // Holding it, or its "till midnight": until when, and how far.
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
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.title}>Open to hit</Text>
        {people.length ? <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.count}>{people.length} near you</Text> : null}
      </View>
      <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroll}>
        {/* Your own: the ring is the switch; once on, the time under it opens the sheet. Two presses side by side, never one inside the other. */}
        {look !== 'now' ? (
          <View style={[styles.item, styles.mine]}>
            <Pressable accessibilityRole="switch" accessibilityState={{ checked: up }} accessibilityLabel={up ? `You’re open to hit${till ? ` ${till}` : ''}. Turn off` : 'I’m free. Turn on open to hit'} accessibilityHint="Hold to edit your time and distance" accessibilityActions={[{ name: 'longpress', label: 'Edit your time and distance' }]} onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'longpress') edit(); }} onPress={flip} onLongPress={held} delayLongPress={400} style={({ pressed }) => [styles.face, pressed && styles.pressed]}>
              <View>
                <OpenRing open={up} size={FACE} hairline halo="small"><Avatar name={me.name} seed={me.avatarSeed} uri={me.avatarUrl} size={FACE} /></OpenRing>
                {up ? null : <Animated.View entering={FadeIn.duration(160)} style={styles.plus}><Ionicons name="add" size={14} color={colors.bg} /></Animated.View>}
              </View>
              {switchWords ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={1}>{switchWords}</Text> : null}
            </Pressable>
            {/* The way into your time: 44pt tall, all of it below the switch (in B the pill's own top sits on the ring's edge, the pill drawn over it). */}
            {up && till ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Open ${till}. Change your time and distance`} hitSlop={{ left: 8, right: 8 }} onPress={edit} style={({ pressed }) => [look === 'A' ? styles.linkA : look === 'B' ? styles.linkB : styles.linkC, pressed && styles.pressed]}>
                {look === 'A' ? (
                  <View style={styles.lineA}>
                    <View style={styles.dot} />
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.name, styles.nameIn]} numberOfLines={1}>{`T${till.slice(1)}`}</Text>
                    <Ionicons name="chevron-forward" size={11} color={colors.textMuted} />
                  </View>
                ) : look === 'B' ? (
                  <>
                    <View style={styles.pill}><Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.pillText} numberOfLines={1}>{till.replace(/^till /, '')}</Text></View>
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.name, styles.nameB]} numberOfLines={1}>You</Text>
                  </>
                ) : (
                  <View style={styles.lineC}>
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{till}</Text>
                    <Ionicons name="chevron-forward" size={10} color={colors.textMuted} />
                  </View>
                )}
              </Pressable>
            ) : null}
          </View>
        ) : (
        <View style={styles.item}>
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: up }} accessibilityLabel={up ? `You’re open to hit${till ? ` ${till}` : ''}. Turn off` : 'I’m free. Turn on open to hit'} accessibilityHint="Hold to edit your time and distance" accessibilityActions={[{ name: 'longpress', label: 'Edit your time and distance' }]} onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'longpress') edit(); }} onPress={flip} onLongPress={held} delayLongPress={400} style={({ pressed }) => [styles.face, pressed && styles.pressed]}>
            <View>
              <OpenRing open={up} size={FACE} hairline halo="small"><Avatar name={me.name} seed={me.avatarSeed} uri={me.avatarUrl} size={FACE} /></OpenRing>
              {up ? null : <Animated.View entering={FadeIn.duration(160)} style={styles.plus}><Ionicons name="add" size={14} color={colors.bg} /></Animated.View>}
            </View>
            {/* On: ink words after a small green dot, as a player's card says it (green words were too faint to read on the court palettes). */}
            <View style={styles.nameRow}>
              {up ? <Animated.View entering={FadeIn.duration(160)} style={styles.dot} /> : null}
              <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.name, styles.nameIn]} numberOfLines={1}>{up ? 'You’re open' : 'I’m free'}</Text>
            </View>
          </Pressable>
          {/* 44pt tall in its own padding, all of it below the switch, so a near miss never turns your ring off.
              Off, the same box held empty, so turning on never moves the row. */}
          {up && till ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${till}. Change your time and distance`} hitSlop={{ left: 8, right: 8 }} onPress={edit} style={({ pressed }) => [styles.tillLink, pressed && styles.pressed]}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{till}</Text>
              <Ionicons name="chevron-forward" size={10} color={colors.textMuted} />
            </Pressable>
          ) : (
            <View style={styles.tillLink} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta}> </Text>
            </View>
          )}
        </View>
        )}
        {people.map((p) => {
          const theirs = tillLabel(p.until);
          const far = p.miles !== undefined ? formatSpotMiles(p.miles, p.rough) : null;
          return (
            <Animated.View key={p.user.id} entering={FadeIn.duration(220)} layout={LinearTransition.duration(220)}>
              <Pressable accessibilityRole="link" accessibilityLabel={`${p.user.name}, open to hit${theirs ? ` ${theirs}` : ''}${far ? `, ${far}` : ''}. Show on the map`} onPress={() => router.push({ pathname: '/map', params: { user: p.user.id } })} style={({ pressed }) => [styles.item, styles.face, pressed && styles.pressed]}>
                <OpenRing open size={FACE} halo="small"><Avatar name={p.user.name} seed={p.user.avatarSeed} uri={p.user.avatarUrl} size={FACE} ring={p.user.isCoach} /></OpenRing>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={1}>{p.user.name.split(' ')[0]}</Text>
                {/* How far, then until when ("till 8pm"): two short lines, so neither is cut off. */}
                {far ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{far}</Text> : null}
                {theirs ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{theirs}</Text> : null}
              </Pressable>
            </Animated.View>
          );
        })}
        {!people.length ? (
          <View style={[styles.empty, look !== 'now' && styles.emptyOnRing]}>
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
  title: { ...typography.title, color: colors.text },
  count: { ...typography.small, color: colors.textMuted },
  // Runs to the screen's edges, the way the stories rail does, and a little above and below the
  // faces' line (into the gaps around it), so the halos and your "till" are never cut off.
  scroll: { marginHorizontal: -spacing.lg, marginTop: -HALO, marginBottom: -BELOW },
  row: { paddingHorizontal: ROW_PAD, paddingTop: HALO, paddingBottom: BELOW, gap: 2, alignItems: 'flex-start' },
  item: { width: ITEM, alignItems: 'center', paddingVertical: 2 },
  face: { alignItems: 'center', gap: 3 },
  pressed: { opacity: PRESS_DIM },
  plus: { position: 'absolute', right: 2, bottom: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.text, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, maxWidth: ITEM },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.open },
  name: { ...typography.smallStrong, color: colors.text, marginTop: 2, flexShrink: 1 },
  nameIn: { marginTop: 0 },
  meta: { ...typography.caption, letterSpacing: 0, color: colors.textMuted, ...font('500') },
  // "till midnight", once you are open: a quiet way into the sheet, the same as holding. Drawn as
  // one line; its 44pt runs on down past the item (the row's BELOW room), never up over the switch.
  tillLink: { flexDirection: 'row', alignItems: 'center', gap: 1, marginTop: 1, paddingTop: TILL_PAD_TOP, paddingBottom: TILL_PAD_BOTTOM, marginBottom: TILL_ROOM - 1 - 44 },
  empty: { justifyContent: 'center', height: FACE + 18, paddingLeft: spacing.sm, maxWidth: 210 },
  emptyText: { ...typography.small, ...font('500'), color: colors.text },
  emptyHint: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  emptyLink: { ...typography.smallStrong, color: colors.brand, marginTop: 2 },
  tip: { bottom: '100%', left: 0, right: 0, alignItems: 'flex-start' },
  // A/B/C (OPEN_LABELS): your item held at a player's height, so the row never jumps as you turn on or off.
  mine: { minHeight: MINE_H },
  // A: one centred line where a player's name sits; its 44pt runs on down inside your item.
  linkA: { marginTop: 5, height: 44, marginBottom: NAME_LINE - 44, alignItems: 'center' },
  lineA: { flexDirection: 'row', alignItems: 'center', gap: 3, height: NAME_LINE },
  // B: a small pill on the ring's bottom edge, then "You"; the press is the pill and the word.
  linkB: { marginTop: -PILL_UP, height: 44, marginBottom: 1 + NAME_LINE + PILL_H - 44, alignItems: 'center' },
  pill: { height: PILL_H, minWidth: 34, paddingHorizontal: 6, borderRadius: PILL_H / 2, backgroundColor: colors.open, borderWidth: 1.5, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  pillText: { ...typography.caption, fontSize: 10, lineHeight: 12, letterSpacing: 0, color: colors.onMedia },
  nameB: { marginTop: 1 },
  // C: "till 12am ›" muted, centred under "You’re open".
  linkC: { marginTop: 1, height: 44, marginBottom: META_LINE - 44, alignItems: 'center' },
  lineC: { flexDirection: 'row', alignItems: 'center', gap: 1, height: META_LINE },
  // The empty words, centred on your ring (the item's own 2 above it, then the ring's box).
  emptyOnRing: { height: RING_BOX, marginTop: 2 },
});

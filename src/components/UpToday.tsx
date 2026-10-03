import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { Avatar } from '@/components/ui';
import { OpenRing } from '@/components/map/OpenRing';
import { agoShort } from '@/components/map/markers';
import type { ID, LastSeen, User } from '@/data/types';
import { formatSpotMiles, milesBetween, spotMilesKey } from '@/features/players/geo';
import { IN_TOWN_MILES } from '@/features/players/mapModel';
import { isOpenToHit } from '@/features/players/openToHit';
import { isRoughSpot, type LatLng } from '@/features/players/positions';
import { show as showToast } from '@/lib/toast';
import * as haptics from '@/lib/haptics';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography } from '@/theme';

const FACE = 52;

/** Someone up for a hit today, near you: who, how far (if we know where you are), and when they were last there. */
interface Up { user: User; miles?: number; rough: boolean; seenAt?: string }

/**
 * The people near you who are up for a hit today, from the map's own pins
 * and nothing else: someone the map may not show you is never here, and
 * nobody is placed by the city on their profile. Up today means their own
 * "open to hit" is on (the map's `open_until`, or their profile). Nearest
 * first, as the distances read, within the map's "in town" reach of where you are; without a spot
 * of your own there is no "near", so nobody is listed (and the row says
 * how to fix that).
 */
export function useUpToday({ users, lastSeen, me, from, blockedIds }: { users: User[]; lastSeen: Record<ID, LastSeen>; me: ID | null; from: LatLng | null; blockedIds: ID[] }): Up[] {
  return useMemo(() => {
    if (!from) return [];
    const now = Date.now();
    const byId = new Map(users.map((u) => [u.id, u]));
    const list: Up[] = [];
    for (const row of Object.values(lastSeen)) {
      if (row.userId === me || blockedIds.includes(row.userId)) continue;
      const user = byId.get(row.userId);
      if (!user) continue;
      const up = isOpenToHit(user) || (!!row.openUntil && Date.parse(row.openUntil) > now);
      if (!up) continue;
      const miles = milesBetween(from, row);
      if (miles > IN_TOWN_MILES) continue;
      list.push({ user, miles, rough: isRoughSpot(row), seenAt: row.seenAt });
    }
    // In the order the distances read (a rough "~1 mi" never before "0.8 mi"); on a tie, a pin on a court or exact first, then the most recent.
    return list.sort((a, b) => spotMilesKey(a.miles ?? 0, a.rough) - spotMilesKey(b.miles ?? 0, b.rough)
      || Number(a.rough) - Number(b.rough) || (b.seenAt ?? '').localeCompare(a.seenAt ?? ''));
  }, [users, lastSeen, me, from?.lat, from?.lng, blockedIds]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * "Who's up today", under the Find Players map: your own "I'm up today"
 * first (one tap puts your green ring on until midnight, the same switch as
 * your card on the map; it never turns Location on), then a face for each
 * player near you who is up today, with how far and how long ago. A face
 * opens the map on them, their card up.
 *
 * For a teen (migration 78) it is the same row, between friends only: the
 * faces are friends who follow each other with them, and their own ring is
 * seen only by those friends; the words say so.
 */
export function UpToday({ me, people, teen = false, locationOn, onLocation, onToggle }: { me: User; people: Up[]; /** Not known to be an adult, with the map's teen rule on: friends only. */ teen?: boolean; locationOn: boolean; /** No spot of yours yet: the way to give one. */ onLocation?: () => void; onToggle: (on: boolean) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const up = isOpenToHit(me);
  const flip = () => {
    const next = !up;
    haptics.tap();
    onToggle(next);
    // Up, but not on the map: say so, and leave Location to them.
    if (next && !locationOn) showToast({ title: 'You’re up today', body: teen ? 'Turn on Location to show your friends who follow you back.' : 'Turn on Location to show on the map.', icon: 'navigate-outline' });
  };
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>Who’s up today</Text>
        {people.length ? <Text style={styles.count}>{people.length} near you</Text> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroll}>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: up }} accessibilityLabel={up ? 'You’re up today. Turn off' : 'I’m up today'} onPress={flip} style={({ pressed }) => [styles.item, styles.mine, pressed && styles.pressed]}>
          <View>
            <OpenRing open={up} size={FACE} hairline><Avatar name={me.name} seed={me.avatarSeed} uri={me.avatarUrl} size={FACE} /></OpenRing>
            {up ? null : <Animated.View entering={FadeIn.duration(160)} style={styles.plus}><Ionicons name="add" size={14} color={colors.bg} /></Animated.View>}
          </View>
          <Text style={[styles.name, up && styles.nameUp]} numberOfLines={1}>{up ? 'You’re up' : 'I’m up today'}</Text>
          <Text style={styles.meta} numberOfLines={1}>{up ? 'until midnight' : ' '}</Text>
        </Pressable>
        {people.map((p) => (
          <Animated.View key={p.user.id} entering={FadeIn.duration(220)} layout={LinearTransition.duration(220)}>
            <Pressable accessibilityRole="link" accessibilityLabel={`${p.user.name}, up today${p.miles !== undefined ? `, ${formatSpotMiles(p.miles, p.rough)}` : ''}. Show on the map`} onPress={() => router.push({ pathname: '/map', params: { user: p.user.id } })} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
              <OpenRing open size={FACE}><Avatar name={p.user.name} seed={p.user.avatarSeed} uri={p.user.avatarUrl} size={FACE} ring={p.user.isCoach} /></OpenRing>
              <Text style={styles.name} numberOfLines={1}>{p.user.name.split(' ')[0]}</Text>
              <Text style={styles.meta} numberOfLines={1}>{[p.miles !== undefined ? formatSpotMiles(p.miles, p.rough) : null, agoShort(p.seenAt) || null].filter(Boolean).join(' · ')}</Text>
            </Pressable>
          </Animated.View>
        ))}
        {!people.length ? (
          <View style={styles.empty}>
            {onLocation ? (
              <Pressable accessibilityRole="button" onPress={onLocation} hitSlop={6} style={({ pressed }) => pressed && styles.pressed}>
                <Text style={styles.emptyText}>{teen ? 'See which friends are up.' : 'See who’s up near you.'}</Text>
                <Text style={styles.emptyLink}>Turn on Location</Text>
                {teen ? <Text style={styles.emptyNote}>Only friends who follow you back see you.</Text> : null}
              </Pressable>
            ) : <Text style={styles.emptyText}>{teen ? 'No friends up near you yet today.' : 'No one near you yet today.'}</Text>}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: spacing.xs },
  title: { ...typography.title, color: colors.text },
  count: { ...typography.small, color: colors.textMuted },
  // Runs to the screen's edges, the way the stories rail does.
  scroll: { marginHorizontal: -spacing.lg },
  row: { paddingHorizontal: spacing.lg - 6, gap: 2, alignItems: 'flex-start' },
  item: { width: 78, alignItems: 'center', gap: 3, paddingVertical: 2 },
  // Yours says the most ("I’m up today"), so it has a little more room.
  mine: { width: 96 },
  pressed: { opacity: 0.7 },
  plus: { position: 'absolute', right: 2, bottom: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.text, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  name: { ...typography.smallStrong, color: colors.text, marginTop: 2 },
  nameUp: { color: colors.open },
  meta: { ...typography.caption, letterSpacing: 0, color: colors.textMuted, ...font('500') },
  empty: { justifyContent: 'center', height: FACE + 18, paddingLeft: spacing.sm, maxWidth: 210 },
  emptyText: { ...typography.small, color: colors.textMuted },
  emptyLink: { ...typography.smallStrong, color: colors.brand, marginTop: 2 },
  emptyNote: { ...typography.caption, letterSpacing: 0, color: colors.textMuted, marginTop: 2 },
});

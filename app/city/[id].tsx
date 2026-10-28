import { PRESS_DIM } from '@/theme/press';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Avatar, Button, EmptyState, Screen } from '@/components/ui';
import { LevelPill } from '@/components/LevelPill';
import { OpenRing } from '@/components/map/OpenRing';
import { CITIES_ACTIVE, DEMO_BUSY_COURTS, DEMO_PLAYER_HITS, MIN_PLAYERS, MY_DEMO_HITS, cityById, ordinal, rankCities } from '@/features/cityBoard/mock';
import { useHomeCityId } from '@/features/cityBoard/useHomeCity';
import { notKnownAdult } from '@/features/players/age';
import { openPlayer } from '@/features/navigation/openPlayer';
import { goBack } from '@/lib/goBack';
import { useApp } from '@/store/AppContext';
import type { User } from '@/data/types';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';
import { corner } from '@/theme/look';

/** Top players shown before your own row is pinned under them. */
const TOP = 5;
/** Made-up "free today" times for the demo's players in another city (never a spot, never a distance). */
const DEMO_FREE: Record<string, { id: string; till: string }[]> = {
  austin: [{ id: 'u-mira', till: 'till 7pm' }, { id: 'u-leo', till: 'till 6pm' }],
};
/** Made-up players for another city's page (the demo has only two in Austin, one of them a teen). Not openable. */
const DEMO_EXTRA: Record<string, { name: string; system: 'NTRP' | 'UTR'; rating: number; hits: number; free?: string }[]> = {
  austin: [
    { name: 'Carlos Mendoza', system: 'NTRP', rating: 4.5, hits: 25, free: 'till 8pm' },
    { name: 'Hannah Wright', system: 'NTRP', rating: 4.0, hits: 21 },
    { name: 'Dami Adeyemi', system: 'UTR', rating: 7.2, hits: 19, free: 'till 6pm' },
    { name: 'Grace Liu', system: 'NTRP', rating: 3.5, hits: 17 },
  ],
};
const MOCK_ID = 'mock-';

/**
 * DESIGN MOCK (design/city-board). A city's page, opened from the board.
 * Short on purpose: three things, each one a reason to tap.
 *
 *   Your city:    where it stands (and the gap), Top players this month, Busiest courts, then the invite.
 *   Another city: who is Free today there (by town, never a spot), Busiest courts, Top players,
 *                 and the map there: the traveller's page ("Visiting Austin?").
 *
 * Left out on purpose: clips and sessions logged there (the Feed has them,
 * and a list of who played where and when is a list of where people are),
 * charts, and any number about a single player beyond their hit count.
 *
 * Who is listed (the teen rule, Apple 13+): adults who share their stats;
 * a private account only to people who follow it; a teen only to friends
 * who follow each other with them, and never in Free today.
 */
export default function CityPage() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const city = cityById(String(id ?? ''));
  const homeId = useHomeCityId();
  const { users, currentUser, currentUserId, followingIds, blockedIds, lastSeen } = useApp();
  const mine = !!city && city.id === homeId;
  const board = useMemo(() => rankCities('total'), []);
  const ranked = board.find((c) => c.id === city?.id) ?? null;

  // Who this viewer may see on a city's board.
  const listable = (u: User) => {
    if (blockedIds.includes(u.id)) return false;
    if (notKnownAdult(u)) return !!lastSeen[u.id]?.mutual;
    if (u.isPrivate) return followingIds.includes(u.id);
    return true;
  };
  const extras = useMemo(() => (city && currentUser ? (DEMO_EXTRA[city.id] ?? []).map((x) => {
    const slug = x.name.toLowerCase().replace(/[^a-z]+/g, '-');
    const user: User = { ...currentUser, id: `${MOCK_ID}${slug}`, name: x.name, handle: slug.replace(/-/g, ''), avatarSeed: slug, avatarUrl: undefined, isCoach: false, isPrivate: false, ageGroup: 'adult', location: `${city.name}, ${city.state}`, profile: { ...currentUser.profile, skillSystem: x.system, rating: x.rating } };
    return { user, hits: x.hits, free: x.free };
  }) : []), [city, currentUser]);
  const players = useMemo(() => {
    if (!city) return [];
    const inCity = users.filter((u) => u.id !== currentUserId && u.location.split(',')[0].trim() === city.name && DEMO_PLAYER_HITS[u.id] && listable(u))
      .map((u) => ({ user: u, hits: DEMO_PLAYER_HITS[u.id], me: false }));
    if (mine && currentUser) inCity.push({ user: currentUser, hits: MY_DEMO_HITS, me: true });
    if (currentUser) for (const x of extras) inCity.push({ user: x.user, hits: x.hits, me: false });
    return inCity.sort((a, b) => b.hits - a.hits).map((p, i) => ({ ...p, rank: i + 1 }));
  }, [city, users, currentUser, currentUserId, mine, followingIds, blockedIds, lastSeen, extras]); // eslint-disable-line react-hooks/exhaustive-deps
  const me = players.find((p) => p.me);
  const top = players.slice(0, TOP);
  const pinMe = me && me.rank > TOP ? me : null;

  const free = useMemo(() => (city && !mine ? (DEMO_FREE[city.id] ?? []).flatMap(({ id: uid, till }) => {
    const u = users.find((x) => x.id === uid);
    // Never a teen here, whoever is looking: their ring is for their friends.
    return u && !notKnownAdult(u) && !blockedIds.includes(u.id) ? [{ user: u, till }] : [];
  }).concat(extras.flatMap((x) => (x.free ? [{ user: x.user, till: x.free }] : []))) : []), [city, mine, users, blockedIds, extras]);
  const courts = city ? DEMO_BUSY_COURTS[city.id] ?? [] : [];

  if (!city) return <Screen title="City" compactTitle onBack={() => goBack()}><EmptyState icon="location-outline" title="No board for this city" body="It may not have enough players yet." /></Screen>;

  const above = ranked && ranked.rank > 1 ? board[ranked.rank - 2] : null;
  const below = ranked ? board[ranked.rank] : null;
  const race = ranked ? [above ? `${above.hits - ranked.hits} behind ${above.name}` : null, below ? `${ranked.hits - below.hits} ahead of ${below.name}` : null].filter(Boolean).join(', ') : null;

  const topPlayers = (
    <View key="top" style={styles.section}>
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.sectionTitle}>Top players</Text>
        <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.headNote}>hits this month</Text>
      </View>
      {top.map((p, i) => <PlayerRow key={p.user.id} p={p} first={i === 0 || top[i - 1]?.me} onPress={() => { if (!p.user.id.startsWith(MOCK_ID)) openPlayer(p.user.id, currentUserId); }} />)}
      {pinMe ? (
        <>
          <View style={styles.gap}><Text style={styles.gapDots}>⋮</Text></View>
          <PlayerRow p={pinMe} first onPress={() => openPlayer(pinMe.user.id, currentUserId)} />
        </>
      ) : null}
    </View>
  );

  const busy = courts.length ? (
    <View key="courts" style={styles.section}>
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.sectionTitle}>Busiest courts</Text>
        <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.headNote}>this month</Text>
      </View>
      {courts.map((c, i) => (
        <View key={c.name} style={[styles.courtRow, i > 0 && styles.line]}>
          <View style={styles.courtWords}>
            <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.name}>{c.name}</Text>
            <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.sub}>{c.courts} courts</Text>
          </View>
          <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.value}><Text style={styles.valueNum}>{c.hits}</Text> hits</Text>
        </View>
      ))}
    </View>
  ) : null;

  const freeToday = !mine ? (
    <View key="free" style={styles.section}>
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.sectionTitle}>Free today</Text>
        {free.length ? <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.headNote}>{free.length === 1 ? '1 player' : `${free.length} players`}</Text> : null}
      </View>
      {free.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.faces} style={styles.facesScroll}>
          {free.map(({ user, till }) => (
            <Pressable key={user.id} accessibilityRole="link" accessibilityLabel={`${user.name}, free today in ${city.name}, ${till}. Open profile`} onPress={() => { if (!user.id.startsWith(MOCK_ID)) openPlayer(user.id, currentUserId); }} style={({ pressed }) => [styles.face, pressed && { opacity: PRESS_DIM }]}>
              <OpenRing open size={52} halo="small"><Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={52} /></OpenRing>
              <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.faceName}>{user.name.split(' ')[0]}</Text>
              <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.faceMeta}>{till}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : <Text style={styles.sub}>No one’s free in {city.name} today.</Text>}
    </View>
  ) : null;

  return (
    <Screen title={city.name} subtitle={mine ? 'Your city' : `${city.state} · this month`} compactTitle onBack={() => goBack()}>
      {/* Where it stands, in a line or two of words: no tiles, no chart. */}
      <View style={styles.standing}>
        {ranked ? (
          <View style={styles.rankLine}>
            <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.rankBig}>{ordinal(ranked.rank)}</Text>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rankOf}>of {CITIES_ACTIVE} cities this month</Text>
          </View>
        ) : <Text style={styles.rankOf}>Not ranked yet: {city.name} needs {MIN_PLAYERS - city.players} more players.</Text>}
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.facts}>
          {city.hits} hits · {city.players} players{ranked && city.lastRank ? ` · ${ordinal(city.lastRank)} last month` : ''}
        </Text>
        {race ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.race}>{race.charAt(0).toUpperCase() + race.slice(1)}.</Text> : null}
      </View>

      {mine ? [topPlayers, busy] : [freeToday, busy, topPlayers]}

      <View style={styles.footer}>
        {mine ? (
          <>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.footHead}>Help {city.name} climb</Text>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.footBody}>Every hit logged by a player from here counts.</Text>
            <View style={styles.footButton}><Button label="Invite a hitting partner" variant="secondary" onPress={() => router.push('/invite')} full /></View>
          </>
        ) : (
          <>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.footHead}>Visiting {city.name}?</Text>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.footBody}>See its courts and open hits on the map.</Text>
            <View style={styles.footButton}><Button label={`See ${city.name} on the map`} variant="secondary" onPress={() => router.push('/map')} full /></View>
          </>
        )}
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.fine}>Players are listed by the city on their profile, never where they are. Only players who share their stats are shown.</Text>
      </View>
    </Screen>
  );
}

function PlayerRow({ p, first, onPress }: { p: { user: User; hits: number; rank: number; me: boolean }; first?: boolean; onPress: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${ordinal(p.rank)}, ${p.me ? 'you' : p.user.name}, ${p.hits} hits`} onPress={onPress} style={({ pressed }) => [styles.playerRow, p.me ? styles.rowMine : !first && styles.line, pressed && { opacity: PRESS_DIM }]}>
      <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.rank, p.me && styles.mineInk]}>{p.rank}</Text>
      <Avatar name={p.user.name} seed={p.user.avatarSeed} uri={p.user.avatarUrl} size={36} ring={p.user.isCoach} />
      <View style={styles.playerWords}>
        <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={[styles.name, p.me && styles.mineName]}>{p.me ? 'You' : p.user.name}</Text>
        <LevelPill profile={p.user.profile} small />
      </View>
      <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.valueNum}>{p.hits}</Text>
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  standing: { gap: 4, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  rankLine: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  rankBig: { ...typography.display, color: colors.text, fontVariant: ['tabular-nums'] },
  rankOf: { ...typography.body, color: colors.textMuted },
  facts: { ...typography.body, ...font('500'), color: colors.text },
  race: { ...typography.small, color: colors.textMuted },
  section: { paddingTop: spacing.xl, gap: 2 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: spacing.sm },
  sectionTitle: { ...typography.title, color: colors.text },
  headNote: { ...typography.small, color: colors.textMuted },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.md },
  rowMine: { backgroundColor: colors.brandDim, borderRadius: corner(12) },
  rank: { ...typography.smallStrong, color: colors.textFaint, width: 18, textAlign: 'right', fontVariant: ['tabular-nums'] },
  mineInk: { color: colors.brand },
  playerWords: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...typography.body, ...font('500'), fontSize: 16, color: colors.text, flexShrink: 1 },
  mineName: { ...font('600'), color: colors.brand },
  sub: { ...typography.small, color: colors.textFaint },
  value: { ...typography.small, color: colors.textFaint },
  valueNum: { ...typography.bodyStrong, color: colors.text, fontVariant: ['tabular-nums'] },
  gap: { height: 24, justifyContent: 'center', paddingLeft: spacing.md },
  gapDots: { ...typography.bodyStrong, color: colors.textFaint, width: 18, textAlign: 'right', lineHeight: 20 },
  courtRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.md },
  courtWords: { flex: 1, minWidth: 0, gap: 1 },
  facesScroll: { marginHorizontal: -spacing.lg },
  faces: { paddingHorizontal: spacing.lg - 6, gap: 2, paddingVertical: 8 },
  face: { width: 86, alignItems: 'center', gap: 3 },
  faceName: { ...typography.smallStrong, color: colors.text, marginTop: 2 },
  faceMeta: { ...typography.caption, letterSpacing: 0, color: colors.textMuted, ...font('500') },
  footer: { paddingTop: spacing.xxl, paddingBottom: spacing.xxl, gap: 4, alignItems: 'center' },
  footHead: { ...typography.heading, color: colors.text, textAlign: 'center' },
  footBody: { ...typography.small, color: colors.textMuted, textAlign: 'center' },
  footButton: { alignSelf: 'stretch', marginTop: spacing.md, maxWidth: 440, width: '100%', marginHorizontal: 'auto' },
  fine: { ...typography.small, color: colors.textFaint, textAlign: 'center', lineHeight: 19, marginTop: spacing.lg, maxWidth: 360 },
});

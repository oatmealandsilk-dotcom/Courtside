import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Screen } from '@/components/ui';
import { CourtGlyph } from '@/components/map/MapChrome';
import { Highlighted, plain, score } from '@/components/CourtSearch';
import type { TaggedCourt } from '@/data/types';
import { takePlacePicker } from '@/features/places/picker';
import { fetchCourts, type Court } from '@/features/players/courts';
import { formatMiles, milesBetween } from '@/features/players/geo';
import { searchPlacesLocal, searchPlacesRemote, type PlaceHit } from '@/features/places/search';
import { homeFor } from '@/features/players/positions';
import { useApp } from '@/store/AppContext';
import { colors, font, radius, spacing, typography } from '@/theme';

/** Every search's answer from the world's place search, kept for the session: going back a letter is instant. */
const answered = new Map<string, PlaceHit[]>();
/** The longest search already answered that the new one starts with: its places, narrowed, show while the new one runs. */
function nearestAnswer(q: string): PlaceHit[] {
  for (let n = q.length; n >= 2; n -= 1) {
    const hit = answered.get(q.slice(0, n));
    if (hit) return hit;
  }
  return [];
}

/**
 * Where a post was, chosen the way Instagram does it: a page of its own
 * with the search at the top (never under the keyboard). The courts near
 * you come first, by name, since that is where most posts were played;
 * picking one tags the court. Places from the whole world follow.
 *
 * Every letter narrows the list at once, from what is already on the phone:
 * the courts for about 15 miles around (loaded when the page opens), and the
 * places from earlier answers. The world's search only adds to that a beat
 * later, so typing never waits on the network.
 */
export default function PickLocation() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, detectedCoords, locationEnabled, detectedLocation, lastSeen } = useApp();
  const picker = useRef(takePlacePicker());
  const [query, setQuery] = useState(picker.current?.initial ?? '');
  const [remote, setRemote] = useState<PlaceHit[]>(() => nearestAnswer(plain(picker.current?.initial ?? '')));
  const [searching, setSearching] = useState(false);
  const [offline, setOffline] = useState(false);
  const input = useRef<TextInput>(null);
  useEffect(() => { const t = setTimeout(() => input.current?.focus(), 80); return () => clearTimeout(t); }, []);

  // Where you are now, else where you last shared your location, else your profile's town.
  const mine = currentUser ? lastSeen[currentUser.id] : undefined;
  const near = useMemo(() => (currentUser ? homeFor(currentUser, detectedCoords ?? (mine ? { lat: mine.lat, lng: mine.lng } : null)) : null), [currentUser, detectedCoords, mine]);
  // The courts close by come first (the map has usually loaded them already),
  // then the wider ring, so a park across town is there by the first letter.
  const [courts, setCourts] = useState<Court[]>([]);
  useEffect(() => {
    if (!near) return;
    let on = true;
    const add = (list: Court[]) => { if (on) setCourts((prev) => (prev.length >= list.length ? prev : list)); };
    fetchCourts(near).then(add).catch(() => undefined);
    fetchCourts(near, 25000).then(add).catch(() => undefined);
    return () => { on = false; };
  }, [near]);
  const typed = query.trim();
  const key = plain(typed);
  const words = useMemo(() => key.split(' ').filter(Boolean), [key]);
  const local = useMemo(() => searchPlacesLocal(query), [query]);
  // The world's answers come a moment later and are kept; until then the
  // closest earlier answer, narrowed to what is typed now, stands in.
  useEffect(() => {
    if (key.length < 2) { setRemote([]); setSearching(false); return; }
    const kept = answered.get(key);
    if (kept) { setRemote(kept); setSearching(false); return; }
    setRemote(nearestAnswer(key));
    const control = new AbortController();
    const t = setTimeout(() => {
      setSearching(true);
      searchPlacesRemote(typed, near, control.signal)
        .then((found) => { answered.set(key, found); setRemote(found); setOffline(false); })
        .catch((err: unknown) => { if ((err as { name?: string })?.name !== 'AbortError') setOffline(true); })
        .finally(() => { if (!control.signal.aborted) setSearching(false); });
    }, 120);
    return () => { clearTimeout(t); control.abort(); };
  }, [key, typed, near]);

  const hits = useMemo(() => {
    const seen = new Set<string>();
    return [...local, ...remote]
      // A stand-in answer from a shorter search keeps only what still matches every word.
      .filter((h) => !words.length || score(`${h.title} ${h.sub}`, words) !== null)
      .filter((h) => (seen.has(h.value.toLowerCase()) ? false : (seen.add(h.value.toLowerCase()), true)));
  }, [local, remote, words]);
  const exact = hits.some((h) => h.value.toLowerCase() === typed.toLowerCase());
  // Named courts: nearest first before you type; then the best matches, a
  // name starting with what you typed before one that only contains it.
  const nearbyCourts = useMemo(() => {
    const out: { c: Court; miles: number; rank: number }[] = [];
    for (const c of courts) {
      if (c.name === 'Tennis courts') continue;
      const rank = words.length ? score(c.name, words) : 0;
      if (rank === null) continue;
      out.push({ c, miles: near ? milesBetween(near, c) : 0, rank });
    }
    out.sort((a, b) => a.rank - b.rank || a.miles - b.miles);
    return out.slice(0, words.length ? 6 : 8);
  }, [courts, words, near]);

  const choose = (value: string, court?: TaggedCourt) => {
    picker.current?.onPick(value, court);
    router.back();
  };

  return (
    <Screen title="Add location" compactTitle scroll={false} onBack={() => router.back()}>
      <View style={styles.search}>
        <Ionicons name="search" size={17} color={colors.textFaint} />
        <TextInput
          ref={input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => (typed ? choose(hits[0]?.value ?? typed) : router.back())}
          accessibilityLabel="Place"
          style={styles.input}
        />
        {/* The clear button stays put while the world's search runs; the list never waits on it. */}
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear" hitSlop={8} onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={17} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.list} style={{ flex: 1 }}>
        {locationEnabled && detectedLocation && !typed ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Use ${detectedLocation}, where you are`} onPress={() => choose(detectedLocation)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
            <View style={[styles.disc, styles.discOn]}><Ionicons name="navigate" size={16} color={colors.brandInk} /></View>
            <View style={styles.words}><Text style={styles.title}>{detectedLocation}</Text><Text style={styles.sub}>Where you are</Text></View>
          </Pressable>
        ) : null}
        {nearbyCourts.length ? <Text style={styles.section}>{typed ? 'Courts' : 'Courts near you'}</Text> : null}
        {nearbyCourts.map(({ c, miles }) => (
          <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`Tag ${c.name}`} onPress={() => choose(c.name, { id: c.id, name: c.name, lat: c.lat, lng: c.lng })} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
            <View style={[styles.disc, styles.discCourt]}><CourtGlyph size={15} color={colors.brand} /></View>
            <View style={styles.words}><Highlighted text={c.name} words={words} lines={1} style={words.length ? styles.titleSoft : styles.title} strong={styles.titleMatch} /><Text style={styles.sub} numberOfLines={1}>{formatMiles(miles)}{c.count > 1 ? ` · ${c.count} courts` : ''}{c.lit ? ' · lights' : ''}</Text></View>
          </Pressable>
        ))}
        {nearbyCourts.length && (hits.length || (typed && !exact)) ? (
          <View style={styles.sectionRow}><Text style={styles.section}>Places</Text>{searching ? <ActivityIndicator size="small" color={colors.textFaint} /> : null}</View>
        ) : null}
        {hits.map((h) => (
          <Pressable key={h.value} accessibilityRole="button" accessibilityLabel={`Use ${h.value}`} onPress={() => choose(h.value)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
            <View style={styles.disc}><Ionicons name="location-outline" size={17} color={colors.text} /></View>
            <View style={styles.words}><Highlighted text={h.title} words={words} lines={1} style={words.length ? styles.titleSoft : styles.title} strong={styles.titleMatch} />{h.sub ? <Text style={styles.sub} numberOfLines={1}>{h.sub}</Text> : null}</View>
          </Pressable>
        ))}
        {typed && !exact ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Use ${typed}`} onPress={() => choose(typed)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
            <View style={styles.disc}><Ionicons name="add" size={18} color={colors.text} /></View>
            <View style={styles.words}><Text style={styles.title}>Use “{typed}”</Text><Text style={styles.sub}>Exactly as typed</Text></View>
          </Pressable>
        ) : null}
        {typed && searching && !nearbyCourts.length && !hits.length ? <ActivityIndicator size="small" color={colors.textFaint} style={{ paddingVertical: spacing.md }} /> : null}
        {typed && offline && !remote.length ? <Text style={styles.hint}>Could not reach the place search. Check your connection.</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 46, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  input: { flex: 1, ...typography.body, color: colors.text, paddingVertical: 0 },
  list: { paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowPressed: { opacity: 0.6 },
  disc: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  discOn: { backgroundColor: colors.brand },
  discCourt: { backgroundColor: colors.brandDim },
  section: { ...typography.smallStrong, color: colors.textMuted, paddingTop: spacing.md, paddingBottom: 2 },
  words: { flex: 1, gap: 2 },
  title: { ...typography.bodyStrong, color: colors.text },
  // While typing, a name reads in the plain weight with the matching letters in bold, the way a search box shows why each came up.
  titleSoft: { ...typography.body, color: colors.textMuted },
  titleMatch: { ...font('600'), color: colors.text },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sub: { ...typography.small, color: colors.textMuted },
  hint: { ...typography.small, color: colors.textFaint, paddingVertical: spacing.md },
});

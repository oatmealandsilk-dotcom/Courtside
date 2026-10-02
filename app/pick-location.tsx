import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Screen } from '@/components/ui';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { Highlighted, score } from '@/components/CourtSearch';
import type { TaggedCourt } from '@/data/types';
import { takePlacePicker } from '@/features/places/picker';
import { recentPlaces, rememberPlace, warmRecentPlaces, type RecentPlace } from '@/features/places/recents';
import { courtRows, fetchCourts, peekCourts, searchCourtsByName, type Court, type CourtRow } from '@/features/players/courts';
import { formatMiles, milesBetween } from '@/features/players/geo';
import { searchPlacesLocal, searchPlacesRemote, townAt, type PlaceHit } from '@/features/places/search';
import { homeFor, placeFor, type LatLng } from '@/features/players/positions';
import { plain, startsWord } from '@/features/search/words';
import { useApp } from '@/store/AppContext';
import { colors, font, radius, spacing, typography } from '@/theme';

/** Every search's answer from the world's place search, kept for the session: going back a letter is instant. */
const answered = new Map<string, PlaceHit[]>();
/** The longest search already answered that the new one starts with: its places, narrowed, show while the new one runs. */
function nearestAnswer(q: string): PlaceHit[] {
  for (let n = q.length; n >= 1; n -= 1) {
    const hit = answered.get(q.slice(0, n));
    if (hit) return hit;
  }
  return [];
}

/** Courts shown before you type, and at most while typing. */
const NEAR_ROWS = 8;
const TYPED_ROWS = 12;
const RECENT_ROWS = 4;

/** The courts already on the phone around a spot: what the page opens on, before any answer. */
function courtsOnPhone(at: LatLng | null): Court[] {
  if (!at) return [];
  const byId = new Map<string, Court>();
  for (const c of [...(peekCourts(at) ?? []), ...(peekCourts(at, 25000) ?? [])]) byId.set(c.id, c);
  return [...byId.values()];
}

/**
 * Where a post was, chosen the way Instagram does it: a page of its own
 * with the search at the top (never under the keyboard). Before you type:
 * where you are, the places you used before, and the courts nearest you.
 *
 * Every letter narrows the list at once, from what is already on the
 * phone: the courts for about 15 miles around (loaded when the page opens,
 * and usually already while you were editing the post). "R" shows every
 * court near you with a word starting with R, the names starting with it
 * first, then nearest; each letter after narrows it. Courts further away
 * whose names match, and places from the whole world, only add to that a
 * beat later, below, so nothing you are about to tap moves.
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

  /* ------------------------------ Where you are ----------------------------- */
  // Where you are now, else where you last shared your location, else your
  // profile town's own spot. A town the built-in list does not know ("Cary,
  // NC") is looked up by name first, rather than guessing a city in your
  // state; only if that cannot answer does the guess stand in. Never nothing
  // just because Location is off.
  const mine = currentUser ? lastSeen[currentUser.id] : undefined;
  const fix = detectedCoords ?? (mine ? { lat: mine.lat, lng: mine.lng } : null);
  const town = currentUser?.location?.trim() ?? '';
  const needsTown = !!currentUser && !fix && !currentUser.cityAt && !!town && !placeFor(town);
  const [looked, setLooked] = useState<{ town: string; at: LatLng | null } | null>(null);
  useEffect(() => {
    if (!needsTown) return;
    let on = true;
    // A slow answer does not hold the courts up for long.
    const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
    Promise.race([townAt(town), late]).then((at) => { if (on) setLooked({ town, at }); });
    return () => { on = false; };
  }, [needsTown, town]);
  const townSpot = looked?.town === town ? looked.at : undefined;
  const spot = currentUser && !(needsTown && townSpot === undefined) ? homeFor(currentUser, fix, townSpot ?? null) : null;
  const nearLat = spot?.lat;
  const nearLng = spot?.lng;
  const near = useMemo<LatLng | null>(() => (nearLat !== undefined && nearLng !== undefined ? { lat: nearLat, lng: nearLng } : null), [nearLat, nearLng]);

  /* --------------------------------- Courts --------------------------------- */
  // The courts around you, kept as they arrive: the close ring (the map has
  // usually loaded it), then the ~15-mile ring. A later spot (Location
  // answering after the page opened) adds its courts to these; the list is
  // always sorted from where you are now.
  const [courts, setCourts] = useState<Court[]>(() => courtsOnPhone(near));
  const [loadingCourts, setLoadingCourts] = useState(true);
  useEffect(() => {
    if (!near) return;
    let on = true;
    let tries = 0;
    const add = (list: Court[]) => {
      if (!on || !list.length) return;
      setCourts((prev) => {
        const byId = new Map(prev.map((c) => [c.id, c]));
        for (const c of list) byId.set(c.id, c);
        return byId.size === prev.length ? prev : [...byId.values()];
      });
    };
    const load = () => {
      setLoadingCourts(true);
      void Promise.allSettled([fetchCourts(near).then(add), fetchCourts(near, 25000).then(add)]).then((done) => {
        if (!on) return;
        // The wide ring did not answer (no signal for a moment): try again shortly, twice, rather than leave the list short.
        if (done[1].status === 'rejected' && tries < 2) { tries += 1; setTimeout(() => { if (on) load(); }, 2500); return; }
        setLoadingCourts(false);
      });
    };
    load();
    return () => { on = false; };
  }, [near]);
  // One row per place, nearest first: the same park split across a few cells is one row with its courts added up.
  const rows = useMemo(() => courtRows(courts, near).filter((r) => r.c.name !== 'Tennis courts'), [courts, near]);

  /* ------------------------------ What is typed ----------------------------- */
  const typed = query.trim();
  const key = plain(typed);
  const words = useMemo(() => key.split(' ').filter(Boolean), [key]);
  const first = words[0] ?? '';

  // Courts further away whose names match, from our own database, a beat
  // after the second letter ("god" finds Godbold Park across the county).
  // Kept for the page; every letter filters them like the rest.
  const [far, setFar] = useState<Court[]>([]);
  useEffect(() => {
    if (!near || first.length < 2) return;
    const control = new AbortController();
    const t = setTimeout(() => {
      searchCourtsByName(first, near, control.signal)
        .then((list) => {
          if (!list.length) return;
          setFar((prev) => {
            const byId = new Map(prev.map((c) => [c.id, c]));
            for (const c of list) byId.set(c.id, c);
            return byId.size === prev.length ? prev : [...byId.values()];
          });
        })
        .catch(() => undefined);
    }, 120);
    return () => { clearTimeout(t); control.abort(); };
  }, [first, near]);
  const farRows = useMemo(() => {
    // Only what the courts around you do not already have.
    const ids = new Set(rows.map((r) => r.c.id));
    const names = new Map<string, CourtRow[]>();
    for (const r of rows) { const n = plain(r.c.name); names.set(n, [...(names.get(n) ?? []), r]); }
    return courtRows(far, near).filter((r) => r.c.name !== 'Tennis courts' && !ids.has(r.c.id)
      && !(names.get(plain(r.c.name)) ?? []).some((k) => milesBetween(k.c, r.c) <= 1.5));
  }, [far, rows, near]);

  // Every letter, at once: courts with a word starting with each word typed,
  // a name starting with it before one with a later word starting with it,
  // then nearest. The ones further away come after all of these, so their
  // late arrival only ever adds rows at the bottom.
  const typedCourts = useMemo(() => {
    if (!words.length) return [];
    const pick = (list: CourtRow[]) => list
      .flatMap((r) => { const rank = score(r.c.name, words); return rank === null ? [] : [{ r, rank }]; })
      .sort((a, b) => a.rank - b.rank || a.r.miles - b.r.miles)
      .map((x) => x.r);
    return [...pick(rows), ...pick(farRows)].slice(0, TYPED_ROWS);
  }, [rows, farRows, words]);

  /* --------------------------------- Places --------------------------------- */
  const local = useMemo(() => searchPlacesLocal(query, near), [query, near]);
  // The world's answers come a moment later and are kept; until then the
  // closest earlier answer, narrowed to what is typed now, stands in.
  useEffect(() => {
    if (!key) { setRemote([]); setSearching(false); return; }
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
    if (!words.length) return [];
    // A place that is one of the courts listed is already there, as the court.
    const seen = new Set<string>(typedCourts.map((r) => plain(r.c.name)));
    const titles = new Set<string>();
    return [
      // A stand-in answer from a shorter search keeps only what still matches every word, from the start of a word.
      ...remote.filter((h) => words.every((w) => startsWord(plain(`${h.title} ${h.sub}`), w))).slice(0, 8),
      ...local,
    ].filter((h) => {
      const title = plain(h.title);
      const value = plain(h.value);
      if (seen.has(value) || seen.has(title) || titles.has(title)) return false;
      seen.add(value);
      titles.add(title);
      return true;
    });
  }, [remote, local, words, typedCourts]);
  const exact = hits.some((h) => plain(h.value) === key) || typedCourts.some((r) => plain(r.c.name) === key);

  /* --------------------------------- Recents -------------------------------- */
  const [recents, setRecents] = useState<RecentPlace[]>(() => (currentUser ? recentPlaces(currentUser.id) ?? [] : []));
  const me = currentUser?.id;
  useEffect(() => {
    if (!me) return;
    let on = true;
    void warmRecentPlaces().then(() => { if (on) setRecents(recentPlaces(me) ?? []); });
    return () => { on = false; };
  }, [me]);
  const showHere = locationEnabled && !!detectedLocation && !typed;
  const shownRecents = useMemo(
    () => recents.filter((r) => !(showHere && !r.court && r.value === detectedLocation)).slice(0, RECENT_ROWS),
    [recents, showHere, detectedLocation],
  );
  // Before typing: the nearest courts, less any already offered as recent.
  const nearCourts = useMemo(() => {
    const recentIds = new Set(shownRecents.flatMap((r) => (r.court ? [r.court.id] : [])));
    return rows.filter((r) => !recentIds.has(r.c.id)).slice(0, NEAR_ROWS);
  }, [rows, shownRecents]);

  const choose = (value: string, court?: TaggedCourt) => {
    if (me) rememberPlace(me, value, court);
    picker.current?.onPick(value, court);
    router.back();
  };
  const tag = (c: Court) => choose(c.name, { id: c.id, name: c.name, lat: c.lat, lng: c.lng });
  // Return picks a court or place named exactly what was typed ("Raleigh" is
  // the city, not The Raleigh Raquet Club); else the top row: the first
  // court, else the first place, else what was typed.
  const submit = () => {
    if (!typed) { router.back(); return; }
    const sameCourt = typedCourts.find((r) => plain(r.c.name) === key);
    const samePlace = hits.find((h) => plain(h.title) === key || plain(h.value) === key);
    if (sameCourt) tag(sameCourt.c);
    else if (samePlace) choose(samePlace.value);
    else if (typedCourts[0]) tag(typedCourts[0].c);
    else choose(hits[0]?.value ?? typed);
  };

  const courtRow = ({ c, miles }: CourtRow, highlight: string[]) => (
    <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`Tag ${c.name}`} onPress={() => tag(c)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={[styles.disc, styles.discCourt]}><CourtGlyph size={15} color={colors.brand} /></View>
      <View style={styles.words}>
        <Highlighted text={c.name} words={highlight} lines={1} style={highlight.length ? styles.titleSoft : styles.title} strong={styles.titleMatch} wordStart />
        <Text style={styles.sub} numberOfLines={1}>{near ? formatMiles(miles) : 'Court'}{c.count > 1 ? ` · ${c.count} courts` : ''}{c.lit ? ' · lights' : ''}</Text>
      </View>
    </Pressable>
  );

  return (
    <Screen title="Add location" compactTitle scroll={false} bar={false} onBack={() => router.back()}>
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
          onSubmitEditing={submit}
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
        {!typed ? (
          <>
            {showHere ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Use ${detectedLocation}, where you are`} onPress={() => choose(detectedLocation!)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                <View style={[styles.disc, styles.discOn]}><Ionicons name="navigate" size={16} color={colors.brandInk} /></View>
                <View style={styles.words}><Text style={styles.title}>{detectedLocation}</Text><Text style={styles.sub}>Where you are</Text></View>
              </Pressable>
            ) : null}
            {shownRecents.length ? <Text style={styles.section}>Recent</Text> : null}
            {shownRecents.map((r) => {
              const court = r.court;
              return (
                <Pressable key={court ? `c:${court.id}` : `p:${r.value}`} accessibilityRole="button" accessibilityLabel={court ? `Tag ${court.name}` : `Use ${r.value}`} onPress={() => choose(court ? court.name : r.value, court)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                  <View style={[styles.disc, court && styles.discCourt]}>{court ? <CourtGlyph size={15} color={colors.brand} /> : <Ionicons name="time-outline" size={17} color={colors.text} />}</View>
                  <View style={styles.words}>
                    <Text style={styles.title} numberOfLines={1}>{court ? court.name : r.value}</Text>
                    <Text style={styles.sub} numberOfLines={1}>{court ? (near ? `${formatMiles(milesBetween(near, court))} · Court` : 'Court') : 'Used before'}</Text>
                  </View>
                </Pressable>
              );
            })}
            {nearCourts.length ? <Text style={styles.section}>Courts near you</Text> : null}
            {nearCourts.map((r) => courtRow(r, []))}
            {!nearCourts.length && !!currentUser && (loadingCourts || !near) ? (
              <View style={styles.waitRow}><ActivityIndicator size="small" color={colors.textFaint} /><Text style={styles.hint}>Finding courts near you…</Text></View>
            ) : null}
          </>
        ) : (
          <>
            {typedCourts.length ? <Text style={styles.section}>Courts</Text> : null}
            {typedCourts.map((r) => courtRow(r, words))}
            {!typedCourts.length && loadingCourts ? (
              <View style={styles.waitRow}><ActivityIndicator size="small" color={colors.textFaint} /><Text style={styles.hint}>Finding courts near you…</Text></View>
            ) : null}
            {/* Right under the courts, so places arriving later never push it away from your thumb. */}
            {typed.length >= 2 && !exact ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Use ${typed}`} onPress={() => choose(typed)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                <View style={styles.disc}><Ionicons name="add" size={18} color={colors.text} /></View>
                <View style={styles.words}><Text style={styles.title}>Use “{typed}”</Text><Text style={styles.sub}>Exactly as typed</Text></View>
              </Pressable>
            ) : null}
            {hits.length || searching ? (
              <View style={styles.sectionRow}><Text style={styles.section}>Places</Text>{searching ? <ActivityIndicator size="small" color={colors.textFaint} /> : null}</View>
            ) : null}
            {hits.map((h) => (
              <Pressable key={h.value} accessibilityRole="button" accessibilityLabel={`Use ${h.value}`} onPress={() => choose(h.value)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                <View style={styles.disc}><Ionicons name="location-outline" size={17} color={colors.text} /></View>
                <View style={styles.words}><Highlighted text={h.title} words={words} lines={1} style={styles.titleSoft} strong={styles.titleMatch} wordStart />{h.sub ? <Text style={styles.sub} numberOfLines={1}>{h.sub}</Text> : null}</View>
              </Pressable>
            ))}
            {offline && !remote.length ? <Text style={styles.hint}>Could not reach the place search. Check your connection.</Text> : null}
          </>
        )}
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
  waitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hint: { ...typography.small, color: colors.textFaint, paddingVertical: spacing.md },
});

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeIn } from 'react-native-reanimated';

import { CourtGlyph } from '@/components/map/CourtGlyph';
import { courtRows, fetchCourts, type Court } from '@/features/players/courts';
import { formatMiles, milesBetween } from '@/features/players/geo';
import type { LatLng } from '@/features/players/positions';
import { plain } from '@/features/search/words';
import { labelOf, score } from '@/features/places/courtName';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

/** Where a hit is played: a court from the list carries the map's id for it, so its card opens that court's page. */
export interface ChosenPlace { id?: string; name: string; lat?: number; lng?: number }

export { plain };
// Moved beside the other court-name rules; kept here for the screens that import them from the search.
export { labelOf, score };

/**
 * The name with the typed words in bold, so you see why each one came up.
 * With `wordStart`, only a match at the start of a word is bold (Search
 * matches that way, so "s" does not light every s in a sentence).
 */
export function Highlighted({ text, words, style, strong, lines = 2, wordStart = false }: { text: string; words: string[]; style: object; strong: object; lines?: number; wordStart?: boolean }) {
  // Letter by letter, so every position lines up with the text as written:
  // "é" reads as "e", and a double space in a name still bolds what follows.
  const lower = Array.from(text, (ch) => { const p = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); return p.length === ch.length ? p : ch.toLowerCase(); }).join('');
  if (lower.length !== text.length || !words.length) return <Text style={style} numberOfLines={lines}>{text}</Text>;
  const marks = new Array(text.length).fill(false);
  for (const w of words) { let i = lower.indexOf(w); while (i >= 0) { if (!wordStart || i === 0 || !/[\p{L}\p{N}]/u.test(lower[i - 1])) for (let k = i; k < i + w.length; k++) marks[k] = true; i = lower.indexOf(w, i + 1); } }
  const parts: { s: string; on: boolean }[] = [];
  for (let i = 0; i < text.length; i++) { const last = parts[parts.length - 1]; if (last && last.on === marks[i]) last.s += text[i]; else parts.push({ s: text[i], on: marks[i] }); }
  return <Text style={style} numberOfLines={lines}>{parts.map((p, i) => <Text key={i} style={p.on ? strong : undefined}>{p.s}</Text>)}</Text>;
}

/**
 * Where to play, picked the way a search box works: before you type, the
 * courts nearest you; as you type, the courts whose names match, best match
 * first with what you typed in bold, and a last row to use what you typed
 * as the place. Names get two lines, so a long park name still reads.
 */
export function CourtSearch({ home, nearby, chosen, onChoose, typed, onType }: {
  home: LatLng | null;
  /** The courts already loaded around you. */
  nearby: Court[];
  chosen: ChosenPlace | null;
  onChoose: (place: ChosenPlace | null) => void;
  typed: string;
  onType: (text: string) => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const input = useRef<TextInput>(null);
  // Typing looks further afield than the courts around you: about 15 miles,
  // loaded as the form opens so the first letter already finds them.
  const [wide, setWide] = useState<Court[] | null>(null);
  const [loadingWide, setLoadingWide] = useState(false);
  const query = typed.trim();
  const homeLat = home?.lat;
  const homeLng = home?.lng;
  useEffect(() => {
    if (homeLat === undefined || homeLng === undefined) return;
    let on = true;
    setLoadingWide(true);
    // A slow answer never holds the list up: after a few seconds it searches the courts already here.
    const late = new Promise<Court[]>((resolve) => setTimeout(() => resolve([]), 8000));
    Promise.race([fetchCourts({ lat: homeLat, lng: homeLng }, 25000), late])
      .then((list) => { if (on) setWide(list); })
      .catch(() => { if (on) setWide([]); })
      .finally(() => { if (on) setLoadingWide(false); });
    return () => { on = false; };
  }, [homeLat, homeLng]);

  const words = useMemo(() => plain(query).split(' ').filter(Boolean), [query]);
  // Every letter narrows this at once: a name with a word starting with each word typed, the name starting with it first, then nearest.
  const pool = useMemo(() => courtRows(query ? [...nearby, ...(wide ?? [])] : nearby, home), [query, wide, nearby, home]);
  const rows = useMemo(() => {
    const out: { c: Court; miles: number; rank: number }[] = [];
    for (const { c, miles } of pool) {
      const rank = query ? score(labelOf(c), words) : 0;
      // Typing, an unnamed "Public courts" never stands above a court actually called what you typed ("Pu" is Pullen Park first).
      if (rank !== null) out.push({ c, miles, rank: query && c.name === 'Tennis courts' ? rank + 2 : rank });
    }
    out.sort((a, b) => a.rank - b.rank || a.miles - b.miles);
    // Nearest first when nothing is typed; at most two unnamed ones, which say little.
    let unnamed = 0;
    return out.filter(({ c }) => (c.name === 'Tennis courts' ? ++unnamed <= 2 : true)).slice(0, query ? 8 : 4);
  }, [query, words, pool]);

  if (chosen) {
    const court = chosen.lat !== undefined;
    return (
      <Animated.View entering={FadeIn.duration(160)} style={styles.chosen}>
        <View style={styles.tileOn}>{court ? <CourtGlyph size={15} color={colors.brandInk} /> : <Ionicons name="location" size={17} color={colors.brandInk} />}</View>
        <View style={styles.rowWords}>
          <Text style={styles.chosenName} numberOfLines={2}>{chosen.name}</Text>
          {court && home ? <Text style={styles.rowMeta}>{formatMiles(milesBetween(home, { lat: chosen.lat!, lng: chosen.lng! }))} away</Text> : <Text style={styles.rowMeta}>The place you typed</Text>}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Change where" hitSlop={8} onPress={() => { onChoose(null); onType(''); setTimeout(() => input.current?.focus(), 50); }}>
          <Text style={styles.change}>Change</Text>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.search}>
        <Ionicons name="search" size={16} color={colors.textFaint} />
        {/* A place's name is kept to 120 characters (hit_requests_place_check): longer failed to post. */}
        <TextInput ref={input} value={typed} onChangeText={onType} maxLength={120} placeholder="Search courts" placeholderTextColor={colors.textFaint} style={styles.searchInput} accessibilityLabel="Where" autoCorrect={false} returnKeyType="done" onSubmitEditing={() => { if (rows[0] && query) onChoose({ id: rows[0].c.id, name: labelOf(rows[0].c), lat: rows[0].c.lat, lng: rows[0].c.lng }); }} />
        {loadingWide && query ? <ActivityIndicator size="small" color={colors.textFaint} /> : typed ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear" hitSlop={8} onPress={() => onType('')}><Ionicons name="close-circle" size={17} color={colors.textFaint} /></Pressable>
        ) : null}
      </View>
      <View style={styles.list}>
        {!query && rows.length ? <Text style={styles.listHead}>Near you</Text> : null}
        {rows.map(({ c, miles }, i) => (
          <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`${labelOf(c)}, ${formatMiles(miles)}`} onPress={() => onChoose({ id: c.id, name: labelOf(c), lat: c.lat, lng: c.lng })} style={({ pressed }) => [styles.row, i > 0 && styles.rule, pressed && styles.pressed]}>
            <View style={styles.tile}><CourtGlyph size={14} color={colors.brand} /></View>
            <View style={styles.rowWords}>
              <Highlighted text={labelOf(c)} words={words} style={styles.rowName} strong={styles.rowNameMatch} wordStart />
              <Text style={styles.rowMeta} numberOfLines={1}>{[formatMiles(miles), c.count > 1 ? `${c.count} courts` : null, c.lit ? 'lights' : null].filter(Boolean).join(' · ')}</Text>
            </View>
          </Pressable>
        ))}
        {query && !rows.length && !loadingWide ? <Text style={styles.none}>No courts called “{query}” nearby.</Text> : null}
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Use ${query}`} onPress={() => onChoose({ name: query.slice(0, 120) })} style={({ pressed }) => [styles.row, rows.length > 0 && styles.rule, pressed && styles.pressed]}>
            <View style={styles.tile}><Ionicons name="location-outline" size={16} color={colors.textMuted} /></View>
            <View style={styles.rowWords}>
              <Text style={styles.rowName} numberOfLines={2}>Use “<Text style={styles.rowNameMatch}>{query}</Text>”</Text>
              <Text style={styles.rowMeta}>Somewhere else: a club, a school, a friend’s court</Text>
            </View>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  // The same lifted pill as the Coaching page's ask box.
  search: { ...lift, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.lg, minHeight: 50, borderRadius: radius.pill, backgroundColor: colors.surface },
  // Sized by its padding, not a fixed height (that drew the words low and cut off on an iPhone).
  searchInput: { flex: 1, minWidth: 0, fontSize: 16, color: colors.text, minHeight: 50, paddingVertical: 12, outlineStyle: 'none' } as object,
  list: { borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, overflow: 'hidden' },
  listHead: { ...typography.caption, color: colors.textFaint, letterSpacing: 0.4, paddingTop: 10, paddingBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { opacity: 0.6 },
  tile: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  tileOn: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  rowWords: { flex: 1, minWidth: 0, gap: 1 },
  rowName: { ...typography.body, color: colors.textMuted, lineHeight: 20 },
  rowNameMatch: { ...font('600'), color: colors.text },
  rowMeta: { ...typography.small, color: colors.textFaint },
  none: { ...typography.small, color: colors.textMuted, paddingVertical: 12 },
  chosen: { ...lift, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, paddingRight: spacing.lg, borderRadius: 18, backgroundColor: colors.surface },
  chosenName: { ...typography.bodyStrong, color: colors.text },
  change: { ...typography.smallStrong, color: colors.brand },
});

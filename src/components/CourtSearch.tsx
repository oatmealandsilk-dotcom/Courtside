import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeIn } from 'react-native-reanimated';

import { CourtGlyph } from '@/components/map/MapChrome';
import { fetchCourts, type Court } from '@/features/players/courts';
import { formatMiles, milesBetween } from '@/features/players/geo';
import type { LatLng } from '@/features/players/positions';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

export interface ChosenPlace { name: string; lat?: number; lng?: number }

/** Lower case, no accents, single spaces: "Pullen  Park" and "pullen park" are the same search. */
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
/** OpenStreetMap leaves most public courts unnamed; the list calls those "Public courts". */
const labelOf = (c: Court) => (c.name === 'Tennis courts' ? 'Public courts' : c.name);

/**
 * How well a court's name answers what was typed, like a search box should:
 * every word typed must be in the name; a name that starts with it beats one
 * with a word starting with it, which beats one that only contains it.
 * Null when it does not match at all.
 */
function score(name: string, words: string[]): number | null {
  const n = plain(name);
  let total = 0;
  for (const w of words) {
    const at = n.indexOf(w);
    if (at < 0) return null;
    total += at === 0 ? 0 : n.includes(` ${w}`) ? 1 : 2;
  }
  return total;
}

/** The name with the typed words in bold, so you see why each one came up. */
function Highlighted({ text, words, style, strong }: { text: string; words: string[]; style: object; strong: object }) {
  const lower = plain(text);
  // Only the ascii-equivalent positions line up; accents make plain() shorter, so fall back to no highlight.
  if (lower.length !== text.length || !words.length) return <Text style={style} numberOfLines={2}>{text}</Text>;
  const marks = new Array(text.length).fill(false);
  for (const w of words) { let i = lower.indexOf(w); while (i >= 0) { for (let k = i; k < i + w.length; k++) marks[k] = true; i = lower.indexOf(w, i + 1); } }
  const parts: { s: string; on: boolean }[] = [];
  for (let i = 0; i < text.length; i++) { const last = parts[parts.length - 1]; if (last && last.on === marks[i]) last.s += text[i]; else parts.push({ s: text[i], on: marks[i] }); }
  return <Text style={style} numberOfLines={2}>{parts.map((p, i) => <Text key={i} style={p.on ? strong : undefined}>{p.s}</Text>)}</Text>;
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
  // Typing looks further afield than the courts around you: about 15 miles.
  const [wide, setWide] = useState<Court[] | null>(null);
  const [loadingWide, setLoadingWide] = useState(false);
  const query = typed.trim();
  useEffect(() => {
    if (!query || wide || loadingWide || !home) return;
    setLoadingWide(true);
    // A slow answer never holds the list up: after a few seconds it searches the courts already here.
    const late = new Promise<Court[]>((resolve) => setTimeout(() => resolve([]), 8000));
    Promise.race([fetchCourts(home, 25000), late]).then(setWide).catch(() => setWide([])).finally(() => setLoadingWide(false));
  }, [query, wide, loadingWide, home]);

  const words = useMemo(() => plain(query).split(' ').filter(Boolean), [query]);
  const rows = useMemo(() => {
    const pool = query ? [...(wide ?? []), ...nearby] : nearby;
    const seen = new Set<string>();
    const out: { c: Court; miles: number; rank: number }[] = [];
    for (const c of pool) {
      const key = `${c.lat.toFixed(3)},${c.lng.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const rank = query ? score(labelOf(c), words) : 0;
      if (rank === null) continue;
      out.push({ c, miles: home ? milesBetween(home, c) : 0, rank });
    }
    out.sort((a, b) => a.rank - b.rank || a.miles - b.miles);
    // Nearest first when nothing is typed; at most two unnamed ones, which say little.
    let unnamed = 0;
    return out.filter(({ c }) => (c.name === 'Tennis courts' ? ++unnamed <= 2 : true)).slice(0, query ? 6 : 4);
  }, [query, words, wide, nearby, home]);

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
        <TextInput ref={input} value={typed} onChangeText={onType} placeholder="Search courts, or type a place" placeholderTextColor={colors.textFaint} style={styles.searchInput} accessibilityLabel="Where" autoCorrect={false} returnKeyType="done" onSubmitEditing={() => { if (rows[0] && query) onChoose({ name: labelOf(rows[0].c), lat: rows[0].c.lat, lng: rows[0].c.lng }); }} />
        {loadingWide ? <ActivityIndicator size="small" color={colors.textFaint} /> : typed ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear" hitSlop={8} onPress={() => onType('')}><Ionicons name="close-circle" size={17} color={colors.textFaint} /></Pressable>
        ) : null}
      </View>
      <View style={styles.list}>
        {!query && rows.length ? <Text style={styles.listHead}>Near you</Text> : null}
        {rows.map(({ c, miles }, i) => (
          <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`${labelOf(c)}, ${formatMiles(miles)}`} onPress={() => onChoose({ name: labelOf(c), lat: c.lat, lng: c.lng })} style={({ pressed }) => [styles.row, i > 0 && styles.rule, pressed && styles.pressed]}>
            <View style={styles.tile}><CourtGlyph size={14} color={colors.brand} /></View>
            <View style={styles.rowWords}>
              <Highlighted text={labelOf(c)} words={words} style={styles.rowName} strong={styles.rowNameMatch} />
              <Text style={styles.rowMeta} numberOfLines={1}>{[formatMiles(miles), c.count > 1 ? `${c.count} courts` : null, c.lit ? 'lights' : null].filter(Boolean).join(' · ')}</Text>
            </View>
          </Pressable>
        ))}
        {query && !rows.length && !loadingWide ? <Text style={styles.none}>No courts called “{query}” nearby.</Text> : null}
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Use ${query}`} onPress={() => onChoose({ name: query })} style={({ pressed }) => [styles.row, rows.length > 0 && styles.rule, pressed && styles.pressed]}>
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
  // The same lifted pill as the Coaching page's "What are you stuck on?".
  search: { ...lift, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.lg, height: 50, borderRadius: radius.pill, backgroundColor: colors.surface },
  searchInput: { flex: 1, minWidth: 0, height: 50, fontSize: 16, color: colors.text, outlineStyle: 'none' } as object,
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

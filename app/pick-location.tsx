import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from '@/components/ui';
import { takePlacePicker } from '@/features/places/picker';
import { searchPlacesLocal, searchPlacesRemote, type PlaceHit } from '@/features/places/search';
import { homeFor } from '@/features/players/positions';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * Where a post was, chosen the way Instagram does it: a page of its own
 * with the search at the top (never under the keyboard) and places from
 * the whole world beneath it — cities, parks, clubs — nearest first.
 */
export default function PickLocation() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, detectedCoords, locationEnabled, detectedLocation } = useApp();
  const picker = useRef(takePlacePicker());
  const [query, setQuery] = useState(picker.current?.initial ?? '');
  const [remote, setRemote] = useState<PlaceHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [offline, setOffline] = useState(false);
  const input = useRef<TextInput>(null);
  useEffect(() => { const t = setTimeout(() => input.current?.focus(), 80); return () => clearTimeout(t); }, []);

  const near = useMemo(() => (currentUser ? homeFor(currentUser, detectedCoords) : null), [currentUser, detectedCoords]);
  const typed = query.trim();
  const local = useMemo(() => searchPlacesLocal(query), [query]);
  // The world's answers arrive a beat after you stop typing; a newer search cancels an older one.
  useEffect(() => {
    if (typed.length < 2) { setRemote([]); setSearching(false); return; }
    const control = new AbortController();
    setSearching(true);
    const t = setTimeout(() => {
      searchPlacesRemote(typed, near, control.signal)
        .then((hits) => { setRemote(hits); setOffline(false); })
        .catch((err: unknown) => { if ((err as { name?: string })?.name !== 'AbortError') setOffline(true); })
        .finally(() => { if (!control.signal.aborted) setSearching(false); });
    }, 250);
    return () => { clearTimeout(t); control.abort(); };
  }, [typed, near]);

  const hits = useMemo(() => {
    const seen = new Set<string>();
    return [...local, ...remote].filter((h) => (seen.has(h.value.toLowerCase()) ? false : (seen.add(h.value.toLowerCase()), true)));
  }, [local, remote]);
  const exact = hits.some((h) => h.value.toLowerCase() === typed.toLowerCase());

  const choose = (value: string) => {
    picker.current?.onPick(value);
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
          placeholder="Search for a place"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => (typed ? choose(hits[0]?.value ?? typed) : router.back())}
          accessibilityLabel="Place"
          style={styles.input}
        />
        {searching ? <ActivityIndicator size="small" color={colors.textFaint} /> : query ? (
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
        {hits.map((h) => (
          <Pressable key={h.value} accessibilityRole="button" accessibilityLabel={`Use ${h.value}`} onPress={() => choose(h.value)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
            <View style={styles.disc}><Ionicons name="location-outline" size={17} color={colors.text} /></View>
            <View style={styles.words}><Text style={styles.title} numberOfLines={1}>{h.title}</Text>{h.sub ? <Text style={styles.sub} numberOfLines={1}>{h.sub}</Text> : null}</View>
          </Pressable>
        ))}
        {typed && !exact ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Use ${typed}`} onPress={() => choose(typed)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
            <View style={styles.disc}><Ionicons name="add" size={18} color={colors.text} /></View>
            <View style={styles.words}><Text style={styles.title}>Use “{typed}”</Text><Text style={styles.sub}>Exactly as typed</Text></View>
          </Pressable>
        ) : null}
        {!typed ? <Text style={styles.hint}>Cities, parks, clubs — anywhere in the world.</Text> : null}
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
  words: { flex: 1, gap: 2 },
  title: { ...typography.bodyStrong, color: colors.text },
  sub: { ...typography.small, color: colors.textMuted },
  hint: { ...typography.small, color: colors.textFaint, paddingVertical: spacing.md },
});

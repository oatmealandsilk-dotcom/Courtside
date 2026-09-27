import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { DragSheet } from '@/components/DragSheet';
import { CourtGlyph } from '@/components/map/MapChrome';
import { SegmentedControl } from '@/components/ui';
import type { HitRequest } from '@/data/types';
import { fetchCourts, type Court } from '@/features/players/courts';
import { formatMiles, milesBetween } from '@/features/players/geo';
import { homeFor } from '@/features/players/positions';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, typography } from '@/theme';

const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

/**
 * Looking for a hit: when (a day and an hour), where (a court near you, or
 * typed), what level, singles or doubles or just hitting, and how many spots.
 * It goes up on Find Players; whoever says "I'm in" lands in a chat with you.
 */
export default function NewHit() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, detectedCoords, actions } = useApp();
  const [closeSignal, setCloseSignal] = useState(0);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d; }), []);
  // Late in the evening there is no hour left today: start on tomorrow.
  const [day, setDay] = useState(new Date().getHours() >= 21 ? 1 : 0);
  const nextHour = Math.min(21, Math.max(6, new Date().getHours() + 1));
  const [hour, setHour] = useState(nextHour);
  const [place, setPlace] = useState<HitRequest['place'] | null>(null);
  const [typed, setTyped] = useState('');
  const [courts, setCourts] = useState<Court[]>([]);
  const home = useMemo(() => (currentUser ? homeFor(currentUser, detectedCoords) : null), [currentUser, detectedCoords]);
  useEffect(() => { if (home) fetchCourts(home).then(setCourts).catch(() => setCourts([])); }, [home]);
  const rating = currentUser?.profile.rating;
  const [level, setLevel] = useState<'any' | 'mine'>(rating ? 'mine' : 'any');
  // The rating may arrive a moment after the sheet: default to your level once it does.
  const levelSet = React.useRef(!!rating);
  useEffect(() => { if (rating && !levelSet.current) { levelSet.current = true; setLevel('mine'); } }, [rating]);
  // Today only offers the hours still ahead, so the first one is the default.
  const hours = day === 0 ? HOURS.filter((h) => h >= new Date().getHours() + 1) : HOURS;
  useEffect(() => { if (hours.length && !hours.includes(hour)) setHour(hours[0]); }, [day]); // eslint-disable-line react-hooks/exhaustive-deps
  const [format, setFormat] = useState<HitRequest['format']>('singles');
  const [spots, setSpots] = useState(1);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const start = new Date(days[day]); start.setHours(hour, 0, 0, 0);
  const past = start.getTime() < Date.now() - 30 * 60_000;
  const where = place ?? (typed.trim() ? { name: typed.trim() } : null);
  const ready = !!where && !past && !saving;
  const nearby = courts
    .map((c) => ({ c, miles: home ? milesBetween(home, c) : 0 }))
    .filter(({ c }) => !typed.trim() || c.name.toLowerCase().includes(typed.trim().toLowerCase()))
    .sort((a, b) => a.miles - b.miles)
    .slice(0, 5);

  const post = async () => {
    if (!ready || !where) return;
    setSaving(true);
    setError('');
    try {
      const step = currentUser?.profile.skillSystem === 'UTR' ? 1 : 0.5;
      await actions.postHit({
        startsAt: start.toISOString(), place: where, format, spots, note: note.trim() || undefined,
        levelMin: level === 'mine' && rating ? Math.max(1, rating - step) : undefined,
        levelMax: level === 'mine' && rating ? rating + step : undefined,
      });
      setCloseSignal((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t post. Try again.');
      setSaving(false);
    }
  };

  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={() => router.back()} peekFraction={0.86} header={
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Looking for a hit</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={() => setCloseSignal((n) => n + 1)}>
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </Pressable>
      </View>
    }>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>When</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {days.map((d, i) => (
            <Pressable key={i} accessibilityRole="radio" accessibilityState={{ selected: day === i }} onPress={() => setDay(i)} style={[styles.chip, day === i && styles.chipOn]}>
              <Text style={[styles.chipText, day === i && styles.chipTextOn]}>{i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'short', day: 'numeric' })}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {hours.map((h) => (
            <Pressable key={h} accessibilityRole="radio" accessibilityState={{ selected: hour === h }} onPress={() => setHour(h)} style={[styles.chip, hour === h && styles.chipOn]}>
              <Text style={[styles.chipText, hour === h && styles.chipTextOn]}>{hourLabel(h)}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {past ? <Text style={styles.error}>That time has passed. Pick a later one.</Text> : null}

        <Text style={styles.label}>Where</Text>
        {place ? (
          <View style={styles.picked}>
            <CourtGlyph size={14} color={colors.brand} />
            <Text style={styles.pickedText} numberOfLines={1}>{place.name}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Change the court" hitSlop={8} onPress={() => setPlace(null)}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></Pressable>
          </View>
        ) : (
          <>
            <TextInput value={typed} onChangeText={setTyped} placeholder="A court near you, or type a place" placeholderTextColor={colors.textFaint} style={styles.input} accessibilityLabel="Where" />
            {nearby.map(({ c, miles }) => (
              <Pressable key={c.id} accessibilityRole="button" onPress={() => { setPlace({ name: c.name, lat: c.lat, lng: c.lng }); setTyped(''); }} style={styles.courtRow}>
                <CourtGlyph size={13} color={colors.textMuted} />
                <Text style={styles.courtName} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.courtMeta}>{formatMiles(miles)}</Text>
              </Pressable>
            ))}
          </>
        )}

        <Text style={styles.label}>Game</Text>
        <SegmentedControl value={format} onChange={(v) => { const f = v as HitRequest['format']; setFormat(f); setSpots(f === 'doubles' ? 3 : 1); }} segments={[{ value: 'singles', label: 'Singles' }, { value: 'doubles', label: 'Doubles' }, { value: 'hit', label: 'Just hitting' }]} />
        <Text style={styles.label}>Level</Text>
        <SegmentedControl value={level} onChange={(v) => setLevel(v as 'any' | 'mine')} segments={[{ value: 'mine', label: rating ? `Around ${rating.toFixed(1)}` : 'Around mine' }, { value: 'any', label: 'Any level' }]} />
        <Text style={styles.label}>Looking for</Text>
        <SegmentedControl value={String(spots)} onChange={(v) => setSpots(Number(v))} segments={[{ value: '1', label: '1 player' }, { value: '2', label: '2' }, { value: '3', label: '3' }]} />
        <TextInput value={note} onChangeText={(v) => setNote(v.slice(0, 280))} placeholder="Anything else (optional): balls, which court, how long" placeholderTextColor={colors.textFaint} style={[styles.input, { minHeight: 64 }]} multiline accessibilityLabel="Note" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={!ready} onPress={post} style={[styles.post, !ready && { opacity: 0.45 }]}>
          <Text style={styles.postText}>{saving ? 'Posting…' : 'Post'}</Text>
        </Pressable>
        <Text style={styles.fine}>Players nearby see it on Find Players. Whoever joins gets a group chat with you.</Text>
      </ScrollView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  heading: { ...typography.title, color: colors.text },
  body: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xxl },
  label: { ...typography.smallStrong, color: colors.textMuted, marginTop: spacing.xs },
  row: { gap: spacing.sm },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: radius.pill, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.brand },
  chipText: { ...typography.smallStrong, fontSize: 14, color: colors.text },
  chipTextOn: { color: colors.brandInk },
  input: { ...typography.body, color: colors.text, minHeight: 46, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, backgroundColor: colors.bgElevated, outlineStyle: 'none' } as object,
  picked: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 46, borderRadius: 14, backgroundColor: colors.brandDim },
  pickedText: { flex: 1, ...typography.bodyStrong, color: colors.brand },
  courtRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, paddingVertical: 8 },
  courtName: { flex: 1, ...typography.body, ...font('500'), color: colors.text },
  courtMeta: { ...typography.small, color: colors.textMuted },
  error: { ...typography.small, color: colors.danger },
  post: { height: 50, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  postText: { ...typography.bodyStrong, color: colors.brandInk },
  fine: { ...typography.caption, letterSpacing: 0, color: colors.textFaint, textAlign: 'center' },
});

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { DragSheet } from '@/components/DragSheet';
import { Field } from '@/components/ui';
import { ChipStrip, Chips, Fine, Section, SheetTitle, Submit, Tiles, formBody } from '@/components/sheet/SheetForm';
import { LinearGradient } from 'expo-linear-gradient';
import type { HitRequest } from '@/data/types';
import { fetchCourts, type Court } from '@/features/players/courts';
import { formatMiles, milesBetween } from '@/features/players/geo';
import { homeFor } from '@/features/players/positions';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
const FORMAT_LABEL: Record<HitRequest['format'], string> = { singles: 'Singles', doubles: 'Doubles', hit: 'Just hitting' };

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
  // Nearest first. OpenStreetMap leaves most public courts unnamed, and five
  // rows of "Tennis courts" told you nothing: at most two of those show, as
  // "Public courts", told apart by distance and size.
  const nearby = (() => {
    const q = typed.trim().toLowerCase();
    const sorted = courts
      .map((c) => ({ c, miles: home ? milesBetween(home, c) : 0 }))
      .filter(({ c }) => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => a.miles - b.miles);
    const out: { c: Court; miles: number; label: string }[] = [];
    let unnamed = 0;
    for (const x of sorted) {
      const plain = x.c.name === 'Tennis courts';
      if (plain && unnamed >= 2) continue;
      if (plain) unnamed += 1;
      out.push({ ...x, label: plain ? 'Public courts' : x.c.name });
      if (out.length === 4) break;
    }
    return out;
  })();
  // The invite as it will read, updated as you choose.
  const dayWord = day === 0 ? 'Today' : day === 1 ? 'Tomorrow' : days[day].toLocaleDateString([], { weekday: 'long' });
  const summary = [FORMAT_LABEL[format], `${dayWord} at ${hourLabel(hour)}`, where?.name].filter(Boolean).join(' · ');

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
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={() => router.back()} peekFraction={0.86}
      header={<SheetTitle title="Looking for a hit" line={summary} lineTone="brand" onClose={() => setCloseSignal((n) => n + 1)} />}>
      <ScrollView contentContainerStyle={formBody} keyboardShouldPersistTaps="handled">
        <Section title="When">
          <Tiles scroll value={day} onChange={setDay} options={days.map((d, i) => ({ value: i, top: i === 0 ? 'Today' : d.toLocaleDateString([], { weekday: 'short' }), main: String(d.getDate()), label: d.toDateString() }))} />
          <ChipStrip value={hour} onChange={setHour} options={hours.map((h) => ({ value: h, label: hourLabel(h) }))} />
        </Section>

        <Section title="Where">
          <View style={styles.search}>
            <Ionicons name="search" size={16} color={colors.textFaint} />
            <TextInput value={place ? '' : typed} onChangeText={(t) => { setTyped(t); setPlace(null); }} placeholder={place ? place.name : 'Search courts, or type a place'} placeholderTextColor={place ? colors.text : colors.textFaint} style={styles.searchInput} accessibilityLabel="Where" />
          </View>
          {/* The nearest courts, swiped through: one row, not a tall list. */}
          {nearby.length ? (
            <View style={{ marginHorizontal: -spacing.lg }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.courts}>
                {nearby.map(({ c, miles, label }) => {
                  const chosen = place?.lat === c.lat && place?.lng === c.lng;
                  return (
                    <Pressable key={c.id} accessibilityRole="radio" accessibilityState={{ selected: chosen }} accessibilityLabel={`${label}, ${formatMiles(miles)}`} onPress={() => { setPlace(chosen ? null : { name: c.name === 'Tennis courts' ? label : c.name, lat: c.lat, lng: c.lng }); setTyped(''); }} style={({ pressed }) => [styles.court, chosen && styles.courtOn, pressed && !chosen && { opacity: 0.8 }]}>
                      <Text style={[styles.courtName, chosen && styles.courtInk]} numberOfLines={1}>{label}</Text>
                      <Text style={[styles.courtMeta, chosen && styles.courtInkSoft]} numberOfLines={1}>{[formatMiles(miles), c.count > 1 ? `${c.count} courts` : null, c.lit ? 'lights' : null].filter(Boolean).join(' · ')}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <LinearGradient pointerEvents="none" colors={[`${colors.bg}00`, colors.bg]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.fade} />
            </View>
          ) : null}
        </Section>

        <Section title="Game">
          <Chips value={format} onChange={(f) => { if (!f) return; setFormat(f); setSpots(f === 'doubles' ? 3 : 1); }} options={[{ value: 'singles', label: 'Singles' }, { value: 'doubles', label: 'Doubles' }, { value: 'hit', label: 'Just hitting' }]} />
        </Section>

        {/* Level and how many, side by side: two small choices, one line. */}
        <View style={styles.pair}>
          <View style={{ flex: 1 }}>
            <Section title="Level">
              <Chips value={level} onChange={(v) => { if (v) setLevel(v); }} options={[{ value: 'mine', label: rating ? `Around ${rating.toFixed(1)}` : 'My level' }, { value: 'any', label: 'Any' }]} />
            </Section>
          </View>
          <Section title="Players">
            <View style={styles.stepper}>
              <Pressable accessibilityRole="button" accessibilityLabel="One fewer" disabled={spots <= 1} onPress={() => setSpots((n) => Math.max(1, n - 1))} style={[styles.step, spots <= 1 && { opacity: 0.35 }]}>
                <Ionicons name="remove" size={16} color={colors.text} />
              </Pressable>
              <Text style={styles.stepValue} accessibilityLiveRegion="polite">{spots}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="One more" disabled={spots >= 3} onPress={() => setSpots((n) => Math.min(3, n + 1))} style={[styles.step, spots >= 3 && { opacity: 0.35 }]}>
                <Ionicons name="add" size={16} color={colors.text} />
              </Pressable>
            </View>
          </Section>
        </View>

        <Field soft value={note} onChangeText={(v) => setNote(v.slice(0, 280))} placeholder="Anything else? (optional)" multiline minHeight={56} />
        {past ? <Text style={styles.error}>That time has passed. Pick a later one.</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Submit label="Post" onPress={post} disabled={!ready} busy={saving} waiting={past ? 'Pick a later time' : 'Choose where to play'} />
        <Fine>Players nearby see it on Find Players. Whoever joins gets a chat with you.</Fine>
      </ScrollView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  error: { ...typography.small, color: colors.danger },
  // The same lifted pill as the Coaching page's "What are you stuck on?".
  search: { ...lift, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.lg, height: 50, borderRadius: radius.pill, backgroundColor: colors.surface },
  searchInput: { flex: 1, minWidth: 0, height: 50, fontSize: 16, color: colors.text, outlineStyle: 'none' } as object,
  courts: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 6, paddingRight: spacing.xl },
  court: { ...lift, width: 156, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, backgroundColor: colors.surface, gap: 2 },
  courtOn: { backgroundColor: colors.text },
  courtName: { ...typography.bodyStrong, color: colors.text },
  courtMeta: { ...typography.small, color: colors.textMuted },
  courtInk: { color: colors.bg },
  courtInkSoft: { color: colors.bg, opacity: 0.75 },
  fade: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 32 },
  pair: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 34 },
  step: { ...lift, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 14, textAlign: 'center', fontSize: 16, ...font('600'), color: colors.text, fontVariant: ['tabular-nums'] },
});

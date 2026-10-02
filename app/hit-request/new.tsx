import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import { DragSheet } from '@/components/DragSheet';
import { CourtSearch } from '@/components/CourtSearch';
import { Field } from '@/components/ui';
import { ChipStrip, Chips, Fine, Section, SheetTitle, Submit, Tiles, formBody } from '@/components/sheet/SheetForm';
import type { HitRequest } from '@/data/types';
import { isMapCourtId } from '@/features/places/courtName';
import { fetchCourts, type Court } from '@/features/players/courts';
import { homeFor } from '@/features/players/positions';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
/** "6:00 AM" or "6:30 AM": the hour with its minutes. */
const timeLabel = (h: number, half: boolean) => `${h % 12 || 12}:${half ? '30' : '00'} ${h < 12 ? 'AM' : 'PM'}`;
const FORMAT_LABEL: Record<HitRequest['format'], string> = { singles: 'Singles', doubles: 'Doubles', hit: 'Just hitting' };

/**
 * Looking for a hit: when (a day and an hour), where (a court near you, or
 * typed), what level, singles or doubles or just hitting, and how many spots.
 * It goes up on Find Players; whoever says "I'm in" lands in a chat with you.
 * Once it is up, a note offers to send it into your chats and groups too,
 * for the friends who might want the spot. Opened from a court ("Play
 * here"), that court is already where.
 */
export default function NewHit() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, detectedCoords, actions } = useApp();
  const [closeSignal, setCloseSignal] = useState(0);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d; }), []);
  // Late in the evening there is no hour left today: start on tomorrow.
  const [day, setDay] = useState(new Date().getHours() >= 21 ? 1 : 0);
  const nextHour = Math.min(21, Math.max(6, new Date().getHours() + 1));
  const [hour, setHourOnly] = useState(nextHour);
  // Courts book on the half hour too: picking an hour offers its :30 underneath, on the hour until chosen.
  const [half, setHalf] = useState(false);
  const setHour = (h: number) => { setHourOnly(h); setHalf(false); };
  // "Play here" on a court's page or card: that court is chosen, its map id kept
  // (when it has one) so the hit shows on the court's page.
  const params = useLocalSearchParams<{ courtId?: string; courtName?: string; lat?: string; lng?: string }>();
  const [place, setPlace] = useState<HitRequest['place'] | null>(() => {
    const name = params.courtName?.trim();
    const lat = Number(params.lat); const lng = Number(params.lng);
    if (!name || !params.lat || !params.lng || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { ...(isMapCourtId(params.courtId) ? { id: params.courtId } : {}), name: name.slice(0, 120), lat, lng };
  });
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
  // The hit just posted, so the note after the sheet has gone can offer to send it.
  const posted = useRef<string | null>(null);

  const start = new Date(days[day]); start.setHours(hour, half ? 30 : 0, 0, 0);
  const past = start.getTime() < Date.now() - 30 * 60_000;
  // Only a chosen court, or a place you chose to use as typed: half a word in the box is not a place yet.
  const where = place;
  const ready = !!where && !past && !saving;
  // The invite as it will read, updated as you choose.
  const dayWord = day === 0 ? 'Today' : day === 1 ? 'Tomorrow' : days[day].toLocaleDateString([], { weekday: 'long' });
  const summary = [FORMAT_LABEL[format], `${dayWord} at ${half ? timeLabel(hour, true) : hourLabel(hour)}`, where?.name].filter(Boolean).join(' · ');

  const post = async () => {
    if (!ready || !where) return;
    setSaving(true);
    setError('');
    try {
      const step = currentUser?.profile.skillSystem === 'UTR' ? 1 : 0.5;
      posted.current = await actions.postHit({
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

  // Away first, then the note: its "Send to a chat" opens the Send-to sheet over the page, never over this sheet on its way out.
  const done = () => {
    router.back();
    const id = posted.current;
    if (!id) return;
    showToast({
      title: 'Your hit is up',
      body: 'Players nearby see it on Find Players',
      icon: 'checkmark-circle-outline',
      action: { label: 'Send to a chat', onPress: () => router.push({ pathname: '/share', params: { kind: 'hit-request', id } }) },
    });
  };

  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={done} peekFraction={0.86}
      header={<SheetTitle title="Looking for a hit" line={summary} lineTone="brand" onClose={() => setCloseSignal((n) => n + 1)} />}>
      <ScrollView contentContainerStyle={formBody} keyboardShouldPersistTaps="handled">
        <Section title="When">
          <Tiles scroll value={day} onChange={setDay} options={days.map((d, i) => ({ value: i, top: i === 0 ? 'Today' : d.toLocaleDateString([], { weekday: 'short' }), main: String(d.getDate()), label: d.toDateString() }))} />
          <ChipStrip value={hour} onChange={setHour} options={hours.map((h) => ({ value: h, label: hourLabel(h) }))} />
          {/* The chosen hour, on the hour or at half past: chips the same size as the hours, sliding in under them. */}
          <Animated.View key={hour} entering={FadeInDown.duration(200)}>
            <ChipStrip value={half ? 30 : 0} onChange={(m) => setHalf(m === 30)} options={[{ value: 0, label: timeLabel(hour, false) }, { value: 30, label: timeLabel(hour, true) }]} />
          </Animated.View>
        </Section>

        <Section title="Where">
          <CourtSearch home={home} nearby={courts} chosen={place} onChoose={setPlace} typed={typed} onType={(t) => { setTyped(t); setPlace(null); }} />
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
  pair: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 34 },
  step: { ...lift, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 14, textAlign: 'center', fontSize: 16, ...font('600'), color: colors.text, fontVariant: ['tabular-nums'] },
});

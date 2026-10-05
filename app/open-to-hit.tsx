import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { DragSheet } from '@/components/DragSheet';
import { ChipStrip, Chips, Section, SheetTitle, Submit, formBody } from '@/components/sheet/SheetForm';
import { onTeenMap } from '@/features/players/mapPrivacy';
import { HIT_MILES, asHitMiles, clockWords, endOfToday, isOpenToHit, tillLabel, todayAt } from '@/features/players/openToHit';
import { useOpenToHitToggle } from '@/features/players/useLocationToggle';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';

/** The quick picks for "Open until", and "Pick a time" for any other. */
type Until = 'two-hours' | 'six' | 'nine' | 'midnight' | 'time';
type Distance = 'any' | `${(typeof HIT_MILES)[number]}`;

/** "7 PM": an hour on the time picker's strip, the way the hit form says it. */
const hourLabel = (d: Date) => `${d.getHours() % 12 || 12} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
/** "7:00 PM" or "7:30 PM". */
const timeLabel = (d: Date, half: boolean) => `${d.getHours() % 12 || 12}:${half ? '30' : '00'} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
/** How many hours ahead the time picker reaches: past midnight and through the next morning. */
const PICKER_HOURS = 18;
/** A quick pick is offered only while it is at least this far ahead. */
const LEAD_MS = 15 * 60_000;

/**
 * Holding your own ring in Community's Open to hit row (Oct 5, owner: "I
 * think holding is better for edit"): until when you are open (2 hours, till
 * 6pm, till 9pm, till midnight, or any time you pick) and how far you'd like
 * to go for a hit (5, 10 or 25 miles, or any). Save puts your green ring on
 * with both. The distance is shown on your card to players farther away,
 * with a friendly line; it never hides you from anyone. A tap on the ring
 * itself still just turns it on (till midnight) or off.
 */
export default function OpenToHitSheet() {
  const { currentUser, locationEnabled, teenMap } = useApp();
  const toggleOpen = useOpenToHitToggle();
  const [closeSignal, setCloseSignal] = useState(0);
  const close = () => setCloseSignal((n) => n + 1);
  // The moment the sheet opened: the quick picks and the picker's hours are worked out from it.
  const [opened] = useState(() => new Date());
  const current = currentUser && isOpenToHit(currentUser) ? new Date(currentUser.openToHitUntil!) : null;
  const six = todayAt(18);
  const nine = todayAt(21);
  const ahead = (d: Date) => d.getTime() - opened.getTime() >= LEAD_MS;

  // Every hour start the picker offers: from the next one, on through the night.
  const hours = useMemo(() => Array.from({ length: PICKER_HOURS }, (_, i) => {
    const d = new Date(opened);
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + i + 1);
    return d;
  }), [opened]);

  // Starts on what you have now: your own time, else till midnight (what a tap gives).
  const [until, setUntil] = useState<Until>(() => {
    if (!current) return 'midnight';
    const midnight = (current.getHours() === 23 && current.getMinutes() === 59) || (current.getHours() === 0 && current.getMinutes() === 0);
    if (midnight) return 'midnight';
    if (current.getTime() === six.getTime() && ahead(six)) return 'six';
    if (current.getTime() === nine.getTime() && ahead(nine)) return 'nine';
    return 'time';
  });
  // The picker starts on your own time when it is one of its own (not midnight, which has its chip), else the next hour.
  const picked = current && until === 'time' ? current : null;
  const startHour = useMemo(() => {
    if (!picked) return 0;
    const i = hours.findIndex((h) => h.getHours() === picked.getHours() && h.getDate() === picked.getDate());
    return i >= 0 ? i : 0;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [hour, setHourOnly] = useState(startHour);
  const [half, setHalf] = useState(() => !!picked && picked.getMinutes() >= 30 && hours[startHour]?.getHours() === picked.getHours());
  const setHour = (i: number) => { setHourOnly(i); setHalf(false); };

  const [distance, setDistance] = useState<Distance>(() => {
    const m = asHitMiles(currentUser?.openToHitMiles);
    return m ? (String(m) as Distance) : 'any';
  });
  const [saving, setSaving] = useState(false);
  // Opened only as tall as the form (it grows when "Pick a time" opens the picker).
  const [contentH, setContentH] = useState(0);

  /** The moment chosen, worked out when it is needed ("2 hours" from when Save is pressed). */
  const untilAt = (now = new Date()): Date => {
    if (until === 'two-hours') return new Date(now.getTime() + 2 * 3_600_000);
    if (until === 'six') return six;
    if (until === 'nine') return nine;
    if (until === 'midnight') return new Date(endOfToday());
    const d = new Date(hours[hour] ?? hours[0]);
    if (half) d.setMinutes(30);
    return d;
  };
  const chosen = untilAt(opened);
  const miles = distance === 'any' ? null : Number(distance);
  const summary = [tillLabel(chosen.toISOString()) ?? `till ${clockWords(chosen)}`, miles ? `within ${miles} mi` : 'any distance'].join(' · ');
  const past = chosen.getTime() <= Date.now();
  // A teen's ring (and so their distance) is seen only by friends who follow each other with them (migration 78).
  const teen = onTeenMap(currentUser, teenMap);

  const save = async () => {
    if (!currentUser || saving) return;
    const at = untilAt();
    if (at.getTime() <= Date.now()) return;
    setSaving(true);
    const on = await toggleOpen(true, { until: at.toISOString(), miles });
    setSaving(false);
    if (!on) return;
    // Open, but not on the map: say so, and leave Location to them (as the ring's tap does).
    if (!locationEnabled) showToast({ title: 'You’re open to hit', body: teen ? 'Turn on Location to show your friends who follow you back.' : 'Turn on Location to show on the map.', icon: 'navigate-outline' });
    close();
  };

  const quick: { value: Until; label: string }[] = [
    { value: 'two-hours', label: '2 hours' },
    ...(ahead(six) ? [{ value: 'six' as const, label: 'Till 6pm' }] : []),
    ...(ahead(nine) ? [{ value: 'nine' as const, label: 'Till 9pm' }] : []),
    { value: 'midnight', label: 'Till midnight' },
    { value: 'time', label: 'Pick a time' },
  ];

  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={() => router.back()} peekFraction={0.8} contentHeight={contentH || undefined}
      header={<SheetTitle title="Open to hit" line={summary} lineTone="brand" onClose={close} />}>
      <ScrollView contentContainerStyle={formBody} keyboardShouldPersistTaps="handled" onContentSizeChange={(_, h) => { const r = Math.ceil(h); if (r !== contentH) setContentH(r); }}>
        <Section title="Open until">
          <Chips value={until} onChange={(v) => { if (v) setUntil(v); }} options={quick} />
          {/* Any other time: the hour, then on the hour or half past, as the hit form picks a time. */}
          {until === 'time' ? (
            <Animated.View entering={FadeInDown.duration(200)} style={styles.picker}>
              <ChipStrip value={hour} onChange={setHour} options={hours.map((h, i) => ({ value: i, label: hourLabel(h) }))} />
              <Animated.View key={hour} entering={FadeInDown.duration(200)}>
                <ChipStrip value={half ? 30 : 0} onChange={(m) => setHalf(m === 30)} options={[{ value: 0, label: timeLabel(hours[hour] ?? hours[0], false) }, { value: 30, label: timeLabel(hours[hour] ?? hours[0], true) }]} />
              </Animated.View>
            </Animated.View>
          ) : null}
        </Section>

        <Section title="Distance you’d like to hit within" hint={teen ? 'Friends who follow you back see it on your card.' : 'Shown on your card. Players farther away still see you.'}>
          <Chips value={distance} onChange={(v) => { if (v) setDistance(v); }} options={[...HIT_MILES.map((m) => ({ value: String(m) as Distance, label: `${m} mi` })), { value: 'any' as const, label: 'Any' }]} />
        </Section>

        <Submit label="Save" onPress={() => { void save(); }} disabled={past || !currentUser} waiting="Pick a later time" busy={saving} busyLabel="Saving…" />
      </ScrollView>
    </DragSheet>
  );
}

const styles = StyleSheet.create({
  picker: { gap: 8, marginTop: 4 },
});

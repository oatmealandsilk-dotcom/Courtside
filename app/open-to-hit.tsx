import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { DragSheet } from '@/components/DragSheet';
import { ChipStrip, Chips, Section, SheetTitle, Submit, formBody } from '@/components/sheet/SheetForm';
import { onTeenMap } from '@/features/players/mapPrivacy';
import { HIT_MILES, asHitMiles, clockWords, endOfToday, isOpenToHit, onTheMinute, tillLabel, todayAt } from '@/features/players/openToHit';
import { useLocationToggle, useOpenToHitToggle } from '@/features/players/useLocationToggle';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

/** The quick picks for "Open until", "Pick a time" for any other, and "keep": the time your ring has now, when it is none of the others. */
type Until = 'keep' | 'two-hours' | 'six' | 'nine' | 'midnight' | 'time';
type Distance = 'any' | `${(typeof HIT_MILES)[number]}`;

/** How far ahead the time picker reaches: past midnight and through the next morning. */
const PICKER_HOURS = 18;
/** A quick pick is offered only while it is at least this far ahead. */
const LEAD_MS = 15 * 60_000;
/** "2 hours" lands on a quarter hour. */
const QUARTER_MS = 15 * 60_000;
const HALF_HOUR_MS = 30 * 60_000;

/**
 * Holding your own ring in Community's Open to hit row, or tapping the "till
 * midnight" under it (Oct 5, owner: "I think holding is better for edit"):
 * until when you are open (2 hours, till 6pm, till 9pm, till midnight, or
 * any half hour you pick from one strip) and how far you'd go for a hit (5,
 * 10 or 25 miles, or any). The button says what it does: "I'm free till 9pm"
 * puts your ring on when it is off; "Save" keeps it on with the change, with
 * a quiet "Turn off" under it. The distance is shown on your card to players
 * farther away, with a friendly line; it never hides you from anyone. A tap
 * on the ring itself still just turns it on (till midnight) or off.
 */
export default function OpenToHitSheet() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, locationEnabled, teenMap } = useApp();
  const toggleOpen = useOpenToHitToggle();
  const location = useLocationToggle();
  const [closeSignal, setCloseSignal] = useState(0);
  const close = () => setCloseSignal((n) => n + 1);
  // The moment the sheet opened: the quick picks and the picker's times are worked out from it.
  const [opened] = useState(() => new Date());
  // Now, moved on twice a minute while the sheet is open, so the line at the top always says what the button will save.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  // Your ring as the sheet opened: on or off, and its time when on (on the minute, to compare with the picks).
  const [wasOn] = useState(() => !!currentUser && isOpenToHit(currentUser));
  const [currentAt] = useState(() => (currentUser && isOpenToHit(currentUser) ? new Date(currentUser.openToHitUntil!) : null));
  const current = currentAt ? onTheMinute(currentAt) : null;
  const six = todayAt(18);
  const nine = todayAt(21);
  const ahead = (d: Date) => d.getTime() - opened.getTime() >= LEAD_MS;

  // Every half hour the picker offers, in one strip: from the next one, on through the night.
  const slots = useMemo(() => {
    const first = new Date(Math.ceil((opened.getTime() + 60_000) / HALF_HOUR_MS) * HALF_HOUR_MS);
    return Array.from({ length: PICKER_HOURS * 2 }, (_, i) => new Date(first.getTime() + i * HALF_HOUR_MS));
  }, [opened]);

  // Starts on what you have now: one of the quick picks when it is one, else
  // your own time as its own chip ("Till 6:47pm"), kept exactly as it is
  // until another is tapped; with your ring off, till midnight (what a tap gives).
  const [until, setUntil] = useState<Until>(() => {
    if (!current) return 'midnight';
    if (current.getTime() === onTheMinute(endOfToday()).getTime()) return 'midnight';
    if (current.getTime() === six.getTime() && ahead(six)) return 'six';
    if (current.getTime() === nine.getTime() && ahead(nine)) return 'nine';
    return 'keep';
  });
  // Its chip stays in the row once another is tapped, so you can go back to it.
  const [startedOnKeep] = useState(until === 'keep');
  // "Pick a time" starts on your own time when it is one of its own (on the hour or half past, and
  // not midnight, which has its own chip), else the first one.
  const [slot, setSlot] = useState(() => {
    if (!current || until === 'midnight') return 0;
    const at = slots.findIndex((d) => d.getTime() === current.getTime());
    return at < 0 ? 0 : at;
  });

  const [distance, setDistance] = useState<Distance>(() => {
    const m = asHitMiles(currentUser?.openToHitMiles);
    return m ? (String(m) as Distance) : 'any';
  });
  const [saving, setSaving] = useState(false);
  // Opened only as tall as the form (it grows when "Pick a time" opens the picker).
  const [contentH, setContentH] = useState(0);

  /** The moment chosen: what the line at the top says, and what the button saves. */
  const untilAt = (): Date => {
    // Two hours from now, up to the next quarter hour ("till 7:45pm", never "till 7:38pm").
    if (until === 'two-hours') return new Date(Math.ceil((now + 2 * 3_600_000) / QUARTER_MS) * QUARTER_MS);
    if (until === 'six') return six;
    if (until === 'nine') return nine;
    if (until === 'midnight') return new Date(endOfToday());
    if (until === 'keep' && currentAt) return currentAt;
    return slots[slot] ?? slots[0];
  };
  const chosen = untilAt();
  const miles = distance === 'any' ? null : Number(distance);
  const tillWords = tillLabel(chosen.toISOString()) ?? `till ${clockWords(chosen)}`;
  const summary = [tillWords, miles ? `within ${miles} mi` : 'any distance'].join(' · ');
  const past = chosen.getTime() <= Date.now();
  // A teen's ring (and so their distance) is seen only by friends who follow each other with them (migration 78).
  const teen = onTeenMap(currentUser, teenMap);

  const save = async () => {
    if (!currentUser || saving) return;
    const at = chosen;
    if (at.getTime() <= Date.now()) return;
    setSaving(true);
    const on = await toggleOpen(true, { until: at.toISOString(), miles });
    setSaving(false);
    if (!on) return;
    haptics.commit();
    // Open, but not on the map: say so, with the one tap that fixes it (as the ring's tap does).
    if (!locationEnabled) {
      showToast({
        title: 'You’re open to hit',
        body: teen ? 'Friends see it once Location is on.' : 'Off the map until Location is on.',
        icon: 'navigate-outline',
        action: { label: 'Turn on', onPress: () => { void location.toggle(); } },
      });
    }
    close();
  };
  const turnOff = async () => {
    if (saving) return;
    haptics.tap();
    await toggleOpen(false);
    close();
  };

  // Your own time, when it is none of the quick picks: kept as it is unless you pick another.
  const keepWords = current ? (tillLabel(current.toISOString()) ?? `till ${clockWords(current)}`) : null;
  const quick: { value: Until; label: string }[] = [
    ...(keepWords && startedOnKeep ? [{ value: 'keep' as const, label: `T${keepWords.slice(1)}` }] : []),
    { value: 'two-hours', label: '2 hours' },
    ...(ahead(six) ? [{ value: 'six' as const, label: 'Till 6pm' }] : []),
    ...(ahead(nine) ? [{ value: 'nine' as const, label: 'Till 9pm' }] : []),
    { value: 'midnight', label: 'Till midnight' },
    { value: 'time', label: 'Pick a time' },
  ];

  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={() => router.back()} peekFraction={0.8} contentHeight={contentH || undefined}
      header={<SheetTitle title="Open to hit" line={summary} onClose={close} />}>
      <ScrollView contentContainerStyle={formBody} keyboardShouldPersistTaps="handled" onContentSizeChange={(_, h) => { const r = Math.ceil(h); if (r !== contentH) setContentH(r); }}>
        <Section title="Open until">
          <Chips value={until} onChange={(v) => { if (v) setUntil(v); }} options={quick} />
          {/* Any other time: one strip of half hours, from the next one on through the night. */}
          {until === 'time' ? (
            <Animated.View entering={FadeInDown.duration(200)} style={styles.picker}>
              <ChipStrip value={slot} onChange={setSlot} options={slots.map((d, i) => ({ value: i, label: clockWords(d) }))} />
            </Animated.View>
          ) : null}
        </Section>

        <Section title="How far you’ll go" hint={teen ? 'Friends who follow you back see it on your card.' : 'Players farther away still see you.'}>
          <Chips value={distance} onChange={(v) => { if (v) setDistance(v); }} options={[...HIT_MILES.map((m) => ({ value: String(m) as Distance, label: `${m} mi` })), { value: 'any' as const, label: 'Any' }]} />
        </Section>

        <Submit label={wasOn ? 'Save' : `I’m free ${tillWords}`} onPress={() => { void save(); }} disabled={past || !currentUser} waiting="Pick a later time" busy={saving} busyLabel="Saving…" />
        {wasOn ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Turn off open to hit" hitSlop={8} onPress={() => { void turnOff(); }} style={({ pressed }) => [styles.off, pressed && { opacity: 0.6 }]}>
            <Text style={styles.offText}>Turn off</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  picker: { marginTop: 4 },
  // The quiet way out, under the green one: a ghost link, the size of a finger.
  off: { alignSelf: 'center', minHeight: 44, paddingHorizontal: spacing.xl, justifyContent: 'center', marginTop: -spacing.sm },
  offText: { ...typography.smallStrong, color: colors.textMuted },
});

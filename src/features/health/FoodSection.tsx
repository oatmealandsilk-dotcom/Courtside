import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Tappable } from '@/components/Tappable';
import { BrandWash } from '@/components/ui/BrandWash';
import { appleHealthAvailable, connectAppleFood, inExpoGo, readAppleNutritionFrom, type FoodDayFrom } from '@/features/health/appleHealth';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';

/*
 * Food, from Cronometer or MyFitnessPal, by way of Apple Health: neither app
 * lets new developers read it directly, but both write each day's calories,
 * protein, carbs and fat into Health once their own sharing switch is on.
 * This card reads those totals on the phone and shows them here, and nowhere
 * else: nothing is sent to the server, posted, or shown to anyone.
 *
 * Android's Health Connect would need a native module this build does not
 * carry, so Android and the website get a short note instead.
 */

/** Whether this phone has asked Health for food before, per account, so the card reads straight away next time. */
const askedKey = (userId: string | null) => `courtside-food-asked:${userId ?? 'anyone'}`;

/** Today on this phone, as Health's day keys are written (YYYY-MM-DD, local time). */
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The last seven days on this phone, oldest first, with whatever Health had for each. */
function lastWeek(days: FoodDayFrom[]): (FoodDayFrom & { label: string; isToday: boolean })[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const out: (FoodDayFrom & { label: string; isToday: boolean })[] = [];
  for (let back = 6; back >= 0; back -= 1) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - back);
    const date = localDay(d);
    out.push({ ...(byDate.get(date) ?? { date }), label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), isToday: back === 0 });
  }
  return out;
}

type Phase = 'idle' | 'asking' | 'reading' | 'ready';

/** The card's state: whether it has asked, and the week it read. */
function useFood(userId: string | null) {
  const [asked, setAsked] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [days, setDays] = useState<FoodDayFrom[]>([]);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const read = useCallback(async () => {
    setPhase((p) => (p === 'ready' ? p : 'reading'));
    const got = await readAppleNutritionFrom(7).catch(() => [] as FoodDayFrom[]);
    if (!alive.current) return;
    setDays(got);
    setPhase('ready');
  }, []);

  useEffect(() => {
    let on = true;
    if (!appleHealthAvailable()) { setAsked(false); return; }
    AsyncStorage.getItem(askedKey(userId)).then((v) => { if (on) setAsked(v !== null); }, () => { if (on) setAsked(false); });
    return () => { on = false; };
  }, [userId]);

  // Read again whenever the page comes back into view: the food app may have written since.
  useFocusEffect(useCallback(() => { if (asked) void read(); }, [asked, read]));

  const connect = useCallback(async () => {
    setPhase('asking');
    try {
      await connectAppleFood();
      try { await AsyncStorage.setItem(askedKey(userId), new Date().toISOString()); } catch { /* It asks again next visit; Health remembers the answer. */ }
      if (!alive.current) return;
      haptics.commit();
      setAsked(true);
      await read();
    } catch (err) {
      if (!alive.current) return;
      setPhase('idle');
      showToast({ title: 'Could not open Apple Health', body: err instanceof Error ? err.message : 'Try again in a moment.', icon: 'alert-circle-outline' });
    }
  }, [userId, read]);

  return { asked, phase, days, connect, read };
}

const kcal = (n: number) => `${Math.round(n).toLocaleString()}`;

export function FoodSection({ userId }: { userId: string | null }) {
  const styles = useThemedStyles(styleDefinitions);
  const { asked, phase, days, connect, read } = useFood(userId);
  const healthHere = appleHealthAvailable();

  const header = (
    <View style={styles.head}>
      <Text style={styles.title}>Food</Text>
      <Text style={styles.private}>Only you see this</Text>
    </View>
  );

  // The website, Android, and an iPhone build without HealthKit (Expo Go).
  if (!healthHere) {
    // Expo Go can never have HealthKit; an App Store build without it needs the next app update, not a different app.
    const line = Platform.OS !== 'ios'
      ? 'Available in the iPhone app: it reads the daily food totals Cronometer and MyFitnessPal save to Apple Health.'
      : inExpoGo()
        ? 'Calories, protein, carbs and fat from Cronometer or MyFitnessPal show here in the App Store version of CourtSide.'
        : 'Calories, protein, carbs and fat from Cronometer or MyFitnessPal are coming in the next app update.';
    return (
      <View style={styles.section}>
        {header}
        <View style={[styles.card, styles.noteCard]}>
          <Ionicons name="phone-portrait-outline" size={18} color={colors.textMuted} />
          <Text style={styles.note}>{line}</Text>
        </View>
      </View>
    );
  }

  // Still reading whether this phone asked before: nothing yet, rather than a button that vanishes.
  if (asked === null) return null;

  // Not asked yet on this phone: one card, one button.
  if (!asked) {
    const busy = phase === 'asking';
    return (
      <View style={styles.section}>
        {header}
        <View style={styles.card}>
          <View style={styles.connectRow}>
            <View style={styles.disc}><Ionicons name="nutrition-outline" size={20} color={colors.text} /></View>
            <View style={styles.words}>
              <Text style={styles.name}>Connect Cronometer or MyFitnessPal</Text>
              <Text style={styles.line}>Reads the daily food totals they save to Apple Health.</Text>
            </View>
          </View>
          <Tappable accessibilityRole="button" accessibilityLabel="Connect food through Apple Health" disabled={busy} scaleTo={0.97} onPress={() => { haptics.tap(); void connect(); }} style={styles.primary}>
            <BrandWash />
            {busy ? <ActivityIndicator size="small" color={colors.brandInk} /> : <Ionicons name="heart-outline" size={16} color={colors.brandInk} />}
            <Text style={styles.primaryText}>{busy ? 'Opening Apple Health…' : 'Allow in Apple Health'}</Text>
          </Tappable>
          <Text style={styles.how}>First, in Cronometer or MyFitnessPal, turn on sharing with Apple Health.</Text>
        </View>
      </View>
    );
  }

  const week = lastWeek(days);
  const today = week[week.length - 1];
  const logged = week.filter((d) => (d.calories ?? 0) > 0);
  const top = Math.max(1, ...logged.map((d) => d.calories ?? 0));
  const average = logged.length ? logged.reduce((a, d) => a + (d.calories ?? 0), 0) / logged.length : 0;
  const reading = phase !== 'ready';
  const from = today.source ?? logged[logged.length - 1]?.source;

  // Asked, but Health has nothing for the week: say what to switch on, and offer to look again.
  if (!reading && !logged.length) {
    return (
      <View style={styles.section}>
        {header}
        <View style={styles.card}>
          <Text style={styles.name}>Nothing from your food app yet</Text>
          <Text style={styles.how}>In Cronometer or MyFitnessPal, turn on sharing with Apple Health and log a meal. If you said no to CourtSide, switch it on in the Health app under Sharing → Apps → CourtSide.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Check Apple Health again" onPress={() => { haptics.tap(); void read(); }} style={({ pressed }) => [styles.small, pressed && styles.pressedDim]}>
            <Ionicons name="refresh" size={14} color={colors.text} /><Text style={styles.smallText}>Check again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const macro = (label: string, grams: number | undefined) => (
    <View style={styles.macro}>
      <Text style={styles.macroValue} numberOfLines={1}>{grams ? `${grams}g` : '—'}</Text>
      <Text style={styles.macroLabel} numberOfLines={1}>{label}</Text>
    </View>
  );

  return (
    <View style={styles.section}>
      {header}
      <View style={styles.card}>
        {reading && !logged.length ? (
          <View style={styles.loading}><ActivityIndicator color={colors.textMuted} /></View>
        ) : (
          <>
            <View style={styles.todayRow}>
              <View style={styles.words}>
                <Text style={styles.kicker}>Today</Text>
                <Text style={styles.big} numberOfLines={1}>
                  {today.calories ? kcal(today.calories) : '—'}<Text style={styles.unit}> kcal</Text>
                </Text>
              </View>
              {from ? <Text style={styles.source} numberOfLines={1}>From {from}</Text> : null}
            </View>
            <View style={styles.macros}>
              {macro('Protein', today.proteinGrams)}
              {macro('Carbs', today.carbGrams)}
              {macro('Fat', today.fatGrams)}
            </View>

            <View style={styles.chart} accessible accessibilityLabel={`Calories, last 7 days. Average ${kcal(average)} kcal on ${logged.length} logged ${logged.length === 1 ? 'day' : 'days'}.`}>
              {week.map((d) => {
                const share = (d.calories ?? 0) / top;
                return (
                  <View key={d.date} style={styles.barCol}>
                    <View style={styles.barTrack}>
                      <View style={[styles.bar, d.isToday ? styles.barToday : null, !d.calories && styles.barEmpty, { height: d.calories ? `${Math.max(8, Math.round(share * 100))}%` : 3 }]} />
                    </View>
                    <Text style={[styles.barLabel, d.isToday && styles.barLabelToday]}>{d.label}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.caption}>Last 7 days · average {kcal(average)} kcal on days you logged</Text>
          </>
        )}

        <View style={styles.tip}>
          <Ionicons name="tennisball-outline" size={15} color={colors.brand} />
          <Text style={styles.tipText}>On a training or match day, a carb-based meal a few hours before you play and some protein afterwards helps most players feel fresher. General training information, not medical advice.</Text>
        </View>
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  section: { gap: spacing.sm, paddingBottom: spacing.xl },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { ...typography.heading, color: colors.text },
  private: { ...typography.small, color: colors.textFaint },
  card: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  noteCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  note: { ...typography.small, color: colors.textMuted, lineHeight: 19, flex: 1 },
  connectRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  disc: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  words: { flex: 1, gap: 3 },
  name: { ...typography.bodyStrong, color: colors.text },
  line: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  how: { ...typography.small, color: colors.textFaint, lineHeight: 18 },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 42, borderRadius: radius.pill, backgroundColor: colors.brand, overflow: 'hidden' },
  primaryText: { ...typography.smallStrong, color: colors.brandInk },
  small: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
  smallText: { ...typography.smallStrong, color: colors.text },
  pressedDim: { opacity: 0.55 },
  loading: { height: 120, alignItems: 'center', justifyContent: 'center' },
  todayRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  kicker: { ...typography.caption, color: colors.textMuted, textTransform: 'uppercase' },
  big: { ...typography.display, color: colors.text, fontVariant: ['tabular-nums'] },
  unit: { ...typography.small, color: colors.textMuted, letterSpacing: 0 },
  source: { ...typography.small, color: colors.textFaint, paddingBottom: 6, maxWidth: '45%' },
  macros: { flexDirection: 'row', gap: spacing.sm },
  macro: { flex: 1, gap: 2, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.bgElevated },
  macroValue: { ...typography.bodyStrong, color: colors.text, fontVariant: ['tabular-nums'] },
  macroLabel: { ...typography.caption, color: colors.textMuted, letterSpacing: 0.2 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, height: 84, paddingTop: spacing.sm },
  barCol: { flex: 1, alignItems: 'center', gap: 6, height: '100%' },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4, backgroundColor: colors.brandDim },
  barToday: { backgroundColor: colors.brand },
  barEmpty: { backgroundColor: colors.surfaceAlt },
  barLabel: { ...typography.caption, color: colors.textFaint },
  barLabelToday: { color: colors.text },
  caption: { ...typography.small, color: colors.textFaint },
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  tipText: { ...typography.small, color: colors.textMuted, lineHeight: 18, flex: 1 },
});

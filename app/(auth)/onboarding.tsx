import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Field, SegmentedControl } from '@/components/ui';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import type {
  Backhand,
  FitnessLevel,
  Handedness,
  PlayStyle,
  PlayerProfile,
  SkillSystem,
  SurfacePreference,
} from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

/* ------------------------------ Rating scales ----------------------------- */

interface Scale {
  min: number;
  max: number;
  /** What one press of the − / + controls moves the number by. */
  step: number;
  decimals: number;
  note: string;
  /** Sorted low to high: the first band the rating fits under describes it. */
  bands: { upTo: number; label: string; detail: string }[];
}

const SCALES: Record<SkillSystem, Scale> = {
  NTRP: {
    min: 1.5, max: 7.0, step: 0.5, decimals: 1,
    note: 'USTA National Tennis Rating Program, 1.5–7.0 in half points.',
    bands: [
      { upTo: 2.5, label: 'Learning to rally', detail: 'Getting the ball back; basic strokes still forming.' },
      { upTo: 3.0, label: 'Consistent at medium pace', detail: 'Rallies hold up; direction and depth still vary.' },
      { upTo: 3.5, label: 'Dependable strokes', detail: 'Directional control on moderate shots; spin developing.' },
      { upTo: 4.0, label: 'Constructing points', detail: 'Reliable on both wings; beginning to build rallies with intent.' },
      { upTo: 4.5, label: 'Pace and spin on demand', detail: 'Controls pace, uses spin deliberately, handles power.' },
      { upTo: 5.0, label: 'A weapon and a plan', detail: 'Anticipates well; has a shot or strategy to build around.' },
      { upTo: 5.5, label: 'Tournament standard', detail: 'Power and consistency at competitive tournament level.' },
      { upTo: 7.0, label: 'Sectional and above', detail: 'National or international level of play.' },
    ],
  },
  UTR: {
    min: 1.0, max: 16.5, step: 0.1, decimals: 1,
    note: 'Universal Tennis Rating, 1.00–16.50. Enter it to one decimal as shown on your UTR profile.',
    bands: [
      { upTo: 2.0, label: 'Starting out', detail: 'First months on court.' },
      { upTo: 4.0, label: 'Developing', detail: 'Can rally; consistency still arriving.' },
      { upTo: 6.0, label: 'Club level', detail: 'Holds a rally and plays full sets.' },
      { upTo: 8.0, label: 'Strong club / varsity', detail: 'Wins at club level; competitive high-school varsity.' },
      { upTo: 10.0, label: 'Advanced junior / D3', detail: 'Top junior sections; Division III college.' },
      { upTo: 12.0, label: 'Division I', detail: 'Division I college and top open tournaments.' },
      { upTo: 14.0, label: 'Professional pathway', detail: 'Futures and Challenger level.' },
      { upTo: 16.5, label: 'Tour level', detail: 'ATP and WTA main draws.' },
    ],
  },
  ITF: {
    min: 1, max: 3, step: 1, decimals: 0,
    note: 'Three tiers. 1 is the strongest.',
    bands: [
      { upTo: 1, label: 'Advanced', detail: 'Competes regularly in tournaments.' },
      { upTo: 2, label: 'Intermediate', detail: 'Plays sets; working on structure and consistency.' },
      { upTo: 3, label: 'Beginner', detail: 'Learning the game.' },
    ],
  },
};

const YEARS: { label: string; value: number }[] = [
  { label: '< 1', value: 0 },
  { label: '1–3', value: 2 },
  { label: '4–9', value: 6 },
  { label: '10+', value: 12 },
];

const PLAY_STYLES: { value: PlayStyle; label: string; detail: string }[] = [
  { value: 'aggressive-baseliner', label: 'Aggressive baseliner', detail: 'Dictates from the back with a big forehand' },
  { value: 'counterpuncher', label: 'Counterpuncher', detail: 'Defends, extends rallies, forces errors' },
  { value: 'all-court', label: 'All-court', detail: 'Comfortable everywhere; no single weapon' },
  { value: 'serve-and-volley', label: 'Serve and volley', detail: 'Gets forward at every chance' },
  { value: 'pusher', label: 'Retriever', detail: 'Consistency over power' },
];

const FITNESS: { value: FitnessLevel; label: string; detail: string }[] = [
  { value: 'beginner', label: 'Building a base', detail: 'New to regular training' },
  { value: 'recreational', label: 'Recreational', detail: 'Fit for a few sessions a week' },
  { value: 'competitive', label: 'Competitive', detail: 'Trains off court as well' },
  { value: 'elite', label: 'Elite', detail: 'Structured conditioning programme' },
];

const SURFACES: { value: SurfacePreference; label: string }[] = [
  { value: 'hard', label: 'Hard' },
  { value: 'clay', label: 'Clay' },
  { value: 'grass', label: 'Grass' },
  { value: 'indoor', label: 'Indoor' },
];

const GOAL_IDEAS = [
  'Second serve above 55% in matches',
  'Move up half an NTRP point',
  '100 hours on court this year',
  'Win the club ladder',
  'Enter a first tournament',
];

const WINDOWS = [
  { label: '2 weeks', value: 14 },
  { label: '1 month', value: 30 },
  { label: '2 months', value: 60 },
  { label: '3 months', value: 90 },
];

const STEPS = [
  { title: 'Level', lead: 'Sets what you see in the feed, the board, and the coach.' },
  { title: 'Game', lead: 'How you play now, not how you intend to.' },
  { title: 'Body', lead: 'The plan works around this.' },
  { title: 'Goals', lead: 'Specific and measurable, if possible.' },
  { title: 'Calendar', lead: 'A date turns the plan into a build-up.' },
  { title: 'Review', lead: 'What the coach will work from.' },
];

/** Steps the plan can run without. Level and game are required. */
const SKIPPABLE = new Set([2, 3, 4]);

const round = (n: number, decimals: number) => Number(n.toFixed(decimals));

export default function Onboarding() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, actions } = useApp();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);

  const [skillSystem, setSkillSystem] = useState<SkillSystem>('NTRP');
  const [rating, setRating] = useState(3.5);
  const [yearsPlaying, setYearsPlaying] = useState(6);
  const [playStyle, setPlayStyle] = useState<PlayStyle>('all-court');
  const [handedness, setHandedness] = useState<Handedness>('right');
  const [backhand, setBackhand] = useState<Backhand>('two-handed');
  const [surface, setSurface] = useState<SurfacePreference>('hard');
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel>('recreational');
  const [sessionsPerWeek, setSessionsPerWeek] = useState(3);
  const [injury, setInjury] = useState('');
  const [scheduleNote, setScheduleNote] = useState('');
  const [goalOne, setGoalOne] = useState('');
  const [goalTwo, setGoalTwo] = useState('');
  const [tournamentName, setTournamentName] = useState('');
  const [tournamentDays, setTournamentDays] = useState(30);

  const scale = SCALES[skillSystem];
  const band = scale.bands.find((b) => rating <= b.upTo) ?? scale.bands[scale.bands.length - 1];

  /* ------------------------------ Animation ------------------------------ */

  const progress = useRef(new Animated.Value(1 / STEPS.length)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    Animated.timing(progress, { toValue: (step + 1) / STEPS.length, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    fade.setValue(0);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    Animated.timing(fade, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [step, progress, fade]);

  const pick = <T,>(setter: (v: T) => void) => (value: T) => { haptics.tap(); setter(value); };
  // The field holds whatever is typed so "6." survives; the number behind it
  // only moves once the text is a rating that fits the scale.
  const [ratingText, setRatingText] = useState('3.5');
  const parsed = Number(ratingText.replace(',', '.'));
  const ratingValid = ratingText.trim() !== '' && Number.isFinite(parsed) && parsed >= scale.min && parsed <= scale.max;
  const typeRating = (text: string) => {
    setRatingText(text);
    const n = Number(text.replace(',', '.'));
    if (text.trim() !== '' && Number.isFinite(n) && n >= scale.min && n <= scale.max) setRating(round(n, scale.decimals));
  };
  const changeSystem = (next: SkillSystem) => {
    if (next === skillSystem) return;
    haptics.tap();
    setSkillSystem(next);
    const fresh = next === 'UTR' ? 6.0 : next === 'ITF' ? 2 : 3.5;
    setRating(fresh);
    setRatingText(fresh.toFixed(SCALES[next].decimals));
  };

  /* -------------------------------- Profile ------------------------------- */

  const profile = useMemo<PlayerProfile>(() => {
    const goals = [goalOne, goalTwo]
      .map((label) => label.trim())
      .filter(Boolean)
      .map((label, i) => ({ id: `g-onboard-${i}`, label, done: false }));
    const constraints = [
      injury.trim() ? { id: 'c-onboard-injury', kind: 'injury' as const, label: injury.trim(), active: true } : null,
      scheduleNote.trim() ? { id: 'c-onboard-schedule', kind: 'schedule' as const, label: scheduleNote.trim(), active: true } : null,
    ].filter((c): c is NonNullable<typeof c> => c !== null);
    const tournaments = tournamentName.trim()
      ? [{
          id: 't-onboard',
          name: tournamentName.trim(),
          startsAt: new Date(Date.now() + Math.max(1, tournamentDays) * 86_400_000).toISOString(),
          surface,
          level: `${skillSystem} ${rating}`,
          location: currentUser?.location ?? '',
          registered: true,
        }]
      : [];
    return {
      skillSystem, rating, playStyle, handedness, backhand, fitnessLevel,
      preferredSurface: surface, sessionsPerWeek, yearsPlaying,
      goals: goals.length > 0 ? goals : [{ id: 'g-default', label: 'Play more consistently', done: false }],
      constraints, tournaments,
    };
  }, [skillSystem, rating, playStyle, handedness, backhand, fitnessLevel, surface, sessionsPerWeek, yearsPlaying, goalOne, goalTwo, injury, scheduleNote, tournamentName, tournamentDays, currentUser?.location]);

  const finish = () => {
    haptics.commit();
    actions.completeOnboarding(profile);
    router.replace('/(tabs)');
  };

  const last = step === STEPS.length - 1;

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.head}>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
        </View>
        <View style={styles.headRow}>
          <Text style={styles.title}>{STEPS[step].title}</Text>
          <Text style={styles.stepLabel}>{step + 1} / {STEPS.length}</Text>
        </View>
        <Text style={styles.lead}>{STEPS[step].lead}</Text>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ gap: spacing.lg, opacity: fade }}>
          {step === 0 ? (
            <>
              <Group label="Rating system">
                <SegmentedControl<SkillSystem>
                  value={skillSystem}
                  onChange={changeSystem}
                  segments={[{ value: 'NTRP', label: 'NTRP' }, { value: 'UTR', label: 'UTR' }, { value: 'ITF', label: 'ITF' }]}
                />
                <Text style={styles.note}>{scale.note}</Text>
              </Group>

              <Field
                label={`${skillSystem} rating`}
                value={ratingText}
                onChangeText={typeRating}
                placeholder={skillSystem === 'UTR' ? '6.4' : skillSystem === 'ITF' ? '2' : '3.5'}
                keyboardType="decimal-pad"
                hint={ratingValid ? `${scale.min.toFixed(scale.decimals)}–${scale.max.toFixed(scale.decimals)} · ${band.label}: ${band.detail}` : `Enter a number between ${scale.min.toFixed(scale.decimals)} and ${scale.max.toFixed(scale.decimals)}.`}
              />

              <Group label="Years playing">
                <SegmentedControl<string>
                  value={String(yearsPlaying)}
                  onChange={(v) => pick(setYearsPlaying)(Number(v))}
                  segments={YEARS.map((y) => ({ value: String(y.value), label: y.label }))}
                />
              </Group>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <Group label="Style of play">
                <View style={styles.list}>
                  {PLAY_STYLES.map((s, i) => (
                    <Row key={s.value} label={s.label} detail={s.detail} selected={playStyle === s.value} first={i === 0} onPress={() => pick(setPlayStyle)(s.value)} />
                  ))}
                </View>
              </Group>
              <Group label="Dominant hand">
                <SegmentedControl<Handedness>
                  value={handedness}
                  onChange={pick(setHandedness)}
                  segments={[{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }]}
                />
              </Group>
              <Group label="Backhand">
                <SegmentedControl<Backhand>
                  value={backhand}
                  onChange={pick(setBackhand)}
                  segments={[{ value: 'two-handed', label: 'Two-handed' }, { value: 'one-handed', label: 'One-handed' }]}
                />
              </Group>
              <Group label="Preferred surface">
                <SegmentedControl<SurfacePreference>
                  value={surface}
                  onChange={pick(setSurface)}
                  segments={SURFACES}
                />
              </Group>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Group label="Fitness">
                <View style={styles.list}>
                  {FITNESS.map((f, i) => (
                    <Row key={f.value} label={f.label} detail={f.detail} selected={fitnessLevel === f.value} first={i === 0} onPress={() => pick(setFitnessLevel)(f.value)} />
                  ))}
                </View>
              </Group>
              <Group label="Sessions per week">
                <SegmentedControl<string>
                  value={String(sessionsPerWeek)}
                  onChange={(v) => pick(setSessionsPerWeek)(Number(v))}
                  segments={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: String(n) }))}
                />
                <Text style={styles.note}>Count what you can keep up for a month, not a good week.</Text>
              </Group>
              <Field label="Injuries or limitations" value={injury} onChangeText={setInjury} placeholder="e.g. Right shoulder, tight after serving" hint="Caps volume in generated plans." />
              <Field label="Schedule constraints" value={scheduleNote} onChangeText={setScheduleNote} placeholder="e.g. Courts only before 8am on weekdays" />
            </>
          ) : null}

          {step === 3 ? (
            <>
              <Field label="Primary goal" value={goalOne} onChangeText={setGoalOne} placeholder="e.g. Second serve above 55% in matches" />
              <Field label="Secondary goal" value={goalTwo} onChangeText={setGoalTwo} placeholder="Optional" />
              <Group label="Suggestions">
                <View style={styles.list}>
                  {GOAL_IDEAS.map((idea, i) => {
                    const used = goalOne === idea || goalTwo === idea;
                    return (
                      <Row
                        key={idea}
                        label={idea}
                        selected={used}
                        first={i === 0}
                        onPress={() => {
                          haptics.tap();
                          if (used) { if (goalOne === idea) setGoalOne(''); else setGoalTwo(''); return; }
                          if (!goalOne.trim()) setGoalOne(idea); else setGoalTwo(idea);
                        }}
                      />
                    );
                  })}
                </View>
              </Group>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <Field label="Next tournament" value={tournamentName} onChangeText={setTournamentName} placeholder="e.g. LA Metro Open" hint="Optional. Without one the plan runs as steady weekly work." />
              <Group label="Starts in">
                <SegmentedControl<string>
                  value={String(tournamentDays)}
                  onChange={(v) => pick(setTournamentDays)(Number(v))}
                  segments={WINDOWS.map((w) => ({ value: String(w.value), label: w.label }))}
                />
              </Group>
              <View style={styles.list}>
                {[
                  ['Base', 'Volume and fundamentals'],
                  ['Sharpen', 'Match patterns in the final month'],
                  ['Taper', 'Reduced load in the final week'],
                ].map(([label, detail], i) => (
                  <View key={label} style={[styles.row, i > 0 && styles.rowBorder]}>
                    <Text style={styles.phaseIndex}>{i + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowLabel}>{label}</Text>
                      <Text style={styles.rowDetail}>{detail}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {step === 5 ? (
            <>
              <View style={styles.list}>
                {[
                  ['Rating', `${skillSystem} ${rating.toFixed(scale.decimals)} · ${band.label}`],
                  ['Experience', `${YEARS.find((y) => y.value === yearsPlaying)?.label ?? yearsPlaying} years`],
                  ['Style', PLAY_STYLES.find((p) => p.value === playStyle)?.label ?? ''],
                  ['Hand', `${handedness === 'left' ? 'Left' : 'Right'} · ${backhand === 'one-handed' ? 'one-handed' : 'two-handed'} backhand`],
                  ['Surface', SURFACES.find((s) => s.value === surface)?.label ?? ''],
                  ['Fitness', FITNESS.find((f) => f.value === fitnessLevel)?.label ?? ''],
                  ['Sessions', `${sessionsPerWeek} per week`],
                  ['Goal', goalOne.trim() || 'Play more consistently'],
                  goalTwo.trim() ? ['Also', goalTwo.trim()] : null,
                  injury.trim() ? ['Limitations', injury.trim()] : null,
                  scheduleNote.trim() ? ['Schedule', scheduleNote.trim()] : null,
                  tournamentName.trim() ? ['Tournament', `${tournamentName.trim()} · ${tournamentDays} days`] : null,
                ].filter((r): r is [string, string] => r !== null).map(([label, value], i) => (
                  <View key={label} style={[styles.row, i > 0 && styles.rowBorder]}>
                    <Text style={styles.summaryLabel}>{label}</Text>
                    <Text style={styles.summaryValue}>{value}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.note}>Everything here can be changed later from your profile.</Text>
            </>
          ) : null}
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {step > 0 ? <Button label="Back" variant="ghost" onPress={() => setStep((s) => s - 1)} /> : <View />}
        <View style={styles.footerRight}>
          {SKIPPABLE.has(step) ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Skip this step" onPress={() => setStep((s) => s + 1)} style={styles.skip}>
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
          ) : null}
          <Button label={last ? 'Finish' : 'Continue'} disabled={step === 0 && !ratingValid} onPress={() => (last ? finish() : setStep((s) => s + 1))} />
        </View>
      </View>
    </View>
  );
}

/* ------------------------------- Pieces --------------------------------- */

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Row({ label, detail, selected, first, onPress }: { label: string; detail?: string; selected: boolean; first: boolean; onPress: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !first && styles.rowBorder, pressed && { backgroundColor: colors.surfaceAlt }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.rowLabel, selected && { color: colors.text }]}>{label}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { paddingHorizontal: spacing.xl, gap: spacing.xs, paddingBottom: spacing.md, maxWidth: 560, width: '100%', alignSelf: 'center' },
  track: { height: 2, backgroundColor: colors.surfaceAlt, marginBottom: spacing.md },
  fill: { height: '100%', backgroundColor: colors.brand },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { ...typography.title, color: colors.text },
  stepLabel: { ...typography.small, color: colors.textFaint, fontVariant: ['tabular-nums'] },
  lead: { ...typography.small, color: colors.textMuted },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xs, paddingBottom: spacing.xl, maxWidth: 560, width: '100%', alignSelf: 'center' },
  group: { gap: spacing.sm },
  groupLabel: { ...typography.caption, color: colors.textFaint, letterSpacing: 1 },
  note: { ...typography.small, color: colors.textFaint, lineHeight: 18 },

  list: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 12, minHeight: 48 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowLabel: { ...typography.body, color: colors.text },
  rowDetail: { ...typography.small, color: colors.textMuted },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.brand },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },
  phaseIndex: { ...typography.smallStrong, color: colors.textFaint, width: 16, fontVariant: ['tabular-nums'] },


  summaryLabel: { ...typography.small, color: colors.textFaint, width: 96 },
  summaryValue: { ...typography.small, color: colors.text, flex: 1 },

  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  footerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  skip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  skipText: { ...typography.smallStrong, color: colors.textMuted },
});

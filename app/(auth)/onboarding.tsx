import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LocationField } from '@/components/LocationField';
import { PermissionRows } from '@/components/PermissionRows';
import { Button, Collapse, Field, SegmentedControl } from '@/components/ui';
import { writeSkipped, type SetupStep } from '@/features/onboarding/setupProgress';
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
  decimals: number;
  note: string;
  /** Sorted low to high: the first band the rating fits under describes it. */
  bands: { upTo: number; label: string }[];
}

const SCALES: Record<'NTRP' | 'UTR', Scale> = {
  NTRP: {
    min: 1.5, max: 7.0, decimals: 1,
    note: 'USTA scale, 1.5–7.0 in half points.',
    bands: [
      { upTo: 2.5, label: 'Learning to rally' },
      { upTo: 3.0, label: 'Consistent at medium pace' },
      { upTo: 3.5, label: 'Dependable strokes' },
      { upTo: 4.0, label: 'Constructing points' },
      { upTo: 4.5, label: 'Pace and spin on demand' },
      { upTo: 5.0, label: 'A weapon and a plan' },
      { upTo: 5.5, label: 'Tournament standard' },
      { upTo: 7.0, label: 'Sectional and above' },
    ],
  },
  UTR: {
    min: 1.0, max: 16.5, decimals: 1,
    note: 'Universal Tennis Rating, to one decimal, as shown on your UTR profile.',
    bands: [
      { upTo: 2.0, label: 'Starting out' },
      { upTo: 4.0, label: 'Developing' },
      { upTo: 6.0, label: 'Club level' },
      { upTo: 8.0, label: 'Strong club / varsity' },
      { upTo: 10.0, label: 'Advanced junior / D3' },
      { upTo: 12.0, label: 'Division I' },
      { upTo: 14.0, label: 'Professional pathway' },
      { upTo: 16.5, label: 'Tour level' },
    ],
  },
};

const YEARS = [
  { label: '< 1', value: 0 },
  { label: '1–3', value: 2 },
  { label: '4–9', value: 6 },
  { label: '10+', value: 12 },
];

const PLAY_STYLES: { value: PlayStyle; label: string; detail: string }[] = [
  { value: 'aggressive-baseliner', label: 'Aggressive baseliner', detail: 'Big forehand, dictates' },
  { value: 'counterpuncher', label: 'Counterpuncher', detail: 'Defends, forces errors' },
  { value: 'all-court', label: 'All-court', detail: 'Comfortable everywhere' },
  { value: 'serve-and-volley', label: 'Serve and volley', detail: 'Gets forward' },
  { value: 'pusher', label: 'Retriever', detail: 'Consistency first' },
];

const FITNESS: { value: FitnessLevel; label: string }[] = [
  { value: 'beginner', label: 'Building' },
  { value: 'recreational', label: 'Recreational' },
  { value: 'competitive', label: 'Competitive' },
  { value: 'elite', label: 'Elite' },
];

const SURFACES: { value: SurfacePreference; label: string }[] = [
  { value: 'hard', label: 'Hard' },
  { value: 'clay', label: 'Clay' },
  { value: 'grass', label: 'Grass' },
  { value: 'indoor', label: 'Indoor' },
];

const GOAL_IDEAS = ['Better second serve', 'Move up a rating', '100 hours on court', 'Win the club ladder', 'First tournament'];

const WINDOWS = [
  { label: '2 weeks', value: 14 },
  { label: '1 month', value: 30 },
  { label: '2 months', value: 60 },
  { label: '3 months', value: 90 },
];

/** Steps, in order. `skip` names the reminder the profile shows if it is skipped. */
const STEPS: { title: string; lead: string; skip?: SetupStep }[] = [
  { title: 'About you', lead: 'Name, city, level.' },
  { title: 'Your game', lead: 'How you play now.' },
  { title: 'Permissions', lead: 'What CourtSide may use on this phone.', skip: 'permissions' },
  { title: 'Body and goals', lead: 'Shapes your weekly plan.', skip: 'body' },
  { title: 'Calendar', lead: 'Optional. Gives the plan a target.', skip: 'calendar' },
  { title: 'Review', lead: 'What the coach works from.' },
];

const round = (n: number, decimals: number) => Number(n.toFixed(decimals));

export default function Onboarding() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, currentUserId, posts, questions, answers, actions } = useApp();
  const insets = useSafeAreaInsets();
  // The profile's "finish setting up" card lands straight on the step it names.
  const params = useLocalSearchParams<{ step?: string; from?: string }>();
  const startAt = Math.min(STEPS.length - 1, Math.max(0, Number(params.step) || 0));
  const [step, setStep] = useState(startAt);
  const skipped = useRef<Set<SetupStep>>(new Set());

  const existing = currentUser?.profile;
  const [name, setName] = useState(currentUser?.name ?? '');
  const [location, setLocation] = useState(currentUser?.location ?? '');
  const [skillSystem, setSkillSystem] = useState<'NTRP' | 'UTR'>(existing?.skillSystem === 'UTR' ? 'UTR' : 'NTRP');
  const [rating, setRating] = useState(existing?.rating && existing.skillSystem !== 'ITF' ? existing.rating : 3.5);
  const [ratingText, setRatingText] = useState(String(existing?.rating && existing.skillSystem !== 'ITF' ? existing.rating : '3.5'));
  const [yearsPlaying, setYearsPlaying] = useState(existing?.yearsPlaying ?? 6);
  const [playStyle, setPlayStyle] = useState<PlayStyle>(existing?.playStyle ?? 'all-court');
  const [styleOpen, setStyleOpen] = useState(false);
  const chevronTurn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(chevronTurn, { toValue: styleOpen ? 1 : 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [styleOpen, chevronTurn]);
  const [handedness, setHandedness] = useState<Handedness>(existing?.handedness ?? 'right');
  const [backhand, setBackhand] = useState<Backhand>(existing?.backhand ?? 'two-handed');
  const [surface, setSurface] = useState<SurfacePreference>(existing?.preferredSurface ?? 'hard');
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel>(existing?.fitnessLevel ?? 'recreational');
  const [sessionsPerWeek, setSessionsPerWeek] = useState(existing?.sessionsPerWeek ?? 3);
  const [goalOne, setGoalOne] = useState(existing?.goals[0]?.label ?? '');
  const [tournamentName, setTournamentName] = useState(existing?.tournaments[0]?.name ?? '');
  const [tournamentDays, setTournamentDays] = useState(30);

  const scale = SCALES[skillSystem];
  const band = scale.bands.find((b) => rating <= b.upTo) ?? scale.bands[scale.bands.length - 1];
  const parsed = Number(ratingText.replace(',', '.'));
  const ratingValid = ratingText.trim() !== '' && Number.isFinite(parsed) && parsed >= scale.min && parsed <= scale.max;

  /* ------------------------------ Animation ------------------------------ */

  const progress = useRef(new Animated.Value((startAt + 1) / STEPS.length)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    Animated.timing(progress, { toValue: (step + 1) / STEPS.length, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    fade.setValue(0);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    Animated.timing(fade, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [step, progress, fade]);

  const pick = <T,>(setter: (v: T) => void) => (value: T) => { haptics.tap(); setter(value); };
  const typeRating = (text: string) => {
    setRatingText(text);
    const n = Number(text.replace(',', '.'));
    if (text.trim() !== '' && Number.isFinite(n) && n >= scale.min && n <= scale.max) setRating(round(n, scale.decimals));
  };
  const changeSystem = (next: 'NTRP' | 'UTR') => {
    if (next === skillSystem) return;
    haptics.tap();
    setSkillSystem(next);
    const fresh = next === 'UTR' ? 6.0 : 3.5;
    setRating(fresh);
    setRatingText(fresh.toFixed(1));
  };

  /* -------------------------------- Profile ------------------------------- */

  const profile = useMemo<PlayerProfile>(() => {
    const goals = [goalOne]
      .map((label) => label.trim())
      .filter(Boolean)
      .map((label, i) => ({ id: `g-onboard-${i}`, label, done: false }));
    const tournaments = tournamentName.trim()
      ? [{
          id: 't-onboard',
          name: tournamentName.trim(),
          startsAt: new Date(Date.now() + Math.max(1, tournamentDays) * 86_400_000).toISOString(),
          surface,
          level: `${skillSystem} ${rating}`,
          location: location.trim(),
          registered: true,
        }]
      : [];
    return {
      skillSystem: skillSystem as SkillSystem, rating, playStyle, handedness, backhand, fitnessLevel,
      preferredSurface: surface, sessionsPerWeek, yearsPlaying,
      goals: goals.length > 0 ? goals : [{ id: 'g-default', label: 'Play more consistently', done: false }],
      // Injury and schedule notes are added later, from the profile.
      constraints: existing?.constraints ?? [],
      tournaments,
    };
  }, [skillSystem, rating, playStyle, handedness, backhand, fitnessLevel, surface, sessionsPerWeek, yearsPlaying, goalOne, tournamentName, tournamentDays, location, existing?.constraints]);

  const finish = () => {
    haptics.commit();
    if (currentUser && (name.trim() !== currentUser.name || location.trim() !== currentUser.location)) {
      actions.updateIdentity({ name: name.trim() || currentUser.name, bio: currentUser.bio, location: location.trim() });
    }
    actions.completeOnboarding(profile);
    if (currentUserId) void writeSkipped(currentUserId, [...skipped.current]);
    // Came here from the profile's "finish setting up"? Back to the profile, not to the top of the feed.
    // A new player with nothing posted yet goes on to their first move.
    const hasPosted = !!currentUserId && (posts.some((p) => p.authorId === currentUserId) || questions.some((q) => q.authorId === currentUserId) || answers.some((a) => a.authorId === currentUserId));
    router.replace(params.from === 'profile' ? '/(tabs)/profile' : hasPosted ? '/(tabs)' : '/first-move');
  };

  const skipStep = () => {
    const key = STEPS[step].skip;
    if (key) skipped.current.add(key);
    setStep((s) => s + 1);
  };
  const next = () => {
    const key = STEPS[step].skip;
    if (key) skipped.current.delete(key);
    setStep((s) => s + 1);
  };

  const last = step === STEPS.length - 1;
  const canContinue = step === 0 ? name.trim().length > 0 && ratingValid : true;

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
              <Field label="Name" value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" />
              <View style={styles.group}>
                <Text style={styles.groupLabel}>WHERE YOU PLAY</Text>
                <LocationField value={location} onChange={setLocation} />
              </View>
              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <Group label="Rating system">
                    <SegmentedControl<'NTRP' | 'UTR'>
                      value={skillSystem}
                      onChange={changeSystem}
                      segments={[{ value: 'NTRP', label: 'NTRP' }, { value: 'UTR', label: 'UTR' }]}
                    />
                  </Group>
                </View>
                <View style={{ width: 120 }}>
                  <Field
                    label="Rating"
                    value={ratingText}
                    onChangeText={typeRating}
                    placeholder={skillSystem === 'UTR' ? '6.4' : '3.5'}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
              <Text style={styles.note}>{ratingValid ? band.label : `Enter ${scale.min.toFixed(1)}–${scale.max.toFixed(1)}`}</Text>
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
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded: styleOpen }} accessibilityLabel="Style of play" onPress={() => setStyleOpen((o) => !o)} style={styles.dropdown}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dropdownValue}>{PLAY_STYLES.find((p) => p.value === playStyle)?.label}</Text>
                      <Text style={styles.rowDetail}>{PLAY_STYLES.find((p) => p.value === playStyle)?.detail}</Text>
                    </View>
                    <Animated.Text style={[styles.chevron, { transform: [{ rotate: chevronTurn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }]}>▾</Animated.Text>
                  </Pressable>
                  {/* The other styles ease open underneath rather than popping in. */}
                  <Collapse open={styleOpen}>
                    {PLAY_STYLES.filter((p) => p.value !== playStyle).map((p) => (
                      <Row key={p.value} label={p.label} detail={p.detail} selected={false} first={false} onPress={() => { pick(setPlayStyle)(p.value); setStyleOpen(false); }} />
                    ))}
                  </Collapse>
                </View>
              </Group>
              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <Group label="Hand">
                    <SegmentedControl<Handedness> value={handedness} onChange={pick(setHandedness)} segments={[{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }]} />
                  </Group>
                </View>
                <View style={{ flex: 1.3 }}>
                  <Group label="Backhand">
                    <SegmentedControl<Backhand> value={backhand} onChange={pick(setBackhand)} segments={[{ value: 'two-handed', label: 'Two' }, { value: 'one-handed', label: 'One' }]} />
                  </Group>
                </View>
              </View>
              <Group label="Preferred surface">
                <SegmentedControl<SurfacePreference> value={surface} onChange={pick(setSurface)} segments={SURFACES} />
              </Group>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <PermissionRows />
              <Text style={styles.note}>Say no to any of these and CourtSide still works; you can allow them later from Settings, or when you go to post.</Text>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <Group label="Fitness">
                <SegmentedControl<FitnessLevel> value={fitnessLevel} onChange={pick(setFitnessLevel)} segments={FITNESS} wrap />
              </Group>
              <Group label="Sessions per week">
                <SegmentedControl<string>
                  value={String(sessionsPerWeek)}
                  onChange={(v) => pick(setSessionsPerWeek)(Number(v))}
                  segments={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: String(n) }))}
                />
              </Group>
              <Field label="Goal" value={goalOne} onChangeText={setGoalOne} placeholder="What are you working toward?" />
              <View style={styles.chips}>
                {GOAL_IDEAS.map((idea) => {
                  const on = goalOne === idea;
                  return (
                    <Pressable key={idea} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => { haptics.tap(); setGoalOne(on ? '' : idea); }} style={[styles.chip, on && styles.chipOn]}>
                      <Text style={[styles.chipText, on && { color: colors.brandInk }]}>{idea}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <Field label="Next tournament" value={tournamentName} onChangeText={setTournamentName} placeholder="e.g. LA Metro Open" />
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
                  ['Name', name.trim() || currentUser?.name || ''],
                  ['From', location.trim() || '—'],
                  ['Rating', `${skillSystem} ${rating.toFixed(1)} · ${band.label}`],
                  ['Experience', `${YEARS.find((y) => y.value === yearsPlaying)?.label ?? yearsPlaying} years`],
                  ['Style', PLAY_STYLES.find((p) => p.value === playStyle)?.label ?? ''],
                  ['Hand', `${handedness === 'left' ? 'Left' : 'Right'} · ${backhand === 'one-handed' ? 'one-handed' : 'two-handed'} backhand`],
                  ['Surface', SURFACES.find((s) => s.value === surface)?.label ?? ''],
                  ['Fitness', FITNESS.find((f) => f.value === fitnessLevel)?.label ?? ''],
                  ['Sessions', `${sessionsPerWeek} per week`],
                  ['Goal', goalOne.trim() || 'Play more consistently'],
                  tournamentName.trim() ? ['Tournament', `${tournamentName.trim()} · ${tournamentDays} days`] : null,
                ].filter((r): r is [string, string] => r !== null).map(([label, value], i) => (
                  <View key={label} style={[styles.row, i > 0 && styles.rowBorder]}>
                    <Text style={styles.summaryLabel}>{label}</Text>
                    <Text style={styles.summaryValue}>{value}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.note}>Injuries and schedule limits can be added from your profile.</Text>
            </>
          ) : null}
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {step > 0 ? <Button label="Back" variant="ghost" onPress={() => setStep((s) => s - 1)} /> : <View />}
        <View style={styles.footerRight}>
          {STEPS[step].skip ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Skip this step" onPress={skipStep} style={styles.skip}>
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
          ) : null}
          <Button label={last ? 'Finish' : 'Continue'} disabled={!canContinue} onPress={() => (last ? finish() : next())} />
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
  head: { paddingHorizontal: spacing.xl, gap: spacing.xs, paddingBottom: spacing.sm, maxWidth: 560, width: '100%', alignSelf: 'center' },
  track: { height: 2, backgroundColor: colors.surfaceAlt, marginBottom: spacing.md },
  fill: { height: '100%', backgroundColor: colors.brand },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { ...typography.display, color: colors.text },
  stepLabel: { ...typography.small, color: colors.textFaint, fontVariant: ['tabular-nums'] },
  lead: { ...typography.small, color: colors.textMuted },
  body: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.xs, paddingBottom: spacing.lg, maxWidth: 560, width: '100%', alignSelf: 'center' },
  group: { gap: spacing.sm },
  groupLabel: { ...typography.caption, color: colors.textFaint, letterSpacing: 1 },
  note: { ...typography.small, color: colors.textFaint, lineHeight: 18 },
  twoCol: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-end' },

  list: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 13, minHeight: 52 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowLabel: { ...typography.body, color: colors.text },
  rowDetail: { ...typography.small, color: colors.textMuted },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.brand },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },
  phaseIndex: { ...typography.smallStrong, color: colors.textFaint, width: 16, fontVariant: ['tabular-nums'] },

  dropdown: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 13, minHeight: 56 },
  dropdownValue: { ...typography.bodyStrong, color: colors.text },
  chevron: { fontSize: 16, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { ...typography.smallStrong, color: colors.textMuted },
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

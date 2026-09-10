import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, Field, Meter } from '@/components/ui';
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
import { colors, spacing, typography } from '@/theme';

const SKILL_SYSTEMS: SkillSystem[] = ['NTRP', 'UTR', 'ITF'];
const NTRP_STEPS = [2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5];
const UTR_STEPS = [2, 4, 6, 8, 10, 12, 14];

const PLAY_STYLES: { value: PlayStyle; label: string; blurb: string }[] = [
  { value: 'aggressive-baseliner', label: 'Aggressive baseliner', blurb: 'Dictate from the back, big forehand' },
  { value: 'counterpuncher', label: 'Counterpuncher', blurb: 'Defend, extend, make them miss' },
  { value: 'all-court', label: 'All-court', blurb: 'Comfortable everywhere, no single weapon' },
  { value: 'serve-and-volley', label: 'Serve and volley', blurb: 'Get forward as often as possible' },
  { value: 'pusher', label: 'Retriever', blurb: 'Consistency over power, every time' },
];

const FITNESS: { value: FitnessLevel; label: string }[] = [
  { value: 'beginner', label: 'Just starting' },
  { value: 'recreational', label: 'Recreational' },
  { value: 'competitive', label: 'Competitive' },
  { value: 'elite', label: 'Elite' },
];

const SURFACES: SurfacePreference[] = ['hard', 'clay', 'grass', 'indoor'];

const STEP_TITLES = ['Your level', 'Your game', 'Your body', 'Your goals', 'Your calendar'];

export default function Onboarding() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, actions } = useApp();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);

  const [skillSystem, setSkillSystem] = useState<SkillSystem>('NTRP');
  const [rating, setRating] = useState(3.5);
  const [yearsPlaying, setYearsPlaying] = useState('5');
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
  const [tournamentDays, setTournamentDays] = useState('30');

  const ratingSteps = skillSystem === 'UTR' ? UTR_STEPS : skillSystem === 'ITF' ? [1, 2, 3] : NTRP_STEPS;

  const profile = useMemo<PlayerProfile>(() => {
    const goals = [goalOne, goalTwo]
      .map((label) => label.trim())
      .filter(Boolean)
      .map((label, i) => ({ id: `g-onboard-${i}`, label, done: false }));

    const constraints = [
      injury.trim()
        ? { id: 'c-onboard-injury', kind: 'injury' as const, label: injury.trim(), active: true }
        : null,
      scheduleNote.trim()
        ? { id: 'c-onboard-schedule', kind: 'schedule' as const, label: scheduleNote.trim(), active: true }
        : null,
    ].filter((c): c is NonNullable<typeof c> => c !== null);

    const tournaments = tournamentName.trim()
      ? [
          {
            id: 't-onboard',
            name: tournamentName.trim(),
            startsAt: new Date(
              Date.now() + Math.max(1, Number(tournamentDays) || 30) * 86_400_000,
            ).toISOString(),
            surface,
            level: `${skillSystem} ${rating}`,
            location: currentUser?.location ?? '',
            registered: true,
          },
        ]
      : [];

    return {
      skillSystem,
      rating,
      playStyle,
      handedness,
      backhand,
      fitnessLevel,
      preferredSurface: surface,
      sessionsPerWeek,
      yearsPlaying: Math.max(0, Number(yearsPlaying) || 0),
      goals: goals.length > 0 ? goals : [{ id: 'g-default', label: 'Play more consistently', done: false }],
      constraints,
      tournaments,
    };
  }, [
    skillSystem,
    rating,
    playStyle,
    handedness,
    backhand,
    fitnessLevel,
    surface,
    sessionsPerWeek,
    yearsPlaying,
    goalOne,
    goalTwo,
    injury,
    scheduleNote,
    tournamentName,
    tournamentDays,
    currentUser?.location,
  ]);

  const finish = () => {
    actions.completeOnboarding(profile);
    router.replace('/(tabs)');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.head}>
        <Text style={styles.step}>
          STEP {step + 1} OF {STEP_TITLES.length}
        </Text>
        <Text style={styles.title}>{STEP_TITLES[step]}</Text>
        <Meter label="" value={(step + 1) / STEP_TITLES.length} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {step === 0 ? (
          <>
            <Section title="Which rating system do you use?">
              <Row>
                {SKILL_SYSTEMS.map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    selected={skillSystem === s}
                    onPress={() => {
                      setSkillSystem(s);
                      setRating(s === 'UTR' ? 6 : s === 'ITF' ? 3 : 3.5);
                    }}
                  />
                ))}
              </Row>
            </Section>
            <Section title={`Your ${skillSystem} rating`}>
              <Row>
                {ratingSteps.map((r) => (
                  <Chip
                    key={r}
                    label={skillSystem === 'NTRP' ? r.toFixed(1) : String(r)}
                    selected={rating === r}
                    onPress={() => setRating(r)}
                  />
                ))}
              </Row>
            </Section>
            <Field
              label="Years playing"
              value={yearsPlaying}
              onChangeText={setYearsPlaying}
              keyboardType="number-pad"
            />
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Section title="How would you describe your game?">
              <View style={styles.stack}>
                {PLAY_STYLES.map((s) => (
                  <StyleOption
                    key={s.value}
                    label={s.label}
                    blurb={s.blurb}
                    selected={playStyle === s.value}
                    onPress={() => setPlayStyle(s.value)}
                  />
                ))}
              </View>
            </Section>
            <Section title="Handedness">
              <Row>
                <Chip label="Right" selected={handedness === 'right'} onPress={() => setHandedness('right')} />
                <Chip label="Left" selected={handedness === 'left'} onPress={() => setHandedness('left')} />
              </Row>
            </Section>
            <Section title="Backhand">
              <Row>
                <Chip
                  label="Two-handed"
                  selected={backhand === 'two-handed'}
                  onPress={() => setBackhand('two-handed')}
                />
                <Chip
                  label="One-handed"
                  selected={backhand === 'one-handed'}
                  onPress={() => setBackhand('one-handed')}
                />
              </Row>
            </Section>
            <Section title="Favourite surface">
              <Row>
                {SURFACES.map((s) => (
                  <Chip key={s} label={s} selected={surface === s} onPress={() => setSurface(s)} />
                ))}
              </Row>
            </Section>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Section title="Fitness level">
              <Row>
                {FITNESS.map((f) => (
                  <Chip
                    key={f.value}
                    label={f.label}
                    selected={fitnessLevel === f.value}
                    onPress={() => setFitnessLevel(f.value)}
                  />
                ))}
              </Row>
            </Section>
            <Section title="Sessions you can realistically play each week">
              <Row>
                {[2, 3, 4, 5, 6].map((n) => (
                  <Chip
                    key={n}
                    label={String(n)}
                    selected={sessionsPerWeek === n}
                    onPress={() => setSessionsPerWeek(n)}
                  />
                ))}
              </Row>
            </Section>
            <Field
              label="Injuries or niggles the coach should respect"
              value={injury}
              onChangeText={setInjury}
              placeholder="e.g. Right shoulder, tight after serving"
              hint="Anything you put here caps volume in your generated plans."
            />
            <Field
              label="Schedule constraints"
              value={scheduleNote}
              onChangeText={setScheduleNote}
              placeholder="e.g. Courts only before 8am on weekdays"
            />
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Field
              label="Main goal for the next few months"
              value={goalOne}
              onChangeText={setGoalOne}
              placeholder="e.g. Second serve above 55% in matches"
            />
            <Field
              label="A second goal (optional)"
              value={goalTwo}
              onChangeText={setGoalTwo}
              placeholder="e.g. Reach 4.5 NTRP"
            />
            <Text style={styles.note}>
              Goals feed straight into the AI coach. The more specific and measurable they are, the more
              useful the weekly plan gets.
            </Text>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <Field
              label="Next tournament (optional)"
              value={tournamentName}
              onChangeText={setTournamentName}
              placeholder="e.g. LA Metro Open"
            />
            <Field
              label="Days from now"
              value={tournamentDays}
              onChangeText={setTournamentDays}
              keyboardType="number-pad"
            />
            <Text style={styles.note}>
              With a date on the calendar the plan periodises: base work first, sharpening in the last
              month, a taper in the final week.
            </Text>
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        {step > 0 ? (
          <Button label="Back" variant="ghost" onPress={() => setStep((s) => s - 1)} />
        ) : (
          <View style={styles.spacer} />
        )}
        <Button
          label={step === STEP_TITLES.length - 1 ? 'Build my plan' : 'Continue'}
          onPress={() => (step === STEP_TITLES.length - 1 ? finish() : setStep((s) => s + 1))}
        />
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  return <View style={styles.row}>{children}</View>;
}

function StyleOption({
  label,
  blurb,
  selected,
  onPress,
}: {
  label: string;
  blurb: string;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        selected && { borderColor: colors.brand, backgroundColor: colors.brandDim },
        pressed && { opacity: 0.75 },
      ]}
    >
      <Text style={[styles.optionLabel, selected && { color: colors.brand }]}>{label}</Text>
      <Text style={styles.optionBlurb}>{blurb}</Text>
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: spacing.lg },
  step: { ...typography.caption, color: colors.brand },
  title: { ...typography.display, color: colors.text },
  body: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.xl },
  section: { gap: spacing.md },
  sectionTitle: { ...typography.bodyStrong, color: colors.text },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stack: { gap: spacing.sm },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    gap: 2,
  },
  optionLabel: { ...typography.bodyStrong, color: colors.text },
  optionBlurb: { ...typography.small, color: colors.textMuted },
  note: { ...typography.small, color: colors.textFaint, lineHeight: 20 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.md,
  },
  spacer: { width: 1 },
});

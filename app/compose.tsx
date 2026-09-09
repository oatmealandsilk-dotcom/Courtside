import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button, Chip, Field, Screen, SegmentedControl, type Segment } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import type { PostKind, SurfacePreference } from '@/data/types';
import { colors, spacing, typography } from '@/theme';

const KINDS: Segment<PostKind>[] = [
  { value: 'session', label: 'Session' },
  { value: 'match', label: 'Match' },
  { value: 'note', label: 'Note' },
  { value: 'gear', label: 'Gear' },
];

const SURFACES: SurfacePreference[] = ['hard', 'clay', 'grass', 'indoor'];

export default function Compose() {
  const { actions } = useApp();

  const [kind, setKind] = useState<PostKind>('session');
  const [body, setBody] = useState('');
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState('');
  const [attachMedia, setAttachMedia] = useState(false);

  // Session fields
  const [focus, setFocus] = useState('');
  const [minutes, setMinutes] = useState('75');
  const [drills, setDrills] = useState('');
  const [intensity, setIntensity] = useState<1 | 2 | 3 | 4 | 5>(3);

  // Match fields
  const [opponent, setOpponent] = useState('');
  const [sets, setSets] = useState('');
  const [won, setWon] = useState(true);
  const [surface, setSurface] = useState<SurfacePreference>('hard');

  const canSubmit = body.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;

    const tagList = tags
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean);

    actions.addPost({
      kind,
      body: body.trim(),
      location: location.trim() || undefined,
      tags: tagList,
      mediaLabel: attachMedia ? (kind === 'match' ? 'Match highlights · 0:36' : 'Session photo') : undefined,
      session:
        kind === 'session'
          ? {
              focus: focus.trim() || 'General practice',
              minutes: Math.max(5, Number(minutes) || 60),
              drills: drills
                .split('\n')
                .map((d) => d.trim())
                .filter(Boolean),
              intensity,
            }
          : undefined,
      match:
        kind === 'match'
          ? {
              opponentName: opponent.trim() || 'Unknown',
              sets: sets
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
              won,
              surface,
            }
          : undefined,
    });

    router.back();
  };

  return (
    <Screen title="New post" compactTitle onBack={() => router.back()}>
      <View style={styles.form}>
        <SegmentedControl segments={KINDS} value={kind} onChange={setKind} />

        <Field
          label="What happened?"
          value={body}
          onChangeText={setBody}
          placeholder="Say what you worked on and what actually changed."
          multiline
        />

        {kind === 'session' ? (
          <>
            <Field label="Focus" value={focus} onChangeText={setFocus} placeholder="e.g. Second serve consistency" />
            <Field label="Minutes" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" />
            <Field
              label="Drills"
              value={drills}
              onChangeText={setDrills}
              placeholder={'One per line\nKick serve to the backhand, 4 x 20'}
              multiline
              minHeight={90}
            />
            <View style={styles.group}>
              <Text style={styles.label}>Intensity</Text>
              <View style={styles.row}>
                {([1, 2, 3, 4, 5] as const).map((n) => (
                  <Chip key={n} label={String(n)} selected={intensity === n} onPress={() => setIntensity(n)} />
                ))}
              </View>
            </View>
          </>
        ) : null}

        {kind === 'match' ? (
          <>
            <Field label="Opponent" value={opponent} onChangeText={setOpponent} placeholder="e.g. K. Oyelaran" />
            <Field
              label="Sets"
              value={sets}
              onChangeText={setSets}
              placeholder="6-4, 4-6, 7-6(5)"
              hint="Comma separated, your score first."
            />
            <View style={styles.group}>
              <Text style={styles.label}>Result</Text>
              <View style={styles.row}>
                <Chip label="Won" selected={won} onPress={() => setWon(true)} />
                <Chip label="Lost" selected={!won} onPress={() => setWon(false)} />
              </View>
            </View>
            <View style={styles.group}>
              <Text style={styles.label}>Surface</Text>
              <View style={styles.row}>
                {SURFACES.map((s) => (
                  <Chip key={s} label={s} selected={surface === s} onPress={() => setSurface(s)} />
                ))}
              </View>
            </View>
          </>
        ) : null}

        <Field label="Location (optional)" value={location} onChangeText={setLocation} placeholder="Griffith Park Courts" />
        <Field
          label="Tags (optional)"
          value={tags}
          onChangeText={setTags}
          placeholder="serve, practice"
          autoCapitalize="none"
        />

        <Button
          label={attachMedia ? 'Media attached ✓' : 'Attach photo or clip'}
          variant="secondary"
          onPress={() => setAttachMedia((v) => !v)}
        />
        <Text style={styles.note}>
          Media uploads are stubbed — attaching renders a placeholder card so the layout is real.
        </Text>

        <Button label="Post" onPress={submit} disabled={!canSubmit} full />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg, paddingTop: spacing.sm },
  group: { gap: spacing.sm },
  label: { ...typography.smallStrong, color: colors.textMuted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  note: { ...typography.small, color: colors.textFaint, lineHeight: 18 },
});

import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { DragSheet } from '@/components/DragSheet';
import { pickFromDevice } from '@/components/MediaPicker';
import { Field } from '@/components/ui';
import type { CourtNote } from '@/data/types';
import { BUSY_LABEL, NETS_LABEL, SURFACE_LABEL } from '@/features/players/courtSummary';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';

const COURT_ID = /^(node|way|relation)\d{1,15}$/;
const entries = <K extends string>(labels: Record<K, string>) => Object.entries(labels) as [K, string][];

/**
 * What you know about a court, in a few taps: lights, surface, the nets, how
 * busy it gets, a photo, a line. Tap a chosen answer again to take it back.
 * Saving again replaces your earlier report; everyone sees the most common answer.
 */
export default function CourtReport() {
  const styles = useThemedStyles(styleDefinitions);
  const { id, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const { actions, courtNotes, currentUserId } = useApp();
  const courtId = id && COURT_ID.test(id) ? id : null;
  const mine = courtId ? courtNotes[courtId]?.find((n) => n.userId === currentUserId) : undefined;
  const [closeSignal, setCloseSignal] = useState(0);
  const [lights, setLights] = useState<boolean | undefined>(mine?.lights);
  const [surface, setSurface] = useState<CourtNote['surface']>(mine?.surface);
  const [nets, setNets] = useState<CourtNote['nets']>(mine?.nets);
  const [busy, setBusy] = useState<CourtNote['busy']>(mine?.busy);
  const [photo, setPhoto] = useState<string | undefined>(mine?.photoUrl);
  const [note, setNote] = useState(mine?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const anything = lights !== undefined || !!surface || !!nets || !!busy || !!photo || !!note.trim();

  const addPhoto = async () => {
    try { const picked = await pickFromDevice('photo'); if (picked?.uri) setPhoto(picked.uri); } catch (e) { setError(e instanceof Error ? e.message : 'Your photos could not be opened.'); }
  };
  const save = async () => {
    if (!courtId || !anything || saving) return;
    setSaving(true);
    setError('');
    try {
      await actions.saveCourtNote({ courtId, lights, surface, nets, busy, photoUrl: photo, note: note.slice(0, 280) });
      showToast({ title: 'Thanks', body: 'Players looking at this court will see it.', icon: 'checkmark-circle-outline' });
      setCloseSignal((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save. Try again.');
      setSaving(false);
    }
  };

  const group = <K extends string>(label: string, options: [K, string][], value: K | undefined, set: (v: K | undefined) => void) => (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {options.map(([v, text]) => (
          <Pressable key={v} accessibilityRole="radio" accessibilityState={{ selected: value === v }} onPress={() => set(value === v ? undefined : v)} style={[styles.chip, value === v && styles.chipOn]}>
            <Text style={[styles.chipText, value === v && styles.chipTextOn]}>{text}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={() => router.back()} peekFraction={0.8} header={
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heading}>{mine ? 'Update what you know' : 'What do you know?'}</Text>
          {name ? <Text style={styles.sub} numberOfLines={1}>{name}</Text> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={() => setCloseSignal((n) => n + 1)}>
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </Pressable>
      </View>
    }>
      <View style={styles.body}>
        {group('Lights', [['yes', 'Yes'], ['no', 'No']] as ['yes' | 'no', string][], lights === undefined ? undefined : lights ? 'yes' : 'no', (v) => setLights(v === undefined ? undefined : v === 'yes'))}
        {group('Surface', entries(SURFACE_LABEL), surface, setSurface)}
        {group('Nets', entries(NETS_LABEL), nets, setNets)}
        {group('How busy', entries(BUSY_LABEL), busy, setBusy)}
        <View style={styles.group}>
          <Text style={styles.label}>Photo</Text>
          {photo ? (
            <View style={styles.photoWrap}>
              <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" accessibilityLabel="Your photo of the court" />
              <Pressable accessibilityRole="button" accessibilityLabel="Remove the photo" hitSlop={8} onPress={() => setPhoto(undefined)} style={styles.photoRemove}>
                <Ionicons name="close" size={14} color="white" />
              </Pressable>
            </View>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Add a photo of the court" onPress={() => { void addPhoto(); }} style={styles.addPhoto}>
              <Ionicons name="camera-outline" size={18} color={colors.text} />
              <Text style={styles.addPhotoText}>Add a photo</Text>
            </Pressable>
          )}
        </View>
        <Field label="Anything else (optional)" value={note} onChangeText={(t) => setNote(t.slice(0, 280))} placeholder="Lights go off at 10. Gate code is on the sign." multiline minHeight={56} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !anything || saving || !courtId }} disabled={!anything || saving || !courtId} onPress={save} style={[styles.save, (!anything || saving || !courtId) && { opacity: 0.45 }]}>
          <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
        <Text style={styles.fine}>Everyone sees what most players say. Your name is not shown.</Text>
      </View>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  heading: { ...typography.title, color: colors.text },
  sub: { ...typography.small, color: colors.textMuted },
  body: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.lg, paddingBottom: spacing.xxl },
  group: { gap: spacing.sm },
  label: { ...typography.smallStrong, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: 16, height: 38, borderRadius: radius.pill, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.brand },
  chipText: { ...typography.smallStrong, fontSize: 14, color: colors.text },
  chipTextOn: { color: colors.brandInk },
  addPhoto: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.sm, paddingHorizontal: 16, height: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
  addPhotoText: { ...typography.smallStrong, fontSize: 14, color: colors.text },
  photoWrap: { width: 112, height: 84, borderRadius: 14, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  photoRemove: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  save: { height: 50, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  saveText: { ...typography.bodyStrong, color: colors.brandInk },
  error: { ...typography.small, color: colors.danger },
  fine: { ...typography.caption, letterSpacing: 0, color: colors.textFaint, textAlign: 'center' },
});

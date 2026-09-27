import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { DragSheet } from '@/components/DragSheet';
import { pickFromDevice } from '@/components/MediaPicker';
import { Field } from '@/components/ui';
import { Chips, Fine, Section, SheetTitle, Submit, formBody } from '@/components/sheet/SheetForm';
import type { CourtNote } from '@/data/types';
import { BUSY_LABEL, NETS_LABEL, SURFACE_LABEL } from '@/features/players/courtSummary';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, lift, radius, spacing, typography } from '@/theme';

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

  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={() => router.back()} peekFraction={0.86}
      header={<SheetTitle title={mine ? 'Update what you know' : 'What do you know?'} line={name ?? undefined} onClose={() => setCloseSignal((n) => n + 1)} />}>
      <ScrollView contentContainerStyle={formBody} keyboardShouldPersistTaps="handled">
        {/* Lights and the photo, side by side: two small things, one line. */}
        <View style={styles.pair}>
          <View style={{ flex: 1 }}>
            <Section title="Lights">
              <Chips clearable value={lights === undefined ? undefined : lights ? 'yes' : 'no'} onChange={(v) => setLights(v === undefined ? undefined : v === 'yes')} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
            </Section>
          </View>
          <Section title="Photo">
            {photo ? (
              <View style={styles.photoWrap}>
                <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" accessibilityLabel="Your photo of the court" />
                <Pressable accessibilityRole="button" accessibilityLabel="Remove the photo" hitSlop={8} onPress={() => setPhoto(undefined)} style={styles.photoRemove}>
                  <Ionicons name="close" size={12} color="white" />
                </Pressable>
              </View>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel="Add a photo of the court" onPress={() => { void addPhoto(); }} style={({ pressed }) => [styles.addPhoto, pressed && { opacity: 0.8 }]}>
                <Ionicons name="camera-outline" size={17} color={colors.text} />
                <Text style={styles.addPhotoText}>Add</Text>
              </Pressable>
            )}
          </Section>
        </View>
        <Section title="Surface">
          <Chips clearable value={surface} onChange={setSurface} options={entries(SURFACE_LABEL).map(([value, label]) => ({ value, label }))} />
        </Section>
        <Section title="Nets">
          <Chips clearable value={nets} onChange={setNets} options={entries(NETS_LABEL).map(([value, label]) => ({ value, label }))} />
        </Section>
        <Section title="How busy">
          <Chips clearable value={busy} onChange={setBusy} options={entries(BUSY_LABEL).map(([value, label]) => ({ value, label }))} />
        </Section>
        <Field soft value={note} onChangeText={(t) => setNote(t.slice(0, 280))} placeholder="Anything else? (optional)" multiline minHeight={56} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Submit label="Save" onPress={() => { void save(); }} disabled={!anything || !courtId} busy={saving} waiting="Pick anything above" />
        <Fine>Everyone sees what most players say. Your name is not shown.</Fine>
      </ScrollView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  pair: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  addPhoto: { ...lift, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 34, borderRadius: radius.pill, backgroundColor: colors.surface },
  addPhotoText: { ...typography.smallStrong, fontSize: 14, color: colors.text },
  photoWrap: { width: 64, height: 48, borderRadius: 12, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  photoRemove: { position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  error: { ...typography.small, color: colors.danger },
});

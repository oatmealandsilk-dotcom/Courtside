import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { CourtSearch, type ChosenPlace } from '@/components/CourtSearch';
import { DragSheet } from '@/components/DragSheet';
import { Fine, Section, SheetTitle, Submit, formBody } from '@/components/sheet/SheetForm';
import { isFlexibleHit } from '@/features/hits/flexible';
import { FORMAT_LABEL, hitWhen } from '@/features/hits/format';
import { fetchCourts, isClosedCourt, type Court } from '@/features/players/courts';
import { homeFor } from '@/features/players/positions';
import { useMyCity } from '@/features/players/useMyCity';
import { goBack } from '@/lib/goBack';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

/**
 * "Set court" on your own flexible hit (Oct 25, the owner: "Flexible is good
 * add set court button"). The same court picker as Looking for a hit (its
 * Where, CourtSearch), without Flexible: pick a court, press Set court, and
 * the hit is a normal hit at that court, on the map and the court's page like
 * any other. Its chat, still called "Hit · Court flexible …", is called after
 * the court (actions.setHitCourt, migration 188).
 *
 * Only for the hit's poster, while it is flexible and on: opened for any
 * other hit (an old link), it closes again.
 */
export default function SetCourt() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { currentUser, detectedCoords, hitRequests, actions } = useApp();
  const hit = hitRequests.find((h) => h.id === id);
  const yours = !!hit && !!currentUser && hit.authorId === currentUser.id && !hit.cancelled && isFlexibleHit(hit);
  const [closeSignal, setCloseSignal] = useState(0);
  const close = () => setCloseSignal((n) => n + 1);
  // The courts around you, as the hit sheet finds them: your town looked up first, members-only and private courts left out.
  const { town, pending: townPending } = useMyCity(currentUser);
  const home = useMemo(() => (currentUser && !(townPending && !detectedCoords) ? homeFor(currentUser, detectedCoords, town) : null), [currentUser, detectedCoords, town, townPending]);
  const [courts, setCourts] = useState<Court[]>([]);
  useEffect(() => {
    if (!home) return undefined;
    let on = true;
    fetchCourts(home).then((list) => { if (on) setCourts(list.filter((c) => !isClosedCourt(c))); }).catch(() => { if (on) setCourts([]); });
    return () => { on = false; };
  }, [home]);
  const [place, setPlace] = useState<ChosenPlace | null>(null);
  const [typed, setTyped] = useState('');
  const [saving, setSaving] = useState(false);
  // Set: the note once the sheet has gone.
  const set = useRef<ChosenPlace | null>(null);
  // Not yours, or no longer flexible (set elsewhere, called off): nothing to do here. Opened from a
  // link before the hits have come in (a reload), it waits for them rather than closing at once.
  const listed = hitRequests.length > 0;
  useEffect(() => { if ((hit || listed) && !yours && !set.current && !saving) close(); }, [yours, listed]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!hit || !place || saving) return;
    setSaving(true);
    const ok = await actions.setHitCourt(hit.id, place);
    // Set: the picker stays as it is while the sheet goes (the hit is no longer flexible underneath it).
    if (ok) set.current = place;
    setSaving(false);
    if (ok) close();
  };
  const done = () => {
    // Back to the page under it; opened first (a reload, a link), to the Players page.
    goBack('/discuss');
    const at = set.current;
    if (!at) return;
    showToast({
      title: 'Court set',
      body: at.lat !== undefined ? 'Your hit is on the map now.' : `Your hit is at ${at.name}.`,
      icon: 'checkmark-circle-outline',
    });
  };
  const open = yours || saving || !!set.current;
  const summary = hit ? `${FORMAT_LABEL[hit.format]} · ${hitWhen(hit.startsAt)}` : undefined;
  const fine = !place ? 'Pick one, and it’s a hit at that court.'
    : place.lat === undefined ? 'A place you typed has no pin on the map.'
      : hit?.conversationId ? 'It goes on the map, and the chat is named after it.' : 'It goes on the map and the court’s page.';

  return (
    <DragSheet closeSignal={closeSignal} onDismissed={done} peekFraction={0.86} slideOpen
      header={<SheetTitle title="Set the court" line={summary} onClose={close} />}>
      <View style={styles.body}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Section strong title="Where">
            {open ? <CourtSearch home={home} nearby={courts} chosen={place} onChoose={setPlace} typed={typed} onType={(t) => { setTyped(t); setPlace(null); }} /> : hit ? <Text style={styles.gone}>This hit already has a court.</Text> : null}
          </Section>
        </ScrollView>
        <View style={styles.footer}>
          <Submit label="Set court" onPress={save} disabled={!open || !place} busy={saving} waiting="Choose a court" />
          <Fine>{fine}</Fine>
        </View>
      </View>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  body: { flex: 1, minHeight: 0 },
  scroll: { flex: 1, minHeight: 0 },
  form: { ...formBody, gap: spacing.xl, paddingBottom: spacing.xl },
  gone: { ...typography.body, color: colors.textMuted },
  // As Looking for a hit's: the button stays in reach at the foot, with what it will do said under it.
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg },
});

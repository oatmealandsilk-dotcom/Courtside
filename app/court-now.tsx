import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { DragSheet } from '@/components/DragSheet';
import { Toggle } from '@/components/ui';
import { Section, SheetTitle, formBody } from '@/components/sheet/SheetForm';
import type { CourtAccess, CourtNow } from '@/data/types';
import { isMapCourtId } from '@/features/places/courtName';
import { notKnownAdult } from '@/features/players/age';
import { canChooseVisibility } from '@/features/players/mapPrivacy';
import { NOW_ICON, NOW_LABEL, nowStatus, playingLine } from '@/features/players/courtSummary';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

const CHOICES: CourtNow[] = ['free', 'wait', 'full', 'wet', 'locked'];
const ACCESS: readonly string[] = ['public', 'members', 'pay', 'private'];

/**
 * "How is it right now?" for one court: Free, A wait, Full, Wet or Locked,
 * shown to everyone as "Free · 20 min ago" for an hour and a half, never
 * with your name (said right under the tiles, so it is plainly about the
 * answer). Under it, for adults and only at a court anyone may play at,
 * "I'm playing here": two hours, gone the moment Location goes off; people
 * who follow each other with you see your name, anyone else only a count,
 * and only once two or more are there. With "Who can see you on the map?"
 * answered (migration 63) it follows that answer: Players nearby also puts
 * you on this court on their map while it lasts; Only people you follow back
 * shows you to them alone; Only me cannot check in. With the check-in on offer, a pick
 * keeps the sheet open (with thanks) so the switch is still in reach;
 * without it, a pick closes the sheet.
 */
export default function CourtNowSheet() {
  const styles = useThemedStyles(styleDefinitions);
  const params = useLocalSearchParams<{ id?: string; name?: string; access?: string }>();
  const { actions, courtNow, courtFacts, users, currentUser, currentUserId, locationEnabled, mapLive, mapVisibility } = useApp();
  const courtId = isMapCourtId(params.id) ? params.id : null;
  const name = params.name?.trim() || 'This court';
  const [closeSignal, setCloseSignal] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState<CourtNow | null>(null);
  useEffect(() => { if (courtId && currentUserId) void actions.loadCourtInfo([courtId]); }, [courtId, currentUserId, actions]);
  const now = courtId ? courtNow[courtId] : undefined;
  const standing = nowStatus(now);
  const playing = playingLine(now, users);
  const here = !!now?.youHere && locationEnabled;
  // Who may play: the facts' answer once loaded, else what the card that opened this knew.
  const said = courtId ? courtFacts[courtId]?.access : undefined;
  const access: CourtAccess = said && said !== 'unknown' ? said : ACCESS.includes(params.access ?? '') ? (params.access as CourtAccess) : 'unknown';
  // A teen never checks in: their spot is never put on the map for anyone.
  // Nor does anyone at a club's or someone's home court.
  const canCheckIn = !!currentUser && !notKnownAdult(currentUser) && access !== 'members' && access !== 'private';
  // Who sees you here follows who can see you on the map, once you have said (migration 63).
  const seenBy = canChooseVisibility(mapLive, currentUser) ? mapVisibility ?? null : null;
  const hereNote = !locationEnabled ? 'Turn on Location to check in.'
    : seenBy === 'none' ? 'You chose Only me on the map, so no one sees you here.'
      : seenBy === 'nearby' ? 'For 2 hours. Players nearby see you on this court.'
        : seenBy === 'mutuals' ? 'For 2 hours. Only people you follow back see you here.'
          : 'For 2 hours. People who follow you back see your name; others only see a count, once 2 or more are here.';

  const pick = async (status: CourtNow) => {
    if (!courtId || busy) return;
    setBusy(true);
    setError('');
    const problem = await actions.reportCourtNow(courtId, status);
    setBusy(false);
    if (problem) { setError(problem); return; }
    if (canCheckIn) { setThanks(status); return; }
    showToast({ title: 'Thanks', body: `${NOW_LABEL[status]}, for the next 90 minutes.`, icon: 'checkmark-circle-outline' });
    setCloseSignal((n) => n + 1);
  };
  const flipHere = async (next: boolean) => {
    if (!courtId) return;
    setError('');
    if (!next) { await actions.checkOutOfCourt(); return; }
    const problem = await actions.checkInAtCourt(courtId);
    if (problem) setError(problem);
  };

  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={() => router.back()} peekFraction={0.7}
      header={<SheetTitle title="How is it right now?" line={standing ? `${name} · ${standing.line}` : name} onClose={() => setCloseSignal((n) => n + 1)} />}>
      <ScrollView contentContainerStyle={formBody} keyboardShouldPersistTaps="handled">
        <View style={styles.choices} accessibilityRole="radiogroup">
          {CHOICES.map((c) => {
            const on = standing?.status === c;
            return (
              <Pressable key={c} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: busy }} accessibilityLabel={NOW_LABEL[c]} disabled={busy || !courtId} onPress={() => { void pick(c); }} style={({ pressed }) => [styles.choice, on && styles.choiceOn, pressed && { transform: [{ scale: 0.97 }] }]}>
                {/* One quiet colour for all five: the shape and the word say which; no status colour reads the same in every theme. */}
                <Ionicons name={NOW_ICON[c]} size={20} color={on ? colors.bg : colors.textMuted} />
                <Text style={[styles.choiceText, on && styles.choiceTextOn]}>{NOW_LABEL[c]}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={thanks ? styles.thanks : styles.fineLine}>
          {thanks ? `Thanks. ${NOW_LABEL[thanks]} shows for 90 minutes, never with your name.` : 'Your answer shows for 90 minutes, never with your name.'}
        </Text>
        {playing ? (
          <View style={styles.playingRow}>
            <View style={styles.liveDot} />
            <Text style={styles.playing}>{playing}</Text>
          </View>
        ) : null}
        {canCheckIn ? (
          <Section title="Playing here?">
            <View style={styles.hereRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.hereTitle}>I’m playing here</Text>
                <Text style={styles.hereNote}>{hereNote}</Text>
              </View>
              {seenBy === 'none' ? null : <Toggle value={here} onChange={(v) => { void flipHere(v); }} accessibilityLabel="I’m playing here" />}
            </View>
          </Section>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // Five lifted tiles, the sheet's own: the picked one filled with ink, the way its chips are.
  choice: { ...lift, flexGrow: 1, flexBasis: '30%', minWidth: 92, height: 64, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 4 },
  choiceOn: { backgroundColor: colors.text },
  choiceText: { ...typography.smallStrong, color: colors.text },
  choiceTextOn: { color: colors.bg },
  // The answer's own small print, right under the tiles it is about.
  fineLine: { ...typography.small, color: colors.textMuted, marginTop: -spacing.xs },
  thanks: { ...typography.small, ...font('600'), color: colors.text, marginTop: -spacing.xs },
  playingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand },
  playing: { ...typography.small, color: colors.textMuted, ...font('500') },
  hereRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface },
  hereTitle: { ...typography.bodyStrong, color: colors.text },
  hereNote: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  error: { ...typography.small, color: colors.danger },
});

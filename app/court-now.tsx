import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { DragSheet } from '@/components/DragSheet';
import { Button, Toggle } from '@/components/ui';
import { Section, SheetTitle, formBody } from '@/components/sheet/SheetForm';
import type { CourtAccess, CourtNow } from '@/data/types';
import { isMapCourtId } from '@/features/places/courtName';
import { lightsCourt } from '@/features/places/lightUp';
import { getPermission } from '@/features/permissions/devicePermissions';
import type { LatLng } from '@/features/players/positions';
import { useCourtTimeUp } from '@/features/places/courtTime';
import { usePlayingHere } from '@/features/places/playingHere';
import { NOW_ICON, NOW_LABEL, nowStatus, playingLine } from '@/features/players/courtSummary';
import { getPosition, recentPosition } from '@/lib/geo';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';
import { corner } from '@/theme/look';

const CHOICES: CourtNow[] = ['free', 'wait', 'full', 'wet', 'locked'];
const ACCESS: readonly string[] = ['public', 'members', 'pay', 'private'];

/**
 * Why a Busy or Full answer saved but did not light the court (migration 207: only answers given at the court
 * do): Location off or refused, the phone could not say where it is, or it is somewhere else.
 */
type Missed = 'off' | 'lost' | 'far';
const MISSED: Record<Missed, string> = {
  off: 'Turn on location at the court to light it up.',
  lost: 'Couldn’t find you, so it didn’t light up.',
  far: 'Answer from the court to light it up.',
};

/**
 * "How is it right now?" for one court: Free, Busy, Full, Wet or Locked,
 * shown to everyone as "Free · 20 min ago" for an hour and a half, never
 * with your name (said right under the tiles, so it is plainly about the
 * answer). Under it, for adults, at any court but someone's home (a club's
 * too since Oct 29: "if your playing there your playing there"),
 * "I'm playing here": for as long as "How long are you here?" says (30
 * minutes to 4 hours, CourtTimeHost; the switch opens it), gone the moment
 * Location goes off; people
 * who follow each other with you see your name, anyone else only a count,
 * and only once two or more are there. It needs a yes to "Who can see you on
 * the map?" (migration 191): with no answer yet, turning it on asks first,
 * and nothing happens without a yes; No one cannot check in. Location off: the
 * switch turns it on (usePlayingHere, the map card's own tap). With the check-in on offer, a pick
 * keeps the sheet open (with thanks) so the switch is still in reach;
 * without it, a pick closes the sheet.
 *
 * Busy and Full light the court on the map, but only from someone at it (Oct 30, owner: "If someone flips it to
 * light it up, we will pop smth up like turn on location or smth, and when they turn it on and are within the
 * radius it will turn on"). With Location on and allowed, the phone says where it is quietly; with it never
 * asked (or off in the app), one short line first, "To light up this court, CourtSide checks you’re here", and
 * Turn on Location brings the phone's own prompt (Just save skips it). The answer is saved either way and shows
 * on the court as before; the server says whether it was given there (migration 207, which never keeps the
 * spot), and if not, one quiet line says so. Free, Wet and Locked light nothing, so they never ask.
 */
export default function CourtNowSheet() {
  const styles = useThemedStyles(styleDefinitions);
  const params = useLocalSearchParams<{ id?: string; name?: string; access?: string }>();
  const { actions, courtNow, courtFacts, users, currentUserId, locationEnabled } = useApp();
  const courtId = isMapCourtId(params.id) ? params.id : null;
  const name = params.name?.trim() || 'This court';
  // With "Who can see you on the map?" up over it (I'm playing here), Escape is that sheet's alone, never this one's too.
  // The same while "How long are you here?" is up over it (CourtTimeHost).
  const focused = useIsFocused();
  const timeUp = useCourtTimeUp();
  const [closeSignal, setCloseSignal] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState<CourtNow | null>(null);
  // Busy or Full waiting on "To light up this court, CourtSide checks you're here" (Location never asked, or off).
  const [asking, setAsking] = useState<CourtNow | null>(null);
  // Saved, but not lit: why (MISSED).
  const [missed, setMissed] = useState<Missed | null>(null);
  // The server said the answer was given at the court, so it lights it up.
  const [litUp, setLitUp] = useState(false);
  // How tall the sheet's contents are, so it opens just that tall rather than at 70% with a gap under them (as Open to hit does).
  const [contentH, setContentH] = useState(0);
  useEffect(() => { if (courtId && currentUserId) void actions.loadCourtInfo([courtId]); }, [courtId, currentUserId, actions]);
  const now = courtId ? courtNow[courtId] : undefined;
  const standing = nowStatus(now);
  const playing = playingLine(now, users);
  // Who may play: the facts' answer once loaded, else what the card that opened this knew.
  const said = courtId ? courtFacts[courtId]?.access : undefined;
  const access: CourtAccess = said && said !== 'unknown' ? said : ACCESS.includes(params.access ?? '') ? (params.access as CourtAccess) : 'unknown';
  // A teen never checks in: their spot is never put on the map for anyone.
  // Nor does anyone at someone's home court (a club's is fine: canCheckIn). The same tap as the map's court card.
  const playingHere = usePlayingHere(courtId, access, params.name?.trim() || undefined);
  const { here, seenBy } = playingHere;
  const checkInHere = playingHere.can;
  // Not on offer for you here (No one on the map): the map card's own line says why, and no switch (the same rule as the card).
  const hereWhy = playingHere.why && !here ? playingHere.why : null;
  const hereNote = hereWhy ? `${hereWhy}.`
    // On: until when, as you chose it.
    : here ? `You’re here${playingHere.till ? ` · ${playingHere.till}` : ''}. Friends who follow you back see your name.`
    : !locationEnabled ? 'Pick how long you’re here. Switching it on turns on Location too.'
    : seenBy === 'none' ? 'You chose No one on the map, so no one sees you here.'
      // Since migration 189: names only to friends; anyone else only a count, never a face.
      : 'Pick how long you’re here. Friends who follow you back see your name; others only see a count, once 2 or more are here.';

  /** Saves the answer, with where you are when known (`at`); `why`: what to say if it does not light the court. */
  const send = async (status: CourtNow, at: LatLng | undefined, why: Missed) => {
    if (!courtId) return;
    setBusy(true);
    const got = await actions.reportCourtNow(courtId, status, at);
    setBusy(false);
    if (typeof got === 'string') { setError(got); return; }
    // `unchecked`: the server can't tell yet (migration 207 not in): a plain thanks, never "answer from the court".
    const miss = lightsCourt(status) && !got.atCourt && !got.unchecked ? (at ? 'far' : why) : null;
    setMissed(miss);
    setLitUp(got.atCourt);
    if (checkInHere) { setThanks(status); return; }
    showToast(miss
      ? { title: 'Saved', body: MISSED[miss], icon: 'location-outline' }
      : { title: 'Thanks', body: `${NOW_LABEL[status]}, for the next 90 minutes.`, icon: 'checkmark-circle-outline' });
    setCloseSignal((n) => n + 1);
  };
  const pick = async (status: CourtNow) => {
    if (!courtId || busy) return;
    setError('');
    setAsking(null);
    if (!lightsCourt(status)) { await send(status, undefined, 'off'); return; }
    setBusy(true);
    const allowed = await getPermission('location');
    // Refused on this phone (or none): saved, and it says how to light it.
    if (allowed === 'denied' || allowed === 'unavailable') { await send(status, undefined, 'off'); return; }
    // Never asked, or Location off in the app: the line first, and the phone's own prompt only on Turn on Location.
    if (allowed !== 'granted' || !locationEnabled) { setBusy(false); setAsking(status); return; }
    // On and allowed: read quietly (never a prompt).
    const fix = await getPosition({ quiet: true, recentMs: 2 * 60_000 });
    await send(status, fix.ok ? { lat: fix.lat, lng: fix.lng } : undefined, fix.ok ? 'far' : 'lost');
  };
  /** Turn on Location: the phone's own prompt (if it was never asked), then the answer with where you are. */
  const allowAndSend = async () => {
    const status = asking;
    if (!status || busy) return;
    setBusy(true);
    const problem = await actions.setLocationEnabled(true);
    const at = problem ? null : await recentPosition(60_000);
    setAsking(null);
    await send(status, at ?? undefined, problem ? 'off' : 'lost');
  };
  const justSave = () => {
    const status = asking;
    if (!status || busy) return;
    setAsking(null);
    void send(status, undefined, 'off');
  };
  const flipHere = async (next: boolean) => {
    if (!courtId) return;
    setError('');
    if (!next) { await playingHere.leave(); return; }
    // No yes yet: "Who can see you on the map?" first, and nothing without a yes (Apple 5.1.2(i), migration 191).
    await playingHere.start();
  };

  return (
    <DragSheet fitContent active={focused && !timeUp} closeSignal={closeSignal} onDismissed={() => router.back()} peekFraction={0.7} contentHeight={contentH || undefined}
      header={<SheetTitle title="How is it right now?" line={standing ? `${name} · ${standing.line}` : name} onClose={() => setCloseSignal((n) => n + 1)} />}>
      <ScrollView contentContainerStyle={formBody} keyboardShouldPersistTaps="handled" onContentSizeChange={(_, h) => { const r = Math.ceil(h); if (r !== contentH) setContentH(r); }}>
        <View style={styles.choices} accessibilityRole="radiogroup">
          {CHOICES.map((c) => {
            const on = (asking ?? standing?.status) === c;
            return (
              <Pressable key={c} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: busy }} accessibilityLabel={NOW_LABEL[c]} disabled={busy || !courtId} onPress={() => { void pick(c); }} style={({ pressed }) => [styles.choice, on && styles.choiceOn, pressed && { transform: [{ scale: 0.97 }] }]}>
                {/* One quiet colour for all five: the shape and the word say which; no status colour reads the same in every theme. */}
                <Ionicons name={NOW_ICON[c]} size={20} color={on ? colors.bg : colors.textMuted} />
                <Text style={[styles.choiceText, on && styles.choiceTextOn]}>{NOW_LABEL[c]}</Text>
              </Pressable>
            );
          })}
        </View>
        {asking ? (
          <View style={styles.askCard}>
            <View style={styles.askHead}>
              <Ionicons name="location-outline" size={18} color={colors.text} />
              <Text style={styles.askText}>To light up this court, CourtSide checks you’re here. Your spot isn’t kept.</Text>
            </View>
            <View style={styles.askRow}>
              <Button size="sm" label="Turn on Location" loading={busy} onPress={() => { void allowAndSend(); }} style={{ flex: 1 }} />
              <Button size="sm" variant="secondary" label="Just save" disabled={busy} onPress={justSave} style={{ flex: 1 }} />
            </View>
          </View>
        ) : missed && thanks ? (
          // Saved, but not lit: one quiet line, why and how.
          <Text style={styles.fineLine}>{`Saved. ${MISSED[missed]}`}</Text>
        ) : (
          <Text style={thanks ? styles.thanks : styles.fineLine}>
            {/* Busy or Full given at the court: it lights up (migration 207), so it says so. */}
            {thanks ? `Thanks. ${NOW_LABEL[thanks]} ${lightsCourt(thanks) && litUp ? 'lights up this court' : 'shows'} for 90 minutes, never with your name.` : 'Your answer shows for 90 minutes, never with your name.'}
          </Text>
        )}
        {playing ? (
          <View style={styles.playingRow}>
            <View style={styles.liveDot} />
            <Text style={styles.playing}>{playing}</Text>
          </View>
        ) : null}
        {checkInHere ? (
          <Section title="Playing here?">
            <View style={styles.hereRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.hereTitle}>I’m playing here</Text>
                <Text style={styles.hereNote}>{hereNote}</Text>
              </View>
              {hereWhy || seenBy === 'none' ? null : <Toggle value={here} onChange={(v) => { void flipHere(v); }} accessibilityLabel="I’m playing here" />}
            </View>
          </Section>
        ) : null}
        {error || playingHere.error ? <Text style={styles.error}>{error || playingHere.error}</Text> : null}
      </ScrollView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // Five lifted tiles, the sheet's own: the picked one filled with ink, the way its chips are.
  choice: { ...lift, flexGrow: 1, flexBasis: '30%', minWidth: 92, height: 64, borderRadius: corner(18), backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 4 },
  choiceOn: { backgroundColor: colors.text },
  choiceText: { ...typography.smallStrong, color: colors.text },
  choiceTextOn: { color: colors.bg },
  // The answer's own small print, right under the tiles it is about.
  fineLine: { ...typography.small, color: colors.textMuted, marginTop: -spacing.xs },
  thanks: { ...typography.small, ...font('600'), color: colors.text, marginTop: -spacing.xs },
  // "To light up this court, CourtSide checks you're here": the sheet's own surface, the line, then the two taps.
  askCard: { gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface },
  askHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  askText: { ...typography.small, ...font('500'), color: colors.text, flex: 1, lineHeight: 19 },
  askRow: { flexDirection: 'row', gap: spacing.sm },
  playingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand },
  playing: { ...typography.small, color: colors.textMuted, ...font('500') },
  hereRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface },
  hereTitle: { ...typography.bodyStrong, color: colors.text },
  hereNote: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  error: { ...typography.small, color: colors.danger },
});

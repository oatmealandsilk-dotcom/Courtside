import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtGlyph } from '@/components/map/CourtGlyph';
import type { CourtAccess } from '@/data/types';
import { useAtCourtPrompt, usePlayingHere } from '@/features/places/playingHere';
import { show as showToast } from '@/lib/toast';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { buttonShape, colors, font, radius, spacing, TextScale, typography } from '@/theme';

/**
 * "I'm playing here" on a court's card on the map (Oct 29, owner: "There's not a I'm playing here button on
 * the courts page ... Like when you go into map"): one tap, under what the card says about the court and above
 * Directions. On: "You're playing here · till 6:40pm" with Leave. Where it is not on offer (someone's home
 * court, a teen, no birthday on file, No one on the map), one quiet line says why. The same tap as the court
 * sheet's switch (usePlayingHere).
 */
export function PlayingHereRow({ courtId, access }: { courtId: string; access: CourtAccess }) {
  const styles = useThemedStyles(styleDefinitions);
  const p = usePlayingHere(courtId, access);
  if (p.why && !p.here) {
    return (
      <View style={styles.why} accessibilityLabel={p.why}>
        <Ionicons name={access === 'private' ? 'home-outline' : 'lock-closed-outline'} size={13} color={colors.textFaint} />
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.whyText} numberOfLines={2}>{p.why}</Text>
      </View>
    );
  }
  if (!p.can && !p.here) return null;
  return (
    <View style={styles.wrap}>
      {p.here ? (
        <View style={[styles.row, styles.rowOn]}>
          <View style={styles.dot} />
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.onText} numberOfLines={1}>{p.till ? `You’re playing here · ${p.till}` : 'You’re playing here'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Leave: stop showing you’re playing here" hitSlop={10} onPress={() => { void p.leave(); }} style={({ pressed }) => [styles.leave, pressed && styles.pressed]}>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.leaveText}>Leave</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel="I’m playing here" accessibilityState={{ busy: p.busy }} disabled={p.busy} onPress={() => { void p.start(); }} style={({ pressed }) => [styles.row, styles.rowOff, pressed && styles.pressed]}>
          {p.busy ? <ActivityIndicator size="small" color={colors.brand} /> : <View style={styles.dot} />}
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.offText} numberOfLines={1}>I’m playing here</Text>
        </Pressable>
      )}
      {p.error ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.error}>{p.error}</Text> : null}
    </View>
  );
}

/**
 * "You're at <court>? · Light it up" on Find Players (AT_COURT_PROMPT): when the phone already knows you are
 * standing at a court (useAtCourtPrompt), one tap says you're playing there, exactly as the court card's button
 * does. Nothing is shared until that tap; the (x) puts it away.
 */
export function AtCourtPrompt({ active }: { active: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const { court, close } = useAtCourtPrompt(active);
  const p = usePlayingHere(court?.id ?? null, court?.access ?? 'unknown');
  if (!court || !p.can) return null;
  const name = court.name && court.name !== 'Tennis courts' ? court.name : 'a court';
  const go = async () => {
    if (!(await p.start())) return;
    close();
    showToast({ title: 'You’re playing here', body: `${name === 'a court' ? 'The court' : name} is lit for 2 hours. Friends who follow you back see your name.`, icon: 'checkmark-circle-outline' });
  };
  return (
    <View style={styles.prompt}>
      <View style={styles.promptRow}>
        <View style={styles.promptDisc}><CourtGlyph size={14} color={colors.brand} /></View>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.promptText} numberOfLines={2}>You’re at <Text style={styles.promptName}>{name}</Text>?</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Light it up: say you’re playing at ${name}`} disabled={p.busy} onPress={() => { void go(); }} hitSlop={buttonShape.smallSlop} style={({ pressed }) => [styles.lightUp, pressed && styles.pressed]}>
          {p.busy ? <ActivityIndicator size="small" color={colors.brandInk} /> : <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.lightUpText}>Light it up</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Not now" hitSlop={10} onPress={close} style={({ pressed }) => [styles.promptClose, pressed && styles.pressed]}>
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </Pressable>
      </View>
      {p.error ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.error}>{p.error}</Text> : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: buttonShape.smallHeight + 6, paddingHorizontal: 14, borderRadius: buttonShape.smallRadius, ...buttonShape.curve },
  rowOff: { justifyContent: 'center', backgroundColor: colors.brandDim },
  rowOn: { backgroundColor: colors.brandDim },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  offText: { ...typography.smallStrong, fontSize: buttonShape.smallLabel, color: colors.brand },
  onText: { ...typography.smallStrong, flex: 1, color: colors.brand },
  leave: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.surface },
  leaveText: { ...typography.smallStrong, color: colors.text },
  pressed: { transform: [{ scale: 0.97 }] },
  why: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.lg },
  whyText: { ...typography.small, flex: 1, color: colors.textMuted },
  error: { ...typography.small, color: colors.danger },
  prompt: { marginHorizontal: spacing.lg, marginTop: spacing.sm, gap: 4 },
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8, paddingLeft: 8, paddingRight: 6, borderRadius: radius.lg, ...buttonShape.curve, backgroundColor: colors.brandDim },
  promptDisc: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  promptText: { ...typography.small, ...font('500'), flex: 1, color: colors.text },
  promptName: { ...font('700') },
  lightUp: { minHeight: buttonShape.smallHeight - 4, paddingHorizontal: 12, borderRadius: buttonShape.smallRadius, ...buttonShape.curve, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  lightUpText: { ...typography.smallStrong, color: colors.brandInk },
  promptClose: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
});

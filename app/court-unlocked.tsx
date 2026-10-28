import { PRESS_DIM } from '@/theme/press';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { DragSheet } from '@/components/DragSheet';
import { CourtMapSnapshots, CourtMapThumb } from '@/components/map/CourtMapThumb';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { Button } from '@/components/ui';
import { Bar, BadgeDisc, CardSwatch } from '@/features/courtUnlocks/DesignParts';
import { MY_COURTS, NEXT_CARD } from '@/features/courtUnlocks/designDemo';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography, withAlpha } from '@/theme';
import { corner } from '@/theme/look';
import { TextScale } from '@/theme/textScale';

/**
 * DESIGN BRANCH ONLY (design/court-unlocks): the "Court unlocked" moment.
 *
 * It follows the Logged note when a session or a hit is logged at a court
 * you have never logged at: the court's own block of map with its mark in
 * the middle, filled in your colour (on a phone the outline draws in, then
 * fills once, with one soft glow that settles; Reduce Motion: already
 * filled), what it was ("Juniper Community Park is your 6th court"), the
 * next badge and the next profile card, and in small print what friends see.
 * No confetti, no sound, no counting up over and over: one calm moment.
 */
export default function CourtUnlockedSheet() {
  const styles = useThemedStyles(styleDefinitions);
  const { width } = useWindowDimensions();
  const [closeSignal, setCloseSignal] = useState(0);
  const [contentH, setContentH] = useState(0);
  const close = () => setCloseSignal((n) => n + 1);
  const court = MY_COURTS[0];
  const count = MY_COURTS.length;
  const mapW = Math.min(width, 560) - spacing.lg * 2;
  const MAP_H = 150;
  const header = (
    <View style={styles.head}>
      <View style={[styles.map, { width: mapW, height: MAP_H }]}>
        <CourtMapSnapshots />
        <CourtMapThumb lat={court.lat} lng={court.lng} width={mapW} height={MAP_H} zoom={15.2} />
        {/* The court's mark in your colour, with one soft glow round it. */}
        <View pointerEvents="none" style={styles.markWrap}>
          <View style={[styles.glow, { width: 104, height: 104, borderRadius: 52, backgroundColor: withAlpha(colors.brand, 0.10) }]} />
          <View style={[styles.glow, { width: 74, height: 74, borderRadius: 37, backgroundColor: withAlpha(colors.brand, 0.16) }]} />
          <View style={[styles.mark, { boxShadow: `0px 6px 14px ${withAlpha(colors.brand, 0.35)}` }]}>
            <CourtGlyph size={22} color={colors.brandInk} />
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={close} style={({ pressed }) => [styles.close, pressed && { opacity: PRESS_DIM }]}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      <View style={styles.words}>
        <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.title}>Court unlocked</Text>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.line}>
          <Text style={styles.lineStrong}>{court.name}</Text> is your {count}th court.
        </Text>
      </View>
    </View>
  );
  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={() => router.back()} peekFraction={0.86} contentHeight={contentH || undefined} header={header}>
      <ScrollView contentContainerStyle={styles.body} onContentSizeChange={(_, h) => { const r = Math.ceil(h); if (r !== contentH) setContentH(r); }}>
        <View style={styles.rows}>
          <View style={styles.row}>
            <BadgeDisc n={10} state="next" have={count} size={44} />
            <View style={styles.rowWords}>
              <View style={styles.rowTop}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowTitle}>10 courts badge</Text>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowFar}>{count} of 10</Text>
              </View>
              <Bar have={count} need={10} />
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowSub}>{10 - count} more courts to go</Text>
            </View>
          </View>
          <View style={[styles.row, styles.rowLine]}>
            <View style={styles.cardLead}><CardSwatch width={30} /></View>
            <View style={styles.rowWords}>
              <View style={styles.rowTop}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowTitle}>Next card: {NEXT_CARD.name}</Text>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowFar}>{NEXT_CARD.have} of {NEXT_CARD.need}</Text>
              </View>
              <Bar have={NEXT_CARD.have} need={NEXT_CARD.need} />
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowSub}>Days played this month</Text>
            </View>
          </View>
        </View>
        <View style={styles.actions}>
          <Button label="See your courts" onPress={() => router.replace('/your-courts')} full />
          <Pressable accessibilityRole="button" onPress={close} style={({ pressed }) => [styles.done, pressed && { opacity: PRESS_DIM }]}>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
        <View style={styles.fine}>
          <Ionicons name="people-outline" size={14} color={colors.textFaint} />
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.fineText}>Friends see “Alex unlocked {court.name}”. Never where you are now.</Text>
        </View>
      </ScrollView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  head: { gap: spacing.lg, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  map: { borderRadius: corner(16), overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignSelf: 'center' },
  markWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute' },
  mark: { width: 50, height: 50, borderRadius: corner(13), backgroundColor: colors.brand, borderWidth: 3, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', top: 10, right: 10, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.16)' },
  words: { gap: 4 },
  title: { ...typography.title, fontSize: 24, letterSpacing: -0.5, color: colors.text },
  line: { ...typography.body, lineHeight: 21, color: colors.textMuted },
  lineStrong: { ...font('600'), color: colors.text },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.lg },
  rows: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  cardLead: { width: 44, alignItems: 'center' },
  rowWords: { flex: 1, gap: 6 },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  rowTitle: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  rowFar: { ...typography.small, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  rowSub: { ...typography.small, color: colors.textMuted },
  actions: { gap: 2 },
  done: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  doneText: { ...typography.bodyStrong, color: colors.textMuted },
  fine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: -spacing.sm },
  fineText: { ...typography.small, color: colors.textFaint, flexShrink: 1 },
});

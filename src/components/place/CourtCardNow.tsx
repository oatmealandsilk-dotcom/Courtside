import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { HitGlyph } from '@/components/HitGlyph';
import { surfaceLabel, type SurfaceKind } from '@/features/places/courtSurface';
import { colors, radius, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { TextScale } from '@/theme/textScale';

/*
 * A court card in its outlined look (CourtsNear's COURTS_LOOK 'now'): the
 * card everyone but an admin sees while map peek waits on the owner's phone
 * (CourtsNear's PEEK_FOR_EVERYONE). Across the top, the surface's tag and
 * what's on there; under them the name (two lines' room) and the line under
 * it. Courts near you and a city's Most active courts both show it, so the
 * two never differ. The card's frame (its outline, the press) is the
 * caller's, with nowFrame for its size and room.
 */

/** A card's width. */
export const NOW_CARD_W = 168;
/** The room inside a card, a little more than a grouped box's, since no fill marks its edge. */
export const NOW_PAD = spacing.lg - 2;
/** The card's size and room inside (the caller adds the outline and the press). */
export const nowFrame = StyleSheet.create({ card: { width: NOW_CARD_W, padding: NOW_PAD, gap: 4 } }).card;

export interface NowCardProps {
  name: string;
  /** The line under the name: how far, how many courts, lights; or a court's visits. */
  meta: string;
  kind?: SurfaceKind | null;
  /** The surface's colour (CourtsNear's surfaceTint). */
  tint?: string;
  /** The soonest open hit ("Tmrw 9 AM"), else how much was posted there. */
  hit?: string | null;
  posts?: string | null;
  /** A small plain tag first in the top row: a court's place among a city's most active ("#1"). */
  tag?: string | null;
  /** Alone in its row, with no other card to match: the words take only their own room, and an empty top row none. */
  fit?: boolean;
  /** A bigger name: the one wide card at the top of a list. */
  big?: boolean;
}

/**
 * Top left on a card, in place of the old court icon (Oct 24, owner: the icon was "too ai looking
 * and repetitive"; "Maybe something that says the surface of the court?"; he chose look 1): a small
 * outlined tag, a dot in the surface's colour and its word ("Hard"), the status pill beside it.
 * When the map does not say what the court is played on, no tag and no icon.
 */
export function NowCardBody(p: NowCardProps) {
  const styles = useThemedStyles(styleDefinitions);
  const words = (
    <>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.name, p.big && styles.nameBig]} numberOfLines={2}>{p.name}</Text>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{p.meta}</Text>
    </>
  );
  const nothingOnTop = !p.tag && !p.kind && !p.hit && !p.posts;
  return (
    <>
      {/* The surface's tag with what's on there beside it (a hit first, else its posts), so the card stays short. */}
      {p.fit && nothingOnTop ? null : (
        <View style={styles.top}>
          {p.tag ? <View style={styles.tag}><Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.tagText, styles.place]} numberOfLines={1}>{p.tag}</Text></View> : null}
          {/* Beside an open hit, the surface is its dot alone: the hit's time must read whole (the card's label still says the surface). */}
          {p.kind ? <View style={[styles.tag, p.hit ? styles.tagDotOnly : null]}><View style={[styles.tagDot, { backgroundColor: p.tint }]} />{p.hit ? null : <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.tagText} numberOfLines={1}>{surfaceLabel[p.kind]}</Text>}</View> : null}
          {p.hit ? <View style={[styles.badge, styles.badgeHit, styles.badgeRow]}><HitGlyph size={11} color={colors.brand} /><Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.badgeText, styles.badgeHitText]} numberOfLines={1}>{p.hit}</Text></View>
            : p.posts ? <View style={styles.badge}><Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.badgeText} numberOfLines={1}>{p.posts}</Text></View> : null}
        </View>
      )}
      {/* The name keeps two lines' room at every text size, the very rule the held cards use, so a
          strip of short names is never shorter than the strip it takes the place of. Alone in its row (fit), just its words. */}
      {p.fit ? <View style={styles.wordsRoom}>{words}</View> : (
        <View>
          <WordsRoom />
          <View style={styles.wordsOver}>{words}</View>
        </View>
      )}
    </>
  );
}

/** A card holding its place while the courts load: the same shape, a name's line and a distance's, in the page's quiet tone. */
export function NowHeldBody() {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <>
      <View style={styles.top}><View style={styles.heldTag} /></View>
      {/* The real card's room for its words (WordsRoom), under the quiet bars: the same height at every text size, so nothing moves when the courts come. */}
      <View>
        <WordsRoom />
        <View style={[styles.heldLine, styles.heldOver, { width: '82%' }]} />
        <View style={[styles.heldLine, styles.heldOver, styles.heldMeta, styles.heldMetaAt]} />
      </View>
    </>
  );
}

/**
 * The room a court card's words take, unseen: two lines of name and one of
 * distance at the phone's text size. Both the held cards and the real ones
 * stand on it, so the strip is the same height before and after the courts
 * come, whatever the names (Oct 22: a strip of one-line names was 20pt
 * shorter, and everything under it jumped up).
 */
function WordsRoom() {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.wordsRoom} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.name, styles.unseen]} numberOfLines={2}>{'Courts\nnear you'}</Text>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.meta, styles.unseen]} numberOfLines={1}>1 mi</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  // The old court tile's 36 pt height whatever stands there (a tag, a pill, or nothing), so no card is taller or shorter than another.
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, minHeight: 36 },
  // A small hairline tag, the surface's dot and its word.
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 7, paddingRight: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, flexShrink: 0 },
  tagDot: { width: 7, height: 7, borderRadius: 4 },
  tagText: { ...typography.caption, letterSpacing: 0, color: colors.text },
  // A place ("#1"): its figures one width.
  place: { fontVariant: ['tabular-nums'] },
  tagDotOnly: { paddingLeft: 7, paddingRight: 7 },
  name: { ...typography.bodyStrong, fontSize: 16, letterSpacing: -0.2, color: colors.text, lineHeight: 20 },
  nameBig: { ...typography.heading, lineHeight: 22 },
  meta: { ...typography.small, color: colors.textMuted },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.bgElevated, maxWidth: NOW_CARD_W - NOW_PAD * 2, flexShrink: 1 },
  badgeText: { ...typography.caption, letterSpacing: 0, color: colors.textMuted },
  badgeHit: { backgroundColor: colors.brandDim },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeHitText: { color: colors.brand },
  // The card's words over their room, from its top.
  wordsOver: { position: 'absolute', top: 0, left: 0, right: 0, gap: 4 },
  wordsRoom: { gap: 4 },
  unseen: { opacity: 0 },
  // The held card: a tag's place, then a name's line and a distance's.
  heldTag: { width: 56, height: 22, borderRadius: radius.pill, backgroundColor: colors.bgElevated },
  heldLine: { height: 14, marginVertical: 3, borderRadius: 7, backgroundColor: colors.bgElevated },
  heldMeta: { width: '48%', height: 12 },
  // Over the unseen words, from their top.
  heldOver: { position: 'absolute', top: 0, left: 0 },
  // The distance's bar, where the distance's line starts: under two name lines (20 each) and the gap.
  heldMetaAt: { top: 44 },
});

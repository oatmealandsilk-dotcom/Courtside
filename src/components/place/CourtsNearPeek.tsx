import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { HitGlyph } from '@/components/HitGlyph';
import { CourtMapSnapshots, CourtMapThumb } from '@/components/map/CourtMapThumb';
import { useOpenSettled, useStartMapsIn } from '@/features/feed/warmup';
import { surfaceLabel, type SurfaceKind } from '@/features/places/courtSurface';
import { useIsFocused } from '@/lib/useIsFocused';
import { colors, font, radius, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { TextScale } from '@/theme/textScale';

/*
 * A card in Courts near you, "Map peek" (Oct 24, owner: "Ok do map peek, but
 * fix the wording under. Right now it's not spaced well"): the court's own
 * map across the top with a small pin, its surface and what's on there as
 * two small chips on the map's foot, and under the map the name (up to two
 * lines) and how far, inside the card's own 12 pt margins.
 *
 * The maps are real pictures of each court's spot in the app's map look
 * (CourtMapThumb, the chat's court card's), never a drawing. When they are drawn:
 * - Never while the app is opening: not until the curtain has gone and the
 *   quiet moment after it is over (useOpenSettled, 1.5 s), and the page's own
 *   big map has painted (useStartMapsIn; or 3 s more at most).
 * - Only for the cards on screen (2–3 of them), then each further card as
 *   the strip is swiped to it, and only while the page is on show. One
 *   picture at a time (the queue).
 * - On a phone, by the one hidden web view the page mounts (CourtsNearSnapshots,
 *   the chat's own way), only while the page is on show, gone the moment
 *   each picture is kept. A card with no picture yet shows the stand-in.
 * - Once ever per court, size and theme: kept on disk (phone) or in the
 *   browser's cache, and shown at once, even under the curtain, after that.
 */

/** A card's width, the same as the card before it. */
export const PEEK_CARD_W = 168;
/** The map across the top, inside the card's 1 pt outline. */
const PEEK_W = PEEK_CARD_W - 2;
const PEEK_H = 84;
/** How close in: the park and the streets right around it. */
const ZOOM = 15;
/** The words' margins: the sides and foot alike, the top a little less (the map's edge is a line already). */
const SIDE = spacing.md;
const UNDER_MAP = 10;

/**
 * Whether the strip may draw new court pictures yet (see above). Only while
 * the page is on show: a card whose page is covered leaves the line, so a
 * chat or court page opened over it draws its own picture first.
 */
export function useCourtPicturesGo(): boolean {
  const onShow = useIsFocused();
  const settled = useOpenSettled();
  const mapsIn = useStartMapsIn();
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!settled || mapsIn) return undefined;
    const t = setTimeout(() => setLate(true), 3000);
    return () => clearTimeout(t);
  }, [settled, mapsIn]);
  return onShow && settled && (mapsIn || late);
}

/**
 * Where a phone draws the strip's pictures: the chat's own hidden web view
 * (CourtMapSnapshots), at the foot of the page and covered by it. Mounted
 * only while the page is on show (no page opened over it, its tab on
 * screen), so no other screen's drawing is ever done twice or out of sight.
 * A browser needs nothing here. The page mounts it once, first.
 */
export function CourtsNearSnapshots() {
  const onShow = useIsFocused();
  return onShow ? <CourtMapSnapshots /> : null;
}

export interface PeekCardProps {
  name: string;
  lat: number;
  lng: number;
  /** The line under the name: how far, how many courts, lights. */
  meta: string;
  kind: SurfaceKind | null;
  /** The surface's colour (CourtsNear's surfaceTint). */
  tint: string;
  /** The soonest open hit ("Tmrw 9 AM"), else how much was posted there. */
  hit: string | null;
  posts: string | null;
  /** Whether this card may draw its map now (on screen, and the opening over). */
  draw: boolean;
}

/** What a card shows. The card's frame (the press, its outline) is CourtsNear's, with peekFrame. */
export function PeekCardBody(p: PeekCardProps) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <>
      <View style={styles.peek}>
        <CourtMapThumb lat={p.lat} lng={p.lng} width={PEEK_W} height={PEEK_H} zoom={ZOOM} draw={p.draw} />
        <Pin />
        <Text pointerEvents="none" style={styles.credit}>© OpenStreetMap</Text>
        {/* On the map's foot: the surface and what's on there, small light chips. Beside an open hit the
            surface is its dot alone, so the hit's time always reads whole. */}
        <View style={styles.chips} pointerEvents="none">
          {p.kind ? (
            <View style={styles.chip}>
              <View style={[styles.dot, { backgroundColor: p.tint }]} />
              {p.hit ? null : <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.chipText} numberOfLines={1}>{surfaceLabel[p.kind]}</Text>}
            </View>
          ) : null}
          {p.hit ? <View style={[styles.chip, styles.chipHit]}><HitGlyph size={10} color={colors.brand} /><Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.chipText, styles.hitText]} numberOfLines={1}>{p.hit}</Text></View>
            : p.posts ? <View style={[styles.chip, styles.chipShrink]}><Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.chipText, styles.muted]} numberOfLines={1}>{p.posts}</Text></View> : null}
        </View>
      </View>
      <View style={styles.words}>
        {/* Two lines of name and one of distance, unseen, so every card is one height; the words sit on it from the top. */}
        <View>
          <Room />
          <View style={styles.over}>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={2}>{p.name}</Text>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{p.meta}</Text>
          </View>
        </View>
      </View>
    </>
  );
}

/** The court's spot on its map: a small dot in the court colour, ringed. */
function Pin() {
  const styles = useThemedStyles(styleDefinitions);
  return <View pointerEvents="none" style={styles.pinWrap}><View style={styles.pin} /></View>;
}

/**
 * The room a card's words take, unseen, at the phone's text size: two lines
 * of name and one of distance. The held cards and the real ones both stand
 * on it, so the strip is one height before and after the courts come, and a
 * one-line name's card is as tall as a two-line one's.
 */
function Room() {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.name, styles.unseen]} numberOfLines={2}>{'Courts\nnear you'}</Text>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.meta, styles.unseen]} numberOfLines={1}>1 mi</Text>
    </View>
  );
}

/** A card holding its place while the courts load: the same shape, in the page's quiet tone. */
export function PeekHeldBody() {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <>
      <View style={[styles.peek, styles.heldFill]} />
      <View style={styles.words}>
        <View>
          <Room />
          <View style={styles.over}>
            <View style={[styles.heldLine, { width: '82%' }]} />
            <View style={[styles.heldLine, styles.heldSmall, { width: '48%' }]} />
          </View>
        </View>
      </View>
    </>
  );
}

/** The card's own frame (CourtsNear adds the outline and the press): the map runs to its edges, its top corners the card's. */
export const peekFrame = StyleSheet.create({ card: { width: PEEK_CARD_W, padding: 0, gap: 0, overflow: 'hidden' } }).card;

const styleDefinitions = StyleSheet.create({
  peek: { width: PEEK_W, height: PEEK_H, backgroundColor: colors.bgElevated, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  credit: { position: 'absolute', right: 5, top: 3, fontSize: 7, lineHeight: 9, color: colors.textFaint, opacity: 0.8 },
  // The chips' dot lines up with the name's first letter below (6 in, plus the chip's own 6).
  chips: { position: 'absolute', left: 6, bottom: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, flexShrink: 0 },
  chipShrink: { flexShrink: 1 },
  chipHit: { backgroundColor: colors.brandDim, borderColor: colors.brandDim },
  chipText: { ...typography.caption, fontSize: 10.5, lineHeight: 14, letterSpacing: 0, color: colors.text },
  dot: { width: 7, height: 7, borderRadius: 4 },
  hitText: { color: colors.brand, ...font('600') },
  muted: { color: colors.textMuted },
  pinWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  pin: {
    width: 12, height: 12, borderRadius: 6, backgroundColor: colors.court, borderWidth: 2, borderColor: colors.surface,
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  // The words' own margins. The unseen room and the words over it share a plain box inside them: the
  // words, placed over the room, measure from that box's corner (placed straight in the padded box
  // they ignored its padding, which is what put the name against the map and the card's edge).
  words: { paddingHorizontal: SIDE, paddingTop: UNDER_MAP, paddingBottom: SIDE },
  name: { ...typography.bodyStrong, fontSize: 15.5, letterSpacing: -0.2, lineHeight: 19, color: colors.text },
  meta: { ...typography.small, lineHeight: 17, marginTop: 3, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  over: { position: 'absolute', top: 0, left: 0, right: 0 },
  unseen: { opacity: 0 },
  heldFill: { backgroundColor: colors.bgElevated },
  heldLine: { height: 14, marginVertical: 3, borderRadius: 7, backgroundColor: colors.bgElevated },
  heldSmall: { height: 12 },
});

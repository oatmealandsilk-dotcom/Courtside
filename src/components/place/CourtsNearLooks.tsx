import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { HitGlyph } from '@/components/HitGlyph';
import { CourtMapThumb } from '@/components/map/CourtMapThumb';
import { useOpenSettled, useStartMapsIn } from '@/features/feed/warmup';
import { surfaceLabel, type SurfaceKind } from '@/features/places/courtSurface';
import { formatMiles } from '@/features/players/geo';
import { colors, font, radius, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { TextScale } from '@/theme/textScale';

/*
 * Three other looks for a card in Courts near you (Oct 24, owner: "They still
 * could look better"), beside the card as it is ('now', in CourtsNear):
 *   N  Map peek: the court's own map on top, its surface and status as two small chips on the map's foot.
 *   O  Map left: a wider card, a square of the court's map beside its name, distance and surface.
 *   P  Refined type: no map and no tag; the name, then two quiet lines (distance · courts / surface · lights).
 *
 * The maps are real pictures of each court's spot in the app's map look
 * (CourtMapThumb, the chat's court card's), never a drawing. When they are drawn:
 * - Never while the app is opening: not until the curtain has gone and the
 *   quiet moment after it is over (useOpenSettled, 1.5 s), and the page's own
 *   big map has painted (useStartMapsIn; or 3 s more at most).
 * - Only for the cards on screen (2–3 of them), then each further card as
 *   the strip is swiped to it. One picture at a time (the queue).
 * - Once ever per court, size and theme: kept on disk (phone) or in the
 *   browser's cache, and shown at once, even under the curtain, after that.
 */
export type CourtsLook = 'N' | 'O' | 'P';

/** A card's width in each look. */
export const LOOK_CARD_W: Record<CourtsLook, number> = { N: 168, O: 260, P: 168 };
/** The map on top of a Map peek card, inside its 1 pt outline. */
const PEEK_W = LOOK_CARD_W.N - 2;
const PEEK_H = 84;
/** The square of map on a Map left card, and the room around it. */
const SQUARE = 72;
const O_PAD = 8;
/** How close in: the park and the streets right around it. */
const ZOOM = 15;

/** Whether the strip may draw new court pictures yet (see above). */
export function useCourtPicturesGo(): boolean {
  const settled = useOpenSettled();
  const mapsIn = useStartMapsIn();
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!settled || mapsIn) return undefined;
    const t = setTimeout(() => setLate(true), 3000);
    return () => clearTimeout(t);
  }, [settled, mapsIn]);
  return settled && (mapsIn || late);
}

export interface LookCardProps {
  look: CourtsLook;
  name: string;
  lat: number;
  lng: number;
  miles: number;
  count: number;
  lit?: boolean;
  kind: SurfaceKind | null;
  /** The surface's colour (CourtsNear's surfaceTint). */
  tint: string;
  /** The soonest open hit ("Tmrw 9 AM"), else how much was posted there. */
  hit: string | null;
  posts: string | null;
  /** Whether this card may draw its map now (on screen, and the opening over). */
  draw: boolean;
}

const courtsWord = (count: number) => (count > 1 ? `${count} courts` : null);

/** What a card shows, in its look. The card's frame (the press, its outline) is CourtsNear's. */
export function LookCardBody(p: LookCardProps) {
  const styles = useThemedStyles(styleDefinitions);
  const far = [formatMiles(p.miles), courtsWord(p.count)].filter(Boolean).join(' · ');
  if (p.look === 'N') {
    return (
      <>
        <View style={styles.peek}>
          <CourtMapThumb lat={p.lat} lng={p.lng} width={PEEK_W} height={PEEK_H} zoom={ZOOM} draw={p.draw} drawsHere />
          <Pin />
          <Text pointerEvents="none" style={styles.credit}>© OpenStreetMap</Text>
          {/* On the map's foot: the surface and what's on there, small light chips. */}
          <View style={styles.chips} pointerEvents="none">
            {p.kind ? (
              <View style={styles.chip}>
                <View style={[styles.dot, { backgroundColor: p.tint }]} />
                {p.hit ? null : <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.chipText} numberOfLines={1}>{surfaceLabel[p.kind]}</Text>}
              </View>
            ) : null}
            {p.hit ? <View style={[styles.chip, styles.chipHit]}><HitGlyph size={10} color={colors.brand} /><Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.chipText, styles.hitText]} numberOfLines={1}>{p.hit}</Text></View>
              : p.posts ? <View style={styles.chip}><Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.chipText, styles.muted]} numberOfLines={1}>{p.posts}</Text></View> : null}
          </View>
        </View>
        <View style={styles.peekWords}>
          <Room look="N" />
          <View style={styles.over}>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.nameN} numberOfLines={2}>{p.name}</Text>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.metaN} numberOfLines={1}>{far}</Text>
          </View>
        </View>
      </>
    );
  }
  if (p.look === 'O') {
    const surface = p.kind ? surfaceLabel[p.kind] : null;
    const third = [surface, p.lit ? 'lights' : null].filter(Boolean).join(' · ');
    return (
      <>
        <View style={styles.square}>
          <CourtMapThumb lat={p.lat} lng={p.lng} width={SQUARE} height={SQUARE} zoom={ZOOM} draw={p.draw} drawsHere />
          <Pin />
        </View>
        <View style={styles.side}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.nameO} numberOfLines={2}>{p.name}</Text>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.metaO} numberOfLines={1}>{far}</Text>
          {third || p.hit || p.posts ? (
            <View style={styles.lineO}>
              {p.kind ? <View style={[styles.dot, { backgroundColor: p.tint }]} /> : null}
              <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.metaO, styles.shrink]} numberOfLines={1}>
                {third}
                {p.hit ? <Text style={styles.hitText}>{third ? '  ·  ' : ''}{p.hit}</Text> : p.posts ? `${third ? ' · ' : ''}${p.posts}` : null}
              </Text>
            </View>
          ) : null}
        </View>
      </>
    );
  }
  // P: words only, in three steps of quiet.
  const second = [p.kind ? surfaceLabel[p.kind] : null, p.lit ? 'Lights' : null].filter(Boolean).join(' · ');
  return (
    <View>
      <Room look="P" />
      <View style={styles.over}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.nameP} numberOfLines={2}>{p.name}</Text>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.metaP, styles.firstMeta]} numberOfLines={1}>{far}</Text>
        {second ? <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.metaP, styles.quiet]} numberOfLines={1}>{second}</Text> : null}
        {p.hit ? (
          <View style={styles.statusP}><HitGlyph size={11} color={colors.brand} /><Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.metaP, styles.hitText]} numberOfLines={1}>{p.hit}</Text></View>
        ) : p.posts ? <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.metaP, styles.statusP, styles.quiet]} numberOfLines={1}>{p.posts}</Text> : null}
      </View>
    </View>
  );
}

/** The court's spot on its map: a small dot in the court colour, ringed. */
function Pin() {
  const styles = useThemedStyles(styleDefinitions);
  return <View pointerEvents="none" style={styles.pinWrap}><View style={styles.pin} /></View>;
}

/**
 * The room a card's words take, unseen, at the phone's text size: the most
 * lines a card in this look can show. The held cards and the real ones both
 * stand on it, so the strip is one height before and after the courts come.
 */
function Room({ look }: { look: 'N' | 'P' }) {
  const styles = useThemedStyles(styleDefinitions);
  const meta = look === 'N' ? styles.metaN : styles.metaP;
  return (
    <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <Text maxFontSizeMultiplier={TextScale.CARD} style={[look === 'N' ? styles.nameN : styles.nameP, styles.unseen]} numberOfLines={2}>{'Courts\nnear you'}</Text>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={[meta, look === 'P' && styles.firstMeta, styles.unseen]} numberOfLines={1}>1 mi</Text>
      {look === 'P' ? <Text maxFontSizeMultiplier={TextScale.CARD} style={[meta, styles.unseen]} numberOfLines={1}>Hard</Text> : null}
      {look === 'P' ? <Text maxFontSizeMultiplier={TextScale.CARD} style={[meta, styles.statusP, styles.unseen]} numberOfLines={1}>Hit</Text> : null}
    </View>
  );
}

/** A card holding its place while the courts load: its look's own shape, in the page's quiet tone. */
export function LookHeldBody({ look }: { look: CourtsLook }) {
  const styles = useThemedStyles(styleDefinitions);
  if (look === 'O') {
    return (
      <>
        <View style={[styles.square, styles.heldFill]} />
        <View style={styles.side}>
          <View style={[styles.heldLine, { width: '86%' }]} />
          <View style={[styles.heldLine, styles.heldSmall, { width: '52%' }]} />
          <View style={[styles.heldLine, styles.heldSmall, { width: '38%' }]} />
        </View>
      </>
    );
  }
  const bars = (
    <View>
      <Room look={look === 'N' ? 'N' : 'P'} />
      <View style={styles.over}>
        <View style={[styles.heldLine, { width: '82%' }]} />
        <View style={[styles.heldLine, styles.heldSmall, { width: '48%' }]} />
      </View>
    </View>
  );
  if (look === 'P') return bars;
  return (
    <>
      <View style={[styles.peek, styles.heldFill]} />
      <View style={styles.peekWords}>{bars}</View>
    </>
  );
}

/** The card's own frame in each look (CourtsNear adds the outline and the press). */
export function lookFrame(look: CourtsLook) {
  return look === 'N' ? frames.N : look === 'O' ? frames.O : frames.P;
}
const frames = StyleSheet.create({
  // The map runs to the card's edges, its top corners the card's.
  N: { width: LOOK_CARD_W.N, padding: 0, gap: 0, overflow: 'hidden' },
  O: { width: LOOK_CARD_W.O, padding: O_PAD, gap: spacing.md, flexDirection: 'row', alignItems: 'center' },
  // More air than today's 14.
  P: { width: LOOK_CARD_W.P, padding: spacing.lg, gap: 0 },
});

const styleDefinitions = StyleSheet.create({
  peek: { width: PEEK_W, height: PEEK_H, backgroundColor: colors.bgElevated, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  peekWords: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12 },
  credit: { position: 'absolute', right: 5, top: 3, fontSize: 7, lineHeight: 9, color: colors.textFaint, opacity: 0.8 },
  chips: { position: 'absolute', left: 6, bottom: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, flexShrink: 1 },
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
  nameN: { ...typography.bodyStrong, fontSize: 15.5, letterSpacing: -0.2, lineHeight: 19, color: colors.text },
  metaN: { ...typography.small, lineHeight: 17, marginTop: 3, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  // Map left: the square is rounded like the card, a step less (it sits inside it).
  square: { width: SQUARE, height: SQUARE, borderRadius: Math.max(4, radius.lg - O_PAD / 2), overflow: 'hidden', backgroundColor: colors.bgElevated },
  side: { flex: 1, minWidth: 0, gap: 2, justifyContent: 'center' },
  nameO: { ...typography.bodyStrong, fontSize: 15, letterSpacing: -0.2, lineHeight: 18, color: colors.text, marginBottom: 1 },
  metaO: { ...typography.small, fontSize: 12.5, lineHeight: 16, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  lineO: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  shrink: { flexShrink: 1 },
  nameP: { ...typography.bodyStrong, ...font('600'), fontSize: 17, letterSpacing: -0.35, lineHeight: 20, color: colors.text },
  metaP: { ...typography.small, lineHeight: 17, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  firstMeta: { marginTop: spacing.sm },
  quiet: { color: colors.textFaint },
  statusP: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.sm },
  over: { position: 'absolute', top: 0, left: 0, right: 0 },
  unseen: { opacity: 0 },
  heldFill: { backgroundColor: colors.bgElevated },
  heldLine: { height: 14, marginVertical: 3, borderRadius: 7, backgroundColor: colors.bgElevated },
  heldSmall: { height: 12 },
});

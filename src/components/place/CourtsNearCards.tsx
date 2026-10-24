import { PRESS_SHRINK } from '@/theme/press';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtGlyph } from '@/components/map/CourtGlyph';
import { HitGlyph } from '@/components/HitGlyph';
import { SwipePressable } from '@/components/SwipePressable';
import { tintOf } from '@/components/place/AerialCourt';
import { open, type CourtBadge } from '@/components/place/CourtsNearLooks';
import { useOnNow } from '@/components/place/CourtsNearPictures';
import { labelOf } from '@/features/places/courtName';
import type { CourtRow } from '@/features/players/courts';
import { formatMiles } from '@/features/players/geo';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, lift, radius, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';

export type CardLook = 'J' | 'K' | 'L' | 'M';

const CARD = 168;

/** A tiny court from above in its surface's colour, standing on end: outline, service lines, centre line and net only, so it stays crisp at 18 pt. */
function CourtMark({ tint }: { tint: string }) {
  const w = 18; const h = 26; const l = { stroke: colors.onMedia, strokeWidth: 1 };
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Rect x={0} y={0} width={w} height={h} rx={2.5} fill={tint} />
      <Rect x={2.5} y={2.5} width={w - 5} height={h - 5} fill="none" {...l} />
      <Line x1={2.5} y1={8} x2={w - 2.5} y2={8} {...l} />
      <Line x1={2.5} y1={h - 8} x2={w - 2.5} y2={h - 8} {...l} />
      <Line x1={w / 2} y1={8} x2={w / 2} y2={h - 8} {...l} />
      <Line x1={1} y1={h / 2} x2={w - 1} y2={h / 2} stroke={colors.onMedia} strokeWidth={1.6} />
    </Svg>
  );
}

/**
 * Close variations of the original court cards (Oct 24, owner after seeing the
 * original again: "Generate some more"), same size, shape, colours and type:
 * - J real court icon: the tile holds a tiny court from above in its surface's colour.
 * - K quieter tile: the tile is just the court's colour; what's on sits bottom right.
 * - L status first: what's on (in the accent) takes the distance's line; distance beside the name.
 * - M lighter card: no fill, a hairline border, more room, a slightly larger name.
 */
export function CourtsCards({ look, rows, badges }: { look: CardLook; rows: CourtRow[]; badges: Map<string, CourtBadge> }) {
  const styles = useThemedStyles(styleDefinitions);
  const onNow = useOnNow(rows, badges);
  const light = look === 'M';
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.title}>Courts near you</Text>
      </View>
      <ScrollView nativeID="courts-near-strip" horizontal showsHorizontalScrollIndicator={false} style={styles.scroller} contentContainerStyle={styles.row}>
        {rows.map(({ c, miles }) => {
          const badge = badges.get(c.id);
          const now = onNow.get(c.id);
          const count = c.count > 1 ? `${c.count} courts` : null;
          const meta = [formatMiles(miles), count, c.lit ? 'lights' : null].filter(Boolean).join(' · ');
          const pill = badge?.hit ? (
            <View style={[styles.badge, styles.badgeHit, styles.badgeRow]}><HitGlyph size={11} color={colors.brand} /><Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.badgeText, styles.badgeHitText]} numberOfLines={1}>{badge.hit}</Text></View>
          ) : badge?.posts ? <View style={styles.badge}><Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.badgeText} numberOfLines={1}>{badge.posts}</Text></View> : null;
          const tile = look === 'J' ? <View style={styles.tile}><CourtMark tint={tintOf(c)} /></View>
            : look === 'K' ? <View style={[styles.swatch, { backgroundColor: tintOf(c) }]} />
            : <View style={styles.tile}><CourtGlyph size={18} color={colors.brand} /></View>;
          return (
            <SwipePressable
              key={c.id}
              accessibilityRole="link"
              accessibilityLabel={[labelOf(c), meta, look === 'L' ? now : badge?.hit ? `hit ${badge.hit}` : null, badge?.posts].filter(Boolean).join(', ')}
              onPress={() => open(c)}
              style={({ pressed }) => [styles.card, light && styles.cardM, pressed && styles.cardPressed]}
            >
              <View style={[styles.top, look === 'K' && styles.topK]}>
                {tile}
                {look === 'L' || look === 'K' ? null : pill}
              </View>
              <View>
                <Room tight={look === 'K'} />
                {look === 'L' ? (
                  <View style={styles.over}>
                    <View style={styles.nameRow}>
                      <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.name, styles.nameL]} numberOfLines={2}>{labelOf(c)}</Text>
                      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.miles} numberOfLines={1}>{formatMiles(miles)}</Text>
                    </View>
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={now ? styles.now : styles.meta} numberOfLines={1}>{now ?? ([count ?? '1 court', c.lit ? 'lights' : null].filter(Boolean).join(' · '))}</Text>
                  </View>
                ) : look === 'K' ? (
                  <View style={[styles.over, styles.overK]}>
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={2}>{labelOf(c)}</Text>
                    <View style={styles.metaRow}>
                      <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.meta, styles.metaGrow]} numberOfLines={1}>{pill ? [formatMiles(miles), count].filter(Boolean).join(' · ') : meta}</Text>
                      {pill}
                    </View>
                  </View>
                ) : (
                  <View style={styles.over}>
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.name, light && styles.nameM]} numberOfLines={2}>{labelOf(c)}</Text>
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{meta}</Text>
                  </View>
                )}
              </View>
            </SwipePressable>
          );
        })}
        <SwipePressable accessibilityRole="link" accessibilityLabel="See all courts on the map" onPress={() => router.push('/map')} style={({ pressed }) => [styles.card, light && styles.cardM, styles.allCard, pressed && styles.cardPressed]}>
          <View style={styles.allDisc}><Ionicons name="map-outline" size={20} color={colors.brand} /></View>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.allText}>See all on the map</Text>
        </SwipePressable>
      </ScrollView>
    </View>
  );
}

/**
 * Two lines of name and one of distance, unseen: the room the original cards' words take (gap 4),
 * so the strip is as tall as the held one before it. K's tighter words (gap 2) give back the 2 pt its tile's room adds.
 */
function Room({ tight }: { tight: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={[styles.room, tight && styles.overK]} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.name, styles.unseen]} numberOfLines={2}>{'Courts\nnear you'}</Text>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.meta, styles.unseen]} numberOfLines={1}>1 mi</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: spacing.sm },
  title: { ...typography.title, color: colors.text },
  scroller: { flexGrow: 0 },
  row: { gap: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.lg },
  card: { ...lift, width: CARD, padding: spacing.md, gap: 4, borderRadius: radius.lg, backgroundColor: colors.surface },
  cardPressed: { transform: [{ scale: PRESS_SHRINK }] },
  // M: no fill and no lift, a hairline in the theme's border colour, a little more room inside.
  cardM: { boxShadow: '0px 0px 0px transparent', backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border, padding: spacing.lg - 2 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  topK: { marginBottom: 8 },
  tile: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  // K: the court's own colour as a soft swatch, nothing drawn on it.
  swatch: { width: 36, height: 36, borderRadius: 11, opacity: 0.85 },
  name: { ...typography.bodyStrong, color: colors.text, lineHeight: 20 },
  nameM: { fontSize: 16, lineHeight: 20, letterSpacing: -0.2 },
  nameL: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  miles: { ...typography.caption, letterSpacing: 0, fontSize: 12, lineHeight: 20, color: colors.textFaint },
  meta: { ...typography.small, color: colors.textMuted },
  now: { ...typography.smallStrong, color: colors.brand },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaGrow: { flex: 1, minWidth: 0 },
  over: { position: 'absolute', top: 0, left: 0, right: 0, gap: 4 },
  overK: { gap: 2 },
  room: { gap: 4 },
  unseen: { opacity: 0 },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.bgElevated, maxWidth: CARD - spacing.md * 2, flexShrink: 1 },
  badgeText: { ...typography.caption, letterSpacing: 0, color: colors.textMuted },
  badgeHit: { backgroundColor: colors.brandDim },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeHitText: { color: colors.brand },
  allCard: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  allDisc: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  allText: { ...typography.smallStrong, color: colors.brand, textAlign: 'center' },
});

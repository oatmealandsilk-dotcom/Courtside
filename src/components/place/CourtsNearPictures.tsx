import { PRESS_DIM, PRESS_SHRINK } from '@/theme/press';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AerialCourt, surfaceOf } from '@/components/place/AerialCourt';
import { courtLine, distance, Head, open, Room, type CourtBadge } from '@/components/place/CourtsNearLooks';
import { SwipePressable } from '@/components/SwipePressable';
import { labelOf } from '@/features/places/courtName';
import { nowStatus } from '@/features/players/courtSummary';
import type { Court, CourtRow } from '@/features/players/courts';
import { formatMiles } from '@/features/players/geo';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';

export type PictureLook = 'G' | 'H' | 'I';

/** G's postcard and H's card, in points. */
const G_W = 232; const G_H = 132;
const H_W = 156; const H_H = 200;
const I_H = 176;

/** What is on at each court, in a few words: the latest report ("Free · 20 min ago"), else the next open hit. */
export function useOnNow(rows: CourtRow[], badges: Map<string, CourtBadge>): Map<string, string> {
  const { courtNow, currentUserId, actions } = useApp();
  const ids = rows.map((r) => r.c.id).join(',');
  // The latest reports for these courts (the court page asks the same).
  useEffect(() => { if (currentUserId && ids) void actions.loadCourtInfo(ids.split(',')).catch(() => undefined); }, [ids, currentUserId, actions]);
  return useMemo(() => {
    const out = new Map<string, string>();
    for (const { c } of rows) {
      const status = nowStatus(courtNow[c.id]);
      const hit = badges.get(c.id)?.hit;
      if (status) out.set(c.id, status.line);
      else if (hit) out.set(c.id, `Hit ${hit}`);
    }
    return out;
  }, [rows, courtNow, badges]);
}

const said = (c: Court, miles: number, now: string | undefined) => [labelOf(c), distance(c, miles), surfaceOf(c), c.lit ? 'lights' : null, now].filter(Boolean).join(', ');

/**
 * Courts near you drawn as pictures (Oct 24, owner on C to F: "Not aesthetic").
 * - G postcard: landscape cards, the courts from above on the page's ground; name and distance under.
 * - H court card: portrait cards in the court's colour, its lines turned and cut by the edges, the name in white.
 * - I big tile: the nearest court large, then the next two as small links under it.
 */
export function CourtsPictured({ look, rows, badges }: { look: PictureLook; rows: CourtRow[]; badges: Map<string, CourtBadge> }) {
  const styles = useThemedStyles(styleDefinitions);
  const onNow = useOnNow(rows, badges);
  const [wide, setWide] = useState(358);
  if (look === 'I') {
    const [first, ...rest] = rows;
    const now = onNow.get(first.c.id);
    return (
      <View style={styles.wrap}>
        <Head link />
        <SwipePressable accessibilityRole="link" accessibilityLabel={said(first.c, first.miles, now)} onPress={() => open(first.c)} style={({ pressed }) => [styles.iMain, pressed && styles.cardPressed]}>
          <View style={styles.iPicture} onLayout={(e) => { const w = Math.round(e.nativeEvent.layout.width); if (w > 0 && w !== wide) setWide(w); }}>
            <AerialCourt court={first.c} width={wide} height={I_H} frame="bleed" id={first.c.id} />
          </View>
          <View style={styles.iWords}>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.iName} numberOfLines={1}>{labelOf(first.c)}</Text>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{`${formatMiles(first.miles)} · ${courtLine(first.c)}`}</Text>
            {now ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.iNow} numberOfLines={1}>{now}</Text> : null}
          </View>
        </SwipePressable>
        {rest.length ? (
          <View style={styles.iMore}>
            {rest.slice(0, 2).map(({ c, miles }, i) => (
              <SwipePressable key={c.id} accessibilityRole="link" accessibilityLabel={said(c, miles, onNow.get(c.id))} onPress={() => open(c)} style={({ pressed }) => [styles.iLink, i > 0 && styles.iLinkRule, pressed && styles.pressed]}>
                <View>
                  <Room />
                  <View style={styles.over}>
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={2}>{labelOf(c)}</Text>
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{formatMiles(miles)}</Text>
                  </View>
                </View>
              </SwipePressable>
            ))}
          </View>
        ) : null}
      </View>
    );
  }
  const card = look === 'H';
  return (
    <View style={styles.wrap}>
      <Head link />
      <ScrollView nativeID="courts-near-strip" horizontal showsHorizontalScrollIndicator={false} style={styles.scroller} contentContainerStyle={card ? styles.hRow : styles.gRow}>
        {rows.map(({ c, miles }) => {
          const now = onNow.get(c.id);
          const pill = now ? <View style={styles.pill}><Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.pillText} numberOfLines={1}>{now}</Text></View> : null;
          return card ? (
            <SwipePressable key={c.id} accessibilityRole="link" accessibilityLabel={said(c, miles, now)} onPress={() => open(c)} style={({ pressed }) => [styles.hCard, pressed && styles.cardPressed]}>
              <AerialCourt court={c} width={H_W} height={H_H} frame="close" id={c.id} />
              {pill}
              <View style={styles.hWords}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.hName} numberOfLines={3}>{labelOf(c)}</Text>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.hMeta} numberOfLines={1}>{distance(c, miles)}</Text>
              </View>
            </SwipePressable>
          ) : (
            <SwipePressable key={c.id} accessibilityRole="link" accessibilityLabel={said(c, miles, now)} onPress={() => open(c)} style={({ pressed }) => [styles.gCard, pressed && styles.cardPressed]}>
              <View style={styles.gPicture}>
                <AerialCourt court={c} width={G_W} height={G_H} frame="postcard" id={c.id} />
                {pill}
              </View>
              <View style={styles.gWords}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={1}>{labelOf(c)}</Text>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{distance(c, miles)}</Text>
              </View>
            </SwipePressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** The section holding its place while the courts load, in each look's own shape. */
export function CourtsPicturedHeld({ look }: { look: PictureLook }) {
  const styles = useThemedStyles(styleDefinitions);
  const unseenLine = (style: object, text = 'Courts') => <Text maxFontSizeMultiplier={TextScale.CARD} style={[style, styles.unseen]} numberOfLines={1}>{text}</Text>;
  return (
    <View style={styles.wrap} accessible accessibilityLabel="Loading courts near you">
      <View style={styles.head}><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.title}>Courts near you</Text></View>
      {look === 'I' ? (
        <>
          <View style={styles.iMain}>
            <View style={[styles.iPicture, styles.held]} />
            <View style={styles.iWords}>
              <View>{unseenLine(styles.iName)}<View style={[styles.heldLine, styles.heldOver, { width: '62%', height: 16 }]} /></View>
              <View>{unseenLine(styles.meta, '1 mi')}<View style={[styles.heldLine, styles.heldOver, { width: '44%', height: 11 }]} /></View>
            </View>
          </View>
          <View style={styles.iMore}>
            {[0, 1].map((i) => (
              <View key={i} style={[styles.iLink, i > 0 && styles.iLinkRule]}><View><Room /><View style={[styles.heldLine, styles.heldOver, { width: '78%' }]} /></View></View>
            ))}
          </View>
        </>
      ) : (
        <View style={[look === 'H' ? styles.hRow : styles.gRow, styles.heldRow]}>
          {[0, 1, 2].map((i) => look === 'H' ? <View key={i} style={[styles.hCard, styles.held]} /> : (
            <View key={i} style={styles.gCard}>
              <View style={[styles.gPicture, styles.held]} />
              <View style={styles.gWords}>
                <View>{unseenLine(styles.name)}<View style={[styles.heldLine, styles.heldOver, { width: '70%' }]} /></View>
                <View>{unseenLine(styles.meta, '1 mi')}<View style={[styles.heldLine, styles.heldOver, { width: '40%', height: 11 }]} /></View>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: spacing.sm },
  title: { ...typography.title, color: colors.text },
  pressed: { opacity: PRESS_DIM },
  cardPressed: { transform: [{ scale: PRESS_SHRINK }] },
  scroller: { flexGrow: 0 },
  name: { ...typography.bodyStrong, color: colors.text, lineHeight: 20 },
  meta: { ...typography.small, color: colors.textMuted },
  over: { position: 'absolute', top: 0, left: 0, right: 0, gap: 2 },
  unseen: { opacity: 0 },
  // What is on there, over the picture's corner: a small pill of the page's own surface.
  pill: { position: 'absolute', top: 10, left: 10, maxWidth: H_W - 20, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.surface },
  pillText: { ...typography.caption, fontSize: 12, letterSpacing: 0, color: colors.text },
  // G: the postcard, the words under it on the page.
  gRow: { gap: 12, paddingBottom: spacing.xs },
  gCard: { width: G_W, gap: 10 },
  gPicture: { width: G_W, height: G_H, borderRadius: 16, overflow: 'hidden' },
  gWords: { gap: 2, paddingHorizontal: 2 },
  // H: the card is the court; the words sit in white on its darkened foot.
  hRow: { gap: 10, paddingBottom: spacing.xs },
  hCard: { width: H_W, height: H_H, borderRadius: 20, overflow: 'hidden' },
  hWords: { position: 'absolute', left: 13, right: 10, bottom: 13, gap: 2 },
  hName: { ...typography.bodyStrong, lineHeight: 19, letterSpacing: -0.2, color: colors.onMedia, textShadowColor: colors.checker, textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  hMeta: { ...typography.small, color: colors.onMedia, opacity: 0.9, textShadowColor: colors.checker, textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  // I: one big tile for the nearest, the next two as quiet links under it.
  iMain: { gap: 12 },
  iPicture: { height: I_H, borderRadius: 20, overflow: 'hidden' },
  iWords: { gap: 3, paddingHorizontal: 2 },
  iName: { ...typography.bodyStrong, fontSize: 19, lineHeight: 24, letterSpacing: -0.35, color: colors.text },
  iNow: { ...typography.smallStrong, color: colors.brand },
  iMore: { flexDirection: 'row', paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: 2 },
  iLink: { flex: 1, minWidth: 0, paddingRight: spacing.lg },
  iLinkRule: { paddingLeft: spacing.lg, paddingRight: 0, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
  // Held: the looks' own shapes in the page's quiet tone.
  held: { backgroundColor: colors.bgElevated },
  heldRow: { flexDirection: 'row', overflow: 'hidden' },
  heldLine: { height: 14, marginVertical: 3, borderRadius: 7, backgroundColor: colors.bgElevated },
  heldOver: { position: 'absolute', top: 0, left: 0 },
});

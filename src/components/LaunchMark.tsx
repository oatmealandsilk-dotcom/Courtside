import React, { useState } from 'react';
import { Platform, StyleSheet, Text, View, useWindowDimensions, type TextLayoutEvent } from 'react-native';

import { font } from '@/theme';

/*
 * The launch picture's logo, name and line, drawn (not a picture) at exactly
 * the place and size the phone's launch picture shows them on this screen, in
 * whatever colours are given (Oct 4, owner: the theme fade with nothing moving
 * and nothing missing, on any phone). The launch picture is 1284 × 2778 and the
 * phone draws it to cover the screen; every number below is a measurement of
 * it (assets/splash.png) carried through that same cover fit. Drawn shapes and
 * text appear on the first frame, where a picture loads a moment later.
 *
 * Measured again with Python + PIL (Oct 4, owner: "should not be misalignment
 * even if it's a tiny bit"), in picture pixels:
 * - Mark: rows 1229–1411, leaning 14°. Halfway down (row 1320) the frame spans
 *   556.0–683.0, sides 18.9 wide, bars 19 tall, the bar across on rows 1312–1327;
 *   the sideline spans 710.0–729.0. BrandMark's proportions are a touch off this
 *   (the old fit was 2 px short, the bar 1 px thin), so it is drawn from these.
 * - Name: ink 414–870, flat bottoms on 1575.0. The picture sets it in an
 *   Arial-like bold, not Inter, so no Inter size matches every letter; the
 *   closest overlay (least squares, whole word) is Inter Bold 99 px, tracking
 *   −0.0285 em, baseline 1575.1, 1.2 px right of the middle.
 * - Line: Inter Bold, not SemiBold (ink within 1% of Bold, 9% over SemiBold),
 *   caps 2461.0–2487.0: 35.6 px, tracking 0.09 em, on the middle (the old fit
 *   sat 1 px high).
 * iOS adds the letter spacing after the last letter too, which put a centred
 * line half a spacing off (the line 1.7 px left); typeAt puts that half back.
 * Apple's text engine can also round a line's depth below the baseline to a
 * whole point at these sizes (it does on a Mac: up to half a point, which is
 * 1.5 px on an iPhone 16 Pro), so each line reports where its baseline really
 * landed and is set by that, not by the font's sums (useDrawnBaseline).
 */
const PIC_W = 1284;
const PIC_H = 2778;
// The mark, in picture pixels, as it stands halfway down (the lean pivots there).
const MARK_TOP = 1229;
const MARK_H = 182;
const FRAME_LEFT = 556.04;
const FRAME_W = 126.92;
const FRAME_SIDE = 18.95; // sides 18.93, bars 19: one width for both
const BAR_TOP = 1312;
const BAR_H = 15;
const SLASH_LEFT = 710.04;
const SLASH_W = 18.92;
// The two lines of type: size and baseline in picture pixels, tracking in ems,
// and where the middle of the line sits (the picture's own middle is 642).
const NAME = { size: 99, tracking: -0.0285, baseline: 1575.1, centre: 643.2 };
const LINE = { size: 35.6, tracking: 0.09, baseline: 2486.95, centre: 642.1 };
// Inter's ascent and descent (2048 units to the em) and the line height used. iOS
// centres the letters in a line taller than the font's own, half the extra above.
const ASCENT = 1984 / 2048;
const DESCENT = 494 / 2048;
const LINE_HEIGHT = 1.2105;

/** Where the font's own sums put the baseline, down from the top of the line's box. */
const baselineBySums = (fontSize: number) => (ASCENT + (LINE_HEIGHT - ASCENT - DESCENT) / 2) * fontSize;

/**
 * Where each size of line has been seen to put its baseline, kept for the app's whole run, so a
 * later copy (the curtain, the cream cover after a sign-in) starts in the right place on its first frame.
 */
const drawnBaselines = new Map<string, number>();

/**
 * Where this line's baseline really sits in its box, once the phone has laid it out (a frame in,
 * under the cover); the font's sums until then. A reading more than a point from the sums is
 * not a rounding, so it is left alone (Oct 5).
 */
function useDrawnBaseline(fontSize: number) {
  const key = fontSize.toFixed(2);
  const [seen, setSeen] = useState<{ key: string; at: number }>();
  const at = seen?.key === key ? seen.at : drawnBaselines.get(key);
  const onTextLayout = (event: TextLayoutEvent) => {
    const first = event.nativeEvent.lines[0];
    if (!first) return;
    const drawn = first.y + first.ascender;
    if (!(Math.abs(drawn - baselineBySums(fontSize)) <= 1)) return;
    drawnBaselines.set(key, drawn);
    setSeen((was) => (was?.key === key && Math.abs(was.at - drawn) < 0.01 ? was : { key, at: drawn }));
  };
  return { at: at ?? baselineBySums(fontSize), onTextLayout };
}

/** The style that puts one line of the picture's type on its measured baseline and middle. */
function typeAt(spec: { size: number; tracking: number; baseline: number; centre: number }, s: number, oy: number, drawnBaseline: number) {
  const fontSize = spec.size * s;
  const letterSpacing = spec.tracking * fontSize;
  const shift = (spec.centre - PIC_W / 2) * s + (Platform.OS === 'ios' ? letterSpacing / 2 : 0);
  return {
    top: oy + spec.baseline * s - drawnBaseline,
    left: shift,
    right: -shift,
    fontSize,
    lineHeight: fontSize * LINE_HEIGHT,
    letterSpacing,
  };
}

export function LaunchMark({ ink, faint, line = 'Growing the game' }: { ink: string; faint: string; line?: string }) {
  const { width: W, height: H } = useWindowDimensions();
  const s = Math.max(W / PIC_W, H / PIC_H);
  const ox = (W - PIC_W * s) / 2;
  const oy = (H - PIC_H * s) / 2;
  const top = oy + MARK_TOP * s;
  const name = useDrawnBaseline(NAME.size * s);
  const tagline = useDrawnBaseline(LINE.size * s);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.lean, { top, height: MARK_H * s, left: ox + FRAME_LEFT * s, width: FRAME_W * s, borderWidth: FRAME_SIDE * s, borderColor: ink }]}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: (BAR_TOP - MARK_TOP - FRAME_SIDE) * s, height: BAR_H * s, backgroundColor: ink }} />
      </View>
      <View style={[styles.lean, { top, height: MARK_H * s, left: ox + SLASH_LEFT * s, width: SLASH_W * s, backgroundColor: ink }]} />
      <Text allowFontScaling={false} onTextLayout={name.onTextLayout} style={[styles.name, typeAt(NAME, s, oy, name.at), { color: ink }]}>CourtSide</Text>
      <Text allowFontScaling={false} onTextLayout={tagline.onTextLayout} style={[styles.line, typeAt(LINE, s, oy, tagline.at), { color: faint }]}>{line}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lean: { position: 'absolute', transform: [{ skewX: '-14deg' }] },
  name: { position: 'absolute', textAlign: 'center', ...font('700') },
  line: { position: 'absolute', textAlign: 'center', ...font('700'), textTransform: 'uppercase' },
});

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View, useWindowDimensions, type TextLayoutEvent } from 'react-native';
import Svg, { G, Rect } from 'react-native-svg';

import { font } from '@/theme';
import { LAUNCH_FADE_MS, launchShowing, whenLaunchHidden } from '@/lib/launchSplash';

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

function PictureLaunchMark({ ink, faint, line = 'Growing the game' }: { ink: string; faint: string; line?: string }) {
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

/*
 * Android (Oct 5). Android's own launch screen is not a full picture: it is
 * the icon's mark alone, 288 points square in the middle of the cream, with
 * no name and no line (assets/android-icon-foreground.png, see the
 * expo-splash-screen plugin in app.config.js). So on Android the app's first
 * screen draws that same mark at that same size, in the middle of the screen,
 * and the launch screen dissolves into it with nothing moving. The name and
 * the line then fade in under it, rather than appearing in the dissolve.
 *
 * The mark, measured from the icon file (1024 pixels square, drawn at 288
 * points) with Python + PIL, in its pixels: the frame 270 wide and 377 tall
 * round the middle row (512), its sides and bars 50.9 thick, the bar across
 * 38.6 tall on the middle; the sideline 51 wide, 41 to the right of the
 * frame and taller than it (417, 303.5 to 720.5, 20 past the frame
 * at each end); everything leaning 14° about the middle row. Android's shapes cannot
 * lean (a skew is dropped), so it is drawn as a picture.
 */
const ICON_PT = 288;
const ICON_PX = 1024;
const MARK = { left: 330.5, top: 323.5, width: 270, height: 377, side: 50.9, bar: 38.6, slashLeft: 641.5, slashWidth: 51, slashTop: 303.5, slashHeight: 417 };
/** How far below the middle of the screen the frame's foot sits, in points (the name is placed from it; the sideline reaches about 5.7 further). */
const MARK_BELOW = ((MARK.top + MARK.height) - ICON_PX / 2) * (ICON_PT / ICON_PX);

function AndroidLaunchMark({ ink, faint, line = 'Growing the game' }: { ink: string; faint: string; line?: string }) {
  // The name and line wait for the launch screen to go (they are not on it);
  // drawn later on (the curtain, a sign-in), they are simply there.
  const words = useRef(new Animated.Value(launchShowing() ? 0 : 1)).current;
  useEffect(() => whenLaunchHidden(() => {
    Animated.timing(words, { toValue: 1, duration: 420, delay: Math.round(LAUNCH_FADE_MS * 0.6), useNativeDriver: true }).start();
  }), [words]);
  const half = ICON_PX / 2;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.centre]}>
      <Svg width={ICON_PT} height={ICON_PT} viewBox={`0 0 ${ICON_PX} ${ICON_PX}`}>
        <G transform={`translate(${half} ${half}) skewX(-14) translate(${-half} ${-half})`}>
          <Rect x={MARK.left + MARK.side / 2} y={MARK.top + MARK.side / 2} width={MARK.width - MARK.side} height={MARK.height - MARK.side} fill="none" stroke={ink} strokeWidth={MARK.side} />
          <Rect x={MARK.left} y={half - MARK.bar / 2} width={MARK.width} height={MARK.bar} fill={ink} />
          <Rect x={MARK.slashLeft} y={MARK.slashTop} width={MARK.slashWidth} height={MARK.slashHeight} fill={ink} />
        </G>
      </Svg>
      <Animated.Text allowFontScaling={false} style={[styles.androidName, { color: ink, opacity: words, transform: [{ translateY: MARK_BELOW + 26 }] }]}>CourtSide</Animated.Text>
      <Animated.Text allowFontScaling={false} style={[styles.androidLine, { color: faint, opacity: words }]}>{line}</Animated.Text>
    </View>
  );
}

/** The launch screen's logo, name and line, drawn in the given colours (see above for each phone). */
export const LaunchMark = Platform.OS === 'android' ? AndroidLaunchMark : PictureLaunchMark;

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  // Just under the mark: laid out from the middle of the screen, so the mark itself never moves.
  androidName: { position: 'absolute', top: '50%', left: 0, right: 0, textAlign: 'center', fontSize: 30, lineHeight: 36, letterSpacing: -0.9, ...font('700') },
  androidLine: { position: 'absolute', bottom: '10.5%', left: 0, right: 0, textAlign: 'center', fontSize: 11.5, letterSpacing: 1, textTransform: 'uppercase', ...font('700') },
  lean: { position: 'absolute', transform: [{ skewX: '-14deg' }] },
  name: { position: 'absolute', textAlign: 'center', ...font('700') },
  line: { position: 'absolute', textAlign: 'center', ...font('700'), textTransform: 'uppercase' },
});

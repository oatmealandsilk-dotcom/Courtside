import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, PixelRatio, Platform, StyleSheet, Text, View, useWindowDimensions, type TextLayoutEvent } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';

import { font } from '@/theme';
import { LAUNCH_FADE_MS, launchHiddenAt, launchShowing, whenLaunchHidden } from '@/lib/launchSplash';
import { BRAND, LINE as LINE_SHAPE, PICTURE } from '@/components/launchPicture';

/*
 * The launch picture's logo, name and line, drawn (not a picture) at exactly
 * the place and size the phone's launch picture shows them on this screen, in
 * whatever colours are given (Oct 4, owner: the theme fade with nothing moving
 * and nothing missing, on any phone). The launch picture is 1284 × 2778 and the
 * phone draws it to cover the screen; every shape here is in that picture's
 * pixels (assets/splash.png) and is carried through that same cover fit.
 * Drawn shapes appear on the first frame, where a picture loads a moment later.
 *
 * The shapes are the picture's own (Oct 7, owner: "the courtsides don't match
 * up exactly"). Until then the name was set in Inter Bold, but the picture sets
 * it in an Arial-like bold the app does not carry, so the letters changed shape
 * at the hand-off however well the size and place were measured. Now the logo,
 * the name and the line are cut from the picture itself, following its edges to
 * a fraction of a pixel (scripts/trace-launch-picture.py writes launchPicture.ts),
 * so the cream hands over to exactly the same letters in your theme's colours.
 * A new launch picture needs that script run again, in the same build.
 * The line is drawn in the theme's launchLine: on the cream court that is the
 * picture's own grey, so there the hand-off changes nothing at all.
 *
 * Only a different line (while a newer version downloads) is set as text, in
 * Inter Bold, on the picture's line: caps 2461.0–2487.0, 35.6 px, tracking
 * 0.09 em, on the middle. iOS adds the letter spacing after the last letter
 * too, which put a centred line half a spacing off; typeAt puts that half back.
 * Apple's text engine can also round a line's depth below the baseline to a
 * whole point at these sizes (up to half a point, 1.5 px on an iPhone 16 Pro),
 * so the line reports where its baseline really landed and is set by that, not
 * by the font's sums (useDrawnBaseline).
 */
const PIC_W = PICTURE.width;
const PIC_H = PICTURE.height;
/** The picture's own line; any other line is set as text. */
const PICTURE_LINE = 'Growing the game';
// The text line: size and baseline in picture pixels, tracking in ems, and where
// the middle of the line sits (the picture's own middle is 642).
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

/**
 * One box of the launch picture (x, y, width, height in its pixels), drawn over exactly the place the
 * phone's picture shows it: the picture is scaled by `s` and its top left sits at (ox, oy).
 *
 * The phone lays every view out on whole screen pixels, rounding a box that falls between them, where
 * the launch picture itself sits wherever the scaling puts it, between pixels too. A box on its own
 * place would be moved by up to half a pixel, and the shapes in it with it. So the box is widened out
 * to the nearest whole pixels, and its window onto the picture (the viewBox) widened by the same, which
 * leaves every shape exactly where the picture has it.
 */
function PictureBox({ view, s, ox, oy, label, children }: { view: readonly number[]; s: number; ox: number; oy: number; label: string; children: React.ReactNode }) {
  const [x, y, w, h] = view;
  const px = PixelRatio.get();
  const left = Math.floor((ox + x * s) * px) / px;
  const top = Math.floor((oy + y * s) * px) / px;
  const width = Math.ceil((ox + (x + w) * s) * px) / px - left;
  const height = Math.ceil((oy + (y + h) * s) * px) / px - top;
  const seen = [(left - ox) / s, (top - oy) / s, width / s, height / s].join(' ');
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ position: 'absolute', left, top, width, height }}>
      <Svg width={width} height={height} viewBox={seen} preserveAspectRatio="none">{children}</Svg>
    </View>
  );
}

function PictureLaunchMark({ ink, faint, line = PICTURE_LINE }: { ink: string; faint: string; line?: string }) {
  const { width: W, height: H } = useWindowDimensions();
  const s = Math.max(W / PIC_W, H / PIC_H);
  const ox = (W - PIC_W * s) / 2;
  const oy = (H - PIC_H * s) / 2;
  const tagline = useDrawnBaseline(LINE.size * s);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <PictureBox view={BRAND.view} s={s} ox={ox} oy={oy} label="CourtSide">
        <Path d={BRAND.mark} fill={ink} fillRule="evenodd" />
        <Path d={BRAND.name} fill={ink} fillRule="evenodd" />
      </PictureBox>
      {line === PICTURE_LINE ? (
        <PictureBox view={LINE_SHAPE.view} s={s} ox={ox} oy={oy} label={line}>
          <Path d={LINE_SHAPE.d} fill={faint} fillRule="evenodd" />
        </PictureBox>
      ) : (
        <Text allowFontScaling={false} onTextLayout={tagline.onTextLayout} style={[styles.line, typeAt(LINE, s, oy, tagline.at), { color: faint }]}>{line}</Text>
      )}
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

/** The name and line fade in this long after the launch screen starts to go, over WORDS_MS. */
const WORDS_DELAY_MS = Math.round(LAUNCH_FADE_MS * 0.6);
const WORDS_MS = 420;
/** How far the words' fade-in has got, by the clock: a copy drawn partway through (the curtain, taking over from the loading screen) carries on from there. */
function wordsShown(): number {
  if (launchShowing()) return 0;
  const at = launchHiddenAt();
  return at ? Math.min(1, Math.max(0, (Date.now() - at - WORDS_DELAY_MS) / WORDS_MS)) : 1;
}

function AndroidLaunchMark({ ink, faint, line = 'Growing the game' }: { ink: string; faint: string; line?: string }) {
  // The name and line wait for the launch screen to go (they are not on it);
  // drawn later on (a sign-in), they are simply there. The curtain the loading screen hands over to
  // (at once, since Oct 6) picks the fade up where the loading screen's copy had got to, so nothing jumps.
  const words = useRef(new Animated.Value(wordsShown())).current;
  useEffect(() => whenLaunchHidden(() => {
    const from = wordsShown();
    if (from >= 1) { words.setValue(1); return; }
    const wait = Math.max(0, launchHiddenAt() + WORDS_DELAY_MS - Date.now());
    Animated.timing(words, { toValue: 1, duration: Math.round((1 - from) * WORDS_MS), delay: wait, easing: Easing.linear, useNativeDriver: true }).start();
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
  line: { position: 'absolute', textAlign: 'center', ...font('700'), textTransform: 'uppercase' },
});

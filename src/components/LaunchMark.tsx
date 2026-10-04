import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { BrandMark } from '@/components/BrandMark';
import { font } from '@/theme';

/*
 * The launch picture's logo, name and line, drawn (not a picture) at exactly
 * the place and size the phone's launch picture shows them on this screen, in
 * whatever colours are given (Oct 4, owner: the theme fade with nothing moving
 * and nothing missing, on any phone). The launch picture is 1284 × 2778 and the
 * phone draws it to cover the screen; every number below is a measurement of
 * it (assets/splash.png) carried through that same cover fit. Drawn shapes and
 * text appear on the first frame, where a picture loads a moment later.
 */
const PIC_W = 1284;
const PIC_H = 2778;
const MARK_TOP = 1230; // the mark's frame, top
const MARK_H = 180; // the mark's frame, height
const NAME_CAP_TOP = 1502; // top of the capital C
const NAME_CAP_H = 72;
const LINE_CAP_TOP = 2460; // top of GROWING THE GAME
const LINE_CAP_H = 26;
const CAP = 0.727; // Inter's capital height, as a share of its size
const ASCENT = 0.96875; // Inter's ascent, as a share of its size

export function LaunchMark({ ink, faint, line = 'Growing the game' }: { ink: string; faint: string; line?: string }) {
  const { width: W, height: H } = useWindowDimensions();
  const s = Math.max(W / PIC_W, H / PIC_H);
  const oy = (H - PIC_H * s) / 2;
  // BrandMark draws its frame 0.72 of its size tall, starting 0.14 down.
  const mark = (MARK_H * s) / 0.72;
  const markTop = oy + MARK_TOP * s - 0.14 * mark;
  const nameSize = (NAME_CAP_H * s) / CAP;
  const nameTop = oy + NAME_CAP_TOP * s - (ASCENT - CAP) * nameSize;
  const lineSize = (LINE_CAP_H * s) / CAP;
  const lineTop = oy + LINE_CAP_TOP * s - (ASCENT - CAP) * lineSize;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', top: markTop, left: (W - mark) / 2 }}>
        <BrandMark size={mark} color={ink} />
      </View>
      <Text allowFontScaling={false} style={[styles.name, { top: nameTop + 0.012 * nameSize, fontSize: nameSize, lineHeight: nameSize * 1.2105, letterSpacing: -nameSize / 34, color: ink }]}>CourtSide</Text>
      <Text allowFontScaling={false} style={[styles.line, { top: lineTop, fontSize: lineSize, lineHeight: lineSize * 1.2105, letterSpacing: lineSize * 0.095, color: faint }]}>{line}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  name: { position: 'absolute', left: 0, right: 0, textAlign: 'center', ...font('700') },
  line: { position: 'absolute', left: 0, right: 0, textAlign: 'center', ...font('600'), textTransform: 'uppercase' },
});

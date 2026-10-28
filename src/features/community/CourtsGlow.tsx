import React, { useId, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useApp } from '@/store/AppContext';
import { spacing } from '@/theme';
import { themes, useTheme, type ThemeName } from '@/theme/ThemeProvider';

/**
 * Soft light behind Courts near you on Find Players, bleeding in from the screen's edges the way
 * Strava's sits behind its cards. Oct 26, owner, with Strava's Progress page beside his Community
 * page: "Under this line in community, let's play around with adding a gradient or a depth kinda
 * cool looking thing behind. Like Strava does. Keep it subtle"; then "the community glow should
 * only appear under courts near you"; then "the fade should correspond to the theme, also move it
 * down a bit. and then even lower lets add another on the righter side".
 *
 * Two lights, each faded out well before its own edges so neither ever shows a line:
 *  - from the left, low behind the court cards;
 *  - from the right, lower still, under the section (it falls behind what comes next).
 * Each court's own two colours (THEME_LIGHTS): its court colour on the left, its second colour on
 * the right where it has one that reads on its page (Melbourne's aqua, Paris's amber, London's
 * purple, CourtSide's peach); Clean, Night and New York keep their one colour on both sides (a warm
 * light on New York's navy turned a muddy olive). Each is as strong as the next on its own page
 * (STRENGTH), never animated, behind everything (it never tints a court's little map), no touches.
 *
 * Admins first (the same pattern as the map peek): COURTS_GLOW_FOR_EVERYONE turns it on for all.
 */
export const COURTS_GLOW_FOR_EVERYONE = false;

/** Whether this person sees the light: everyone once it is released, admins until then. */
export function useCourtsGlowOn(): boolean {
  const { users, currentUserId } = useApp();
  const admin = !!users.find((u) => u.id === currentUserId)?.isAdmin;
  return COURTS_GLOW_FOR_EVERYONE || admin;
}

/** How far above the section the drawing starts, and how far below it runs (the right light lives down there). */
const ABOVE = 40;
const BELOW = 470;
/** Where each light sits: the left one low in the section, the right one well under it (points). */
const LEFT_AT = 0.8;
const RIGHT_BELOW = 260;

/** Which of the palette's colours each side's light takes, per court. */
const THEME_LIGHTS: Record<ThemeName, readonly ['court' | 'brand', 'court' | 'brand' | 'cardGlowBottom' | 'cardTouch']> = {
  clean: ['court', 'court'],
  night: ['brand', 'brand'],
  'us-open': ['court', 'court'],
  ao: ['court', 'cardGlowBottom'],
  'roland-garros': ['court', 'cardGlowBottom'],
  wimbledon: ['court', 'cardTouch'],
  default: ['brand', 'cardGlowBottom'],
};

/**
 * How far each light moves its page at its centre (RGB distance): the same on every court, so a
 * pale colour on a pale page shows as much as a deep one, never more. 46 is Clean's green at 15%.
 */
// Oct 28 (owner: "the gradients here could be dialed back a tiny tiny bit, also make the one on the right a tiny bit lower"): 46 → 40, right light 50 pt lower.
const STRENGTH = 40;
const MAX_ALPHA = 0.5;

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** The strength a colour needs on this page to move it by STRENGTH. */
function alphaFor(color: string, page: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(color) || !/^#[0-9a-f]{6}$/i.test(page)) return 0.15;
  const [a, b] = [rgb(color), rgb(page)];
  const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  return distance ? Math.min(MAX_ALPHA, STRENGTH / distance) : 0;
}

/** Smooth at both ends (no ring where a light ends): 1 at the centre, 0 at the edge. */
const FALLOFF = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => [t, 1 - (3 * t * t - 2 * t * t * t)] as const);

/**
 * An oval light. Phones draw an SVG radial gradient's rx/ry as an oval; browsers ignore rx/ry and
 * draw a circle, so on the web the same oval is drawn with a gradientTransform.
 */
const ellipse = (cx: number, cy: number, rx: number, ry: number) => (Platform.OS === 'web'
  ? { cx: 0, cy: 0, r: 1, gradientTransform: `translate(${cx} ${cy}) scale(${rx} ${ry})` }
  : { cx, cy, rx, ry });

/**
 * The lights, laid as the first child of the section (so the heading and the cards draw over it,
 * and so does whatever follows the section). The drawing reaches out to the screen's edges past the
 * page's side margins, from a little above the section to well below it, sized once laid out.
 */
export const CourtsGlow = React.memo(function CourtsGlow() {
  const { theme } = useTheme();
  // The court's name is in the ids: iOS keeps a gradient by id and would not repaint one whose colour changed under the same name.
  const id = `${useId().replace(/[^a-zA-Z0-9]/g, '')}${theme.replace(/-/g, '')}`;
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const palette = themes[theme];
  const [leftKey, rightKey] = THEME_LIGHTS[theme] ?? THEME_LIGHTS.clean;
  const lights = box ? (() => {
    const { w, h } = box;
    const section = Math.max(1, h - ABOVE - BELOW);
    // Left: low in the section, faded out before the drawing's top.
    const ly = ABOVE + section * LEFT_AT;
    const left = { color: palette[leftKey], cx: -0.18 * w, cy: ly, rx: 0.95 * w, ry: Math.min(ly, 170) };
    // Right: under the section, faded out before the drawing's bottom.
    const rightY = ABOVE + section + RIGHT_BELOW;
    const right = { color: palette[rightKey], cx: 1.18 * w, cy: rightY, rx: 0.95 * w, ry: Math.min(h - rightY, 190) };
    return [left, right];
  })() : [];
  return (
    <View
      pointerEvents="none"
      style={styles.glow}
      onLayout={(e) => { const { width, height } = e.nativeEvent.layout; setBox((b) => (b && b.w === width && b.h === height ? b : { w: width, h: height })); }}
    >
      {box ? (
        <Svg width={box.w} height={box.h} viewBox={`0 0 ${box.w} ${box.h}`}>
          <Defs>
            {lights.map((light, i) => {
              const alpha = alphaFor(light.color, palette.bg);
              return (
                <RadialGradient key={i} id={`courts${i}${id}`} {...ellipse(light.cx, light.cy, light.rx, light.ry)} gradientUnits="userSpaceOnUse">
                  {FALLOFF.map(([t, f]) => <Stop key={t} offset={t} stopColor={light.color} stopOpacity={alpha * f} />)}
                </RadialGradient>
              );
            })}
          </Defs>
          {lights.map((_, i) => <Rect key={i} x="0" y="0" width={box.w} height={box.h} fill={`url(#courts${i}${id})`} />)}
        </Svg>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  glow: { position: 'absolute', top: -ABOVE, bottom: -BELOW, left: -spacing.lg, right: -spacing.lg },
});

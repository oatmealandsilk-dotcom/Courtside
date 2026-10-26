import React, { useId } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useResponsive } from '@/lib/useResponsive';
import { themes, useTheme } from '@/theme/ThemeProvider';

/**
 * A soft light behind Community's pages, under the Find Players | Discussions line.
 * Oct 26, owner, with Strava's Progress page beside his own Community page: "Under this line in
 * community, let's play around with adding a gradient or a depth kinda cool looking thing behind.
 * Like Strava does. Keep it subtle".
 *
 *   'off'  no light: the page exactly as it was.
 *   'A'    side light, as Strava's: one wide, soft light bleeding in from the left edge behind the
 *          top of the page (the map card's lower half and Open to hit), gone before the middle.
 *   'B'    top light: the page tinted just under the line (a step lighter on a dark court), fading
 *          evenly to the plain page about 300 points down, right across.
 *   'C'    corner light: the light comes from the tab you are on, falling from the corner under
 *          it, brightest beside the search box and lingering down the side past the map.
 *
 * One colour only, the court's own (`court` in every palette: Clean's green, Melbourne's and New
 * York's blue, Paris's brick, London's grass), at a low strength, so it reads as light on the court
 * rather than a decoration. It sits behind everything on the page and scrolls with it; nothing
 * over it changes, and it is never animated.
 */
export type CommunityGlowLook = 'off' | 'A' | 'B' | 'C';
export const COMMUNITY_GLOW: CommunityGlowLook = 'off';
/**
 * Discussions wears the same light, from its own tab's side (the right): the light stays on the
 * outer edge of each page, so the two pages sliding past each other never show a seam of light.
 */
export const COMMUNITY_GLOW_ON_DISCUSSIONS: boolean = true;

type Light =
  /**
   * A round light: its centre across (a share of the page's width, from the light's side) and down
   * (points under the line), and its reach across (a share of the width) and down (points).
   */
  | { kind: 'radial'; x: number; y: number; rx: number; ry: number; alpha: number; darkAlpha: number }
  /** A light falling straight down from the line, gone `to` points below it. */
  | { kind: 'linear'; to: number; alpha: number; darkAlpha: number };
/** How far under the line the drawing runs (where its lights have all faded out), and its lights. */
type Spec = { height: number; lights: Light[] };

/** `alpha` on a light court, `darkAlpha` on a dark one (Night, New York), where light needs more to show. */
const LOOKS: Record<Exclude<CommunityGlowLook, 'off'>, Spec> = {
  A: { height: 860, lights: [{ kind: 'radial', x: -0.18, y: 380, rx: 0.95, ry: 460, alpha: 0.15, darkAlpha: 0.26 }] },
  B: { height: 340, lights: [{ kind: 'linear', to: 320, alpha: 0.08, darkAlpha: 0.16 }] },
  C: { height: 820, lights: [{ kind: 'radial', x: -0.08, y: 40, rx: 1.05, ry: 760, alpha: 0.13, darkAlpha: 0.22 }] },
};

/** Smooth at both ends (no ring where a light ends): 1 at the centre, 0 at the edge. */
const FALLOFF = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => [t, 1 - (3 * t * t - 2 * t * t * t)] as const);

/** How much smaller than it shows the light is drawn (see `frame`). */
const SHRINK = 3;

/**
 * An oval light. Phones draw an SVG radial gradient's rx/ry as an oval; browsers ignore
 * rx/ry and draw a circle, so on the web the same oval is drawn with a gradientTransform.
 */
const ellipse = (cx: number, cy: number, rx: number, ry: number) => (Platform.OS === 'web'
  ? { cx: 0, cy: 0, r: 1, gradientTransform: `translate(${cx} ${cy}) scale(${rx} ${ry})` }
  : { cx, cy, rx, ry });

/**
 * The light, drawn from the top of a section's scrolling page (PaneScroller's backdrop). `top` is
 * where the line sits in it: below a phone's pull strip, where the light fades out upward, so a
 * pull never shows an edge. `side` is the side of the tab it belongs to: Find Players' is on the
 * left, Discussions' on the right (drawn mirrored).
 */
export const CommunityGlow = React.memo(function CommunityGlow({ look = COMMUNITY_GLOW, top = 0, side = 'left' }: {
  look?: CommunityGlowLook;
  top?: number;
  side?: 'left' | 'right';
}) {
  const { theme, dark } = useTheme();
  const { isPhone } = useResponsive();
  // The court's name and the look are in the ids: iOS keeps a gradient by id and would not
  // repaint one whose colours changed under the same name.
  const id = `${useId().replace(/[^a-zA-Z0-9]/g, '')}${theme.replace(/-/g, '')}${look}`;
  if (look === 'off') return null;
  const spec = LOOKS[look];
  const palette = themes[theme];
  const height = top + spec.height;
  // On a computer the page keeps to a column in a wider window: the drawing runs half a column past
  // each side, so a light from the edge fades out in the window's margin instead of stopping at the
  // column's edge. A phone's edges are the screen's: nothing past them is ever seen.
  const bleed = isPhone ? 0 : 0.5;
  const across = (x: number) => (100 * (x + bleed)) / (1 + 2 * bleed);
  const down = (y: number) => (100 * (top + y)) / height;
  // Drawn at a third of its size and scaled up: a soft light loses nothing, and the phone keeps a
  // small picture behind the page rather than one twice the screen's height at full sharpness.
  const wide = 100 * (1 + 2 * bleed);
  const frame = {
    left: `${-100 * bleed + (wide - wide / SHRINK) / 2}%`,
    width: `${wide / SHRINK}%`,
    top: (height - height / SHRINK) / 2,
    height: height / SHRINK,
    transform: [{ scaleX: side === 'right' ? -SHRINK : SHRINK }, { scaleY: SHRINK }],
  } as const;
  return (
    <View pointerEvents="none" style={[styles.canvas, frame]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          {spec.lights.map((light, i) => {
            const alpha = dark ? light.darkAlpha : light.alpha;
            if (light.kind === 'radial') {
              return (
                <RadialGradient key={i} id={`g${i}${id}`} {...ellipse(across(light.x), down(light.y), (100 * light.rx) / (1 + 2 * bleed), (100 * light.ry) / height)} gradientUnits="userSpaceOnUse">
                  {FALLOFF.map(([t, f]) => <Stop key={t} offset={t} stopColor={palette.court} stopOpacity={alpha * f} />)}
                </RadialGradient>
              );
            }
            return (
              <LinearGradient key={i} id={`g${i}${id}`} x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
                {FALLOFF.map(([t, f]) => <Stop key={t} offset={(top + t * light.to) / height} stopColor={palette.court} stopOpacity={alpha * f} />)}
              </LinearGradient>
            );
          })}
          {/* A phone's pull strip, above the line: the page's own colour, thinning to nothing at the line. */}
          {top > 0 ? (
            <LinearGradient id={`s${id}`} x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
              <Stop offset={0} stopColor={palette.bg} stopOpacity={1} />
              <Stop offset={top / height} stopColor={palette.bg} stopOpacity={0} />
            </LinearGradient>
          ) : null}
        </Defs>
        {spec.lights.map((_, i) => <Rect key={i} x="0" y="0" width="100" height="100" fill={`url(#g${i}${id})`} />)}
        {top > 0 ? <Rect x="0" y="0" width="100" height={down(0)} fill={`url(#s${id})`} /> : null}
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  canvas: { position: 'absolute' },
});

import React, { useId } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useApp } from '@/store/AppContext';
import { spacing } from '@/theme';
import { themes, useTheme } from '@/theme/ThemeProvider';

/**
 * A soft light behind Courts near you on Find Players, bleeding in from the left edge the way
 * Strava's sits behind its cards. Oct 26, owner, with Strava's Progress page beside his Community
 * page: "Under this line in community, let's play around with adding a gradient or a depth kinda
 * cool looking thing behind. Like Strava does. Keep it subtle"; shown three looks on the whole page,
 * "the community glow should only appear under courts near you". So it lives in that section and
 * scrolls with it, and nowhere else.
 *
 * One colour, the court's own (`court` in every palette: Clean's green, New York's blue, Paris's
 * brick), faint, fading to nothing before the section's edges so it never shows a line. It sits
 * behind the cards (it never tints a court's little map), is never animated, and takes no touches.
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

/** How far past the section's top and bottom the light reaches (it has faded out by then). */
const BLEED = 28;
/** On a light page, and on a dark one (Night, New York), where light needs a little more to show. */
const ALPHA = 0.15;
const DARK_ALPHA = 0.26;

/** Smooth at both ends (no ring where the light ends): 1 at the centre, 0 at the edge. */
const FALLOFF = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => [t, 1 - (3 * t * t - 2 * t * t * t)] as const);

/**
 * An oval light. Phones draw an SVG radial gradient's rx/ry as an oval; browsers ignore rx/ry and
 * draw a circle, so on the web the same oval is drawn with a gradientTransform.
 */
const ellipse = (cx: number, cy: number, rx: number, ry: number) => (Platform.OS === 'web'
  ? { cx: 0, cy: 0, r: 1, gradientTransform: `translate(${cx} ${cy}) scale(${rx} ${ry})` }
  : { cx, cy, rx, ry });

/**
 * The light, laid as the first child of the section (so the heading and the cards draw over it).
 * It reaches out to the screen's edges past the page's side margins, and a little above and below
 * the section, its oval centred off the left edge and gone before either end of it.
 */
export const CourtsGlow = React.memo(function CourtsGlow() {
  const { theme, dark } = useTheme();
  // The court's name is in the id: iOS keeps a gradient by id and would not repaint one whose colour changed under the same name.
  const id = `${useId().replace(/[^a-zA-Z0-9]/g, '')}${theme.replace(/-/g, '')}`;
  const alpha = dark ? DARK_ALPHA : ALPHA;
  const court = themes[theme].court;
  return (
    <View pointerEvents="none" style={styles.glow}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={`courts${id}`} {...ellipse(-18, 50, 95, 50)} gradientUnits="userSpaceOnUse">
            {FALLOFF.map(([t, f]) => <Stop key={t} offset={t} stopColor={court} stopOpacity={alpha * f} />)}
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#courts${id})`} />
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  glow: { position: 'absolute', top: -BLEED, bottom: -BLEED, left: -spacing.lg, right: -spacing.lg },
});

import React from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { RAIL_ICONS_LOOK } from '@/features/feed/railIconsLook';
import { colors } from '@/theme';

/** The heart's red: bright and warm, the one that gets a reaction. */
export const LIKE_RED = '#FF3B5C';

/** The rail's five buttons, by what they do. */
export type RailIcon = 'heart' | 'comment' | 'share' | 'save' | 'more';

type Name = React.ComponentProps<typeof Ionicons>['name'];

/** Today's outlines, and what each shows when on (a liked heart and a saved bookmark fill in). */
const OUTLINE: Record<RailIcon, readonly [Name, Name]> = {
  heart: ['heart-outline', 'heart'],
  comment: ['chatbubble-outline', 'chatbubble-outline'],
  share: ['arrow-redo-outline', 'arrow-redo-outline'],
  save: ['bookmark-outline', 'bookmark'],
  more: ['ellipsis-horizontal', 'ellipsis-horizontal'],
};

/** B: the same five, solid, as TikTok's rail; the bubble keeps three dots cut out so it still reads as talk. */
const FILLED: Record<RailIcon, Name> = { heart: 'heart', comment: 'chatbubble-ellipses', share: 'arrow-redo', save: 'bookmark', more: 'ellipsis-horizontal' };
/** B's shadow: soft and wide rather than a hard edge, so solid white lifts off a bright court without a dark rim. */
const SOFT_SHADOW = { textShadowColor: 'rgba(0, 0, 0, 0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 } as const;

/**
 * A: today's shapes, drawn here so the line can be heavier. They are the
 * icon font's own drawings on its 512 grid, where today's line is 32 (about
 * 1.6 to 1.9 pt at the rail's sizes); here every line is BOLD_LINE points,
 * whatever the icon's size, so all five weigh the same.
 */
const SHAPES: Record<Exclude<RailIcon, 'more'>, { d: string; cap?: 'round'; join?: 'round' }> = {
  heart: {
    d: 'M352.92 80C288 80 256 144 256 144s-32-64-96.92-64c-52.76 0-94.54 44.14-95.08 96.81-1.1 109.33 86.73 187.08 183 252.42a16 16 0 0018 0c96.26-65.34 184.09-143.09 183-252.42-.54-52.67-42.32-96.81-95.08-96.81z',
    cap: 'round',
    join: 'round',
  },
  comment: {
    d: 'M87.49 380c1.19-4.38-1.44-10.47-3.95-14.86a44.86 44.86 0 00-2.54-3.8 199.81 199.81 0 01-33-110C47.65 139.09 140.73 48 255.83 48 356.21 48 440 117.54 459.58 209.85a199 199 0 014.42 41.64c0 112.41-89.49 204.93-204.59 204.93-18.3 0-43-4.6-56.47-8.37s-26.92-8.77-30.39-10.11a31.09 31.09 0 00-11.12-2.07 30.71 30.71 0 00-12.09 2.43l-67.83 24.48a16 16 0 01-4.67 1.22 9.6 9.6 0 01-9.57-9.74 15.85 15.85 0 01.6-3.29z',
    cap: 'round',
  },
  share: { d: 'M448 256L272 88v96C103.57 184 64 304.77 64 424c48.61-62.24 91.6-96 208-96v96z', join: 'round' },
  save: { d: 'M352 48H160a48 48 0 00-48 48v368l144-128 144 128V96a48 48 0 00-48-48z', cap: 'round', join: 'round' },
};
/** A's line, in points. */
const BOLD_LINE = 2.4;
/** A's dots, their radius on the 512 grid (today's 48): a touch fuller, to sit with the heavier lines. */
const DOT = 54;
/** Room around a drawing for its edge, so the edge is never cut off; the button's box stays the font's. */
const PAD = 3;
/**
 * The icon font's line, as a share of its size: the box an outline took, with
 * the drawing centred in it (the font's own room above and below). A drawn
 * icon takes the same box, so the count under the heart stays where it was.
 */
const LINE = 1.1;
/**
 * A's edge: the outline's crisp dark edge (GLYPH_EDGE's black, a point low),
 * drawn as two dark copies under the white, a wide faint one and a close
 * firmer one, since a drawing has no text shadow. [extra width pt, drop pt, strength].
 */
const EDGE = [[3, 1, 0.18], [1.4, 0.75, 0.42]] as const;

function BoldGlyph({ icon, on, size, ink, edge }: { icon: RailIcon; on: boolean; size: number; ink: string; edge: boolean }) {
  const unit = 512 / size; // grid units in one point
  const line = BOLD_LINE * unit;
  const room = PAD * unit;
  const filled = on && (icon === 'heart' || icon === 'save');
  const draw = (key: string, color: string, width: number, drop = 0, strength = 1) => {
    if (icon === 'more') {
      return (
        <G key={key} fill={color} opacity={strength} transform={`translate(0 ${drop})`}>
          {[96, 256, 416].map((cx) => <Circle key={cx} cx={cx} cy={256} r={DOT + (width - line) / 2} />)}
        </G>
      );
    }
    const shape = SHAPES[icon];
    return (
      <G key={key} opacity={strength} transform={`translate(0 ${drop})`}>
        <Path
          d={shape.d}
          fill={filled ? color : 'none'}
          stroke={color}
          strokeWidth={width}
          strokeLinecap={shape.cap ?? 'butt'}
          strokeLinejoin={shape.join ?? 'miter'}
          strokeMiterlimit={10}
        />
      </G>
    );
  };
  const box = size * LINE;
  return (
    <View style={{ width: size, height: box }}>
      <Svg width={size + PAD * 2} height={size + PAD * 2} viewBox={`${-room} ${-room} ${512 + room * 2} ${512 + room * 2}`} style={{ position: 'absolute', left: -PAD, top: (box - size) / 2 - PAD }}>
        {edge ? EDGE.map(([extra, drop, strength], i) => draw(`edge${i}`, 'black', line + extra * unit, drop * unit, strength)) : null}
        {draw('glyph', ink, line)}
      </Svg>
    </View>
  );
}

/**
 * One of the rail's icons, in the look RAIL_ICONS_LOOK names. `on` is a
 * liked heart or a saved bookmark. `style` is today's crisp dark edge
 * (GLYPH_EDGE); left out (the loading rail on the plain page), no look draws
 * an edge or shadow.
 */
export function RailGlyph({ icon, on = false, size, ink = 'white', style }: { icon: RailIcon; on?: boolean; size: number; ink?: string; style?: object }) {
  const red = on && icon === 'heart';
  if (RAIL_ICONS_LOOK === 'A') return <BoldGlyph icon={icon} on={on} size={size} ink={red ? LIKE_RED : ink} edge={!!style} />;
  if (RAIL_ICONS_LOOK === 'B') {
    // Read when drawn: the same bright green on every court (the logo's on a photo).
    const color = red ? LIKE_RED : on && icon === 'save' ? colors.brandBright : ink;
    return <Ionicons name={FILLED[icon]} size={size} color={color} style={style ? SOFT_SHADOW : undefined} />;
  }
  return <Ionicons name={OUTLINE[icon][on ? 1 : 0]} size={size} color={red ? LIKE_RED : ink} style={style} />;
}

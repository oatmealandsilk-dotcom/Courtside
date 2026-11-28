import React, { useId } from 'react';
import Svg, { Circle, Defs, G, Mask, Path, Rect } from 'react-native-svg';

/**
 * The other bottom bars' icons, pictures only (Nov 28, barPreview; the critic's "stock Ionicons look thin and generic"):
 * five glyphs drawn on one 24-point grid with ONE stroke weight (about 1.8 points on the screen, as Instagram's, Strava's
 * and Apple's are), each with a filled form for the lit tab. Knock-outs in a filled glyph are real holes (masks), so the
 * bar's ground or glass shows through them, never a painted patch.
 *
 *   community   two people, the one behind cut clear of the one in front (Apple's person.2 way)
 *   feed        a reel: a rounded square with a clapper band and a small play mark (not a circle: filled, a circle
 *               became a round blob, and over a clip a white play button read as the video's own control)
 *   coaching    a clipboard with a tick; filled, the tick and a ring round the clip are cut out (it no longer reads as a phone)
 *   profile     one person
 *   plus        a plain plus; squarePlus  Instagram's rounded square with a plus in it
 */
export type GlyphKind = 'community' | 'feed' | 'coaching' | 'profile' | 'plus' | 'squarePlus';

/** Each tab's glyph, by its route. */
export function glyphOf(route: string): GlyphKind {
  return route === 'discuss' ? 'community' : route === 'index' ? 'feed' : route === 'coaches' ? 'coaching' : 'profile';
}

/** The stroke on the screen, in points, whatever the glyph's size. */
export const GLYPH_STROKE = 1.8;

export function BarGlyph({ kind, filled = false, size, color, stroke = GLYPH_STROKE }: {
  kind: GlyphKind; filled?: boolean; size: number; color: string; stroke?: number;
}) {
  // One id per glyph for its masks (ids are page-wide on the web).
  const id = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const sw = (stroke * 24) / size;
  const line = { stroke: color, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const solid = { stroke: color, strokeWidth: sw, strokeLinejoin: 'round' as const, fill: color };
  const cut = { stroke: '#000', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  let body: React.ReactNode = null;
  if (kind === 'community') {
    // In front: head and shoulders; behind: the same a little smaller, higher and to the right, cut clear of the front one.
    const head = { cx: 9, cy: 8.25, r: 3.4 };
    const front = 'M2.75 20.5C2.75 16.95 5.55 14.6 9 14.6C12.45 14.6 15.25 16.95 15.25 20.5Z';
    const back = 'M12.6 20.5C12.6 16.8 14.5 13.95 17 13.95C19.5 13.95 21.4 16.8 21.4 20.5Z';
    const ring = sw + 2.6;
    body = (
      <>
        <Defs>
          <Mask id={`${id}b`} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
            <Rect x="0" y="0" width="24" height="24" fill="#fff" />
            <Circle {...head} fill="#000" stroke="#000" strokeWidth={ring} />
            <Path d={front} fill="#000" stroke="#000" strokeWidth={ring} strokeLinejoin="round" />
          </Mask>
        </Defs>
        <G mask={`url(#${id}b)`}>
          <Circle cx={16.6} cy={7.6} r={2.85} {...(filled ? solid : line)} />
          <Path d={back} {...(filled ? solid : line)} />
        </G>
        <Circle {...head} {...(filled ? solid : line)} />
        <Path d={front} {...(filled ? solid : line)} />
      </>
    );
  } else if (kind === 'profile') {
    body = (
      <>
        <Circle cx={12} cy={7.9} r={3.9} {...(filled ? solid : line)} />
        <Path d="M4.6 20.6C4.6 16.75 7.95 14.3 12 14.3C16.05 14.3 19.4 16.75 19.4 20.6Z" {...(filled ? solid : line)} />
      </>
    );
  } else if (kind === 'feed') {
    const box = { x: 3.4, y: 3.4, width: 17.2, height: 17.2, rx: 4.8 };
    const band = 'M3.6 8.6H20.4';
    const slants = 'M8.6 3.6L10.6 8.4M14.3 3.6L16.3 8.4';
    const play = 'M10.35 12.05L15.05 14.8L10.35 17.55Z';
    body = filled ? (
      <>
        <Defs>
          <Mask id={`${id}f`} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
            <Rect x="0" y="0" width="24" height="24" fill="#fff" />
            <Path d={band} {...cut} strokeWidth={sw * 0.85} />
            <Path d={slants} {...cut} strokeWidth={sw * 0.85} />
            <Path d={play} fill="#000" {...cut} strokeWidth={0.9} />
          </Mask>
        </Defs>
        <Rect {...box} {...solid} mask={`url(#${id}f)`} />
      </>
    ) : (
      <>
        <Rect {...box} {...line} />
        <Path d={band} {...line} />
        <Path d={slants} {...line} />
        <Path d={play} fill={color} stroke={color} strokeWidth={0.9} strokeLinejoin="round" />
      </>
    );
  } else if (kind === 'coaching') {
    const clip = { x: 8.9, y: 2.75, width: 6.2, height: 3.7, rx: 1.4 };
    const tick = 'M8.7 13.6L11 15.9L15.3 11.35';
    body = filled ? (
      <>
        <Defs>
          <Mask id={`${id}c`} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
            <Rect x="0" y="0" width="24" height="24" fill="#fff" />
            <Path d={tick} {...cut} fill="none" strokeWidth={sw} />
            <Rect {...clip} fill="#000" stroke="#000" strokeWidth={sw + 2.2} />
          </Mask>
        </Defs>
        <Rect x={4.9} y={4.6} width={14.2} height={16.4} rx={3} {...solid} mask={`url(#${id}c)`} />
        <Rect {...clip} {...solid} />
      </>
    ) : (
      <>
        <Path d="M8.9 4.6H7.9A3 3 0 0 0 4.9 7.6V18A3 3 0 0 0 7.9 21H16.1A3 3 0 0 0 19.1 18V7.6A3 3 0 0 0 16.1 4.6H15.1" {...line} />
        <Rect {...clip} {...line} />
        <Path d={tick} {...line} />
      </>
    );
  } else if (kind === 'plus') {
    body = <Path d="M12 4.6V19.4M4.6 12H19.4" {...line} />;
  } else {
    const box = { x: 3.4, y: 3.4, width: 17.2, height: 17.2, rx: 5 };
    const plus = 'M12 8.3V15.7M8.3 12H15.7';
    body = filled ? (
      <>
        <Defs>
          <Mask id={`${id}p`} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
            <Rect x="0" y="0" width="24" height="24" fill="#fff" />
            <Path d={plus} {...cut} strokeWidth={sw} />
          </Mask>
        </Defs>
        <Rect {...box} {...solid} mask={`url(#${id}p)`} />
      </>
    ) : (
      <>
        <Rect {...box} {...line} />
        <Path d={plus} {...line} />
      </>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
}

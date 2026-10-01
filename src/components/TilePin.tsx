import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

/**
 * A thumbtack, tilted 45 degrees with its head to the top right, the way
 * Instagram marks a pinned post. Drawn here rather than taken from the icon
 * font because the font's "pin" is a map marker (a dot on a stick), which
 * reads as "a place", not "pinned".
 *
 * The shape is Material's push-pin (Apache 2.0) standing upright in a 24-unit
 * box. Tilting it leaves its head heavier on one side, so it is also nudged a
 * little down and left to sit in the middle of a round badge.
 */
export function PinGlyph({ size = 14, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G transform="translate(-1.9 1.9) rotate(45 12 12)">
        <Path
          d="M16 9V4h1a1 1 0 0 0 0-2H7a1 1 0 0 0 0 2h1v5a3 3 0 0 1-3 3v2h5.97v7l1 1 1-1v-7H19v-2a3 3 0 0 1-3-3z"
          fill={color}
        />
      </G>
    </Svg>
  );
}

/**
 * "Pinned", top left of a profile grid tile (the top right holds a clip's play
 * icon). A small dark disc with a white thumbtack, so it reads on any picture,
 * bright sky or white shirt, and on a pale text-only tile too, where a bare
 * white icon disappeared. White on a dark shade is the one pairing that works
 * over any photo, so, like the view count in TileViews, it does not follow the
 * theme. It lets taps through to the tile underneath.
 */
export function TilePin() {
  return (
    <View pointerEvents="none" accessibilityRole="image" accessibilityLabel="Pinned" style={styles.badge}>
      <PinGlyph size={14} color="#FFFFFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

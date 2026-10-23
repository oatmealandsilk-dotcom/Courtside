import React from 'react';
import { View } from 'react-native';

import { Fold } from './Fold';

/** With `unclip`, the room kept round the contents for a card's soft shadow (the `lift`: 2px down, 10px soft). */
const SHADOW_ROOM = 12;

/**
 * Opens and closes its contents with an eased height and fade, instead of
 * snapping into place. One open from the start is simply there on the first
 * frame.
 *
 * Built on Fold (Oct 23): its contents are built only while open (and while
 * closing), so every opening is a fresh view whose only resting look is the
 * open one, and at rest it is said by a plain style. An iPhone that drops a
 * settled animation value can then never fold an open form shut while you
 * type in it. Everything put in a Collapse is held by its page, so nothing is
 * lost while it is shut.
 *
 * It runs on the animation thread (Reanimated), so a busy moment in the app
 * (setup saving, the keyboard coming up) never makes it stutter.
 */
export function Collapse({ open, children, unclip = false }: {
  open: boolean;
  children: React.ReactNode;
  /**
   * Leave room round the contents for a card's soft shadow (Oct 22). The fold
   * still clips while it moves, but the shadow sits inside it the whole time, so
   * it never appears all at once when the open ends or is cut the moment a close
   * starts. The room is taken back with negative margins, so the page's spacing
   * is unchanged.
   */
  unclip?: boolean;
}) {
  const room = unclip ? SHADOW_ROOM : 0;
  return (
    <Fold open={open} room={room} duration={260} style={room ? { marginHorizontal: -room } : undefined}>
      {room ? <View style={{ padding: room }}>{children}</View> : children}
    </Fold>
  );
}

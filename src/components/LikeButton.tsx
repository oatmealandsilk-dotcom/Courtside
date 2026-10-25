import React, { useEffect, useRef } from 'react';
import { Platform, Pressable, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { router } from 'expo-router';

import { RailCount } from '@/components/RailCount';
import { RailPressable, useHeartSparks, useRailMotion } from '@/components/RailButton';
import { LIKE_RED } from '@/components/Heart';
import { RailGlyph } from '@/components/RailGlyph';
import { useIsGuest } from '@/features/guest/guestStatus';
import * as haptics from '@/lib/haptics';
import { useOptimisticToggle } from '@/lib/useOptimisticToggle';

interface Props {
  /** "p:<post id>" or "h:<hit id>", so the picture's double tap and this button agree. */
  ledgerKey: string;
  liked: boolean;
  count: number;
  onToggle: () => void;
  /** Where the count (or a hold on the heart) goes: the list of who liked it. */
  likesRoute: Parameters<typeof router.push>[0];
  /** A fresh number each time the picture is double tapped. */
  pop?: number;
  size?: number;
  ink?: string;
  /** "clip" or "hit", for the screen reader. */
  what?: string;
  style?: StyleProp<ViewStyle>;
  /** The box the heart is centred in (the rail's glyph box, so it lines up with the other buttons). */
  glyphBox?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}

/**
 * The heart on a clip's or hit's rail, with its count. It fills on the tap
 * itself, pops with a few sparks (RailButton), and the count rolls with it; the
 * store follows a beat later without anything on screen changing again. A
 * double tap on the picture pops it too, in step with the big heart there.
 */
export function LikeButton({ ledgerKey, liked, count, onToggle, likesRoute, pop = 0, size = 36, ink = 'white', what, style, glyphBox, labelStyle }: Props) {
  const like = useOptimisticToggle(ledgerKey, liked, onToggle, pop);
  const motion = useRailMotion();
  // A guest's tap only asks them to join (useOptimisticToggle): the heart answers the press, nothing more.
  const isGuest = useIsGuest();
  const sparks = useHeartSparks(size);
  const thing = what ? ` ${what}` : '';
  const total = count + like.delta;
  // Whether it showed liked when last drawn: a double tap on an unliked clip throws the sparks too.
  const wasOn = useRef(like.on);
  wasOn.current = like.on;
  const seen = useRef(pop);
  useEffect(() => {
    if (pop && pop !== seen.current && !isGuest) {
      motion.celebrate();
      if (!wasOn.current) sparks.play();
    }
    seen.current = pop;
  }, [pop, motion, sparks, isGuest]);
  const press = () => {
    if (isGuest) motion.tap();
    else if (like.on) motion.settle();
    else { motion.celebrate(); sparks.play(); }
    like.toggle();
  };
  // The heart likes; the number under it opens who liked it, as on Instagram
  // and TikTok. Holding the heart still opens the list too.
  return (
    <View style={style}>
      <RailPressable
        motion={motion}
        accessibilityLabel={`${like.on ? 'Unlike' : 'Like'}${thing}`}
        onPress={press}
        onLongPress={() => { haptics.commit(); router.push(likesRoute); }}
        hitSlop={8}
        glyphBox={glyphBox}
        glyph={<RailGlyph name="heart" size={size} filled={like.on} color={like.on ? LIKE_RED : ink} />}
        around={sparks.node}
      />
      <Pressable accessibilityRole="button" accessibilityLabel={`See who liked this${thing}`} hitSlop={8} disabled={total === 0} onPress={() => router.push(likesRoute)} style={countHit}>
        {/* "1.2k" past a thousand; no likes yet shows nothing, the line held so the rail never jumps. */}
        {(state) => <RailCount value={total} maxFontSizeMultiplier={1.2} style={[labelStyle, (state as { hovered?: boolean }).hovered && { textDecorationLine: 'underline' }]} />}
      </Pressable>
    </View>
  );
}

// Browsers ignore hitSlop, so on a computer the number gets a real, bigger click area without moving anything.
const countHit = Platform.OS === 'web' ? ({ paddingHorizontal: 12, paddingVertical: 6, marginHorizontal: -12, marginVertical: -6, cursor: 'pointer' } as object) : undefined;

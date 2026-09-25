import React from 'react';
import { Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { router } from 'expo-router';

import { Heart } from '@/components/Heart';
import { Tappable } from '@/components/Tappable';
import * as haptics from '@/lib/haptics';
import { useOptimisticToggle } from '@/lib/useOptimisticToggle';

interface Props {
  /** "p:<post id>" or "h:<hit id>", so the picture's double tap and this button agree. */
  ledgerKey: string;
  liked: boolean;
  count: number;
  onToggle: () => void;
  /** Where a hold goes: the list of who liked it. */
  likesRoute: Parameters<typeof router.push>[0];
  /** A fresh number each time the picture is double tapped. */
  pop?: number;
  size?: number;
  ink?: string;
  /** "clip" or "hit", for the screen reader. */
  what?: string;
  style?: StyleProp<ViewStyle>;
  glyphStyle?: object;
  labelStyle?: StyleProp<TextStyle>;
}

/**
 * The heart on a clip's or hit's rail, with its count. It fills on the tap
 * itself and the count moves with it; the store follows a beat later without
 * anything on screen changing again.
 */
export function LikeButton({ ledgerKey, liked, count, onToggle, likesRoute, pop = 0, size = 36, ink = 'white', what, style, glyphStyle, labelStyle }: Props) {
  const like = useOptimisticToggle(ledgerKey, liked, onToggle, pop);
  const thing = what ? ` ${what}` : '';
  return (
    <Tappable
      accessibilityLabel={`${like.on ? 'Unlike' : 'Like'}${thing}. Hold to see who liked it`}
      onPress={like.toggle}
      onLongPress={() => { haptics.commit(); router.push(likesRoute); }}
      scaleTo={0.78}
      style={style}
    >
      <Heart liked={like.on} pop={pop} size={size} ink={ink} style={glyphStyle} />
      <Text style={labelStyle}>{count + like.delta}</Text>
    </Tappable>
  );
}

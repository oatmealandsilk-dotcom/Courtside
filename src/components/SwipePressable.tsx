import React, { forwardRef, useState } from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps, type PressableStateCallbackType, type View } from 'react-native';

import { useSwipePressLook } from '@/features/navigation/swipePress';

/**
 * A Pressable for cards and rows that can sit on a page that swipes sideways
 * (Discussions / Find Players, the tab row). There, its pressed look waits a
 * beat and never shows under a finger that turns out to be swiping (see
 * features/navigation/swipePress). Anywhere else it is a plain Pressable.
 * Takes exactly Pressable's props; `pressed` in a style or children function
 * is the look on show.
 */
export const SwipePressable = forwardRef<View, PressableProps>(function SwipePressable(props, ref) {
  const [look, setLook] = useState(false);
  const { inSwipe, pressIn, pressOut, delay } = useSwipePressLook(setLook, { delayLongPress: props.delayLongPress ?? undefined });
  if (!inSwipe) return <Pressable ref={ref} {...props} />;
  const { style, children, onPressIn, onPressOut } = props;
  const withLook = (state: PressableStateCallbackType): PressableStateCallbackType => ({ ...state, pressed: look });
  return (
    <Pressable
      ref={ref}
      {...props}
      {...delay}
      onPressIn={(e: GestureResponderEvent) => { pressIn(); onPressIn?.(e); }}
      onPressOut={(e: GestureResponderEvent) => { pressOut(); onPressOut?.(e); }}
      style={typeof style === 'function' ? (state) => style(withLook(state)) : style}
    >
      {typeof children === 'function' ? (state) => children(withLook(state)) : children}
    </Pressable>
  );
});

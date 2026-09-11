import React, { useRef } from 'react';
import { Animated, Platform, Pressable, type StyleProp, type ViewStyle } from 'react-native';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  /** How far it shrinks while held. Smaller number, bigger dip. */
  scaleTo?: number;
  /** How far it lifts on hover. Pointer devices only; phones never see this. */
  hoverTo?: number;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
  accessibilityRole?: 'button' | 'link';
  accessibilityLabel?: string;
  accessibilityState?: { selected?: boolean; disabled?: boolean };
}

/**
 * A Pressable that answers back.
 *
 * Presses dip the control slightly and release with a spring; on a mouse it
 * lifts a touch on hover. Both run on the native driver so they stay smooth
 * while the rest of the screen is busy.
 *
 * The numbers are deliberately small. The effect should register as the control
 * acknowledging you, not as an animation you sit and watch — anything past a
 * few percent starts to feel springy and cheap.
 */
export function Tappable({
  children,
  onPress,
  onLongPress,
  disabled = false,
  scaleTo = 0.94,
  hoverTo = 1.04,
  style,
  hitSlop,
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityState,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const spring = (to: number) =>
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onLongPress={disabled ? undefined : onLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ ...accessibilityState, disabled }}
      onPressIn={() => !disabled && spring(scaleTo)}
      onPressOut={() => !disabled && spring(1)}
      // react-native-web maps these to mouse enter/leave; native ignores them.
      onHoverIn={() => Platform.OS === 'web' && !disabled && spring(hoverTo)}
      onHoverOut={() => Platform.OS === 'web' && !disabled && spring(1)}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/**
 * Returns a handler that tells a double tap from a single one.
 *
 * Pressable has no double-tap of its own, so this counts taps inside a short
 * window. A single tap is held back until the window closes, which is why
 * `onSingle` is optional — leave it off and the pause costs nothing.
 */
export function useDoubleTap(onDouble: () => void, onSingle?: () => void, window = 280) {
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  return () => {
    const now = Date.now();
    if (now - last.current < window) {
      last.current = 0;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      onDouble();
      return;
    }
    last.current = now;
    if (onSingle) {
      timer.current = setTimeout(() => {
        timer.current = null;
        onSingle();
      }, window);
    }
  };
}

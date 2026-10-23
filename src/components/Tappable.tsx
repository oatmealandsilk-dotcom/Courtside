import React, { useRef } from 'react';
import { Animated, Platform, Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { useSwipePressLook } from '@/features/navigation/swipePress';
import { PRESS_DIM, PRESS_SHRINK } from '@/theme/press';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  /** How long a hold takes to count, in milliseconds. The phone's usual is 500. */
  delayLongPress?: number;
  disabled?: boolean;
  /** How far it shrinks while held. Smaller number, bigger dip. */
  scaleTo?: number;
  /** Fire on touch-down instead of release — for a like, where any wait reads as lag. */
  immediate?: boolean;
  /** How far it lifts on hover. Pointer devices only; phones never see this. */
  hoverTo?: number;
  /**
   * Dim instead of dip, for a small icon that opens a page (the bell, Messages, the menu): a scaled
   * icon on iPhone is a resampled picture of itself and goes soft, and a tap that opens a page holds
   * the dip until the page is ready, so the icon sat blurry for that moment (Oct 11, owner: "when i
   * click msg or notifcaition button it gets really blurry kinda grainy and then changes"). Dimmed,
   * it stays sharp, the way iPhone's own buttons answer a press.
   */
  dim?: boolean;
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
  delayLongPress,
  disabled = false,
  // One press feel (Oct 20 sweep, theme/press): a button shrinks slightly, an icon (dim) dims a little.
  scaleTo = PRESS_SHRINK,
  immediate = false,
  hoverTo = 1.04,
  dim = false,
  style,
  hitSlop,
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityState,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(1)).current;

  // Quick: the dip is a short straight run, the release a fast spring, so a
  // tap reads as instant rather than as an animation you watch.
  const spring = (to: number) => {
    // A dimming control: down at once on the press, back up over a beat on release (and any hover lift undone).
    if (dim && to <= 1) {
      Animated.timing(fade, { toValue: to < 1 ? PRESS_DIM : 1, duration: to < 1 ? 0 : 160, useNativeDriver: true }).start();
      if (to === 1) Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 160, bounciness: 4 }).start();
      return;
    }
    (to < 1
      ? Animated.timing(scale, { toValue: to, duration: 60, useNativeDriver: true })
      : Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 160, bounciness: 4 })
    ).start();
  };

  // On a page that swipes sideways the dip waits a beat, so a finger that is swiping never dips the
  // control (swipePress). A like (immediate) is left to fire on touch-down, exactly as before.
  const press = useSwipePressLook((on) => spring(on ? scaleTo : 1), { enabled: !immediate, delayLongPress });

  return (
    <Pressable
      onPress={disabled || immediate ? undefined : onPress}
      onLongPress={disabled ? undefined : onLongPress}
      delayLongPress={delayLongPress}
      {...press.delay}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ ...accessibilityState, disabled }}
      onPressIn={() => { if (disabled) return; press.pressIn(); if (immediate) onPress?.(); }}
      onPressOut={() => !disabled && press.pressOut()}
      // react-native-web maps these to mouse enter/leave; native ignores them.
      onHoverIn={() => Platform.OS === 'web' && !disabled && spring(hoverTo)}
      onHoverOut={() => Platform.OS === 'web' && !disabled && spring(1)}
    >
      <Animated.View style={[style, dim ? { opacity: fade, transform: [{ scale }] } : { transform: [{ scale }] }]}>{children}</Animated.View>
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

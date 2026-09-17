import React from 'react';
import { Platform, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  /** How far it shrinks while held. Smaller number, bigger dip. */
  scaleTo?: number;
  /** Fire on touch-down instead of release — for a like, where any wait reads as lag. */
  immediate?: boolean;
  /** How far it lifts on hover. Pointer devices only; phones never see this. */
  hoverTo?: number;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
  accessibilityRole?: 'button' | 'link';
  accessibilityLabel?: string;
  accessibilityState?: { selected?: boolean; disabled?: boolean };
}

const OUT = Easing.out(Easing.quad);

/**
 * A Pressable that answers back.
 *
 * Presses dip the control slightly and it comes straight back; on a mouse it
 * lifts a touch on hover. Every move runs on the animation thread, so a
 * busy screen (a like re-drawing the feed) never holds the control small.
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
  immediate = false,
  hoverTo = 1.04,
  style,
  hitSlop,
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityState,
}: Props) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  // One quick pop: down in a few frames, back up in a few more — the same
  // pace as the heart growing on a double tap.
  const pop = () => { scale.value = withSequence(withTiming(scaleTo, { duration: 50, easing: OUT }), withTiming(1, { duration: 120, easing: OUT })); };

  return (
    <Pressable
      onPress={disabled || immediate ? undefined : onPress}
      onLongPress={disabled ? undefined : onLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ ...accessibilityState, disabled }}
      // The pop is started before the work, so it is already under way when
      // the screen gets busy; an immediate control also fires its action here.
      onPressIn={() => { if (disabled) return; pop(); if (immediate) onPress?.(); }}
      // react-native-web maps these to mouse enter/leave; native ignores them.
      onHoverIn={() => { if (Platform.OS === 'web' && !disabled) scale.value = withTiming(hoverTo, { duration: 120 }); }}
      onHoverOut={() => { if (Platform.OS === 'web' && !disabled) scale.value = withTiming(1, { duration: 120 }); }}
    >
      <Reanimated.View style={[style, animated]}>{children}</Reanimated.View>
    </Pressable>
  );
}

import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { TIP_WORDS, type TipKey } from '@/features/tips/tips';
import { font } from '@/theme';

/**
 * A just-in-time tip: a small dark bubble with one line, a little pointer,
 * and a tap anywhere on it to close it for good. The caller places it
 * (absolute) next to the thing it is about.
 */
export function TipBubble({ tip, shown, onClose, style, pointer = 'down' }: { tip: TipKey; shown: boolean; onClose: () => void; style?: StyleProp<ViewStyle>; pointer?: 'up' | 'down' | 'none' }) {
  const on = useSharedValue(0);
  useEffect(() => { on.value = withTiming(shown ? 1 : 0, { duration: shown ? 260 : 160, easing: Easing.out(Easing.cubic) }); }, [shown, on]);
  const look = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ translateY: (1 - on.value) * (pointer === 'up' ? -6 : 6) }] }));
  return (
    <Animated.View pointerEvents={shown ? 'auto' : 'none'} style={[styles.wrap, style, look]}>
      {pointer === 'up' ? <Animated.View style={[styles.pointer, styles.pointerUp]} /> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`Tip: ${TIP_WORDS[tip]} Tap to close.`} onPress={onClose} style={styles.bubble}>
        <Text style={styles.text}>{TIP_WORDS[tip]}</Text>
        <Text style={styles.ok}>Got it</Text>
      </Pressable>
      {pointer === 'down' ? <Animated.View style={[styles.pointer, styles.pointerDown]} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', zIndex: 30, alignItems: 'center' },
  bubble: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 300, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: 'rgba(20, 24, 21, 0.92)', boxShadow: '0px 6px 20px rgba(0,0,0,0.25)' },
  text: { flexShrink: 1, color: '#FFFFFF', fontSize: 14, lineHeight: 19, ...font('500') },
  ok: { color: '#A9D3B0', fontSize: 13, ...font('700') },
  pointer: { width: 12, height: 12, backgroundColor: 'rgba(20, 24, 21, 0.92)', transform: [{ rotate: '45deg' }] },
  pointerDown: { marginTop: -7 },
  pointerUp: { marginBottom: -7 },
});

import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { TIP_WORDS, type TipKey } from '@/features/tips/tips';
import { font } from '@/theme';

/**
 * A just-in-time tip: a small dark bubble with one line, a little pointer,
 * and a tap anywhere on it to close it for good. The caller places it
 * (absolute) next to the thing it is about.
 */
export function TipBubble({ tip, shown, onClose, style, pointer = 'down', pointerInset, pointerRight }: { tip: TipKey; shown: boolean; onClose: () => void; style?: StyleProp<ViewStyle>; pointer?: 'up' | 'down' | 'none'; /** With the bubble lined up on its left (`alignItems: 'flex-start'`): how far in from that edge the pointer sits. */ pointerInset?: number; /** With the bubble lined up on its right (`alignItems: 'flex-end'`): how far in from that edge the pointer sits. */ pointerRight?: number }) {
  const on = useSharedValue(0);
  useEffect(() => { on.value = withTiming(shown ? 1 : 0, { duration: shown ? 260 : 160, easing: Easing.out(Easing.cubic) }); }, [shown, on]);
  const look = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ translateY: (1 - on.value) * (pointer === 'up' ? -6 : 6) }] }));
  // Closed, it still takes touches for a moment: in a browser the tap that closed it
  // is followed by a click at the same spot, which must not land on what is underneath.
  const [catching, setCatching] = useState(shown);
  useEffect(() => {
    if (shown) { setCatching(true); return undefined; }
    const t = setTimeout(() => setCatching(false), Platform.OS === 'web' ? 400 : 0);
    return () => clearTimeout(t);
  }, [shown]);
  return (
    <Animated.View pointerEvents={shown || catching ? 'auto' : 'none'} style={[styles.wrap, style, look]}>
      {pointer === 'up' ? <Animated.View style={[styles.pointer, styles.pointerUp, pointerInset !== undefined && { marginLeft: pointerInset }, pointerRight !== undefined && { marginRight: pointerRight }]} /> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`Tip: ${TIP_WORDS[tip]} Tap to close.`} onPress={onClose} style={styles.bubble}>
        <Text style={styles.text}>{TIP_WORDS[tip]}</Text>
        <Text style={styles.ok}>Got it</Text>
      </Pressable>
      {pointer === 'down' ? <Animated.View style={[styles.pointer, styles.pointerDown, pointerInset !== undefined && { marginLeft: pointerInset }, pointerRight !== undefined && { marginRight: pointerRight }]} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', zIndex: 30, alignItems: 'center' },
  bubble: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 300, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: 'rgba(20, 24, 21, 0.92)', boxShadow: '0px 6px 20px rgba(0,0,0,0.25)' },
  text: { flexShrink: 1, color: '#FFFFFF', fontSize: 14, lineHeight: 19, ...font('500') },
  // Never squeezed onto two lines by a long tip.
  ok: { flexShrink: 0, color: '#A9D3B0', fontSize: 13, ...font('700') },
  pointer: { width: 12, height: 12, backgroundColor: 'rgba(20, 24, 21, 0.92)', transform: [{ rotate: '45deg' }] },
  pointerDown: { marginTop: -7 },
  pointerUp: { marginBottom: -7 },
});

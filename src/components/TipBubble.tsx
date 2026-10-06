import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { TIP_WORDS, type TipKey } from '@/features/tips/tips';
import { colors, font, pageIsDark } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/**
 * A just-in-time tip: a small dark bubble with one line, a little pointer,
 * and a tap anywhere on it to close it for good. The caller places it
 * (absolute) next to the thing it is about.
 *
 * `inline` (Oct 5): in the page's own flow instead, so it covers nothing.
 * It opens by easing the page below it down, and closes by easing it back.
 *
 * `on="page"`: it sits on a plain page rather than over a video or a map,
 * so on a dark page (Night, New York) it is drawn a shade lighter than the
 * page, with a hairline, rather than the fixed dark bubble that vanished
 * into it. On a light page it looks the same either way.
 */
export function TipBubble({ tip, shown, onClose, style, pointer = 'down', pointerInset, pointerRight, inline = false, on = 'media' }: { tip: TipKey; shown: boolean; onClose: () => void; style?: StyleProp<ViewStyle>; pointer?: 'up' | 'down' | 'none'; /** With the bubble lined up on its left (`alignItems: 'flex-start'`): how far in from that edge the pointer sits. */ pointerInset?: number; /** With the bubble lined up on its right (`alignItems: 'flex-end'`): how far in from that edge the pointer sits. */ pointerRight?: number; /** In the page's flow, pushing what follows down while it shows. */ inline?: boolean; /** What it sits on: a video or a map (the fixed dark bubble), or a plain page (the page's own colours when it is dark). */ on?: 'media' | 'page' }) {
  const styles = useThemedStyles(styleDefinitions);
  const lifted = on === 'page' && pageIsDark();
  const visible = useSharedValue(0);
  useEffect(() => { visible.value = withTiming(shown ? 1 : 0, { duration: shown ? 260 : 160, easing: Easing.out(Easing.cubic) }); }, [shown, visible]);
  const look = useAnimatedStyle(() => ({ opacity: visible.value, transform: [{ translateY: (1 - visible.value) * (pointer === 'up' ? -6 : 6) }] }));
  // Inline: the room it takes grows with it, so the page eases down rather than jumping.
  const tall = useSharedValue(0);
  const room = useAnimatedStyle(() => ({ height: tall.value * visible.value }));
  const measure = (e: LayoutChangeEvent) => { tall.value = e.nativeEvent.layout.height; };
  // Closed, it still takes touches for a moment: in a browser the tap that closed it
  // is followed by a click at the same spot, which must not land on what is underneath.
  const [catching, setCatching] = useState(shown);
  useEffect(() => {
    if (shown) { setCatching(true); return undefined; }
    const t = setTimeout(() => setCatching(false), Platform.OS === 'web' ? 400 : 0);
    return () => clearTimeout(t);
  }, [shown]);
  // Inline, it leaves the page altogether once it has eased shut (a page's gap would keep room for it otherwise).
  const [present, setPresent] = useState(shown);
  useEffect(() => {
    if (shown) { setPresent(true); return undefined; }
    const t = setTimeout(() => setPresent(false), 420);
    return () => clearTimeout(t);
  }, [shown]);
  const pointerStyle = [styles.pointer, lifted && styles.pointerLifted, pointerInset !== undefined && { marginLeft: pointerInset }, pointerRight !== undefined && { marginRight: pointerRight }];
  const body = (
    <>
      {pointer === 'up' ? <Animated.View style={[pointerStyle, styles.pointerUp, lifted && styles.pointerUpLifted]} /> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`Tip: ${TIP_WORDS[tip]} Tap to close.`} onPress={onClose} style={[styles.bubble, lifted && styles.bubbleLifted]}>
        <Text style={[styles.text, lifted && styles.textLifted]}>{TIP_WORDS[tip]}</Text>
        <Text style={[styles.ok, lifted && styles.okLifted]}>Got it</Text>
      </Pressable>
      {pointer === 'down' ? <Animated.View style={[pointerStyle, styles.pointerDown, lifted && styles.pointerDownLifted]} /> : null}
    </>
  );
  if (inline) {
    if (!shown && !present) return null;
    return (
      <Animated.View pointerEvents={shown || catching ? 'auto' : 'none'} style={[styles.room, room]}>
        <Animated.View onLayout={measure} style={[styles.inlineWrap, style, look]}>{body}</Animated.View>
      </Animated.View>
    );
  }
  return (
    <Animated.View pointerEvents={shown || catching ? 'auto' : 'none'} style={[styles.wrap, style, look]}>{body}</Animated.View>
  );
}

/** The fixed dark bubble, over a video or a map (and on every light page). */
const INK = 'rgba(20, 24, 21, 0.92)';

const styleDefinitions = StyleSheet.create({
  wrap: { position: 'absolute', zIndex: 30, alignItems: 'center' },
  // Inline: the room in the page, and the tip laid out at its top (not clipped, so its shadow is never cut off).
  room: { zIndex: 1 },
  inlineWrap: { position: 'absolute', left: 0, right: 0, top: 0, paddingVertical: 4, alignItems: 'center' },
  bubble: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 300, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: INK, boxShadow: '0px 6px 20px rgba(0,0,0,0.25)' },
  text: { flexShrink: 1, color: '#FFFFFF', fontSize: 14, lineHeight: 19, ...font('500') },
  // Never squeezed onto two lines by a long tip.
  ok: { flexShrink: 0, color: '#A9D3B0', fontSize: 13, ...font('700') },
  pointer: { width: 12, height: 12, backgroundColor: INK, transform: [{ rotate: '45deg' }] },
  pointerDown: { marginTop: -7 },
  pointerUp: { marginBottom: -7 },
  // On a dark page: a shade lighter than the page, a hairline round it, in the page's own ink.
  bubbleLifted: { backgroundColor: colors.surfaceAlt, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, boxShadow: '0px 6px 20px rgba(0,0,0,0.45)' },
  textLifted: { color: colors.text },
  okLifted: { color: colors.brand },
  // Drawn over the bubble's hairline where the two meet, with the hairline carried round its two outer sides.
  pointerLifted: { backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong, zIndex: 1 },
  pointerUpLifted: { borderTopWidth: StyleSheet.hairlineWidth, borderLeftWidth: StyleSheet.hairlineWidth },
  pointerDownLifted: { borderBottomWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth },
});

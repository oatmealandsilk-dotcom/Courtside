import React, { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, View } from 'react-native';

export function SwipeSurface({ children, onSwipe, enabled = true, fill = true, renderPreview, delegateRight = false, delegateLeft = false }: {
  children: React.ReactNode; onSwipe: (direction: 1 | -1) => void;
  delegateLeft?: boolean; delegateRight?: boolean; enabled?: boolean; fill?: boolean; renderPreview?: (direction: 1 | -1) => React.ReactNode;
}) {
  const offset = useRef(new Animated.Value(0)).current;
  const width = useRef(1);
  const busy = useRef(false);
  const props = useRef({ onSwipe, enabled, renderPreview, delegateRight, delegateLeft });
  props.current = { onSwipe, enabled, renderPreview, delegateRight, delegateLeft };
  const [direction, setDirection] = useState<1 | -1>(1);
  const [dragging, setDragging] = useState(false);
  const pan = useMemo(() => {
    const settle = (dx: number, velocity: number, cancelled = false) => {
      const next = dx < 0 ? 1 : -1;
      const available = !props.current.renderPreview || !!props.current.renderPreview(next);
      const commit = !cancelled && available && (Math.abs(dx) > width.current * 0.36 || (Math.abs(dx) > 35 && Math.abs(velocity) > 0.5 && Math.sign(dx) === Math.sign(velocity)));
      busy.current = true;
      Animated.spring(offset, { toValue: commit ? -next * width.current : 0, stiffness: 220, damping: 28, mass: 1, useNativeDriver: true }).start(() => {
        if (commit) props.current.onSwipe(next);
        offset.setValue(0); setDragging(false); busy.current = false;
      });
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => props.current.enabled && !(props.current.delegateRight && g.dx > 0) && !(props.current.delegateLeft && g.dx < 0) && !busy.current && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderMove: (_, g) => {
        const next = g.dx < 0 ? 1 : -1;
        setDragging(true); setDirection(next);
        const available = !props.current.renderPreview || !!props.current.renderPreview(next);
        offset.setValue(available ? g.dx : g.dx * 0.16);
      },
      onPanResponderRelease: (_, g) => settle(g.dx, g.vx),
      onPanResponderTerminate: (_, g) => settle(g.dx, g.vx, true),
    });
  }, [offset]);
  const preview = dragging ? renderPreview?.(direction) : null;
  return <View onLayout={event => { width.current = event.nativeEvent.layout.width; }} style={{ flex: fill ? 1 : undefined, overflow: 'hidden' }} {...pan.panHandlers}>
    <Animated.View style={{ flex: fill ? 1 : undefined, transform: [{ translateX: offset }] }}>{children}</Animated.View>
    {preview && <Animated.View pointerEvents="none" accessibilityElementsHidden style={{ position: 'absolute', top: 0, bottom: 0, width: '100%', left: direction * width.current, transform: [{ translateX: offset }] }}>{preview}</Animated.View>}
  </View>;
}

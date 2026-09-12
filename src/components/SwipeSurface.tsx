import React, { useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, View } from 'react-native';
import { useResponsive } from '@/lib/useResponsive';

export function SwipeSurface({ children, onSwipe, onCommit, onDragTo, enabled: requestedEnabled = true, fill = true, renderPreview, delegateRight = false, delegateLeft = false }: {
  children: React.ReactNode; onSwipe: (direction: 1 | -1) => void;
  /** Fires the instant the gesture is known to be going through, before the animation. */
  onCommit?: (direction: 1 | -1) => void;
  /** Fires while the finger is still down, or with null when the drag is abandoned. */
  onDragTo?: (direction: 1 | -1 | null) => void;
  delegateLeft?: boolean; delegateRight?: boolean; enabled?: boolean; fill?: boolean; renderPreview?: (direction: 1 | -1) => React.ReactNode;
}) {
  const { isPhone } = useResponsive();
  const enabled = requestedEnabled && isPhone;
  const offset = useRef(new Animated.Value(0)).current;
  const width = useRef(1);
  const busy = useRef(false);
  const props = useRef({ onSwipe, onCommit, onDragTo, enabled, renderPreview, delegateRight, delegateLeft });
  props.current = { onSwipe, onCommit, onDragTo, enabled, renderPreview, delegateRight, delegateLeft };
  const [direction, setDirection] = useState<1 | -1>(1);
  const [dragging, setDragging] = useState(false);
  const pan = useMemo(() => {
    const settle = (dx: number, velocity: number, cancelled = false) => {
      const next = dx < 0 ? 1 : -1;
      const available = !props.current.renderPreview || !!props.current.renderPreview(next);
      const commit = !cancelled && available && (Math.abs(dx) > width.current * 0.36 || (Math.abs(dx) > 35 && Math.abs(velocity) > 0.5 && Math.sign(dx) === Math.sign(velocity)));
      busy.current = true;
      const release = () => { offset.setValue(0); setDragging(false); busy.current = false; };

      // Tell the rest of the app now, not when the animation ends. The bottom
      // bar can follow the gesture instead of snapping once navigation lands.
      if (commit && props.current.enabled) props.current.onCommit?.(next);
      // A drag that did not go through has to let the bar fall back.
      else props.current.onDragTo?.(null);

      // A spring's callback fires at true rest, which is noticeably later than
      // the point it stops looking like it is moving — that gap was the pause
      // before the page changed. A fixed curve ends when it appears to end.
      Animated.timing(offset, {
        toValue: commit ? -next * width.current : 0,
        duration: commit ? 240 : 180,
        easing: Easing.bezier(0.22, 0.61, 0.36, 1),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        if (!commit || !props.current.enabled) return release();
        props.current.onSwipe(next);
        // One frame so the destination paints before the offset resets,
        // otherwise the outgoing screen flashes back at full size.
        requestAnimationFrame(release);
      });
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => props.current.enabled && !(props.current.delegateRight && g.dx > 0) && !(props.current.delegateLeft && g.dx < 0) && !busy.current && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderMove: (_, g) => {
        const next = g.dx < 0 ? 1 : -1;
        setDragging(true); setDirection(next);
        const available = !props.current.renderPreview || !!props.current.renderPreview(next);
        // Tell the bar where this is heading while the finger is still down.
        if (available && props.current.enabled) props.current.onDragTo?.(next);
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

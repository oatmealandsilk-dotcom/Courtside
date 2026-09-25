import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Whether the person has asked for less motion: the phone's Reduce Motion
 * setting, or the browser's prefers-reduced-motion. Animations run by hand
 * (a requestAnimationFrame loop, an RNAnimated spring) read this and land on
 * their end state instead; Reanimated's own use ReduceMotion.System.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
      const query = window.matchMedia('(prefers-reduced-motion: reduce)');
      const update = () => setReduced(query.matches);
      update();
      query.addEventListener?.('change', update);
      return () => query.removeEventListener?.('change', update);
    }
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

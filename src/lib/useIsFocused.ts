import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useTabActive } from '@/features/navigation/tabFocus';

/**
 * Whether this screen is the one on top.
 *
 * Replaces @react-navigation/native's hook of the same name. That package was
 * never a dependency of this project — it came along under expo-router, and
 * expo-router dropped it in SDK 57 when it moved to a different navigation
 * core. Building on expo-router's own useFocusEffect means there is nothing
 * left to fall out from under us.
 */
export function useIsFocused(): boolean {
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  // Inside the tab row, a tab that has slid off screen is not focused either.
  return focused && useTabActive();
}

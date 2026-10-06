import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '@/theme';
import { useModalOpenWhile } from '@/lib/modalOpen';

/**
 * A card that rises from the bottom inside a React Native Modal (a player's
 * ⋯ menu, a coach question's menu, Account center's sheets), on Android
 * (Oct 6).
 *
 * The Modal is drawn edge to edge there, under the navigation bar, so a
 * sheet that keeps a fixed 32 points under its last row had that row half
 * under the Back, Home and Recents buttons on a phone with three-button
 * navigation (a 48-point bar). On Android the sheet keeps the bar's height
 * plus a little; with gesture navigation (a thin bar) that is about what it
 * had. An iPhone and a browser keep `base`, exactly as before.
 *
 * It also counts the Modal as open while `visible`, so a message arriving
 * meanwhile shows as the phone's own alert rather than under the sheet
 * (see modalOpen). Returns the sheet's bottom padding.
 */
export function useModalSheetBottom(visible: boolean, base: number): number {
  useModalOpenWhile(visible);
  const insets = useSafeAreaInsets();
  return Platform.OS === 'android' ? Math.max(base, insets.bottom + spacing.md) : base;
}

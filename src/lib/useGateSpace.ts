import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '@/theme';

/**
 * Breathing room for the pages someone sees before the app opens: the
 * welcome and sign-in, birthday, terms, setup, first move and the
 * reset-password page. None of them has a header bar, so nothing else keeps
 * them clear of the phone's own edges: the status bar and the Dynamic Island
 * cover the top 20–62 points of an iPhone, and the home bar the bottom 34.
 * Every one of these pages starts and ends the same distance from those
 * edges, and the numbers live here so the pages cannot drift apart again.
 */
export function useGateSpace() {
  const insets = useSafeAreaInsets();
  return {
    /** Where a page's first thing (the mark, the name, a title) starts. */
    top: insets.top + spacing.xxl,
    /** Where setup's progress bar starts: it is a header, so it sits closer than a title. */
    header: insets.top + spacing.lg,
    /** Clear space under the last thing on a page that scrolls. */
    bottom: insets.bottom + spacing.xl,
    /** Under a row of buttons pinned to the bottom of the screen. */
    footer: insets.bottom + spacing.md,
  };
}

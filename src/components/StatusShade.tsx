import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Wash } from '@/components/Wash';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors } from '@/theme';

interface Props {
  /** The page's own wash, if it has one, so the strip is painted exactly like the page behind it. */
  wash?: { height: number; strength?: number };
}

/**
 * A strip the height of the status bar for the pages before the app, which
 * have no header bar of their own. When a page scrolls (a long form, or the
 * keyboard lifting the box you tapped), whatever moves up slides under this
 * strip and stops at the status bar's edge, instead of running under the
 * clock and the Dynamic Island. The strip is painted with the page's own
 * colour and wash, so at rest, with nothing under it, it cannot be seen.
 * Place it after the page's ScrollView so it draws on top.
 */
export function StatusShade({ wash }: Props) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  // A computer's browser has no status bar, so there is nothing to cover.
  if (insets.top <= 0) return null;
  return (
    <View pointerEvents="none" style={[styles.strip, { height: insets.top }]}>
      {wash ? <Wash height={wash.height} strength={wash.strength} /> : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  strip: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden', backgroundColor: colors.bg },
});

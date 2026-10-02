import React, { useSyncExternalStore } from 'react';
import { Image as ExpoImage, type ImageProps } from 'expo-image';

import { smallCoverOf } from '@/lib/smallCover';

// Small covers found missing this session (one whose small copy did not make
// it, or was still on its way). Every tile showing that cover switches to the
// full one together, and none asks for the small one again.
const missing = new Set<string>();
const listeners = new Set<() => void>();
let changes = 0;
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const version = () => changes;
function markMissing(small: string) {
  if (missing.has(small)) return;
  missing.add(small);
  changes += 1;
  listeners.forEach((listener) => listener());
}

/**
 * A post's cover on a small square tile (profile grids, search, a court's
 * grid, saved, the archive): its small copy when it has one, a few dozen KB
 * instead of a few hundred (see smallCover.ts). If the small copy is not
 * there it swaps to the full cover in place, so the tile never shows a
 * broken picture. Full-screen pages keep the full cover.
 */
export function TileCover({ uri, onError, ...rest }: Omit<ImageProps, 'source'> & { uri?: string }) {
  useSyncExternalStore(subscribe, version, version);
  if (!uri) return null;
  const small = smallCoverOf(uri);
  const trySmall = !!small && !missing.has(small);
  return (
    <ExpoImage
      {...rest}
      // A fresh picture for the swap: kept as the same one, the browser
      // version fades the failed small copy out again, asking for it twice.
      key={trySmall ? 'small' : 'full'}
      source={{ uri: trySmall ? small : uri }}
      onError={trySmall ? () => markMissing(small) : onError}
    />
  );
}

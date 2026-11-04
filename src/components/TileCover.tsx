import React, { useSyncExternalStore } from 'react';
import { Image as ExpoImage, type ImageProps } from 'expo-image';

import { smallCoverOf } from '@/lib/smallCover';
import { markPhotoShown, photoFirstShowing, photoTransition } from '@/lib/photoSeen';

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
export function TileCover({ uri, onError, onLoad, transition, ...rest }: Omit<ImageProps, 'source'> & { uri?: string }) {
  useSyncExternalStore(subscribe, version, version);
  if (!uri) return null;
  const small = smallCoverOf(uri);
  const trySmall = !!small && !missing.has(small);
  const shown = trySmall ? small : uri;
  // The caller's fade only the first time this cover is shown this session (load-in, admins first: photoSeen.ts),
  // so a profile or a grid opened again has its tiles there at once rather than fading them all in again.
  const first = photoFirstShowing(shown);
  return (
    <ExpoImage
      {...rest}
      transition={photoTransition(shown, transition)}
      onLoad={first ? (e) => { markPhotoShown(shown); onLoad?.(e); } : onLoad}
      // A fresh picture for the swap: kept as the same one, the browser
      // version fades the failed small copy out again, asking for it twice.
      key={trySmall ? 'small' : 'full'}
      source={{ uri: trySmall ? small : uri }}
      onError={trySmall ? () => markMissing(small) : onError}
    />
  );
}

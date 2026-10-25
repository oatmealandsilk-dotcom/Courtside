import React, { useState } from 'react';

/**
 * The browser's twin of MapSoftShot: the kept picture of this place's map, covering the card, softly
 * blurred (a CSS filter on the picture itself), a little larger than the card so its blurred edges
 * stay outside it. It eases in once it has loaded, never popping.
 */
export function MapSoftShot({ uri }: { uri: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      src={uri}
      alt=""
      onLoad={() => setLoaded(true)}
      style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(10px)', transform: 'scale(1.08)', opacity: loaded ? 1 : 0, transition: 'opacity 300ms ease', pointerEvents: 'none' }}
    />
  );
}

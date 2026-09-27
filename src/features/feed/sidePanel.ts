import { useEffect, useState } from 'react';

/**
 * How wide a panel docked to the right of the window is right now (comments
 * on a computer), so Home can slide its clip left to stay in view beside it,
 * the way TikTok's web player makes room for comments. 0 when none is open.
 */
type Listener = (width: number) => void;
const listeners = new Set<Listener>();
let current = 0;

export function setSidePanel(width: number) {
  if (width === current) return;
  current = width;
  listeners.forEach((fn) => fn(width));
}

export function useSidePanel(): number {
  const [width, setWidth] = useState(current);
  useEffect(() => {
    listeners.add(setWidth);
    setWidth(current);
    return () => { listeners.delete(setWidth); };
  }, []);
  return width;
}

import { createContext } from 'react';
import type { View } from 'react-native';

/** The colour wash behind the top of every page (Screen): how far down it runs and how strong it is. */
export const PAGE_WASH = { height: 360, strength: 0.85 } as const;

/**
 * Where a page's scrolling part sits under its wash, for a bar pinned at the
 * top of the page (the Tennis profile's tabs) to draw the same wash behind
 * itself. Only a browser needs it: there the wash stays put while the page
 * scrolls, so a plain band in the page's colour would cut a stripe through
 * it; on a phone the wash has scrolled away by then. `y` is how far below
 * the wash's top the scrolling part starts, and `node` is that part, measured
 * for where it sits across. Null on a page drawn without a wash.
 */
export interface PageWashFrame { node: View | null; y: number }
export const PageWashContext = createContext<{ readonly current: PageWashFrame } | null>(null);

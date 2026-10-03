import { createContext } from 'react';

/*
 * The Feed's top row ("For you · a group · +") has a band of its own just
 * under the clock. A clip's sound disc and its "2×" pill normally sit in
 * that same strip, level with the CourtSide mark; on a feed with the row
 * they step down by this much, so nothing at the top overlaps and a tap on
 * the "+" is never caught by an unseen disc. Zero everywhere else.
 */

/** How far under the clock the row's band starts, and how tall it is. */
export const TOP_BAND_TOP = 6;
export const TOP_BAND_HEIGHT = 40;

/** How far the disc steps down under a feed with the row. */
export const TOP_BAND_DROP = 30;

export const TopBandContext = createContext(0);

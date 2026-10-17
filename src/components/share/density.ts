import { createContext, useContext } from 'react';

/*
 * How many times finer than today's hidden copy a share picture is being
 * drawn (Oct 16, owner: "the courtside overlays are kinda blurry, pixelated,
 * make it super high quality"). The see-through stickers handed to
 * Instagram are drawn a second time, out of sight, two times bigger
 * (storyImage.ts, stickerDensity), so Instagram gets more real pixels of the
 * numbers and the mark and they stay sharp when pinched bigger.
 *
 * Nearly everything in the share art already grows with its width. The few
 * sizes that are fixed points (a word's soft shadow, the sticker's drop
 * shadow, a hairline rule) read this and grow with it too, so the bigger copy
 * is the very same picture, only sharper. 1 everywhere else: the previews
 * and today's hidden copy are unchanged.
 */
export const ShareDensity = createContext(1);

export function useShareDensity(): number {
  return useContext(ShareDensity);
}

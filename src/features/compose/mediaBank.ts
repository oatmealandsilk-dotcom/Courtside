import type { PickedMedia } from '@/components/MediaPicker';

/**
 * Everything picked from the device this session, newest first, so the
 * composer can offer it again without another trip through the file dialog.
 * Lives outside React because the composer is a modal that unmounts each
 * time it closes.
 */
const bank: PickedMedia[] = [];

export function addToBank(media: PickedMedia) {
  if (!media.uri || bank.some((item) => item.uri === media.uri)) return;
  bank.unshift(media);
}

export function getBank(): PickedMedia[] {
  return bank;
}

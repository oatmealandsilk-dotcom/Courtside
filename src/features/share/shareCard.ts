import { Platform, type View } from 'react-native';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

import { stageSize } from './storyImage';

/**
 * The card, photographed at Instagram Stories size (1080 × 1920) and handed
 * to the phone's share sheet: Instagram, Messages, Save Image. Says nothing
 * back when the sheet opened; a sentence when it could not.
 *
 * `view` is the card drawn once more out of sight at exactly 1080 × 1920
 * pixels (stageSize, as the session pictures are), and photographed at its
 * own size (Oct 16, owner: "make it super high quality"). It used to be the
 * small card on screen, asked for "1080 × 1920", which an iPhone reads as
 * points: the 320-point card was stretched over three times, soft.
 */
/** Gets the card's drawing ready before Share is tapped; a phone has it built in already (the browser twin fetches it). */
export function warmShareCard() {}

export async function shareCard(view: View | null, title: string): Promise<string | null> {
  if (!view) return 'The card is not ready yet. Try again in a moment.';
  const uri = await captureRef(view, { format: 'png', quality: 1, result: 'tmpfile', ...(Platform.OS === 'android' ? {} : stageSize()) });
  try {
    if (!(await Sharing.isAvailableAsync())) return 'Sharing is not available on this phone.';
    await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: title });
    return null;
  } finally {
    // The sheet has closed: the file is let go on an iPhone (storyImage.ts's letGo).
    if (Platform.OS === 'ios') { try { releaseCapture(uri.replace(/^file:\/\//, '')); } catch { /* already gone */ } }
  }
}

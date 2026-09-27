import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

/**
 * The card on screen, photographed at Instagram Stories size (1080 × 1920)
 * and handed to the phone's share sheet: Instagram, Messages, Save Image.
 * Says nothing back when the sheet opened; a sentence when it could not.
 */
export async function shareCard(view: View | null, title: string): Promise<string | null> {
  if (!view) return 'The card is not ready yet. Try again in a moment.';
  const uri = await captureRef(view, { format: 'png', quality: 1, width: 1080, height: 1920, result: 'tmpfile' });
  if (!(await Sharing.isAvailableAsync())) return 'Sharing is not available on this phone.';
  await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: title });
  return null;
}

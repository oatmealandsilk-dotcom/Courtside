import { Platform } from 'react-native';
import { captureRef, releaseCapture } from 'react-native-view-shot';

/**
 * A still of one feed as it stands, for its card in the Feed windows (features/feed/feedWindows):
 * the page on show, drawn to a small JPEG on the phone. Null when it could not be taken.
 *
 * Only ever asked for once a finger has rested a moment on the top row or the bar's Feed tab (never
 * on a plain tap), never while anything moves, and never of a clip's page (a video's own layer
 * comes out black).
 */
export async function takeFeedShot(node: unknown): Promise<string | null> {
  if (!node) return null;
  try {
    return await captureRef(node as never, { format: 'jpg', quality: 0.7, result: 'tmpfile' });
  } catch {
    return null;
  }
}

/** A still no longer needed: its file is let go (as shareCard does on an iPhone). */
export function dropFeedShot(uri: string) {
  if (Platform.OS !== 'ios') return;
  try { releaseCapture(uri.replace(/^file:\/\//, '')); } catch { /* already gone */ }
}

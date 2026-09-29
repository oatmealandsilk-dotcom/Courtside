import { captureScreen } from 'react-native-view-shot';

/**
 * A photograph of the screen as it is, for a theme change to fade from.
 * Null when the phone could not take one; the veil takes over then.
 */
export async function snapshotScreen(): Promise<string | null> {
  try {
    return await captureScreen({ format: 'jpg', quality: 0.85, result: 'tmpfile' });
  } catch {
    return null;
  }
}

import { Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

/**
 * The app stays upright everywhere except a full-screen video or photo,
 * where turning the phone sideways turns the picture with it. Closing the
 * viewer puts it back upright. Browsers are left alone.
 */
export async function allowTurning() {
  if (Platform.OS === 'web') return;
  try { await ScreenOrientation.unlockAsync(); } catch { /* not available here */ }
}

export async function stayUpright() {
  if (Platform.OS === 'web') return;
  try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); } catch { /* not available here */ }
}

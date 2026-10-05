import { Platform } from 'react-native';

/**
 * Android 13 and later show their own "Copied" preview at the bottom of the
 * screen whenever an app copies something, so a "Copied" note of the app's
 * own on top of it says it twice (Oct 5). An iPhone, older Android phones and
 * a browser show nothing of their own, so they keep the app's note.
 */
export const phoneSaysCopied = Platform.OS === 'android' && Number(Platform.Version) >= 33;

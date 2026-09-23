import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

/**
 * Which terms an account has agreed to. Bump this when public/terms.html
 * changes in a way people should see, and everyone is asked again the next
 * time they open the app — accounts made before the change included.
 */
export const TERMS_VERSION = '2026-09-21';

/** Where a legal page lives: next to the site on the web, on the published site from the app. */
export function legalUrl(page: 'terms' | 'privacy'): string {
  if (Platform.OS === 'web') {
    const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
    return `${window.location.origin}${base}/${page}.html`;
  }
  return `https://app.courtsidebase.com/${page}.html`;
}

/** Opens the terms or the privacy policy without losing your place in the app. */
export function openLegal(page: 'terms' | 'privacy') {
  const url = legalUrl(page);
  if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
  else void WebBrowser.openBrowserAsync(url);
}

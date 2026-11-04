import { Platform } from 'react-native';

/**
 * Design options to look at, never shipped: on the web only, `?var=<page>:<letter>`
 * (e.g. `?var=create-sheet:B`) picks an option for one page. It is kept for the
 * rest of the browser tab, so it survives the app's own page changes. Without
 * it, and always on a phone, every page is exactly as it is today (null).
 */
export function designVariant(page: string): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const key = `courtside.var.${page}`;
  try {
    const raw = new URLSearchParams(window.location.search).get('var');
    if (raw) {
      for (const part of raw.split(',')) {
        const [p, letter] = part.split(':');
        if (p === page && letter) window.sessionStorage.setItem(key, letter.toUpperCase());
      }
    }
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

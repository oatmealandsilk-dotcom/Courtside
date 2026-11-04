import { Platform } from 'react-native';

/**
 * Design options to look at, never shipped: on the web only, `?var=<page>:<letter>`
 * (e.g. `?var=create-sheet:B`) picks an option for one page. It is kept for the
 * rest of the browser tab, so it survives the app's own page changes. Without
 * it, and always on a phone, every page is exactly as it is today (null).
 */
function stash() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const raw = new URLSearchParams(window.location.search).get('var');
    if (!raw) return;
    for (const part of raw.split(',')) {
      const [p, letter] = part.split(':');
      if (p && letter) window.sessionStorage.setItem(`courtside.var.${p}`, letter.toUpperCase());
    }
  } catch {
    // No storage (a private window): options just fall back to today's page.
  }
}

// Read once as the app starts (imported by app/_layout.tsx), before sign-in moves the address on.
stash();

export function designVariant(page: string): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  stash();
  try {
    return window.sessionStorage.getItem(`courtside.var.${page}`);
  } catch {
    return null;
  }
}

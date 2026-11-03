import { Platform } from 'react-native';

/**
 * Design options to pick from, on the website only: `?var=<page>:<option>`
 * (say `?var=notifications-empty:B`) shows that option of that page, and is
 * remembered for the visit, since signing in moves to other addresses. With
 * no `var`, and always on a phone, every page is exactly as it is today.
 */
const KEY = 'courtside-design-var';

function read(): Record<string, string> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return {};
  try {
    const stored: Record<string, string> = JSON.parse(window.sessionStorage?.getItem(KEY) ?? '{}');
    const asked = new URLSearchParams(window.location.search).get('var');
    if (asked) {
      for (const one of asked.split(',')) {
        const [page, option] = one.split(':');
        if (page && option) stored[page] = option;
      }
      window.sessionStorage?.setItem(KEY, JSON.stringify(stored));
    }
    return stored;
  } catch {
    return {};
  }
}

/** The option asked for on this page ('A', 'B', …), or null for today's. */
export function designVariant(page: string): string | null {
  return read()[page] ?? null;
}

// Noted as the app starts (app/_layout imports this file), while the address still has the `var` asked for.
read();

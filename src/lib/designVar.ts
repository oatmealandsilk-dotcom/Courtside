import { Platform } from 'react-native';

/**
 * DESIGN PREVIEWS ONLY (Nov 3): the web demo can show a page's design option
 * with `?var=<page>:<option>` (several: `?var=messages-empty:B,feed:A`), so
 * the owner can compare options in a browser. It holds for the browser tab
 * (sessionStorage), so moving around the app keeps the option on. Without the
 * query, and always on a phone, the answer is null: the page as it is today.
 */
const KEY = 'courtside-design-var';

function read(): Record<string, string> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return {};
  try {
    const asked = new URLSearchParams(window.location.search).get('var');
    if (asked) window.sessionStorage?.setItem(KEY, asked);
    const raw = asked ?? window.sessionStorage?.getItem(KEY) ?? '';
    return Object.fromEntries(raw.split(',').map((p) => p.split(':')).filter((p) => p.length === 2 && p[0] && p[1]).map(([k, v]) => [k.trim(), v.trim().toUpperCase()]));
  } catch {
    return {};
  }
}

/** The design option asked for on this page, or null for today's page. */
export function designVar(page: string): string | null {
  return read()[page] ?? null;
}

// Read once as the app loads too, so a link to any page (the sign-in page included) keeps the option for the tab.
read();

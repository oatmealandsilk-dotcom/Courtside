import { usePathname } from 'expo-router';
import { useIsFocused } from '@/lib/useIsFocused';

/**
 * Whether the page at `path` is the one on show: on top, its tab on screen,
 * and the address its own. Left out, always.
 *
 * For a first-visit tip, asked by the tip itself rather than by the tab it
 * sits in: the address changes with every page opened or closed anywhere, and
 * a tab that asked redrew all of itself each time, before the new page could
 * slide in (Oct 10, owner: "the buttons like the settings. msg notifications,
 * etc respond too slow"). Now only the tip redraws.
 */
export function useShownAt(path?: string): boolean {
  // Both hooks run every time: a hook behind `&&` gets skipped whenever the left side is false.
  const focused = useIsFocused();
  const pathname = usePathname();
  return path === undefined || (focused && pathname === path);
}

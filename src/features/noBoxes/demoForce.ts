import { Platform } from 'react-native';

import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * For the no-boxes pictures only: puts a screen in a state the demo cannot
 * otherwise reach (a sign-up's "Check your inbox", a failed load, a card meant
 * for a new account). ?force=name1,name2 in the demo website's address; kept
 * for the rest of that visit. Never anything in a build with Supabase (the live
 * website, the store app), and never on a phone.
 */
const KEY = 'courtside-force';
let names: Set<string> | null = null;

export function forced(name: string): boolean {
  if (!names) {
    names = new Set();
    if (!isSupabaseConfigured && Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const asked = new URLSearchParams(window.location.search).get('force');
        const raw = asked ?? window.sessionStorage.getItem(KEY) ?? '';
        if (asked !== null) window.sessionStorage.setItem(KEY, asked);
        raw.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => names!.add(s));
      } catch { /* none */ }
    }
  }
  return names.has(name);
}

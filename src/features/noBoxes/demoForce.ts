import { Platform } from 'react-native';

import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * For the no-boxes pictures only: puts a screen in a state the demo cannot
 * otherwise reach (a sign-up's "Check your inbox", a failed load, a card meant
 * for a new account). ?force=name1,name2 in the demo website's address, for
 * that page load only. Never anything in a build with Supabase (the live
 * website, the store app), and never on a phone.
 */
let names: Set<string> | null = null;

export function forced(name: string): boolean {
  if (!names) {
    names = new Set();
    if (!isSupabaseConfigured && Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const raw = new URLSearchParams(window.location.search).get('force') ?? '';
        raw.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => names!.add(s));
      } catch { /* none */ }
    }
  }
  return names.has(name);
}

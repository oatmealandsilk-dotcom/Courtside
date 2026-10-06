import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

/**
 * The Supabase client, or null when the project is not configured — in which
 * case the app runs entirely on its fixtures, exactly as it did before.
 *
 * Sessions persist in AsyncStorage on the phone and localStorage on the web.
 * Token refresh only runs on the web: on native it needs an AppState hook,
 * which src/store/AppContext.tsx wires up.
 */
if ((!url || !key) && !__DEV__) {
  // A production build without these silently ships the demo sign-in.
  console.error('[supabase] EXPO_PUBLIC_SUPABASE_URL / _KEY are not set — running in demo mode.');
}

/** Where the login is kept on the device. Named after the project, not the address, so moving to auth.courtsidebase.com signs nobody out. */
const AUTH_STORAGE_KEY = 'sb-cgitvbnvchmofqkhtlml-auth-token';

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: Platform.OS === 'web' ? undefined : AsyncStorage,
          storageKey: AUTH_STORAGE_KEY,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: Platform.OS === 'web',
        },
      })
    : null;

export const isSupabaseConfigured = supabase !== null;

/**
 * The account whose login this device keeps, read straight from where it is kept, without the
 * check against the server that getSession makes (after an hour away, a trip to renew it). Only
 * ever a hint for opening on last time's saved copy; the check still decides (see AppContext).
 */
export async function storedLoginId(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const raw = Platform.OS === 'web' ? window.localStorage.getItem(AUTH_STORAGE_KEY) : await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    const kept = raw ? (JSON.parse(raw) as { user?: { id?: unknown }; refresh_token?: unknown }) : null;
    return kept && typeof kept.user?.id === 'string' && typeof kept.refresh_token === 'string' ? kept.user.id : null;
  } catch { return null; }
}

/** In a browser: whether a login (or the demo's ?as= one) is already kept, known before anything loads. */
export function storedLoginNow(): boolean {
  if (Platform.OS !== 'web') return false;
  try {
    return supabase ? !!window.localStorage.getItem(AUTH_STORAGE_KEY) : !!(new URLSearchParams(window.location.search).get('as') || window.sessionStorage.getItem('courtside-demo-as'));
  } catch { return false; }
}

let throwaways = 0;
/**
 * A client that keeps nothing (no storage, no timers), for one job: checking
 * a saved login before it replaces the one in use (Switch account). Its
 * session lives only in its own memory and goes with it, and it never signs
 * out (that would end the login being checked). Each gets its own name, so
 * Supabase never takes two of them for the same client.
 */
export function throwawayAuthClient(): SupabaseClient | null {
  if (!url || !key) return null;
  throwaways += 1;
  return createClient(url, key, {
    auth: { storageKey: `courtside-check-${throwaways}`, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Where the Android Google sign-in helper keeps its one-time secret (and nothing else for long). */
export const ANDROID_OAUTH_KEY = 'courtside-android-oauth';
let androidOAuth: SupabaseClient | null | undefined;

/**
 * Android only (Oct 5): a second, short-lived client used for one thing,
 * Continue with Google, so that sign-in uses PKCE. With it, the address
 * Google sends the phone back to carries only a one-time code, useless
 * without a secret kept on this phone; the usual way carried the login
 * itself, and on Android any app can claim the courtside:// address. The
 * session it gets is handed straight to the main client (setSession) and its
 * own copy is wiped. The main client stays as it is: password reset,
 * sign-up confirmation and email change open the website, which could not
 * know this phone's secret. Never signs out (that would end the shared login).
 */
export function androidOAuthClient(): SupabaseClient | null {
  if (Platform.OS !== 'android' || !url || !key) return null;
  if (androidOAuth === undefined) {
    androidOAuth = createClient(url, key, {
      auth: {
        flowType: 'pkce',
        storage: AsyncStorage,
        storageKey: ANDROID_OAUTH_KEY,
        // Kept on the phone, so a sign-in finishes even if Android closed the app while Google was open.
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return androidOAuth;
}

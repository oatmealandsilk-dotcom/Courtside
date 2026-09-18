import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

/**
 * Crash reports, filed in the app's own database (the app_errors table —
 * read them in Supabase under Table Editor). Each one says what went wrong,
 * on which screen, in which version of the app, on which kind of device, and
 * for which account. No messages, posts or media are ever included.
 *
 * A few rules keep it from becoming noise: the same error is filed at most
 * once a minute, no more than 25 a session, and filing can never itself
 * cause a second failure.
 */

let screen = '';
let filed = 0;
const lastFiled = new Map<string, number>();

/** The screen on show, kept up to date by the app shell, so a report says where it happened. */
export function setCrashScreen(name: string) { screen = name; }

export async function reportError(error: unknown, options: { fatal?: boolean; where?: string } = {}) {
  try {
    if (!supabase) return;
    const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : safeText(error));
    const message = `${options.where ? `[${options.where}] ` : ''}${err.message || 'Unknown error'}`.slice(0, 2000);
    if (/ResizeObserver loop/.test(message)) return; // a harmless browser notice, not a fault
    const now = Date.now();
    if (filed >= 25 || now - (lastFiled.get(message) ?? 0) < 60_000) return;
    lastFiled.set(message, now);
    filed += 1;
    const { data } = await supabase.auth.getSession();
    await supabase.from('app_errors').insert({
      user_id: data.session?.user.id ?? null,
      message,
      stack: (err.stack ?? '').slice(0, 8000),
      screen,
      platform: `${Platform.OS} ${String(Platform.Version ?? '')}`.trim(),
      // Errors from testing in Expo Go are marked, so they can be told apart from real users'.
      app_version: `${Constants.expoConfig?.version ?? '?'}${__DEV__ ? ' (testing)' : ''}`,
      fatal: !!options.fatal,
    });
  } catch { /* reporting must never cause a second failure */ }
}

function safeText(value: unknown) {
  try { return JSON.stringify(value).slice(0, 500); } catch { return String(value); }
}

let installed = false;

/** Listens for any error the app does not catch itself, anywhere, and files it. Called once at startup. */
export function installCrashReporting() {
  if (installed) return;
  installed = true;
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    window.addEventListener('error', (e) => { void reportError(e.error ?? e.message, { where: 'page' }); });
    window.addEventListener('unhandledrejection', (e) => { void reportError(e.reason, { where: 'promise' }); });
    return;
  }
  type Handler = (error: unknown, isFatal?: boolean) => void;
  const errorUtils = (globalThis as unknown as { ErrorUtils?: { getGlobalHandler?: () => Handler; setGlobalHandler?: (h: Handler) => void } }).ErrorUtils;
  const previous = errorUtils?.getGlobalHandler?.();
  errorUtils?.setGlobalHandler?.((error, isFatal) => {
    void reportError(error, { fatal: !!isFatal });
    previous?.(error, isFatal);
  });
  const hermes = (globalThis as unknown as { HermesInternal?: { enablePromiseRejectionTracker?: (o: { allRejections: boolean; onUnhandled: (id: number, error: unknown) => void }) => void } }).HermesInternal;
  hermes?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (_id, error) => {
      if (__DEV__) console.warn('Unhandled promise rejection', error);
      void reportError(error, { where: 'promise' });
    },
  });
}

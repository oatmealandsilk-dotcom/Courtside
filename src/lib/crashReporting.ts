import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { anyUploading, subscribeUploads } from '@/lib/uploads';

/**
 * Crash reports, filed in the app's own database (the app_errors table —
 * read them in Supabase under Table Editor). Each one says what went wrong,
 * on which screen, in which version of the app (and which instant update),
 * on which kind of device, and for which account. No messages, posts or
 * media are ever included.
 *
 * A few rules keep it from becoming noise: the same error is filed at most
 * once a minute, no more than 25 a session, and filing can never itself
 * cause a second failure.
 *
 * Two more things make a phone's crashes actually reach the table:
 *  - An error that ends the app is first written down on the phone, then
 *    given a moment to send before the app is allowed to close. One that
 *    still does not get out is sent the next time the app opens. (Before,
 *    the app closed while the report was still on its way, so no iPhone
 *    crash was ever filed.)
 *  - The phone keeps a one-line note of what the app is doing: in front or
 *    not, which screen, whether a post is going up, whether the phone has
 *    warned it is low on memory. An app that opens to find the last note
 *    still saying "in front" was closed without warning while someone was
 *    using it — a crash the app could not see itself, such as the phone
 *    closing it for memory — and that is filed too, with the screen. A
 *    restart for an instant update writes its own note first, so it never
 *    counts as a crash.
 */

let screen = '';
let release = '';
let filed = 0;
const lastFiled = new Map<string, number>();

/** The screen on show, kept up to date by the app shell, so a report says where it happened. */
export function setCrashScreen(name: string) {
  screen = name;
  writeNote();
}
/** The screen on show right now (the update check reads it: no restart over a half-written post). */
export function crashScreen(): string {
  return screen;
}
/** Which instant update is running ("update 1a2b3c4d", or "built-in"), so a report says which code it came from. */
export function setCrashRelease(label: string) {
  release = label;
  writeNote();
}

const appVersion = () => `${Constants.expoConfig?.version ?? '?'}${release ? ` · ${release}` : ''}${__DEV__ ? ' (testing)' : ''}`;
/**
 * "ios 18.6", or on Android (Oct 5) "android 35 · samsung SM-S921B": Android
 * runs on hundreds of phones, and which one is the first thing to know when
 * sorting out a crash there. An iPhone report is as it was.
 */
const platformName = () => {
  const base = `${Platform.OS} ${String(Platform.Version ?? '')}`.trim();
  if (Platform.OS !== 'android') return base;
  const phone = [Device.manufacturer, Device.modelName].filter(Boolean).join(' ');
  return phone ? `${base} · ${phone}` : base;
};
/** Where the phone's own crash log is, for a crash JavaScript never saw. */
const NATIVE_LOG = Platform.OS === 'android'
  ? 'The native crash log, if there is one, is in Play Console → Android vitals → Crashes and ANRs (only for copies installed from Google Play; a test .apk has none).'
  : 'The native crash log, if there is one, is in App Store Connect → TestFlight → Crashes.';

/** One report, as it goes into the table (the account is added when it is sent). */
interface Report {
  message: string;
  stack: string;
  screen: string;
  app_version: string;
  fatal: boolean;
}

function reportFor(error: unknown, options: { fatal?: boolean; where?: string }): Report | null {
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : safeText(error));
  const message = `${options.where ? `[${options.where}] ` : ''}${err.message || 'Unknown error'}`.slice(0, 2000);
  if (/ResizeObserver loop/.test(message)) return null; // a harmless browser notice, not a fault
  return { message, stack: (err.stack ?? '').slice(0, 8000), screen, app_version: appVersion(), fatal: !!options.fatal };
}

/** Puts one report in the table. True once it is there. */
async function send(report: Report): Promise<boolean> {
  try {
    if (!supabase) return true;
    const { data } = await supabase.auth.getSession();
    const { error } = await supabase.from('app_errors').insert({
      user_id: data.session?.user.id ?? null,
      message: report.message,
      stack: report.stack,
      screen: report.screen,
      platform: platformName(),
      app_version: report.app_version,
      fatal: report.fatal,
    });
    return !error;
  } catch {
    return false;
  }
}

/** Files an error. True once it is in the table, or when it did not need filing (a repeat, or noise). */
export async function reportError(error: unknown, options: { fatal?: boolean; where?: string } = {}): Promise<boolean> {
  try {
    if (!supabase) return true;
    const report = reportFor(error, options);
    if (!report) return true;
    const now = Date.now();
    if (filed >= 25 || now - (lastFiled.get(report.message) ?? 0) < 60_000) return true;
    lastFiled.set(report.message, now);
    filed += 1;
    return await send(report);
  } catch {
    return false; /* reporting must never cause a second failure */
  }
}

function safeText(value: unknown) {
  try { return JSON.stringify(value).slice(0, 500); } catch { return String(value); }
}

/* ---- Kept on the phone between opens ---- */

/** A fatal report that may not have got out before the app closed. */
const PENDING_KEY = 'courtside-crash-pending';
/** What the app was last doing (see the top of this file). */
const NOTE_KEY = 'courtside-session-note';
/** How long an error that ends the app waits for its report to send. */
const FATAL_HOLD_MS = 1500;

interface SessionNote {
  /** 'active' (in front), 'inactive', 'background', 'update' (restarting for an instant update), or 'fatal' (ended on an error filed below). */
  state: string;
  screen: string;
  uploading: boolean;
  lowMemory: boolean;
  version: string;
  /** What a post was in the middle of (see noteStep), and since when. */
  step?: string;
  stepAt?: string;
  at: string;
}

let appState = AppState.currentState === 'background' ? 'background' : 'active';
let lowMemory = false;
let restarting = false;
let lastNote = '';
let step = '';
let stepAt = '';
/** Last open's note is read before this open writes its own. */
let lastOpenRead: Promise<void> | null = null;

function writeNote(): Promise<void> {
  if (!lastOpenRead || restarting) return Promise.resolve();
  const note = { state: appState, screen, uploading: anyUploading(), lowMemory, version: appVersion(), step };
  const same = JSON.stringify(note);
  if (same === lastNote) return Promise.resolve();
  lastNote = same;
  const full: SessionNote = { ...note, stepAt, at: new Date().toISOString() };
  return lastOpenRead.then(() => AsyncStorage.setItem(NOTE_KEY, JSON.stringify(full))).catch(() => undefined);
}

/**
 * What a post is in the middle of ("shrinking a 412 MB video", "sending a
 * 24 MB video", "saving the post"), kept in the note. Awaited just before a
 * step that runs in the phone's own code (the shrinker, the upload), so if
 * that step takes the app down, the next open still says which one it was.
 * Never more than a short wait. Sizes and step names only, never content.
 */
export function noteStep(what: string): Promise<void> {
  step = what.slice(0, 160);
  stepAt = what ? new Date().toISOString() : '';
  return Promise.race([writeNote(), new Promise<void>((resolve) => setTimeout(resolve, 300))]);
}

/**
 * Called just before the app restarts itself for an instant update, so the
 * next open knows it was not a crash. Nothing is written after this.
 */
export async function noteRestartForUpdate(): Promise<void> {
  if (!lastOpenRead) return;
  restarting = true;
  const full: SessionNote = { state: 'update', screen, uploading: anyUploading(), lowMemory, version: appVersion(), step, stepAt, at: new Date().toISOString() };
  try {
    await lastOpenRead;
    await AsyncStorage.setItem(NOTE_KEY, JSON.stringify(full));
  } catch { /* the restart goes ahead either way */ }
}
/** The restart did not happen after all: the note carries on as before. */
export function noteRestartCancelled() {
  restarting = false;
  lastNote = '';
  writeNote();
}

function parse<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

/** On opening: anything the last open could not send, or a sign that it ended without warning. */
async function checkLastOpen(): Promise<void> {
  let pending: Report | null = null;
  let note: SessionNote | null = null;
  try {
    const got = await AsyncStorage.multiGet([PENDING_KEY, NOTE_KEY]);
    pending = parse<Report>(got[0]?.[1]);
    note = parse<SessionNote>(got[1]?.[1]);
  } catch {
    return;
  }
  // Sent after this open is under way (the account has to come back first),
  // never holding anything up.
  void (async () => {
    const during = note?.step ? `, during: ${note.step}` : '';
    if (pending) {
      // Its step, if any, was added when it was written down (see the handler below).
      const sent = await send({ ...pending, message: `[last open] ${pending.message}`.slice(0, 2000) });
      if (sent) await AsyncStorage.removeItem(PENDING_KEY).catch(() => undefined);
      return;
    }
    // An update restart, or a JavaScript error the handler below already filed.
    if (!note || note.state === 'update' || note.state === 'fatal') return;
    if (note.state !== 'active') {
      // Closed while away (swiped off, or the phone took the memory back) with
      // a post still going up: nothing is resumed, so that post is lost.
      if (!note.uploading) return;
      await send({
        message: `[last open] A post was lost: the app was closed while ${note.state === 'background' ? 'in the background' : 'covered'} with it still going up${during}`,
        stack: `Last noted ${note.at}${note.stepAt ? `; that step began ${note.stepAt}` : ''}.`,
        screen: note.screen,
        app_version: note.version,
        fatal: false,
      });
      return;
    }
    await send({
      message: `[last open] The app closed without warning while open on ${note.screen || 'an unknown screen'}`
        + `${note.uploading ? ', with a post going up' : ''}${during}${note.lowMemory ? ', after the phone warned it was low on memory' : ''}`,
      stack: `Last noted ${note.at}. No JavaScript error was caught: the phone closed the app (most often for memory) or a native part of it failed. `
        + NATIVE_LOG,
      screen: note.screen,
      app_version: note.version,
      fatal: true,
    });
  })();
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
  // The note (testing builds reload all the time, so only real ones keep it).
  if (!__DEV__) {
    lastOpenRead = checkLastOpen();
    AppState.addEventListener('change', (next) => { appState = next; writeNote(); });
    AppState.addEventListener('memoryWarning', () => { lowMemory = true; writeNote(); });
    subscribeUploads(writeNote);
    writeNote();
  }
  type Handler = (error: unknown, isFatal?: boolean) => void;
  const errorUtils = (globalThis as unknown as { ErrorUtils?: { getGlobalHandler?: () => Handler; setGlobalHandler?: (h: Handler) => void } }).ErrorUtils;
  const previous = errorUtils?.getGlobalHandler?.();
  let closing = false;
  errorUtils?.setGlobalHandler?.((error, isFatal) => {
    // Not fatal, or a testing build (whose red error screen should not wait): filed on the side, as before.
    if (!isFatal || __DEV__) {
      void reportError(error, { fatal: !!isFatal });
      previous?.(error, isFatal);
      return;
    }
    // Already on the way out with the first error: that one is the report.
    if (closing) return;
    closing = true;
    // Handing a fatal error on closes the app at once, so the report goes
    // first: written down on the phone, then given a moment to send.
    let handed = false;
    const handOn = () => {
      if (handed) return;
      handed = true;
      closing = false;
      previous?.(error, isFatal);
    };
    const timer = setTimeout(handOn, FATAL_HOLD_MS);
    void (async () => {
      // Marked first, so the next open does not file this a second time as
      // "closed without warning … no JavaScript error was caught".
      appState = 'fatal';
      await Promise.race([writeNote(), new Promise((r) => setTimeout(r, 300))]);
      const report = reportFor(error, { fatal: true });
      if (report && step) report.message = `${report.message} (during: ${step})`.slice(0, 2000);
      if (report) {
        await Promise.race([AsyncStorage.setItem(PENDING_KEY, JSON.stringify(report)).catch(() => undefined), new Promise((r) => setTimeout(r, 400))]);
        if (await send(report)) await AsyncStorage.removeItem(PENDING_KEY).catch(() => undefined);
      }
      clearTimeout(timer);
      handOn();
    })();
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

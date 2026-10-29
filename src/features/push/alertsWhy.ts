import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

/**
 * "Why turn on alerts" (Oct 29, owner: "build why turn on alerats tommorow
 * morning", from the audit: "A short 'why' screen before Apple's alert popup,
 * shown at a useful moment such as after turning on Open to hit. Today 56% of
 * players can't be reached, and Apple's popup only gets one try").
 *
 * Off until he picks it (ALERTS_WHY): while it is false nothing here does
 * anything, and the phone asks for alerts exactly as before (once, straight
 * after sign-up, from AppShell).
 *
 * On, the phone no longer asks at sign-up. Instead, at a moment where alerts
 * plainly help, a small card (AlertsWhyHost, the "Who can see you" card's
 * look) says why, with two or three reasons tied to that moment:
 *   up-to-hit  right after Up to hit goes through
 *   hit        after posting an open hit, or joining one
 *   follow     after following someone
 * "Turn on alerts" then shows Apple's own question; "Not now" never does.
 * Someone who already said no to Apple gets "Open Settings" instead (Apple
 * asks only once). The card comes at most once a week and three times in
 * all, never on the app's first launch, and never to someone whose alerts are
 * already on. A browser has no alerts: alertsWhy.web.ts does nothing.
 */
export const ALERTS_WHY = true;

export type AlertMoment = 'up-to-hit' | 'hit-posted' | 'hit-joined' | 'follow';

/** At most once a week, and three times in all. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TIMES = 3;
const KEY = 'courtside-alerts-why';

interface Seen { shown: number; lastAt: number; firstLaunch: number }

/** This launch of the app: the card never comes on the launch the app was first opened. */
const LAUNCH = Date.now();

async function read(): Promise<Seen | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Seen>;
    return { shown: Number(v.shown) || 0, lastAt: Number(v.lastAt) || 0, firstLaunch: Number(v.firstLaunch) || 0 };
  } catch {
    return null;
  }
}
async function write(v: Seen) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(v)); } catch { /* best effort */ }
}

/** Called once the app opens with someone signed in: notes the first launch, so the card waits for a later one. */
export async function noteAlertsLaunch(): Promise<void> {
  if (!ALERTS_WHY || Platform.OS === 'web') return;
  const had = await read();
  if (!had) await write({ shown: 0, lastAt: 0, firstLaunch: LAUNCH });
}

/** Whether the phone's own question may still be asked (never asked yet, or Android letting it ask again). */
export type AlertsAsk = 'ask' | 'settings';

/** What the card needs to show: the moment, and whether its button asks or opens Settings. */
export interface AlertsWhyRequest { moment: AlertMoment; ask: AlertsAsk }

type Listener = (r: AlertsWhyRequest) => void;
let listener: Listener | null = null;
let waiting: AlertsWhyRequest | null = null;
/** The card registers itself here (AlertsWhyHost). */
export function setAlertsWhyHost(next: Listener | null) {
  listener = next;
  if (next && waiting) { const w = waiting; waiting = null; next(w); }
}

let checking = false;

/**
 * A moment where alerts help has just happened. If the card is due, it is
 * handed to AlertsWhyHost, which shows it once the screen is clear (no sheet
 * being written in, no tutorial). Does nothing with the flag off, in a
 * browser, in the simulator, or for someone whose alerts are already on.
 */
export async function askForAlertsAt(moment: AlertMoment): Promise<void> {
  if (!ALERTS_WHY || Platform.OS === 'web' || !Device.isDevice || checking) return;
  checking = true;
  try {
    const seen = await read();
    // No launch noted yet (or noted on this very launch): this is the first launch.
    if (!seen || seen.firstLaunch === LAUNCH || !seen.firstLaunch) return;
    if (seen.shown >= MAX_TIMES || Date.now() - seen.lastAt < WEEK_MS) return;
    const p = await Notifications.getPermissionsAsync();
    if (p.granted) return;
    const req: AlertsWhyRequest = { moment, ask: p.canAskAgain ? 'ask' : 'settings' };
    if (listener) listener(req);
    else waiting = req;
  } catch {
    /* never in the way of what was just done */
  } finally {
    checking = false;
  }
}

/** The card was really seen: it counts toward the week and the three. */
export async function markAlertsWhyShown(): Promise<void> {
  const seen = await read();
  await write({ shown: (seen?.shown ?? 0) + 1, lastAt: Date.now(), firstLaunch: seen?.firstLaunch ?? LAUNCH });
}

/**
 * The card's words for each moment: its question and two or three reasons,
 * each one an alert the app really sends (send_push in the newest triggers,
 * migration 191: hit-match "is also looking for a hit", hit invites, joins,
 * follows, replies and messages). Never how near anyone is (Apple 5.1.2(i)).
 */
export function alertsWhyWords(moment: AlertMoment): { title: string; reasons: { icon: string; text: string }[] } {
  switch (moment) {
    case 'up-to-hit':
      return {
        title: 'Know when someone wants to hit?',
        reasons: [
          { icon: 'tennisball-outline', text: 'Someone is also looking for a hit' },
          { icon: 'mail-outline', text: 'Someone invites you to a hit' },
          { icon: 'chatbubble-outline', text: 'Replies and messages' },
        ],
      };
    case 'hit-posted':
      return {
        title: 'Know when someone joins?',
        reasons: [
          { icon: 'person-add-outline', text: 'Someone joins your hit' },
          { icon: 'chatbubbles-outline', text: 'A message in the hit’s chat' },
          { icon: 'chatbubble-outline', text: 'Replies and messages' },
        ],
      };
    case 'hit-joined':
      return {
        title: 'Hear from your hit?',
        reasons: [
          { icon: 'chatbubbles-outline', text: 'A message in the hit’s chat' },
          { icon: 'mail-outline', text: 'Someone invites you to a hit' },
          { icon: 'chatbubble-outline', text: 'Replies and messages' },
        ],
      };
    case 'follow':
    default:
      return {
        title: 'Know when they follow back?',
        reasons: [
          { icon: 'person-add-outline', text: 'Someone follows you back' },
          { icon: 'mail-outline', text: 'Someone invites you to a hit' },
          { icon: 'chatbubble-outline', text: 'Replies and messages' },
        ],
      };
  }
}

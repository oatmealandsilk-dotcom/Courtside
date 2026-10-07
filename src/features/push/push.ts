import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/crashReporting';
import { goHome } from '@/lib/goBack';
import { heardAlert } from '@/features/messages/incoming';
import { isChatInFront } from '@/features/messages/chatInFront';
import { setUpNotificationChannels } from '@/features/push/channels';
import { STILL_PLAYING_ALERT } from '@/features/activity/liveSession';

/**
 * Push notifications: alerts on the phone's lock screen for likes, replies,
 * follows and messages. The phone asks once for permission; if it is given,
 * the phone's push address is saved with the account, and the database sends
 * alerts through Expo's push service whenever something is filed for you.
 * A tap on an alert opens the thing it is about.
 *
 * Needs the app's Expo project id (EAS_PROJECT_ID); without it, or on the
 * web, or in the simulator, it quietly does nothing.
 */

// An alert that arrives while the app is open still shows as a banner. One
// about a message (it opens a chat) shows as the app's own banner instead
// (MessageBanner), never the phone's as well: heardAlert drops it if the
// message already came in live, so one message is one banner. Whenever the
// app's banner can't show it (a story or the camera is up, the tutorial, the
// app half-hidden behind Control Center or the app switcher), heardAlert
// says so and the phone's shows as before, so a message is never silent.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const { title, body, data } = notification.request.content;
      const href = typeof data?.href === 'string' ? data.href : '';
      const chat = href.startsWith('/messages/') ? href.slice('/messages/'.length).split(/[/?#]/)[0] : '';
      if (chat && heardAlert(chat, title ?? '', body ?? '')) {
        return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
      }
      // "Still playing?" with the app open: the app's own note asks it (components/session/StillPlaying), never the phone's as well.
      if (notification.request.identifier === STILL_PLAYING_ALERT) {
        return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
      }
      return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false };
    },
  });
}

let currentToken: string | null = null;

export type PushState = 'on' | 'off' | 'unavailable';

/** Asks once for permission (the phone never asks twice), then saves this phone's push address to the account. */
export async function registerForPush(): Promise<PushState> {
  try {
    if (Platform.OS === 'web' || !Device.isDevice || !supabase) return 'unavailable';
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId
      ?? (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    if (!projectId) return 'unavailable';
    // Android: its alert channels first (Android 13 shows the alerts question only once one exists).
    await setUpNotificationChannels();
    let { status } = await Notifications.getPermissionsAsync();
    if (status === 'undetermined') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return 'off';
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const { error } = await supabase.rpc('save_push_token', { t: token, p: Platform.OS });
    if (error) throw error;
    currentToken = token;
    return 'on';
  } catch (error) {
    // An Android build made without Firebase's file (google-services.json) cannot
    // have a push address; that is a setup step, not a crash, so it is filed once
    // per install rather than on every launch (it buried real crashes).
    if (Platform.OS === 'android' && /FirebaseApp is not initialized|google-services|Default FirebaseApp/i.test(error instanceof Error ? error.message : String(error))) {
      const filed = await AsyncStorage.getItem(NO_FIREBASE_KEY).catch(() => null);
      if (!filed) { void AsyncStorage.setItem(NO_FIREBASE_KEY, '1').catch(() => undefined); void reportError(error, { where: 'push setup (no Firebase in this Android build)' }); }
      return 'unavailable';
    }
    void reportError(error, { where: 'push setup' });
    return 'unavailable';
  }
}

const NO_FIREBASE_KEY = 'courtside-push-no-firebase';
/** The last alert tap that was opened, kept across the app reloading itself for an instant update. */
const LAST_TAP_KEY = 'courtside-last-push-tap';

/** Signing out: this phone stops getting that account's alerts. */
export async function forgetPushToken() {
  if (!currentToken || !supabase) return;
  try { await supabase.from('push_tokens').delete().eq('token', currentToken); } catch { /* best effort */ }
  currentToken = null;
}

/**
 * The server's one "4 workouts found" alert (several workouts found at once,
 * migration 20261006000138) is sent to open Notifications with its workouts'
 * ids, "/notifications?workouts=…": an address every version of the app can
 * open, so it never lands on a page an older version does not have yet. This
 * version opens their list instead (app/workouts-found), each with Log it.
 */
function foundListFor(href: string): string | null {
  const m = /^\/notifications\?workouts=([0-9a-f,-]*)$/i.exec(href);
  if (!m) return null;
  const ids = m[1].split(',').filter(Boolean);
  return ids.length ? `/workouts-found?ids=${ids.join(',')}` : '/workouts-found';
}

/** A tap on an alert opens what it is about — also when the tap is what opened the app. */
export function listenForPushTaps(): () => void {
  if (Platform.OS === 'web') return () => undefined;
  const since = Date.now();
  let opened: string | null = null;
  const open = async (response: Notifications.NotificationResponse | null) => {
    const sent = response?.notification.request.content.data?.href;
    if (typeof sent !== 'string' || !sent.startsWith('/')) return;
    const href = foundListFor(sent) ?? sent;
    // One tap is its alert's name plus when that alert arrived. The name alone
    // is not enough: training-plan reminders reuse theirs every week
    // (courtside-plan-0 is every Monday), and next Monday's tap must still open.
    const identifier = response?.notification.request.identifier;
    const id = identifier ? `${identifier}@${response?.notification.date ?? ''}` : null;
    // At launch the same tap can arrive both ways (asked for, and as an event): it opens one page.
    if (id && id === opened) return;
    opened = id;
    // An instant update reloads the app, and Android then hands the tap that
    // opened it over again: the old alert's page opened a second time, a moment
    // after the update. The tap last opened is kept on the phone, and one seen
    // before is not opened again (harmless on an iPhone, which can do the same).
    if (id) {
      const last = await AsyncStorage.getItem(LAST_TAP_KEY).catch(() => null);
      if (last === id) return;
      void AsyncStorage.setItem(LAST_TAP_KEY, id).catch(() => undefined);
    }
    try { Notifications.clearLastNotificationResponse(); } catch { /* an older build */ }
    // Home ('/') is reached with goHome, never pushed: '/' is also the splash
    // screen's address, and pushing it built a second copy of the app.
    // An alert about the chat already in front leaves it where it is, rather
    // than stacking a second copy of it that Back then lands on. (A browser has
    // no alerts to tap: push.web.ts.)
    const chat = href.startsWith('/messages/') ? href.slice('/messages/'.length).split(/[/?#]/)[0] : '';
    const go = () => {
      if (href === '/') goHome();
      else if (chat && isChatInFront(chat)) return;
      else router.push(href as never);
    };
    // The tap that opened the app waits a beat while its pages are set up.
    // One meaning Home is left alone at launch: the app opens on its own start
    // page (Community, see startTab), and no alert sent today points at
    // Home. With the app already running the page opens at once: waiting let
    // the clip on Home start again, with sound, before the page covered it.
    if (Date.now() - since < 2000) { if (href !== '/') setTimeout(go, 300); }
    else go();
  };
  void Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
  const sub = Notifications.addNotificationResponseReceivedListener((response) => { void open(response); });
  return () => sub.remove();
}

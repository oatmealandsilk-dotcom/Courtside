import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/crashReporting';

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

// An alert that arrives while the app is open still shows as a banner.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
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
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'CourtSide', importance: Notifications.AndroidImportance.HIGH });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status === 'undetermined') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return 'off';
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const { error } = await supabase.rpc('save_push_token', { t: token, p: Platform.OS });
    if (error) throw error;
    currentToken = token;
    return 'on';
  } catch (error) {
    void reportError(error, { where: 'push setup' });
    return 'unavailable';
  }
}

/** Signing out: this phone stops getting that account's alerts. */
export async function forgetPushToken() {
  if (!currentToken || !supabase) return;
  try { await supabase.from('push_tokens').delete().eq('token', currentToken); } catch { /* best effort */ }
  currentToken = null;
}

/** A tap on an alert opens what it is about — also when the tap is what opened the app. */
export function listenForPushTaps(): () => void {
  if (Platform.OS === 'web') return () => undefined;
  const open = (response: Notifications.NotificationResponse | null) => {
    const href = response?.notification.request.content.data?.href;
    if (typeof href === 'string' && href.startsWith('/')) setTimeout(() => router.push(href as never), 300);
  };
  void Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
  const sub = Notifications.addNotificationResponseReceivedListener(open);
  return () => sub.remove();
}

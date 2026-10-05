import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/*
 * Android's notification channels (Oct 5): the groups an Android phone lists
 * under Settings → Apps → CourtSide → Notifications, each with its own on/off
 * switch and its own sound and pop-up. Three, so someone can, say, silence
 * reminders and keep messages:
 *
 * - messages: direct messages and group chats. High: pops up and sounds.
 * - activity: likes, replies, follows, coaching and everything else the
 *   server sends. High.
 * - reminders: the training plan's and the streak's reminders, set on the
 *   phone. Default: in the list and the status bar, no pop-up.
 *
 * Alerts from the server name their channel (send_push, migration 106);
 * anything that names none goes to "activity" (the expo-notifications plugin's
 * defaultChannel in app.config.js). A channel's importance can never be changed
 * on a phone once it exists, which is why these are set before the first
 * Android test build rather than after. An iPhone has no channels: nothing here
 * runs there.
 */
export const CHANNEL = { messages: 'messages', activity: 'activity', reminders: 'reminders' } as const;

let made: Promise<void> | null = null;

/** Makes the three channels (once per launch; making one again changes nothing). Before any alert or permission prompt. */
export function setUpNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  if (!made) {
    made = (async () => {
      try {
        await Notifications.setNotificationChannelAsync(CHANNEL.messages, {
          name: 'Messages',
          description: 'Direct messages and group chats',
          importance: Notifications.AndroidImportance.HIGH,
        });
        await Notifications.setNotificationChannelAsync(CHANNEL.activity, {
          name: 'Likes, replies and follows',
          description: 'Likes, replies, follows, hits and coaching',
          importance: Notifications.AndroidImportance.HIGH,
        });
        await Notifications.setNotificationChannelAsync(CHANNEL.reminders, {
          name: 'Reminders',
          description: 'Your training plan and streak reminders',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      } catch {
        made = null; // tried again next time
      }
    })();
  }
  return made;
}

import * as Notifications from 'expo-notifications';

import { CHANNEL, setUpNotificationChannels } from '@/features/push/channels';
import { STILL_PLAYING_ALERT } from './liveSession';

/** Each plan waits for the one before, so a quick Resume then Pause can never leave an alert set behind the pause. */
let chain: Promise<void> = Promise.resolve();
/** The newest plan asked for: an older one still waiting is skipped, the newest decides. */
let newest = 0;

/**
 * "Still playing?" on the lock screen (Oct 6, owner): set on the phone itself
 * (no server) for the moment a live session's clock reaches three hours, the
 * way the streak reminder is (practice/reminder). A new time replaces the
 * old one; null (paused, finished, thrown away, signed out) takes it away.
 * Never asks for permission: with alerts off it simply does nothing, and the
 * app's own note asks the next time it is open (components/session/StillPlaying).
 * A tap opens the live page, with Finish.
 */
export function planStillPlaying(at: number | null, body?: string): Promise<void> {
  const mine = ++newest;
  chain = chain.then(async () => {
    if (mine !== newest) return;
    try {
      await Notifications.cancelScheduledNotificationAsync(STILL_PLAYING_ALERT).catch(() => undefined);
      // Already due: the app is open, and its own note asks.
      if (at === null || at <= Date.now() + 5_000) return;
      const permission = await Notifications.getPermissionsAsync();
      if (!permission.granted || mine !== newest) return;
      await setUpNotificationChannels();
      if (mine !== newest) return;
      await Notifications.scheduleNotificationAsync({
        identifier: STILL_PLAYING_ALERT,
        content: { title: 'Still playing?', body: body ?? 'Your session is still going. Finish it, or keep going.', data: { href: '/live-session' } },
        // Android files it under Reminders (see push/channels); an iPhone ignores the channel.
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: CHANNEL.reminders },
      });
    } catch { /* a reminder is a nicety */ }
  });
  return chain;
}

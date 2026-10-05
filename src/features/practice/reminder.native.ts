import * as Notifications from 'expo-notifications';

import { CHANNEL, setUpNotificationChannels } from '@/features/push/channels';

const REMINDER = 'courtside-streak-reminder';

/**
 * A streak of two days or more with nothing yet today: one quiet reminder at
 * 7pm, set on the phone itself (no server involved). Anything logged or posted
 * today takes it away again. Never asks for permission; if alerts are off, it
 * simply does nothing.
 */
export async function planStreakReminder(streakAtRisk: number): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(REMINDER).catch(() => undefined);
    if (streakAtRisk < 2) return;
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return;
    const at = new Date();
    at.setHours(19, 0, 0, 0);
    if (at.getTime() < Date.now() + 60_000) return;
    await setUpNotificationChannels();
    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER,
      content: { title: `Keep your ${streakAtRisk}-day streak`, body: 'Log a session or post from today’s hit to keep it going.' },
      // Android files it under Reminders (see push/channels); an iPhone ignores the channel.
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL.reminders },
    });
  } catch { /* a reminder is a nicety */ }
}

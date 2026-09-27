import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import type { TrainingPlan } from '@/data/types';
import { duration } from '@/lib/format';

const KEY = 'courtside-plan-reminders';
const id = (n: number) => `courtside-plan-${n}`;
/** Eight in the morning: early enough to plan the day around, late enough not to wake anyone. */
const HOUR = 8;

/** A phone can hold a morning alert; a browser cannot. */
export const planRemindersSupported = true;

export async function readPlanReminders(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(KEY)) === 'on'; } catch { return false; }
}

async function cancelAll() {
  await Promise.all(Array.from({ length: 14 }, (_, n) => Notifications.cancelScheduledNotificationAsync(id(n)).catch(() => undefined)));
}

/**
 * Turning it on asks for alerts if they were never asked for (it is a tap on
 * a switch, so the question has a reason). Says 'denied' when alerts are off,
 * so the switch can stay off and say where to turn them on.
 */
export async function setPlanReminders(on: boolean): Promise<'on' | 'off' | 'denied'> {
  try {
    if (on) {
      let { status, canAskAgain } = await Notifications.getPermissionsAsync();
      if (status !== 'granted' && canAskAgain) status = (await Notifications.requestPermissionsAsync()).status;
      if (status !== 'granted') return 'denied';
    }
    await AsyncStorage.setItem(KEY, on ? 'on' : 'off');
    if (!on) await cancelAll();
    return on ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

/**
 * Each training day of the plan gets an alert at 8am with that day's session:
 * "Serve +1 patterns · 2h 7m". Rest days get nothing. The alerts are set on the
 * phone itself (no server), for the rest of this week and the same days of
 * next week, and set again whenever the plan is opened — so they carry on
 * while you use the plan and fade out, rather than nag, if you stop.
 */
export async function schedulePlanReminders(plan: TrainingPlan): Promise<void> {
  try {
    if (!(await readPlanReminders())) return;
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return;
    await cancelAll();
    // Day 0 is Monday; a plan's weekOf is any moment in its week.
    const monday = new Date(plan.weekOf);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    for (let week = 0; week < 2; week++) {
      for (const day of plan.days) {
        if (day.restDay || !day.blocks.length || day.dayIndex < 0 || day.dayIndex > 6) continue;
        const at = new Date(monday);
        at.setDate(monday.getDate() + week * 7 + day.dayIndex);
        at.setHours(HOUR, 0, 0, 0);
        if (at.getTime() < Date.now() + 60_000) continue;
        // Named after its longest block — the serve work, not the warm-up.
        const main = day.blocks.reduce((best, b) => (b.minutes > best.minutes ? b : best), day.blocks[0]);
        const minutes = day.blocks.reduce((sum, b) => sum + b.minutes, 0);
        const others = day.blocks.filter((b) => b !== main).map((b) => b.title.toLowerCase());
        const listed = others.length > 3 ? [...others.slice(0, 3), `${others.length - 3} more`] : others;
        const also = listed.length > 1 ? `${listed.slice(0, -1).join(', ')} and ${listed[listed.length - 1]}` : listed[0];
        await Notifications.scheduleNotificationAsync({
          identifier: id(week * 7 + day.dayIndex),
          content: {
            title: `${main.title} · ${duration(minutes)}`,
            body: also ? `Today’s session, with ${also}. Tap for the drills.` : 'Today’s session from your plan. Tap for the drills.',
            data: { href: `/ai-coach?section=plan&day=${day.dayIndex}` },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
        });
      }
    }
  } catch { /* a reminder is a nicety */ }
}

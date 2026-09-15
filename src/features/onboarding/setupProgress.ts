import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Which setup steps a player skipped, per account, so the profile can offer
 * to finish them later. Cleared when they complete the run-through.
 */
const key = (userId: string) => `courtside-setup-skipped:${userId}`;

export type SetupStep = 'permissions' | 'body' | 'calendar';

export async function readSkipped(userId: string): Promise<SetupStep[]> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    return raw ? (JSON.parse(raw) as SetupStep[]) : [];
  } catch {
    return [];
  }
}

export async function writeSkipped(userId: string, steps: SetupStep[]): Promise<void> {
  try {
    if (steps.length) await AsyncStorage.setItem(key(userId), JSON.stringify(steps));
    else await AsyncStorage.removeItem(key(userId));
  } catch { /* A device that refuses storage just loses the reminder. */ }
}

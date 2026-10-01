import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Whether this phone has already shown the tour to this account. It is
 * written the moment the first tip appears, not at the end, so an app closed
 * halfway never brings it back on every open.
 */
const key = (userId: string) => `courtside-tour-seen:${userId}`;

export async function hasSeenTour(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key(userId))) !== null;
  } catch {
    // A phone that refuses storage would otherwise show it on every open.
    return true;
  }
}

export async function markTourSeen(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), new Date().toISOString());
  } catch { /* Nothing to do: the flag above already treats this as seen. */ }
}

/**
 * Whether new accounts get the tour on their own (switched on Oct 1). Off,
 * it plays only when asked for, and Settings/Help offer it to admins only.
 */
export const TOUR_ON = true;

/**
 * Only brand-new accounts get the tour on their own: made in the last day,
 * so it greets someone who has just signed up (or comes back later that
 * day), never a player who already knows their way round.
 */
export const NEW_ACCOUNT_HOURS = 24;

export function isNewAccount(joinedAt: string | undefined): boolean {
  if (!joinedAt) return false;
  const at = Date.parse(joinedAt);
  if (!Number.isFinite(at)) return false;
  return Date.now() - at < NEW_ACCOUNT_HOURS * 60 * 60 * 1000;
}

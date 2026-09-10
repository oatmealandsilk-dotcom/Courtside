const preferences = new Map<string, boolean>();
export function readReceiptPreference(userId: string) { return preferences.get(userId) ?? true; }
export function saveReceiptPreference(userId: string, enabled: boolean) { preferences.set(userId, enabled); }

export function readReceiptPreference(userId: string): boolean {
  try { return localStorage.getItem(`courtside-receipts:${userId}`) !== 'off'; } catch { return true; }
}
export function saveReceiptPreference(userId: string, enabled: boolean) {
  try { localStorage.setItem(`courtside-receipts:${userId}`, enabled ? 'on' : 'off'); } catch { /* Keep the in-session setting when storage is unavailable. */ }
}

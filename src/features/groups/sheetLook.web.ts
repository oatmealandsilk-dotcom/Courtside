/*
 * Design preview (Oct 22), web only: ?gs=a|b|c|d|e picks a direction for the
 * Groups sheet, read once when the app loads and kept for the tab's session
 * (?gs=now goes back). Without it the sheet is exactly today's. The phone
 * twin (sheetLook.ts) is always today's.
 */
export type SheetLook = 'now' | 'a' | 'b' | 'c' | 'd' | 'e';
const LOOKS: readonly string[] = ['a', 'b', 'c', 'd', 'e'];
const isLook = (v: string | null): v is Exclude<SheetLook, 'now'> => !!v && LOOKS.includes(v);

const read = (): SheetLook => {
  try {
    const asked = new URLSearchParams(window.location.search).get('gs');
    const store = window.sessionStorage;
    if (isLook(asked)) { store.setItem('courtside-gs', asked); return asked; }
    if (asked === 'now') { store.removeItem('courtside-gs'); return 'now'; }
    const kept = store.getItem('courtside-gs');
    return isLook(kept) ? kept : 'now';
  } catch {
    return 'now';
  }
};

export const SHEET_LOOK: SheetLook = read();

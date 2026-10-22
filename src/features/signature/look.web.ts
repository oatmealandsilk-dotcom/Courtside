/*
 * Design preview (Oct 22, owner: "How do we make our ui look unique"), web
 * only: ?sig=1 turns on the three signature moves (the ScoreBoard, the
 * session card's fixed order with its StatStrip, court lines instead of
 * glow), read once when the app loads and kept for the tab's session
 * (?sig=0 goes back). Without it every screen is exactly today's. The phone
 * twin (look.ts) is always today's.
 */
const read = (): boolean => {
  try {
    const asked = new URLSearchParams(window.location.search).get('sig');
    const store = window.sessionStorage;
    if (asked === '1') { store.setItem('courtside-sig', '1'); return true; }
    if (asked === '0') { store.removeItem('courtside-sig'); return false; }
    return store.getItem('courtside-sig') === '1';
  } catch {
    return false;
  }
};

export const SIG: boolean = read();

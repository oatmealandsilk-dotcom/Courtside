/**
 * One tap, one page (Nov 4, a bug in the live app too): two quick taps on the bell, Messages, a face in Open to hit,
 * a player in Find Players, a Feed clip's face, a profile grid tile or a chat (about 0.15 s apart) opened two copies
 * of the same page, one on top of the other, so one Back still showed the same page and a second Back was needed.
 * The court card and a clip's court name already guarded themselves (courtLink); every other way in did not.
 *
 * So, for everyone, in the one place every router call goes through (expo-router's queue of calls, the same one
 * justNavigated listens to): a second call that opens the very same address (push or navigate, the same href)
 * within ONE_OPEN_MS of the first is dropped. Anything else goes through untouched: Back, a different page, the
 * same page asked for again after that half second, a replace, a sheet's own calls.
 *
 * The queue is reached by path (it is not part of expo-router's public surface); if an update moves or reshapes it,
 * this changes nothing and says so in the log, as animatedValuesStay does for Reanimated. Imported first thing
 * (app/_layout.tsx), before any tap can ask for a page.
 */
export const ONE_OPEN_MS = 500;

type LinkAction = { type?: string; payload?: { href?: unknown; options?: { event?: unknown } } };
type Queue = { add: (action: LinkAction) => void; __oneOpen?: boolean };

let lastHref: string | null = null;
let lastAt = 0;

/**
 * An address to open instead, decided as the call is made (null: open it as asked). Set by the app (postOpen.ts: a
 * post opens straight as its feed page). It sees pushes, navigates and replaces only.
 */
let rewrite: ((href: string) => string | null) | null = null;
export function setOpenRewrite(fn: ((href: string) => string | null) | null) { rewrite = fn; }

function rewritten(action: LinkAction): LinkAction {
  if (!rewrite || !action || action.type !== 'ROUTER_LINK') return action;
  const event = action.payload?.options?.event;
  const href = action.payload?.href;
  if ((event !== 'PUSH' && event !== 'NAVIGATE' && event !== 'REPLACE') || typeof href !== 'string') return action;
  let to: string | null = null;
  try { to = rewrite(href); } catch { to = null; }
  return to && to !== href ? { ...action, payload: { ...action.payload, href: to } } : action;
}

/** A page-opening call's address, or null for anything else (Back, a pop, a replace, a preload…). */
export function openingHref(action: LinkAction): string | null {
  if (!action || action.type !== 'ROUTER_LINK') return null;
  const event = action.payload?.options?.event;
  if (event !== 'PUSH' && event !== 'NAVIGATE') return null;
  const href = action.payload?.href;
  return typeof href === 'string' ? href : null;
}

/** Whether this call is the same page asked for again within ONE_OPEN_MS (and so is dropped). Notes it when it is not. */
export function isRepeatOpen(action: LinkAction, now: number): boolean {
  const href = openingHref(action);
  if (href == null) {
    // Back (or any pop) in between: the same page asked for next is a new open, never a repeat.
    if (action && action.type !== 'ROUTER_LINK') lastHref = null;
    return false;
  }
  if (href === lastHref && now - lastAt < ONE_OPEN_MS) return true;
  lastHref = href;
  lastAt = now;
  return false;
}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { routingQueue } = require('expo-router/build/global-state/routingQueue') as { routingQueue?: Queue };
  if (routingQueue && typeof routingQueue.add === 'function' && !routingQueue.__oneOpen) {
    const add = routingQueue.add.bind(routingQueue);
    routingQueue.add = (asked: LinkAction) => {
      const action = rewritten(asked);
      if (isRepeatOpen(action, Date.now())) return;
      add(action);
    };
    routingQueue.__oneOpen = true;
  } else if (!routingQueue?.__oneOpen) {
    console.warn('[one open] expo-router changed: a quick second tap may open a page twice, as before');
  }
} catch {
  console.warn('[one open] expo-router changed: a quick second tap may open a page twice, as before');
}

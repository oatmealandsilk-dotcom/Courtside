import type { ID, Message } from '@/data/types';

/**
 * News of a message from someone else, for the banner that drops in at the
 * top (src/components/MessageBanner.tsx). Two things can tell the app about
 * one: the store's live connection (the 'messages-live' handler in
 * AppContext, and the demo's made-up replies), and a phone alert that lands
 * while the app is open (src/features/push/push.ts). Both report here, and
 * here they are paired up, so one message is one banner however many ways it
 * arrived. Kept outside React, like the toast bus, because the phone-alert
 * handler runs outside any screen.
 */
export type IncomingEvent =
  /** `known`: a phone alert already announced this one, so the banner shows its words without counting it twice. */
  | { type: 'message'; message: Message; known: boolean }
  /** A phone alert about a chat whose message has not come in live (yet). No `body` means it is not a message at all ("Mira added you to …"). */
  | { type: 'alert'; conversationId: ID; title: string; body: string }
  /** Unsent by its sender: a banner about it goes. */
  | { type: 'unsent'; messageId: ID };

type Listener = (event: IncomingEvent) => void;
const listeners = new Set<Listener>();
const emit = (event: IncomingEvent) => listeners.forEach((fn) => fn(event));

export function subscribeIncoming(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * What the banner would do with news about a chat right now: show it;
 * nothing, because that chat (or the inbox) is already on screen ('here');
 * or nothing, because no banner can show at the moment ('off': a story, the
 * camera, the tutorial, the app out of sight, or a muted chat or blocked
 * sender). The phone-alert handler asks too, so the phone's own banner
 * stands in whenever the app's can't, and nothing is ever announced twice.
 */
export type Verdict = 'show' | 'here' | 'off';
type Judge = (conversationId: ID, message?: Message) => Verdict;
const noBanner: Judge = () => 'off';
let judge: Judge = noBanner;

/** The banner says how it decides, once, while it is on screen. */
export function judgeIncoming(fn: Judge): () => void {
  judge = fn;
  return () => { if (judge === fn) judge = noBanner; };
}

/*
 * A phone alert carries no message id, only which chat it is about, so a
 * live message and an alert are paired by chat and by time: each one that
 * arrives first waits here, and the next of the other kind for the same chat
 * cancels it out. Alerts go through Expo and then Apple or Google, so they
 * usually trail the live message by a few seconds; half a minute is plenty.
 */
const PAIR_MS = 30_000;
/** `shown`: the app's banner showed it, so whatever arrives second has nothing more to say. */
type Arrival = { at: number; shown: boolean };
const waitingLive = new Map<ID, Arrival[]>();
const waitingAlert = new Map<ID, Arrival[]>();

/** Takes the oldest still-fresh waiting arrival for a chat, if there is one. */
function take(waiting: Map<ID, Arrival[]>, conversationId: ID, now: number): Arrival | null {
  const fresh = (waiting.get(conversationId) ?? []).filter((a) => now - a.at < PAIR_MS);
  const found = fresh.shift() ?? null;
  if (fresh.length) waiting.set(conversationId, fresh);
  else waiting.delete(conversationId);
  return found;
}

function hold(waiting: Map<ID, Arrival[]>, conversationId: ID, arrival: Arrival) {
  waiting.set(conversationId, [...(waiting.get(conversationId) ?? []).filter((a) => arrival.at - a.at < PAIR_MS), arrival]);
}

/** The store has just added a message from someone else, live or in the demo. */
export function heardMessage(message: Message) {
  const now = Date.now();
  const verdict = judge(message.conversationId, message);
  const alert = take(waitingAlert, message.conversationId, now);
  if (!alert) hold(waitingLive, message.conversationId, { at: now, shown: verdict === 'show' });
  // Its alert came first: the banner updates quietly if it showed that alert,
  // and lets it be if the phone did.
  if (verdict === 'show') emit({ type: 'message', message, known: !!alert });
}

/**
 * A phone alert about a chat arrived while the app was open. Answers whether
 * the app has it in hand (its banner shows it, it already showed its
 * message, or that chat is on screen), so the phone need not show its own.
 */
export function heardAlert(conversationId: ID, title: string, body: string): boolean {
  const now = Date.now();
  const verdict = judge(conversationId);
  // Only an alert with words is a message, so only that kind pairs with one.
  if (body) {
    const live = take(waitingLive, conversationId, now);
    if (live) {
      if (live.shown || verdict === 'here') return true;
      // Its message came in while no banner could show (a story was up, say):
      // this alert is its first word, from whichever banner can show it now.
      if (verdict === 'off') return false;
      emit({ type: 'alert', conversationId, title, body });
      return true;
    }
    // Held even when the phone shows it, so its live copy isn't announced a second time.
    hold(waitingAlert, conversationId, { at: now, shown: verdict === 'show' });
  }
  if (verdict === 'show') emit({ type: 'alert', conversationId, title, body });
  return verdict !== 'off';
}

/** Someone unsent a message: if a banner is about it, it goes. */
export function heardUnsent(messageId: ID) {
  emit({ type: 'unsent', messageId });
}

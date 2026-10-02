import type { ID, Message } from '@/data/types';

/**
 * What the message banner (src/components/MessageBanner.tsx) is showing and
 * what is waiting its turn, as plain data with no drawing in it. One banner
 * shows at a time. A second message from the chat on show updates it ("2 new
 * messages") rather than stacking another; another chat waits its turn;
 * and once a second is waiting they fold into one "4 new messages", so at
 * most one more card follows the one on show.
 */

/** One chat's news. */
export interface ChatNews {
  kind: 'chat';
  /** Tells a new banner apart from an update to the one on show. */
  id: number;
  conversationId: ID;
  /** The messages that came in live, oldest first. */
  messages: Message[];
  /** The words of the last phone alert about this chat. */
  alert?: { title: string; body: string };
  /**
   * The alert is about the newest message, so its words are what the banner
   * says. Still so once that message comes in live: the card keeps the words
   * it was showing rather than changing them as you read.
   */
  alertNewest: boolean;
  /** Phone alerts about messages that have not come in live yet: each is one message more. */
  alerts: number;
}

/** Several chats' news folded into one banner: "4 new messages", which opens the inbox. */
export interface PileNews {
  kind: 'pile';
  id: number;
  chats: ChatNews[];
}

export type News = ChatNews | PileNews;

export interface BannerQueue {
  current: News | null;
  /** The banner on show is on its way out; the next one waits until it has gone. */
  leaving: boolean;
  waiting: News[];
  /** Goes up whenever what is on show changes, new or updated: its timer starts again and a screen reader hears it. */
  stamp: number;
}

/** Decides whether a chat's news may still show: the same news, a trimmed copy, or null to drop it. */
export type Keep = (news: ChatNews) => ChatNews | null;

export type QueueAction =
  | { type: 'message'; message: Message; known: boolean }
  | { type: 'alert'; conversationId: ID; title: string; body: string }
  | { type: 'unsent'; messageId: ID }
  /** Put the banner away (timed out, flicked up, tapped). */
  | { type: 'dismiss' }
  /** It has finished leaving: the next in line comes on, if it may still show. */
  | { type: 'gone'; keep: Keep }
  /** Something changed (a chat opened, muted, a block): drop what may no longer show. */
  | { type: 'keep'; keep: Keep }
  /** Nothing may show right now (the tutorial, the inbox, signed out): put it all away. */
  | { type: 'clear' };

export const emptyQueue: BannerQueue = { current: null, leaving: false, waiting: [], stamp: 0 };

/** At most this many chats wait their turn; one more and they fold into a single "N new messages". */
const WAITING_MAX = 1;

let lastId = 0;
const newId = () => { lastId += 1; return lastId; };

/** How many messages a banner stands for. */
export function newsCount(n: News): number {
  return n.kind === 'chat' ? n.messages.length + n.alerts : n.chats.reduce((sum, c) => sum + newsCount(c), 0);
}

/** Nothing left to say. An alert with no words ("Mira added you to …") is a note in its own right, not a message. */
const isEmpty = (c: ChatNews) => newsCount(c) === 0 && !(c.alert && !c.alert.body);

/** The chats a banner is about. */
export const chatsIn = (n: News): ChatNews[] => (n.kind === 'chat' ? [n] : n.chats);

/** Every chat's news still to be read: on show (and staying) or waiting. */
const openNews = (q: BannerQueue): ChatNews[] => [...(q.current && !q.leaving ? chatsIn(q.current) : []), ...q.waiting.flatMap(chatsIn)];

/** A pile left with one chat in it is just that chat again; with none, nothing. */
function tidy(n: News): News | null {
  if (n.kind === 'chat') return isEmpty(n) ? null : n;
  const chats = n.chats.filter((c) => !isEmpty(c));
  if (!chats.length) return null;
  return chats.length === 1 ? chats[0] : chats.length === n.chats.length ? n : { ...n, chats };
}

/** News run through `keep`: what of it may still show, or null. */
export function keepNews(n: News, keep: Keep): News | null {
  const kept = n.kind === 'chat' ? keep(n) : { ...n, chats: n.chats.map(keep).filter((c): c is ChatNews => !!c) };
  return kept ? tidy(kept) : null;
}

/**
 * Runs `change` over every chat's news; the same queue back when nothing
 * changed, so nothing redraws. A banner already on its way out is left as it
 * is: asking again would send it away again, and the banner, which asks
 * whenever the queue changes, would never stop asking.
 */
function mapChats(q: BannerQueue, change: (c: ChatNews) => ChatNews | null): BannerQueue {
  let touched = false;
  const apply = (n: News | null): News | null => {
    if (!n) return n;
    const next = n.kind === 'chat'
      ? change(n)
      : { ...n, chats: n.chats.map(change).filter((c): c is ChatNews => !!c) };
    const tidied = next ? tidy(next) : null;
    const same = n.kind === 'chat' ? tidied === n : tidied?.kind === 'pile' && tidied.chats.length === n.chats.length && tidied.chats.every((c, i) => c === n.chats[i]);
    if (!same) touched = true;
    return same ? n : tidied;
  };
  const current = q.leaving ? q.current : apply(q.current);
  const waiting = q.waiting.map(apply).filter((n): n is News => !!n);
  if (!touched) return q;
  // The one on show has nothing left to say: it leaves, still showing its
  // last words while it goes.
  if (q.current && !current) return { ...q, leaving: true, waiting };
  return { ...q, current, waiting, stamp: current !== q.current && !q.leaving ? q.stamp + 1 : q.stamp };
}

/** Adds news that is about no chat already here: on show if nothing is, else in line. */
function enqueue(q: BannerQueue, news: ChatNews): BannerQueue {
  if (!q.current) return { ...q, current: news, leaving: false, stamp: q.stamp + 1 };
  const pile = q.waiting.find((n): n is PileNews => n.kind === 'pile');
  if (pile) return { ...q, waiting: q.waiting.map((n) => (n === pile ? { ...pile, chats: [...pile.chats, news] } : n)) };
  if (q.waiting.length < WAITING_MAX) return { ...q, waiting: [...q.waiting, news] };
  const chats = [...q.waiting.flatMap(chatsIn), news];
  return { ...q, waiting: [{ kind: 'pile', id: newId(), chats }] };
}

/**
 * Applies `change` to the news about one chat, wherever it is. A banner on
 * its way out is left alone: news for it waits in line and shows again.
 * `news`: something new to say, so the banner on show starts its time again
 * and is read out afresh; without it the change is quiet.
 */
function forChat(q: BannerQueue, conversationId: ID, change: (c: ChatNews) => ChatNews, news: boolean): BannerQueue | null {
  const has = (n: News | null) => !!n && chatsIn(n).some((c) => c.conversationId === conversationId);
  if (!(has(q.current) && !q.leaving) && !q.waiting.some(has)) return null;
  const skipCurrent = q.leaving;
  let done = false;
  const apply = (n: News): News => {
    if (done || !has(n)) return n;
    done = true;
    return n.kind === 'chat' ? change(n) : { ...n, chats: n.chats.map((c) => (c.conversationId === conversationId ? change(c) : c)) };
  };
  const current = q.current && !skipCurrent ? apply(q.current) : q.current;
  const waiting = q.waiting.map(apply);
  return { ...q, current, waiting, stamp: news && current !== q.current ? q.stamp + 1 : q.stamp };
}

export function bannerReducer(q: BannerQueue, action: QueueAction): BannerQueue {
  switch (action.type) {
    case 'message': {
      const { message, known } = action;
      const add = (c: ChatNews): ChatNews => ({
        ...c,
        messages: [...c.messages, message],
        // Its alert already counted it. The card keeps the alert's words (the
        // phone's alert words some things a little differently), so nothing
        // changes, restarts or is read out again: it is the same message.
        alerts: known ? Math.max(0, c.alerts - 1) : c.alerts,
        alertNewest: known ? c.alertNewest : false,
      });
      // A message whose alert has already been and gone was announced once; that's enough.
      if (known && !openNews(q).some((c) => c.conversationId === message.conversationId && c.alerts > 0)) return q;
      const updated = forChat(q, message.conversationId, add, !known);
      if (updated) return updated;
      return enqueue(q, { kind: 'chat', id: newId(), conversationId: message.conversationId, messages: [message], alertNewest: false, alerts: 0 });
    }
    case 'alert': {
      const { conversationId, title, body } = action;
      // An alert with no words is a note ("Mira added you to …"), not one more message.
      const more = body ? 1 : 0;
      const updated = forChat(q, conversationId, (c) => ({ ...c, alert: { title, body }, alertNewest: true, alerts: c.alerts + more }), true);
      return updated ?? enqueue(q, { kind: 'chat', id: newId(), conversationId, messages: [], alert: { title, body }, alertNewest: true, alerts: more });
    }
    case 'unsent':
      return mapChats(q, (c) => {
        if (!c.messages.some((m) => m.id === action.messageId)) return c;
        const messages = c.messages.filter((m) => m.id !== action.messageId);
        // With no alert still waiting for its message, the alert's words were
        // one of these messages' (perhaps this one): what is left says its own.
        return c.alerts ? { ...c, messages } : { ...c, messages, alertNewest: false, alert: c.alert?.body ? undefined : c.alert };
      });
    case 'dismiss':
      return q.current && !q.leaving ? { ...q, leaving: true } : q;
    case 'gone': {
      if (!q.leaving) return q;
      // The next in line, checked again now: that chat may have been opened, or muted, while it waited.
      const rest = [...q.waiting];
      while (rest.length) {
        const next = keepNews(rest.shift()!, action.keep);
        if (next) return { current: next, leaving: false, waiting: rest, stamp: q.stamp + 1 };
      }
      return { ...emptyQueue, stamp: q.stamp + 1 };
    }
    case 'keep':
      return mapChats(q, action.keep);
    case 'clear':
      if (!q.current && !q.waiting.length) return q;
      return q.current ? { ...q, leaving: true, waiting: [] } : { ...q, waiting: [] };
    default:
      return q;
  }
}

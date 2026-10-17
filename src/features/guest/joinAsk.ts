import { useSyncExternalStore } from 'react';

/**
 * The one "Join CourtSide to …" sheet a guest sees (Oct 17, owner: "it's
 * just when you want to actually do something that requires profile it will
 * make you sign up"). Anything a guest tries that needs a profile asks
 * through here: the app's actions (AppContext's guest gate), the + button,
 * and pages a guest cannot open (AppShell). One shared value and a list of
 * who to tell, the way tourStore and pendingTab share theirs.
 */
export interface JoinAsk {
  /** What they tried, finishing "Join CourtSide to …": "like posts", "reply". */
  what: string;
  /** Set when they tried to report something: its kind and id ("post:…"), for the no-account way to report. */
  report?: string;
  /** Where to land once they are in, when not the page they are on: an open hit's page, joined for them (as the peek does). */
  target?: { href: string; joinHit?: string; host?: string };
  /** Counts up on every ask, so the same ask twice still opens the sheet again. */
  at: number;
}

let current: JoinAsk | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function openJoinSheet(what: string, options?: { report?: string; target?: JoinAsk['target'] }) {
  current = { what, report: options?.report, target: options?.target, at: Date.now() };
  emit();
}

export function closeJoinSheet() {
  if (!current) return;
  current = null;
  emit();
}

export function useJoinSheet(): JoinAsk | null {
  return useSyncExternalStore(subscribe, () => current, () => current);
}

/** The iPhone app while it is in TestFlight (owner, Oct 17); the App Store link once it is approved. */
export const IPHONE_APP_URL = 'https://testflight.apple.com/join/21UJPuny';

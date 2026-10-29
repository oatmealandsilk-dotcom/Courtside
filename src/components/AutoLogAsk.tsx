import { useEffect, useRef, useState } from 'react';
import { router, usePathname } from 'expo-router';

import { isBusy } from '@/components/HitFollowUp';
import { markAutoLogAskReady } from '@/data/api';
import { AUTO_LOG_ASK, demoAsk, hasAutoTennis, readAsked } from '@/features/activity/autoLogAsk';
import { isDemo } from '@/features/activity/flags';
import { useFeedSwiped } from '@/features/feed/firstSwipe';
import { useOpenSettled } from '@/features/feed/warmup';
import { useTourBusy } from '@/features/tour/tourStore';
import { sheetOnTop } from '@/lib/goBack';
import { isShowing as toastShowing } from '@/lib/toast';
import { useAnyUploading } from '@/lib/uploads';
import { useApp } from '@/store/AppContext';

/** A moment after the way is clear, so it never lands on the app's own opening notes. */
const SETTLE_MS = 2500;
/** Something else was up when the moment came: looked at again this much later. */
const RETRY_MS = 4000;
/** Accounts this launch has already told the server it can show the card (once per launch is plenty). */
const toldReady = new Set<string>();

/**
 * Opens "Show your tennis to friends?" (app/auto-log-ask) by itself, once
 * per account on this phone, the next time the app is open, for a player
 * who has never chosen who sees the tennis that logs itself (autoLogSharing
 * null, not undefined: a database without migration 193 never asks) and has
 * some: a session that logged itself, or anything a tracker sent. As "How
 * was the hit?" waits (HitFollowUp): not under the opening curtain or the
 * tutorial, not while a post is being written or going up, not over another
 * sheet or note, and on the Feed not before its first swipe. Never in the
 * demo, where it would stand over every walk-through, unless asked for
 * (`?ask=auto-log`, features/activity/autoLogAsk). Draws nothing itself; the same on a phone and in a browser.
 */
export function AutoLogAsk({ enabled }: { enabled: boolean }) {
  const { currentUserId, autoLogSharing, sessions, detectedActivities } = useApp();
  const pathname = usePathname();
  const touring = useTourBusy();
  const uploading = useAnyUploading();
  const curtainDown = useOpenSettled();
  const swiped = useFeedSwiped();
  const waitOnFeed = (pathname === '/' || pathname === '/index') && !swiped;
  // Whether this phone already asked this account; null until read (or when it cannot be).
  const [asked, setAsked] = useState<boolean | null>(null);
  const [retry, setRetry] = useState(0);
  const opened = useRef(false);

  // The demo only when asked for (?ask=auto-log, read on whatever page it is opened at), so it never stands over a walk-through.
  const demoWanted = !!demoAsk();
  const live = enabled && !!currentUserId && (!isDemo(currentUserId) || demoWanted);
  // This version can show the card, so the server's one alert may come to this account (migration 200
  // sends it only then: an older version, as the store's build 22, could not open it). Never the demo's.
  useEffect(() => {
    if (!live || !currentUserId || isDemo(currentUserId) || toldReady.has(currentUserId)) return;
    toldReady.add(currentUserId);
    void markAutoLogAskReady();
  }, [live, currentUserId]);
  useEffect(() => {
    if (!live || !currentUserId) return undefined;
    let on = true;
    setAsked(null);
    void readAsked(currentUserId).then((v) => { if (on) setAsked(v); });
    return () => { on = false; };
  }, [live, currentUserId]);

  // Up by any way (the alert, Settings): it has been asked this app session, never put up again by itself.
  useEffect(() => {
    if (pathname === AUTO_LOG_ASK) { opened.current = true; setAsked(true); }
  }, [pathname]);

  const due = live && asked === false && autoLogSharing === null && hasAutoTennis(currentUserId, sessions, detectedActivities);
  const clear = curtainDown && !touring && !uploading && !isBusy(pathname) && pathname !== AUTO_LOG_ASK && !waitOnFeed;

  useEffect(() => {
    if (!due || !clear || opened.current) return undefined;
    const t = setTimeout(() => {
      // A note or a sheet is up: never pushed aside; looked at again shortly.
      if (toastShowing() || sheetOnTop()) { setRetry((n) => n + 1); return; }
      opened.current = true;
      setAsked(true);
      router.push(AUTO_LOG_ASK as never);
    }, retry ? RETRY_MS : SETTLE_MS);
    return () => clearTimeout(t);
  }, [due, clear, retry]);

  return null;
}

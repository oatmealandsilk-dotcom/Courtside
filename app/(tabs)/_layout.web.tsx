import { useTheme } from '@/theme/ThemeProvider';
import React, { startTransition, useEffect, useRef, useState } from 'react';
import Discuss from './discuss';
import Home from './index';
import Coaches from './coaches';
import Profile from './profile';
import { Redirect, Tabs, router, usePathname, useGlobalSearchParams } from 'expo-router';
import { SwipeSurface } from '@/components/SwipeSurface';
import { setPendingTab } from '@/features/navigation/pendingTab';
import { TABS_SLIDE, listenForSlides, type PageSlide } from '@/features/navigation/pageSlide';
import { requestSection, shownSection, swipeDestination } from '@/features/navigation/swipeOrder';
import { requestScrollToTop } from '@/features/navigation/scrollToTop';
import { TabFocus } from '@/features/navigation/tabFocus';
import { useResponsive } from '@/lib/useResponsive';
import { useApp } from '@/store/AppContext';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useCurtainDown } from '@/features/feed/warmup';
import { useTourOpen } from '@/features/tour/tourStore';
import { nearbyMapSettled } from '@/components/NearbyMap';
import { colors } from '@/theme';

/** The browser has been asked to keep data use down (a phone's data saver). */
function savingData(): boolean {
  return !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
}

/**
 * Settles once nothing new has finished downloading for a second (the map's
 * style, pictures and tiles are in), or after six seconds whatever is going
 * on, or as soon as `wanted` says it is no longer needed.
 */
function networkQuiet(wanted: () => boolean, quietMs = 1000, maxMs = 6000): Promise<void> {
  return new Promise((resolve) => {
    const started = performance.now();
    let last = started;
    let watcher: PerformanceObserver | null = null;
    try {
      watcher = new PerformanceObserver(() => { last = performance.now(); });
      watcher.observe({ type: 'resource' });
    } catch { /* an older browser: the clock alone decides */ }
    const check = setInterval(() => {
      const now = performance.now();
      if (!wanted() || now - last >= quietMs || now - started >= maxMs) { clearInterval(check); watcher?.disconnect(); resolve(); }
    }, 200);
  });
}

/** The strip, left to right, the same as the phone's TabsPager: Community, Home, Coaching, Profile. */
const TAB_PATHS = ['/discuss', '/', '/coaches', '/profile'];

export default function TabsLayout() {
  useTheme();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ section?: string }>();
  // A page turn the tutorial asks for (see pageSlide) plays on this same
  // surface, with the page it is heading for as the one sliding in: it may
  // be further along than the next stop (the Feed to the map), the way the
  // phone's tab row glides straight to a far tab.
  const slide = useRef<((direction: 1 | -1) => boolean) | null>(null);
  const asked = useRef<PageSlide | null>(null);
  useEffect(() => listenForSlides(TABS_SLIDE, (wanted) => {
    asked.current = wanted;
    if (slide.current?.(wanted.direction)) return true;
    asked.current = null;
    return false;
  }), []);
  const destination = (direction: 1 | -1) => {
    const wanted = asked.current;
    if (wanted && wanted.direction === direction) return wanted.to;
    return swipeDestination(pathname, pathname === "/discuss" || pathname === "/profile" ? shownSection(pathname) ?? params.section : params.section, direction);
  };
  const swipe = (direction: 1 | -1) => {
    const next = destination(direction);
    if (next) { requestSection(next.pathname, next.section); router.navigate(next.pathname); }
    // Kept until the page it went to is drawn and the surface lets go, so the
    // picture sliding in stays the same one; the next swipe is a finger's.
    const done = asked.current;
    if (done) setTimeout(() => { if (asked.current === done) asked.current = null; }, 1000);
  };
  const { ready, currentUserId, remoteLoaded, snapshotShown } = useApp();
  const { isPhone } = useResponsive();
  // The Feed is built out of sight a moment after the app has opened, while
  // you look at the start page, so its first clip has loaded by the time you
  // get there (on a phone all four tabs are built from the start: TabsPager).
  // It waits for the opening curtain to go, for the map to have what it needs
  // from the connection (on a slow one the clips used to hold the map up),
  // and for a quiet moment; it is built as background work, so nothing on
  // screen waits for it. Not while the tutorial is up (its tips are animating,
  // and it takes you to the Feed itself), and not when the browser has been
  // asked to save data. Never before the account's own posts are in (or last
  // time's copy of them): a link opened cold skips the logo that waits for
  // them, and a Feed dealt from the stand-in demo posts would be left with
  // nothing once the real ones replace them.
  const curtainDown = useCurtainDown();
  const touring = useTourOpen();
  const dataIn = ready && (!isSupabaseConfigured || remoteLoaded || snapshotShown);
  const [feedEarly, setFeedEarly] = useState(false);
  useEffect(() => {
    if (!curtainDown || feedEarly || !currentUserId || !dataIn || touring || savingData()) return;
    let live = true;
    let idle: number | undefined;
    const build = () => { if (live) startTransition(() => setFeedEarly(true)); };
    void nearbyMapSettled().then(() => networkQuiet(() => live)).then(() => {
      if (!live) return;
      if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(build, { timeout: 2000 });
      else build();
    });
    return () => { live = false; if (idle !== undefined) window.cancelIdleCallback(idle); };
  }, [curtainDown, feedEarly, currentUserId, dataIn, touring]);
  // Community opens at its top whenever you come to it from another tab (the
  // tabs stay mounted, so it used to sit wherever you last left it). Coming
  // back from a thread is not a tab change, so your place is kept. Same rule
  // as the phone's TabsPager.
  const lastTab = useRef(pathname);
  useEffect(() => {
    if (!TAB_PATHS.includes(pathname)) return;
    if (pathname === '/discuss' && TAB_PATHS.includes(lastTab.current) && lastTab.current !== '/discuss') requestScrollToTop('/discuss', true);
    lastTab.current = pathname;
  }, [pathname]);
  if (ready && !currentUserId) return <Redirect href="/sign-in" />;
  return (
    <SwipeSurface slideRef={slide} onSwipe={swipe} onCommit={direction => {
      const next = destination(direction);
      if (next) setPendingTab(next.pathname);
    }} onDragTo={direction => {
      if (direction === null) return setPendingTab(null);
      const next = destination(direction);
      setPendingTab(next ? next.pathname : null);
    }} delegateLeft={pathname === "/profile"} settledKey={`${pathname}:${shownSection(pathname) ?? params.section ?? ''}`} renderPreview={direction => {
      const next = destination(direction);
      if (!next) return null;
      // Home slid in under a finger is a picture of the feed, not the feed:
      // its clip shows its cover and starts only once you have arrived (a
      // second, live copy played with sound before you got there).
      if (next.pathname === '/') return <TabFocus active={false}><Home/></TabFocus>;
      if (next.pathname === '/discuss') return <Discuss previewSection={next.section}/>;
      if (next.pathname === '/coaches') return <Coaches/>;
      return <Profile previewSection={next.section}/>;
    }}>
    <Tabs
      // The root shell keeps navigation visible across both tabs and detail pages.
      tabBar={() => null}
      screenOptions={{
        headerShown: false,
        // The swipe is the transition. A fade on top of it plays second and
        // reads as a hitch once the page has already landed.
        animation: 'none',
        tabBarPosition: isPhone ? 'bottom' : 'left',
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {/* In the strip's order, Community first. '/(tabs)' still means Home: an
          address picks its screen by name, never by this order. */}
      <Tabs.Screen name="discuss" options={{ title: 'Community' }} />
      <Tabs.Screen name="index" options={{ title: 'Feed', lazy: !feedEarly }} />
      <Tabs.Screen name="coaches" options={{ title: 'Coaching' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
    </SwipeSurface>
  );
}

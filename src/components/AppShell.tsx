import { useTheme } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Platform, View } from 'react-native';
import { goBack } from '@/lib/goBack';
import { Redirect, router, usePathname } from 'expo-router';
import { NavBar } from './NavBar';
import { UploadBar } from '@/components/UploadBar';
import { WarmCurtain } from '@/components/WarmCurtain';
import { Toast } from './Toast';
import { RouteTransition } from './RouteTransition';
import { useResponsive } from '@/lib/useResponsive';
import { getPendingTab, setPendingTab, subscribePendingTab } from '@/features/navigation/pendingTab';
import { requestScrollToTop } from '@/features/navigation/scrollToTop';
import { useApp } from '@/store/AppContext';
import { recallAnswered } from '@/features/age/ageCheck';
import { setCrashScreen } from '@/lib/crashReporting';
import { listenForPushTaps, registerForPush } from '@/features/push/push';
import { isSupabaseConfigured } from '@/lib/supabase';
import { TERMS_VERSION } from '@/lib/legal';
import { colors } from '@/theme';

const paths = { index: '/', discuss: '/discuss', coaches: '/coaches', profile: '/profile' } as const;
const routes = Object.keys(paths).map(name => ({ key: name, name }));
/** The pages that slide up over the app; Escape closes them on a computer. */
const SHEETS = new Set(['/compose', '/share', '/ask', '/comments', '/post-menu', '/edit-post']);
const TAB_ORDER: string[] = [paths.index, paths.discuss, paths.coaches, paths.profile];
export function AppShell({ children }: { children: React.ReactNode }) {
  useTheme();
  const pathname = usePathname();
  // A swipe publishes where it is going before the router knows, so the bar
  // moves with the gesture. Once the route agrees, the hint is dropped.
  const pending = useSyncExternalStore(subscribePendingTab, getPendingTab, getPendingTab);
  useEffect(() => {
    if (!pending) return;
    if (pending === pathname) { setPendingTab(null); return; }
    // A hint the route never confirms (the swipe was cancelled) must not
    // leave the bar pointing at the wrong tab.
    const timer = setTimeout(() => setPendingTab(null), 900);
    return () => clearTimeout(timer);
  }, [pending, pathname]);
  const shown = pending ?? pathname;
  // A sideways trackpad swipe is the browser's own back/forward gesture; the
  // page never lets a swipe run off its edge, so it stays where it is.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overscrollBehavior = 'none';
  }, []);
  // Keyboard on a computer: Escape closes a sheet, the left and right arrows step between the four tabs.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Escape' && SHEETS.has(pathname)) { e.preventDefault(); goBack('/'); return; }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && TAB_ORDER.includes(pathname) && !e.metaKey && !e.altKey) {
        const next = TAB_ORDER[TAB_ORDER.indexOf(pathname) + (e.key === 'ArrowRight' ? 1 : -1)];
        if (next) { e.preventDefault(); router.navigate(next); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pathname]);
  const { currentUserId, currentUser, ready, authResolved, remoteLoaded, onboardingComplete, termsVersion } = useApp();
  // Crash reports say which screen they happened on.
  useEffect(() => { setCrashScreen(pathname); }, [pathname]);
  // Alerts: a tap on one opens what it is about. Once someone is signed in
  // and set up, the phone asks (once, ever) whether alerts may be sent, and
  // keeps this phone's push address on the account fresh.
  useEffect(() => listenForPushTaps(), []);
  const pushAskedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured || !currentUserId || !remoteLoaded || !onboardingComplete || !currentUser?.ageGroup) return;
    if (pushAskedFor.current === currentUserId) return;
    pushAskedFor.current = currentUserId;
    void registerForPush();
  }, [currentUserId, remoteLoaded, onboardingComplete, currentUser?.ageGroup]);
  // The age check: an account with no birthday on file is asked for one
  // before anything else, wherever it opens. (An answer given on this phone
  // counts too, in case the database's side of the check is not added yet.)
  const [answered, setAnswered] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setAnswered(undefined);
    if (currentUserId) void recallAnswered(currentUserId).then(setAnswered);
  }, [currentUserId, currentUser?.ageGroup]);
  const needsBirthday = isSupabaseConfigured && !!currentUserId && remoteLoaded && !!currentUser && !currentUser.ageGroup
    && answered === null && !['/birthday', '/sign-in'].includes(pathname);
  // The terms: an account that has not agreed to the current ones — a Google
  // sign-up, one made before sign-up asked, or anyone after the terms change —
  // agrees once before going further. It comes after the age check, so
  // nobody under 13 is asked to agree to anything.
  const needsTerms = isSupabaseConfigured && !!currentUserId && remoteLoaded && termsVersion !== undefined
    && termsVersion !== TERMS_VERSION && !needsBirthday && !['/agree', '/birthday', '/sign-in'].includes(pathname);
  const { isPhone } = useResponsive();
  const selected = useRef(0);
  if (shown === '/') selected.current = 0;
  else if (shown === '/discuss' || shown.startsWith('/question/') || shown.startsWith('/user/')) selected.current = 1;
  else if (shown === '/coaches' || shown.startsWith('/coach/')) selected.current = 2;
  else if (shown === '/profile' || ['/settings', '/edit-profile', '/profile-details'].includes(shown)) selected.current = 3;
  const showNav = !!currentUserId && !['/sign-in', '/onboarding', '/agree'].includes(pathname);
  // A shared link opened while signed out goes to sign-in, not to an empty page.
  // The waitlist is the exception: it exists for people who have no account yet.
  const mustSignIn = ready && authResolved && !currentUserId && !['/', '/index', '/sign-in', '/onboarding', '/birthday', '/waitlist'].includes(pathname);
  const nav = <NavBar state={{ index: selected.current, routes }} navigation={{ navigate: name => {
    const destination = paths[name as keyof typeof paths];
    if (!destination) return;
    // Already here: a second tap on the same icon takes the page back to the top.
    if (destination === pathname) requestScrollToTop(destination);
    // From a page pushed on top (settings, edit profile…), go back down to the
    // tab the way the back button would — a pop with its slide, not a jump.
    else if (!Object.values(paths).includes(pathname as (typeof paths)[keyof typeof paths])) {
      const r = router as unknown as { dismissTo?: (href: string) => void; canGoBack?: () => boolean };
      // Home's address is also the splash screen's, so it cannot be dismissed
      // to directly: step back to the tabs first, then glide across to Home.
      if (destination === '/') {
        if (r.canGoBack?.()) { router.back(); setTimeout(() => router.navigate('/'), 30); }
        else router.navigate('/');
      } else if (r.dismissTo) r.dismissTo(destination);
      else router.navigate(destination);
    }
    else router.navigate(destination);
  } }} />;
  if (mustSignIn) return <Redirect href="/sign-in" />;
  if (needsBirthday) return <Redirect href="/birthday" />;
  if (needsTerms) return <Redirect href="/agree" />;
  return <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.bg, flexDirection: isPhone ? 'column' : 'row' }}>
    {showNav && !isPhone && nav}
    <View style={{ flex: 1, minWidth: 0, minHeight: 0 }}><RouteTransition>{children}</RouteTransition><Toast /><UploadBar /></View>
    {showNav && isPhone && nav}
    {showNav && (pathname === '/' || pathname === '/index') ? <WarmCurtain /> : null}
  </View>;
}

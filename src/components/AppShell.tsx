import { useTheme } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Platform, View } from 'react-native';
import { goBack, goHome, setRootNavigation } from '@/lib/goBack';
import { router, useGlobalSearchParams, useNavigationContainerRef, usePathname, useSegments } from 'expo-router';
import { NavBar } from './NavBar';
import { setInstantExit } from '@/features/navigation/instantExit';
import { UploadBar } from '@/components/UploadBar';
import { WarmCurtain } from '@/components/WarmCurtain';
import { TourOverlay } from '@/components/TourOverlay';
import { isTourOpen, useTourOpen } from '@/features/tour/tourStore';
import { Toast } from './Toast';
import { MessageBanner } from './MessageBanner';
import { HitFollowUp } from './HitFollowUp';
import { RouteTransition } from './RouteTransition';
import { useResponsive } from '@/lib/useResponsive';
import { getPendingTab, setPendingTab, subscribePendingTab } from '@/features/navigation/pendingTab';
import { requestScrollToTop } from '@/features/navigation/scrollToTop';
import { askForCommunityMap, isStartTab } from '@/features/navigation/startTab';
import { launchSettle, useCurtainDown } from '@/features/feed/warmup';
import { useApp } from '@/store/AppContext';
import { isPublicPath } from '@/features/share/publicPaths';
import { useShareLanding } from '@/features/share/useShareLanding';
import { useWorkoutWatch } from '@/features/activity/useWorkoutWatch';
import { useRatePrompt } from '@/features/rating/useRatePrompt';
import { claimCarriedBirthDate, isDeviceBlocked, recallAnswered } from '@/features/age/ageCheck';
import { auth as remoteAuth } from '@/data/remote';
import { setCrashScreen } from '@/lib/crashReporting';
import { listenForPushTaps, registerForPush } from '@/features/push/push';
import { recoverChatPick } from '@/features/messages/pendingPick';
import { setUpNotificationChannels } from '@/features/push/channels';
import { isSupabaseConfigured } from '@/lib/supabase';
import { TERMS_VERSION } from '@/lib/legal';
import { colors } from '@/theme';
import { stageKeyOf, useStageSelect } from '@/features/feed/commentStage';
import { useStageMotion } from '@/features/feed/useStageMotion';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';

/**
 * The four tabs in the strip's order, left to right: Community, Home,
 * Coaching, Profile. The bar's lit item, the arrow keys and the "which side
 * is it on" check below all count along this one list, the same order as
 * TabsPager's row and the bar's buttons.
 */
const paths = { discuss: '/discuss', index: '/', coaches: '/coaches', profile: '/profile' } as const;
const routes = Object.keys(paths).map(name => ({ key: name, name }));
/**
 * The pages that slide up over the app; Escape closes them on a computer.
 * The comments close themselves on Escape, with their own animation (see
 * DragSheet.web), so they are not here: a second step back closed the page under them too.
 */
const SHEETS = new Set(['/compose', '/share', '/pick-group', '/find-groups', '/group-form', '/group-invite', '/pick-court', '/ask', '/post-menu', '/edit-post', '/messages/new', '/log-session', '/pick-session', '/session-tag', '/hit-request/new', '/court-report', '/court-now', '/map-visibility', '/open-to-hit']);
const TAB_ORDER: string[] = Object.values(paths);
/** How often an open app looks for new workouts and new Notifications rows: just over the two minutes the Apple Health look waits between looks. */
const LIVE_LOOK_MS = 125_000;
/** The pages that can take a clip's stage (see commentStage): its comments, and its session stats. */
const STAGE_ROUTES = new Set(['/comments', '/session-stats']);
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
  // Keyboard on a computer: Escape closes a sheet, the left and right arrows step between the four tabs in strip order.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      // The tour has the keyboard while it is up.
      if (isTourOpen()) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Escape' && SHEETS.has(pathname)) { e.preventDefault(); goBack('/'); return; }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && TAB_ORDER.includes(pathname) && !e.metaKey && !e.altKey) {
        const next = TAB_ORDER[TAB_ORDER.indexOf(pathname) + (e.key === 'ArrowRight' ? 1 : -1)];
        if (next) { e.preventDefault(); if (next === paths.discuss) askForCommunityMap(); router.navigate(next); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pathname]);
  // The going-home helpers look at which page is on show (see tabsOnShow in goBack).
  const rootNavigation = useNavigationContainerRef();
  useEffect(() => { setRootNavigation(rootNavigation); return () => setRootNavigation(null); }, [rootNavigation]);
  const { currentUserId, currentUser, ready, authResolved, remoteLoaded, onboardingComplete, termsVersion, healthIsReal, actions } = useApp();
  // Crash reports say which screen they happened on.
  useEffect(() => { setCrashScreen(pathname); }, [pathname]);
  // Alerts: a tap on one opens what it is about. Once someone is signed in
  // and set up, the phone asks (once, ever) whether alerts may be sent, and
  // keeps this phone's push address on the account fresh.
  useEffect(() => listenForPushTaps(), []);
  // Android: the alert channels (Messages, Likes and replies, Reminders) exist from the first launch, before any alert or question.
  useEffect(() => { void setUpNotificationChannels(); }, []);
  const pushAskedFor = useRef<string | null>(null);
  useEffect(() => {
    // Logging out takes this phone's push address off the account, so the
    // next sign-in (the same account too) puts it back.
    if (!currentUserId) { pushAskedFor.current = null; return; }
    if (!isSupabaseConfigured || !remoteLoaded || !onboardingComplete || !currentUser?.ageGroup) return;
    if (pushAskedFor.current === currentUserId) return;
    pushAskedFor.current = currentUserId;
    void registerForPush();
  }, [currentUserId, remoteLoaded, onboardingComplete, currentUser?.ageGroup]);
  // Android: a chat photo taken or chosen just before the phone closed the app
  // (short of memory) is collected, and the app goes back to that chat with it
  // in the tray, once the app has settled on its first page (see pendingPick).
  useEffect(() => {
    if (Platform.OS !== 'android' || !currentUserId || !remoteLoaded || !onboardingComplete) return undefined;
    const t = setTimeout(() => { void recoverChatPick().then((chatId) => { if (chatId) router.push(`/messages/${chatId}`); }); }, 1200);
    return () => clearTimeout(t);
  }, [currentUserId, remoteLoaded, onboardingComplete]);
  // Tennis sessions and (Oct 5) other workouts from a tracker: looked for
  // when the app opens, each time it comes back to the front, and every
  // couple of minutes while it stays open on screen (the look itself is
  // held to once every two minutes for Apple Health, once an hour for WHOOP
  // and the others). It does nothing unless a source has sessions on and its
  // server switch is on (migration 58).
  useEffect(() => {
    if (!isSupabaseConfigured || !currentUserId || !remoteLoaded || !onboardingComplete || !healthIsReal) return;
    void actions.checkForActivities();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void actions.checkForActivities(); });
    return () => sub.remove();
  }, [currentUserId, remoteLoaded, onboardingComplete, healthIsReal]); // eslint-disable-line react-hooks/exhaustive-deps
  // While the app stays open on screen, new rows in Notifications arrive
  // without closing and opening it (Oct 5): a workout just found, WHOOP's own
  // alert, anything else filed meanwhile. One small ask every two minutes
  // and a bit, only while the app is in front. The workouts look on a tick
  // hands over only workouts not handed over yet, and reads your sessions
  // again only when one was.
  useEffect(() => {
    if (!isSupabaseConfigured || !currentUserId || !remoteLoaded || !onboardingComplete) return undefined;
    const tick = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      if (healthIsReal) void actions.checkForActivities(false, true);
      void actions.catchUpNotifications();
    }, LIVE_LOOK_MS);
    return () => clearInterval(tick);
  }, [currentUserId, remoteLoaded, onboardingComplete, healthIsReal]); // eslint-disable-line react-hooks/exhaustive-deps
  // The age check: an account with no birthday on file is asked for one
  // before anything else, wherever it opens. (An answer given on this phone
  // counts too, in case the database's side of the check is not added yet.)
  const [answered, setAnswered] = useState<string | null | undefined>(undefined);
  // Only once the account's own record is in is it known whether its age is on file.
  const accountIn = remoteLoaded && !!currentUser;
  useEffect(() => {
    setAnswered(undefined);
    if (!currentUserId) return;
    let stale = false;
    void (async () => {
      let answer: string | null = await recallAnswered(currentUserId);
      // A birthday given at sign-up and not saved yet: typed on the email
      // form (it rides on the account, which can open before it is saved or
      // only from the email link), or typed before tapping Apple or Google
      // (carried on this phone for a few minutes). It is saved now, the same
      // way the birthday page saves one, so whoever typed it is not asked again.
      if (isSupabaseConfigured && accountIn) {
        const who = await remoteAuth.signedInUser().catch(() => null);
        // A phone that has had an under-13 answer takes no birthday from
        // anywhere: an account with no age goes to the birthday page, which
        // says CourtSide is not available.
        const blocked = await isDeviceBlocked();
        if (!stale && who?.id === currentUserId) {
          // What Apple or Google carried is used up by the first account to open after it.
          const carried = claimCarriedBirthDate({ createdAt: who.createdAt });
          const typed = who.birthDate ?? carried;
          // (An answer only this phone remembers, from a save that did not
          // reach the server, is saved again here too.)
          if (typed && !currentUser?.ageGroup && !blocked) {
            const saved = await actions.confirmBirthDate(typed).catch(() => null);
            if (saved === 'teen' || saved === 'adult') answer = saved;
          }
          // The form's birthday rode on the account only to get here; with the age on file it comes off.
          if (who.birthDate && currentUser?.ageGroup) void remoteAuth.forgetSignUpBirthDate().catch(() => undefined);
        }
      }
      if (!stale) setAnswered(answer);
    })();
    return () => { stale = true; };
  }, [currentUserId, currentUser?.ageGroup, accountIn]);
  const needsBirthday = isSupabaseConfigured && !!currentUserId && remoteLoaded && !!currentUser && !currentUser.ageGroup
    && answered === null && !['/birthday', '/sign-in'].includes(pathname);
  // The terms: an account that has not agreed to the current ones — a Google
  // sign-up, one made before sign-up asked, or anyone after the terms change —
  // agrees once before going further. It comes after the age check, so
  // nobody under 13 is asked to agree to anything.
  const needsTerms = isSupabaseConfigured && !!currentUserId && remoteLoaded && termsVersion !== undefined
    && termsVersion !== TERMS_VERSION && !needsBirthday && !['/agree', '/birthday', '/sign-in'].includes(pathname);
  const { isPhone } = useResponsive();
  const tourOpen = useTourOpen();
  // Which tab the page on show belongs to, as its place in TAB_ORDER. A page
  // that is not a tab's own keeps the tab it was opened from. It starts on
  // Home: a real launch passes through the splash and then Community and
  // sets it on the way, so this only shows on a link opened cold (a shared
  // post, say), where Home is the tab it belongs with.
  const selected = useRef(TAB_ORDER.indexOf(paths.index));
  if (shown === paths.index) selected.current = TAB_ORDER.indexOf(paths.index);
  else if (shown === paths.discuss || shown.startsWith('/question/') || shown.startsWith('/user/')) selected.current = TAB_ORDER.indexOf(paths.discuss);
  else if (shown === paths.coaches || shown.startsWith('/coach/') || shown.startsWith('/coach-') || shown === '/ai-coach' || shown === '/booking-done') selected.current = TAB_ORDER.indexOf(paths.coaches);
  else if (shown === paths.profile || ['/settings', '/edit-profile', '/change-handle', '/profile-details', '/your-sessions', '/workouts'].includes(shown)) selected.current = TAB_ORDER.indexOf(paths.profile);
  // Pages with their own bottom controls (a composer, an editor, a thread's
  // message box) run without the phone's floating bar. On a computer the
  // menu sits at the side, out of their way, so it stays, the way
  // Instagram's does behind its Create box. Sign-in, setup and the camera
  // hide it everywhere.
  const phoneOnlyHide = ['/compose', '/edit-post', '/ask', '/ask-coach', '/coach-apply', '/pick-location', '/pick-court', '/invite', '/comments', '/session-stats', '/who-played', '/share', '/pick-group', '/find-groups', '/group-form', '/group-invite', '/likes', '/post-menu', '/log-session', '/pick-session', '/session-tag', '/hit-request/new', '/court-report', '/court-now', '/map-visibility', '/open-to-hit', '/wrapped', '/health-share', '/share-session'].includes(pathname) || pathname === '/messages' || pathname.startsWith('/messages/');
  // Arriving from the password-reset email is its own calm page, with no app around it yet.
  // (The comments' own address says which clip they are about, for the stage below.)
  const { reset, kind: routeKind, id: routeId, stage: routeStage } = useGlobalSearchParams<{ reset?: string; kind?: string; id?: string; stage?: string }>();
  const hideEverywhere = ['/sign-in', '/onboarding', '/agree', '/birthday', '/first-move', '/hit'].includes(pathname) || pathname.startsWith('/story/') || (pathname === '/account' && !!reset);
  // The splash shares Home's address ('/'); only the route's segments tell
  // them apart. The bar waits until the splash has handed over to the app.
  const segments = useSegments() as string[];
  const onSplash = segments.length === 0 || (segments.length === 1 && segments[0] === 'index');
  // On the comments stage the phone's bar does not pop away: it stays, out of
  // reach of touches, and fades out with the first of the opening (and back
  // in with the last of the closing), following the sheet (see commentStage).
  // It follows from the tap, before the comments' address is even the page's,
  // so it fades from the first frame of the move; then only while those very
  // comments are in front (not a page opened over them, nor other comments),
  // and as the page grows back if the comments went without their own close.
  const stageBar = useStageSelect((s) => (s && s.mode === 'stage' && !s.covered ? `${s.key}|${s.mounted && !s.ending ? 'up' : 'moving'}` : ''));
  const [barKey, barPhase] = stageBar.split('|');
  // The comments and a clip's stats (session-stats) both take the stage.
  const commentsOnStage = STAGE_ROUTES.has(pathname) && routeStage === '1' && stageKeyOf(routeKind === 'hit' ? 'hit' : 'post', routeId ?? '') === barKey;
  const barOnStage = isPhone && !!stageBar && (commentsOnStage || (barPhase === 'moving' && !STAGE_ROUTES.has(pathname)));
  // The bar is cut off at the sheet's top as it rises (navInner holds the bar
  // still inside the cut): the sheet comes up over it, never under it.
  const navFade = useStageMotion('nav', { enabled: barOnStage });
  const navHold = useStageMotion('navInner', { enabled: barOnStage });
  // A browser still lets taps reach the bar's buttons through "none" on the
  // layer around it (they set their own); `inert` takes the whole bar out of
  // reach, and out of a screen reader's, while the comments are over it.
  const navLayer = useRef<HTMLElement | null>(null);
  useEffect(() => { if (Platform.OS === 'web' && navLayer.current) navLayer.current.inert = barOnStage; }, [barOnStage]);
  const showNav = !!currentUserId && !hideEverywhere && !onSplash && (!(isPhone && phoneOnlyHide) || barOnStage);
  const curtainDown = useCurtainDown();
  // As the opening curtain lifts, the page under it settles from a touch large
  // and low into place, on the curtain's own curve (see WarmCurtain), so the
  // logo leaving and the app arriving are one motion. On the phone only: in a
  // browser a transform round the whole app would trap everything that floats
  // over the bar beneath it, and there the curtain's own lift carries it.
  const settleOn = Platform.OS !== 'web';
  const settle = useAnimatedStyle(() => (!settleOn ? {} : {
    transform: [{ translateY: launchSettle.value * 10 }, { scale: 1 + launchSettle.value * 0.03 }],
  }));
  // A page opened while signed out goes to sign-in, not to an empty page. A
  // shared link (a post, a profile, an open hit, a thread, a court, an
  // invite) is the exception: it shows its public look (see publicRoute).
  const mustSignIn = ready && authResolved && !currentUserId && !['/', '/index', '/sign-in', '/onboarding', '/birthday'].includes(pathname) && !isPublicPath(pathname);
  // The gates — sign in, birthday, terms — are reached by one replace each,
  // with the app left mounted underneath. Swapping the whole app for a
  // redirect unmounted the navigator; when it came back on the page it had
  // left, the gate fired again, and the two bounced until React gave up.
  const detour = mustSignIn ? '/sign-in' : needsBirthday ? '/birthday' : needsTerms ? '/agree' : null;
  // Signed up from a shared link: once in, the app opens on what they were looking at.
  useShareLanding({ pathname, held: !!detour });
  // The phone's own "Workout detected" alert (build 15): kept in step with the switches, and its tap opens Log it.
  useWorkoutWatch({ settled: !detour && !onSplash });
  // "Rate CourtSide" (build 15): the phone's own rating box after a happy moment, only ever on a calm
  // page: past the splash, the gates and the tutorial, and not a composer, a sheet or a camera.
  useRatePrompt({ calm: !!currentUserId && !detour && !onSplash && !hideEverywhere && !tourOpen && curtainDown && !phoneOnlyHide && !SHEETS.has(pathname) });
  const sentTo = useRef<string | null>(null);
  useEffect(() => {
    if (!detour) { sentTo.current = null; return; }
    if (sentTo.current === detour) return;
    sentTo.current = detour;
    router.replace(detour);
  }, [detour]);
  const nav = <NavBar state={{ index: selected.current, routes }} navigation={{ navigate: name => {
    const destination = paths[name as keyof typeof paths];
    if (!destination) return;
    // Community opens on its map, from the top, whenever the bar takes you there.
    if (destination === paths.discuss && destination !== pathname) askForCommunityMap();
    // Already here: a second tap on the same icon takes the page back to the top.
    if (destination === pathname) requestScrollToTop(destination);
    // From a page pushed on top (settings, edit profile…), go back down to the
    // tab the way the back button would — a pop with its slide, not a jump.
    else if (!Object.values(paths).includes(pathname as (typeof paths)[keyof typeof paths])) {
      const r = router as unknown as { dismissTo?: (href: string) => void; canGoBack?: () => boolean };
      // Going to a different tab than the one this page belongs to (the map,
      // under Community, then Coaching): the page leaves without the Back
      // slide, which would run the opposite way to the tabs' own glide.
      if (Platform.OS !== 'web' && TAB_ORDER.indexOf(destination) !== selected.current) {
        setInstantExit(true);
        // One frame for the stack to take the "no slide" setting before the page is dismissed.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (destination === '/') goHome();
          else if (r.dismissTo) r.dismissTo(destination);
          else router.navigate(destination);
          setTimeout(() => setInstantExit(false), 450);
        }));
        return;
      }
      // Home's address ('/') is also the splash screen's: going there from a
      // page on top replayed the logo and built a second copy of the app,
      // with no bar while the logo was up. goHome closes every page on top,
      // however deep, down to the tabs, and the tabs move across to Home.
      if (destination === '/') goHome();
      else if (r.dismissTo) r.dismissTo(destination);
      else router.navigate(destination);
    }
    else if (destination === '/') goHome();
    else router.navigate(destination);
  } }} />;
  return <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.bg, flexDirection: isPhone ? 'column' : 'row' }}>
    {showNav && !isPhone && nav}
    {/* While the tour is up, TalkBack reads only the tour, not the page under the dim. */}
    <Reanimated.View importantForAccessibility={tourOpen ? 'no-hide-descendants' : 'auto'} style={[{ flex: 1, minWidth: 0, minHeight: 0 }, settle]}><RouteTransition>{children}</RouteTransition><Toast /><UploadBar /></Reanimated.View>
    {showNav && isPhone ? (
      <Reanimated.View ref={((node: unknown) => { navLayer.current = node as HTMLElement | null; navFade.ref?.(node); }) as never} pointerEvents={barOnStage ? 'none' : 'box-none'} style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, barOnStage && { overflow: 'hidden' }, navFade.style]}>
        <Reanimated.View ref={navHold.ref as never} pointerEvents="box-none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, navHold.style]}>{nav}</Reanimated.View>
      </Reanimated.View>
    ) : null}
    {/* A new message drops in at the top, over the bar too; never on the pages the app keeps to themselves. */}
    <MessageBanner enabled={!!currentUserId && !hideEverywhere && !onSplash && !detour} />
    {/* "How was the hit?", once, after a hit you played; only for a set-up account, never on the pages the app keeps to themselves. */}
    <HitFollowUp enabled={!!currentUserId && onboardingComplete && (remoteLoaded || !isSupabaseConfigured) && !hideEverywhere && !onSplash && !detour} />
    {/* The splash curtain, from the splash's hand-over until the page the app opens on has drawn (see warmup). */}
    {!curtainDown && !!currentUserId && !hideEverywhere && (onSplash || isStartTab(pathname)) ? <WarmCurtain /> : null}
    {/* The first-run tour: over the bar, so it can light the bar's own buttons. */}
    {currentUserId ? <TourOverlay eligible={showNav && !detour && !onSplash} /> : null}
    {/* On its way to a gate (sign-in, birthday, terms): the page underneath is covered for the moment it takes. */}
    {detour ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg }} /> : null}
  </View>;
}

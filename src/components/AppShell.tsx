import { useTheme } from '@/theme/ThemeProvider';
import { catchUpNow } from '@/theme/catchUp';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Platform, View } from 'react-native';
import { goBack, goHome, setRootNavigation } from '@/lib/goBack';
import { router, useGlobalSearchParams, useNavigationContainerRef, usePathname, useSegments } from 'expo-router';
import { NavBar } from './NavBar';
import { setInstantExit } from '@/features/navigation/instantExit';
import { UploadBar } from '@/components/UploadBar';
import { LiveBar } from '@/components/session/LiveBar';
import { StillPlaying } from '@/components/session/StillPlaying';
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
import { askForCommunityMap, isStartTab, isTabPage } from '@/features/navigation/startTab';
import { launchSettle, useCurtainDown } from '@/features/feed/warmup';
import { preloadNearbyMap } from '@/components/NearbyMap';
import { useApp } from '@/store/AppContext';
import { isPublicPath } from '@/features/share/publicPaths';
import { guestAskFor } from '@/features/guest/guestPaths';
import { openJoinSheet } from '@/features/guest/joinAsk';
import { JoinSheet } from '@/features/guest/JoinSheet';
import { GetAppBar } from '@/features/guest/GetAppBar';
import { rememberReferrer } from '@/features/invite/referral';
import { rememberCampaign } from '@/features/guest/campaign';
import { HOME } from '@/lib/goBack';
import { useShareLanding } from '@/features/share/useShareLanding';
import { useWorkoutWatch } from '@/features/activity/useWorkoutWatch';
import { useRatePrompt } from '@/features/rating/useRatePrompt';
import { claimCarriedBirthDate, isDeviceBlocked, recallAnswered } from '@/features/age/ageCheck';
import { auth as remoteAuth } from '@/data/remote';
import { setCrashScreen } from '@/lib/crashReporting';
import { listenForPushTaps, registerForPush } from '@/features/push/push';
import { PhoneAppWelcome } from '@/features/phoneApp/PhoneAppCard';
import { recoverChatPick } from '@/features/messages/pendingPick';
import { setUpNotificationChannels } from '@/features/push/channels';
import { isSupabaseConfigured } from '@/lib/supabase';
import { TERMS_VERSION } from '@/lib/legal';
import { colors } from '@/theme';
import { stageKeyOf, useStageSelect } from '@/features/feed/commentStage';
import { useStageMotion } from '@/features/feed/useStageMotion';
import Reanimated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useCreateMenuState } from '@/features/compose/createMenu';
import { useReducedMotion } from '@/lib/useReducedMotion';

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
const SHEETS = new Set(['/compose', '/share', '/pick-group', '/find-groups', '/group-form', '/group-invite', '/pick-court', '/ask', '/post-menu', '/edit-post', '/messages/new', '/log-session', '/pick-session', '/session-tag', '/hit-request/new', '/court-report', '/court-now', '/map-visibility', '/open-to-hit', '/tennis-sheet', '/review-request', '/start-session', '/live-session', '/new-session']);
const TAB_ORDER: string[] = Object.values(paths);
/** How often an open app looks for new workouts and new Notifications rows: just over the two minutes the Apple Health look waits between looks. */
const LIVE_LOOK_MS = 125_000;
// The toast and the posting strip take nothing from the frame, so they are drawn again only when
// their own news changes, not each time any page opens or anything in the app changes (Oct 10,
// owner: "the buttons like the settings. msg notifications, etc respond too slow").
const ToastLayer = React.memo(Toast);
const UploadLayer = React.memo(UploadBar);
/** The pages that can take a clip's stage (see commentStage): its comments, and its session stats. */
const STAGE_ROUTES = new Set(['/comments', '/session-stats']);
/** The phone's tab bar in its place, said by its own style (see barSteady). */
const BAR_IN_PLACE = { transform: [{ translateY: 0 }] };
/** If a slide back into place never reports that it has finished, the bar is put in place this long after anyway. */
const BAR_SETTLE_MAX_MS = 1500;
// An emailed link that has expired or was used already (or a Google sign-in that failed) comes
// back with error_description on the address. Kept for the sign-in page to say, whatever page the
// link lands on: a new password's link lands on /account, and the sign-in detour below replaced
// that address (and the error with it) before the start page, which used to keep it, ever drew.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  try {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const message = hash.get('error_description') || new URLSearchParams(window.location.search).get('error_description');
    if (message) sessionStorage.setItem('courtside-auth-error', message);
  } catch { /* Nothing to carry forward. */ }
}
// The person a link to the app's front door carried (courtsidebase.com/?ref=handle, or a friend's
// ?r=code, forwarded by public/waitlist.html, Oct 17), read once as the page loads, before the
// splash's hand-over drops the address: a guest who signs up is still credited to them.
let landingRef: string | null = null;
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  try {
    const q = new URLSearchParams(window.location.search);
    const ref = q.get('ref');
    const code = (q.get('r') ?? '').toLowerCase();
    landingRef = ref ? ref : /^[0-9a-f]{8}$/.test(code) ? `r=${code}` : null;
    // The campaign a link came from (?src=fb, from courtsidebase.com/?ref=fb, Oct 18): kept so a
    // sign-up or a "Get the app" tap here is counted for that link (campaign.ts).
    rememberCampaign(q.get('src'));
  } catch { /* nothing carried */ }
}
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
  const { currentUserId, currentUser, ready, authResolved, remoteLoaded, onboardingComplete, termsVersion, healthIsReal, actions, liveSession, isGuest } = useApp();
  // Crash reports say which screen they happened on.
  useEffect(() => { setCrashScreen(pathname); }, [pathname]);
  // Alerts: a tap on one opens what it is about. Once someone is signed in
  // and set up, the phone asks (once, ever) whether alerts may be sent, and
  // keeps this phone's push address on the account fresh.
  useEffect(() => listenForPushTaps(), []);
  // Android: the alert channels (Messages, Likes and replies, Reminders) exist from the first launch, before any alert or question.
  useEffect(() => { void setUpNotificationChannels(); }, []);
  // Anyone signed in opens on Find Players, whose map is the page's one slow piece: its engine
  // (and, in a browser, a warm connection to the map's tiles) starts the moment the account is
  // known, whichever way in that was (Oct 21). Fetched once; asking again costs nothing.
  useEffect(() => { if (currentUserId && !isGuest) preloadNearbyMap(); }, [currentUserId, isGuest]);
  const pushAskedFor = useRef<string | null>(null);
  useEffect(() => {
    // Logging out takes this phone's push address off the account, so the
    // next sign-in (the same account too) puts it back.
    if (!currentUserId) { pushAskedFor.current = null; return; }
    // After the age check: a birthday on file, or skipped with "I'm 13 or older" (Oct 17).
    if (!isSupabaseConfigured || !remoteLoaded || !onboardingComplete || !(currentUser?.ageGroup || currentUser?.birthdaySkipped)) return;
    if (pushAskedFor.current === currentUserId) return;
    pushAskedFor.current = currentUserId;
    void registerForPush();
  }, [currentUserId, remoteLoaded, onboardingComplete, currentUser?.ageGroup, currentUser?.birthdaySkipped]);
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
          // No birthday on the form, "I'm 13 or older" ticked instead (the
          // birthday is optional since Oct 17): noted as a skip, the same as
          // Skip for now on the birthday page, so it is not asked again.
          else if (!typed && who.said13Plus && !currentUser?.ageGroup && !currentUser?.birthdaySkipped && !blocked) {
            const skipped = await actions.skipBirthday().then(() => true, () => false);
            if (skipped) answer = 'skipped';
          }
          // The form's birthday rode on the account only to get here; with the age on file it comes off.
          if (who.birthDate && currentUser?.ageGroup) void remoteAuth.forgetSignUpBirthDate().catch(() => undefined);
        }
      }
      if (!stale) setAnswered(answer);
    })();
    return () => { stale = true; };
  }, [currentUserId, currentUser?.ageGroup, accountIn]);
  // Asked once: a skip ("I'm 13 or older", Oct 17) is remembered on the server
  // (migration 162) and on this phone, and the app goes on without asking again.
  const needsBirthday = isSupabaseConfigured && !!currentUserId && remoteLoaded && !!currentUser && !currentUser.ageGroup
    && !currentUser.birthdaySkipped && answered === null && !['/birthday', '/sign-in'].includes(pathname);
  // The terms: an account that has not agreed to the current ones — a Google
  // sign-up, one made before sign-up asked, or anyone after the terms change —
  // agrees once before going further. It comes after the age check, so
  // nobody under 13 is asked to agree to anything.
  const needsTerms = isSupabaseConfigured && !!currentUserId && remoteLoaded && termsVersion !== undefined
    && termsVersion !== TERMS_VERSION && !needsBirthday && !['/agree', '/birthday', '/sign-in', '/guidelines'].includes(pathname);
  const { isPhone } = useResponsive();
  const tourOpen = useTourOpen();
  // Which tab the page on show belongs to, as its place in TAB_ORDER. A page
  // that is not a tab's own keeps the tab it was opened from. It starts on
  // none (-1): a real launch passes through the splash and then Community and
  // sets it on the way, so this only shows on a link opened cold (a shared
  // post, say), which was opened from no tab, so no tab is lit (it used to
  // light Feed, which you had never been on).
  const selected = useRef(-1);
  // Whether any page has said which tab it belongs to yet. Until one has (a
  // link opened cold), a Community page with no tab under it (a court, a
  // player's profile, the map, who else was there, your alerts) lights Community, not Home (Oct 5:
  // a court opened from a link lit Feed). Opened from a tab, it keeps that tab.
  const placed = useRef(false);
  // The Tennis profile is Profile's only when it is your own; someone else's keeps the tab it was opened from.
  const { userId: shownUserId } = useGlobalSearchParams<{ userId?: string }>();
  const ownTennisProfile = shown === '/profile-details' && (!shownUserId || shownUserId === currentUserId);
  if (shown === paths.index) { selected.current = TAB_ORDER.indexOf(paths.index); placed.current = true; }
  else if (shown === paths.discuss || shown.startsWith('/question/')) { selected.current = TAB_ORDER.indexOf(paths.discuss); placed.current = true; }
  else if (shown === paths.coaches || shown.startsWith('/coach/') || shown.startsWith('/coach-') || shown === '/ai-coach' || shown === '/booking-done') { selected.current = TAB_ORDER.indexOf(paths.coaches); placed.current = true; }
  else if (shown === paths.profile || ownTennisProfile || ['/settings', '/edit-profile', '/change-handle', '/your-sessions', '/workouts', '/weekly-recap'].includes(shown)) { selected.current = TAB_ORDER.indexOf(paths.profile); placed.current = true; }
  else if (!placed.current && (shown.startsWith('/court/') || shown.startsWith('/user/') || ['/map', '/flyby', '/notifications', '/open-to-hit'].includes(shown))) selected.current = TAB_ORDER.indexOf(paths.discuss);
  // Pages with their own bottom controls (a composer, an editor, a thread's
  // message box) run without the phone's floating bar. On a computer the
  // menu sits at the side, out of their way, so it stays, the way
  // Instagram's does behind its Create box. Sign-in, setup and the camera
  // hide it everywhere.
  // The full map (owner, Oct 8: "without the feed community profile etc.") runs without it too:
  // the map fills the screen and its own Back (or the edge swipe) leaves it.
  const phoneOnlyHide = ['/map', '/compose', '/edit-post', '/ask', '/ask-coach', '/coach-apply', '/pick-location', '/pick-court', '/invite', '/comments', '/session-stats', '/who-played', '/share', '/pick-group', '/find-groups', '/group-form', '/group-invite', '/likes', '/post-menu', '/log-session', '/pick-session', '/session-tag', '/hit-request/new', '/court-report', '/court-now', '/map-visibility', '/open-to-hit', '/wrapped', '/health-share', '/share-session', '/share-card', '/tennis-sheet', '/flyby', '/weekly-recap', '/review-request', '/start-session', '/live-session', '/new-session'].includes(pathname) || pathname === '/messages' || pathname.startsWith('/messages/');
  // The page the phone's bar sits over: the one on show, or, while a page that takes the bar away is
  // up (the Create box and a clip's comments among them, which leave the bar under them), the one it
  // was over. The quiet pill turns dark over a clip only on the Feed itself (TabBarLooks): a page
  // opened from a clip (its player, its court) is a light page, and the bar there is too.
  const barOver = useRef(pathname);
  if (!phoneOnlyHide) barOver.current = pathname;
  // Arriving from the password-reset email is its own calm page, with no app around it yet.
  // (The comments' own address says which clip they are about, for the stage below.)
  const { reset, kind: routeKind, id: routeId, stage: routeStage } = useGlobalSearchParams<{ reset?: string; kind?: string; id?: string; stage?: string }>();
  const hideEverywhere = ['/sign-in', '/onboarding', '/agree', '/birthday', '/auto-log', '/first-move', '/hit'].includes(pathname) || pathname.startsWith('/story/') || (pathname === '/account' && !!reset);
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
  // While the Create box (the + menu) is up, the phone's bar stays, under the
  // box's dim, rather than going and coming back (owner, Oct 17: "When I click
  // the + and then click out of it, the bottom island disappears and comes
  // back. Either make it not disappear or make the animation significantly
  // better"). Only the box itself: once it moves on to a full page (the photo
  // editor, the post form, the Session sheet) the bar leaves as before.
  const createMenu = useCreateMenuState();
  const createBoxUp = pathname === '/compose' && createMenu !== 'closed';
  // A guest on the website (guest mode, Oct 17) has the same bar: every tab reads, the + asks to join.
  // The peek and the join page are their own pages with their own sign-up bar: no tab bar there.
  const guestOwnPage = isGuest && (pathname === '/peek' || pathname === '/join');
  const barWanted = (!!currentUserId || isGuest) && !hideEverywhere && !onSplash && !guestOwnPage;
  const showNav = barWanted && (!(isPhone && phoneOnlyHide) || barOnStage || createBoxUp);
  useEffect(() => { if (Platform.OS === 'web' && navLayer.current) navLayer.current.inert = barOnStage || !showNav; }, [barOnStage, showNav]);
  // And when a page does take the phone's bar away, it no longer pops: it
  // slips down a little and fades (about a fifth of a second), and comes back
  // the same way. It stays drawn until it has gone. Sign-in, the splash and
  // the other pages that never have it still take it at once.
  const still = useReducedMotion();
  const [barKept, setBarKept] = useState(showNav);
  // Whether the bar has reached its place: from then on its own (React) style says "in place" too,
  // not only the animation thread (Oct 22, owner's iPhone: Community with no tab bar at all, after
  // an open that left the app busy). An iPhone could lose a slide's end value when the app was busy
  // just after it, and the bar then fell back to where its style first said it was: below the edge.
  // Only its style changes; the bar and its glass are never built again.
  const [barSteady, setBarSteady] = useState(showNav);
  const barAway = useSharedValue(showNav ? 0 : 1);
  const wantedBefore = useRef(barWanted);
  // Gone: drawn no more, and the next time it comes it starts from below the edge again.
  const barGone = useCallback(() => { setBarKept(false); setBarSteady(false); }, []);
  // Run as the page changes, not after it has drawn: a bar that has just appeared below the edge starts
  // moving on the animation thread right behind it, so even a page that keeps the app busy for a while
  // as it opens (a map being built) never leaves "below the edge" standing there long enough to be
  // copied back as where the bar lives.
  useLayoutEffect(() => {
    const arriving = barWanted && !wantedBefore.current;
    wantedBefore.current = barWanted;
    // First arrival after the splash or sign-in: NavBar's own rise does it, nothing on top.
    if (showNav && arriving) { setBarKept(true); setBarSteady(true); barAway.value = 0; return; }
    if (showNav) {
      setBarKept(true);
      const slideIn = { duration: 200, easing: Easing.out(Easing.cubic) };
      // Already in place (or leaving from there, now coming back): its style says so already.
      if (barSteady) { barAway.value = withTiming(0, slideIn); return; }
      barAway.value = withTiming(0, slideIn, (done) => { if (done) runOnJS(setBarSteady)(true); });
      return;
    }
    if (!barWanted) { barGone(); barAway.value = 1; return; }
    // A sheet rising from the bottom covers the bar's place itself: the bar goes at once, never fading over it.
    if (SHEETS.has(pathname)) { barGone(); barAway.value = 1; return; }
    barAway.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) }, (done) => { if (done) runOnJS(barGone)(); });
  }, [showNav, barWanted, barAway, pathname, barGone]);
  // Showing, but the slide back never reported that it finished: in place anyway.
  useEffect(() => {
    if (!showNav || barSteady) return undefined;
    const t = setTimeout(() => setBarSteady(true), BAR_SETTLE_MAX_MS);
    return () => clearTimeout(t);
  }, [showNav, barSteady]);
  // Slides only, never fades: the bar is glass, and on an iPhone glass under a fading parent
  // drew see-through and stayed that way (Oct 17, owner: "Why did this bottom thing turn
  // transparent? ... change it back"). It slides all the way below the screen's edge instead.
  const barSlide = useAnimatedStyle(() => ({ transform: [{ translateY: still ? 0 : barAway.value * 160 }] }));
  const curtainDown = useCurtainDown();
  // A session you started and haven't logged (Oct 6): its bar rides above the tab bar wherever the bar
  // is, never over a sheet, a composer or the live page itself, nor on a clip's comments stage or under the tutorial.
  const liveBarOn = !!liveSession && liveSession.userId === currentUserId && showNav && !barOnStage && !phoneOnlyHide && !SHEETS.has(pathname) && !tourOpen && curtainDown;
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
  // On the website a signed-out visitor is a guest instead (guest mode, Oct 17): see below.
  const mustSignIn = ready && authResolved && !currentUserId && !isGuest && !['/', '/index', '/sign-in', '/onboarding', '/birthday'].includes(pathname) && !isPublicPath(pathname);
  // Guest mode (Oct 17, owner: "we still want people to be able to read discussions etc, or even
  // view videos ... it's just when you want to actually do something that requires profile it will
  // make you sign up"): a guest reads anywhere guestAskFor allows; a page that needs a profile
  // (a chat, the map, someone's profile, posting) goes back where they were and asks them to join.
  const landedAt = useRef<string | null>(null);
  if (landedAt.current === null && ready && authResolved) landedAt.current = pathname;
  useEffect(() => {
    if (!isGuest) return;
    const what = guestAskFor(pathname, pathname === landedAt.current);
    if (!what) return;
    const r = router as unknown as { canGoBack?: () => boolean };
    // A post's or Instant's ••• menu (its Report row) offers the same no-account way to report as a
    // thread or comment: an email to support naming only that post (found in review, Oct 17).
    const report = pathname === '/post-menu' && routeId ? `${routeKind === 'hit' ? 'hit' : 'post'}:${routeId}` : undefined;
    if (pathname !== landedAt.current && r.canGoBack?.()) router.back();
    else router.replace(HOME);
    openJoinSheet(what, report ? { report } : undefined);
  }, [isGuest, pathname]);
  // A link that carried someone's handle or code (courtsidebase.com/?ref=… forwards here, Oct 17)
  // still credits them when this guest signs up, wherever it landed.
  useEffect(() => {
    if (!isGuest || !landingRef) return;
    void rememberReferrer(landingRef);
    landingRef = null;
  }, [isGuest]);
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
  // page: past the splash, the gates, the tutorial and the opening curtain, and then only on one of the
  // four tabs or Your sessions. A list of pages it may show on, not of pages it may not: anywhere else
  // (a chat, the AI coach, an answer, edit profile, settings) someone may be mid-message or mid-change.
  const calmPage = !!currentUserId && !detour && !onSplash && !tourOpen && curtainDown && (isTabPage(pathname) || pathname === '/your-sessions');
  useRatePrompt({ calm: calmPage });
  const sentTo = useRef<string | null>(null);
  useEffect(() => {
    if (!detour) { sentTo.current = null; return; }
    if (sentTo.current === detour) return;
    sentTo.current = detour;
    router.replace(detour);
  }, [detour]);
  const nav = <NavBar state={{ index: selected.current, routes }} feedUnder={barOver.current === paths.index} navigation={{ navigate: name => {
    const destination = paths[name as keyof typeof paths];
    if (!destination) return;
    // Community opens on its map, from the top, whenever the bar takes you there.
    if (destination === paths.discuss && destination !== pathname) askForCommunityMap();
    // A theme just picked: the tab this shows, and the one under the page closing, are on it as they show (catchUp).
    if (destination !== pathname) catchUpNow(['active', destination]);
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
    <Reanimated.View importantForAccessibility={tourOpen ? 'no-hide-descendants' : 'auto'} style={[{ flex: 1, minWidth: 0, minHeight: 0 }, settle]}>{isGuest && Platform.OS === 'web' && !hideEverywhere && !onSplash && !guestOwnPage ? <GetAppBar /> : null}<RouteTransition>{children}</RouteTransition>{liveBarOn && !isPhone ? <LiveBar phone={false} /> : null}<ToastLayer /><UploadLayer /></Reanimated.View>
    {(showNav || (barKept && barWanted)) && isPhone ? (
      <Reanimated.View pointerEvents={showNav ? 'box-none' : 'none'} style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, barSlide, barSteady ? BAR_IN_PLACE : null]}>
      <Reanimated.View ref={((node: unknown) => { navLayer.current = node as HTMLElement | null; navFade.ref?.(node); }) as never} pointerEvents={barOnStage || !showNav ? 'none' : 'box-none'} style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, barOnStage && { overflow: 'hidden' }, navFade.style]}>
        <Reanimated.View ref={navHold.ref as never} pointerEvents="box-none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, navHold.style]}>{nav}</Reanimated.View>
      </Reanimated.View>
      </Reanimated.View>
    ) : null}
    {liveBarOn && isPhone ? <LiveBar phone /> : null}
    {/* A new message drops in at the top, over the bar too; never on the pages the app keeps to themselves. */}
    <MessageBanner enabled={!!currentUserId && !hideEverywhere && !onSplash && !detour} />
    {/* "How was the hit?", once, after a hit you played; only for a set-up account, never on the pages the app keeps to themselves. */}
    <HitFollowUp enabled={!!currentUserId && onboardingComplete && (remoteLoaded || !isSupabaseConfigured) && !hideEverywhere && !onSplash && !detour} />
    {/* "Still playing?", when a live session's clock reaches three hours: the same note, on the same terms. */}
    <StillPlaying enabled={!!currentUserId && onboardingComplete && !hideEverywhere && !onSplash && !detour} />
    {/* The splash curtain, from the splash's hand-over until the page the app opens on has drawn (see warmup). */}
    {!curtainDown && !!currentUserId && !hideEverywhere && (onSplash || isStartTab(pathname)) ? <WarmCurtain /> : null}
    {/* The first-run tour: over the bar, so it can light the bar's own buttons. */}
    {currentUserId ? <TourOverlay eligible={showNav && !detour && !onSplash} /> : null}
    {/* On its way to a gate (sign-in, birthday, terms): the page underneath is covered for the moment it takes. */}
    {detour ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg }} /> : null}
    {/* The website: "Get CourtSide on your iPhone", once, just after signing up here (R3). Nothing in the phone apps. */}
    {currentUserId && !isGuest ? <PhoneAppWelcome calm={calmPage} /> : null}
    {/* Guest mode's one "Join CourtSide to …" ask, over everything, the bar too. */}
    {isGuest ? <JoinSheet /> : null}
  </View>;
}

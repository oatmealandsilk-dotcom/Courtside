import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Redirect, useNavigation } from 'expo-router';
import { isSupabaseConfigured, storedLoginNow } from '@/lib/supabase';
import { START_HREF, goToStart } from '@/features/navigation/startTab';
import { raiseCurtain } from '@/features/feed/warmup';
import { preloadNearbyMap } from '@/components/NearbyMap';
import { useLaunchUpdate } from '@/lib/instantUpdates';

import { LAUNCH_FADE_MS, LAUNCH_MAX_MS, hideLaunch, launchShowing } from '@/lib/launchSplash';
import { LaunchMark } from '@/components/LaunchMark';
import { BrandMark } from '@/components/BrandMark';
import { useApp } from '@/store/AppContext';
import { colors, lightColors, spacing, typography, font } from '@/theme';
import { Button } from '@/components/ui';
import { leaveGently } from '@/components/SignOutCurtain';

/** How long the mark stays up even when the data is instant — a beat, not a wait. */
const HOLD_MS = 450;
const FADE_MS = 260;

/**
 * Splash: the mark and the name, held for a moment, then faded out into
 * whatever comes next — sign-in for a new visitor, the start page for a
 * returning one (Community, on the map: see startTab). The fade is the whole
 * transition; the next screen must not slide.
 */
export default function Index() {
  const styles = useThemedStyles(styleDefinitions);
  const { ready, currentUserId, onboardingComplete, remoteLoaded, snapshotShown, error, actions } = useApp();
  const [retrying, setRetrying] = useState(false);
  // Signed in but the profile has not come down yet: the answer to "has this
  // person done the quiz" is not known, so hold the splash rather than guess.
  // Last time's saved copy is enough to open on (see data/snapshot); the fresh load lands on top.
  const settled = ready && (!currentUserId || !isSupabaseConfigured || remoteLoaded || snapshotShown || !!error);
  // A newer version on its way: the loading screen holds a moment and opens it (see useLaunchUpdate).
  const launchUpdate = useLaunchUpdate();
  const [held, setHeld] = useState(false);
  const [gone, setGone] = useState(false);
  const [settledCode, setSettledCode] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || !/[?&]code=/.test(window.location.search)) return;
    const timer = setTimeout(() => setSettledCode(true), 6000);
    return () => clearTimeout(timer);
  }, []);
  const opacity = useRef(new Animated.Value(1)).current;
  // On a phone the iPhone's own launch picture is already showing the mark at
  // full size, so the mark carries straight on rather than vanishing and
  // springing back in (that blink read as a flash). The browser has no
  // launch picture, so there it still rises in.
  // A browser that already keeps a login is on its way straight in: the mark is simply there, as on
  // the curtain it hands over to (rising in, then cut to the curtain's still copy, would jump).
  const [quickIn] = useState(() => Platform.OS !== 'web' || storedLoginNow());
  const rise = useRef(new Animated.Value(quickIn ? 1 : 0)).current;
  // On a phone the iPhone's launch picture (always cream: it shows before any
  // code runs and cannot know the theme) hands over to this screen, which is in
  // your own theme. A copy of the launch picture sits on top and fades away, so
  // cream melts into, say, New York's navy instead of snapping (Oct 2).
  const cover = useRef(new Animated.Value(1)).current;
  const [launchCover, setLaunchCover] = useState(Platform.OS !== 'web');
  // Only a real launch has the phone's picture still up as this screen first draws, and only then is
  // the cover that picture itself. Coming here later (a sign-in, a switch of account) there is no
  // picture to match, and the picture would land a few frames after the drawn copy, a tiny jump of
  // its own: the drawn copy stays, and fades as soon as it is laid out, as before (Oct 5).
  const [fromLaunch] = useState(launchShowing);
  const fadeStarted = useRef(false);
  const startCoverFade = () => {
    if (fadeStarted.current) return;
    fadeStarted.current = true;
    if (fromLaunch) {
      // A real launch: no copy of the picture at all. The phone's own picture dissolves straight into
      // this themed screen (launchSplash sets the fade), the logo, name and line already in place under
      // it (Oct 5, owner's video: the copy that stood in between showed blank cream, then the logo faded in).
      hideLaunch();
      setTimeout(() => setLaunchCover(false), LAUNCH_FADE_MS + 60);
      return;
    }
    hideLaunch();
    Animated.timing(cover, { toValue: 0, duration: 700, delay: 350, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start(() => setLaunchCover(false));
  };
  // A real launch: once this screen is laid out and two frames have drawn it (the text settles on its
  // measured baseline in the first), the dissolve, at once (Oct 6, owner: the loading screen was too long).
  const laidOut = useRef(false);
  const onThemedLayout = () => {
    if (laidOut.current) return;
    laidOut.current = true;
    requestAnimationFrame(() => requestAnimationFrame(startCoverFade));
  };
  useEffect(() => {
    if (!launchCover) return;
    // A beat on the cream first, then a slow, even fade: it reads as the app
    // settling into your colours rather than a cut (Oct 2, William: "wait a
    // bit before fading, don't have to do it super fast").
    // The fade starts once the cover's own copy of the picture has drawn (its onLoad, below), so the phone's
    // picture hands over to an identical one, never on a timer from mount: that ran the fade under the
    // phone's picture, which then cut to the theme. A picture that never reports holds no one, though:
    // after the same longest wait as the phone's picture, the fade starts anyway (Oct 4).
    const timer = setTimeout(startCoverFade, LAUNCH_MAX_MS);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Opened on top of the app that is already running: something went to '/'
  // (this splash's address, which Home shares) from a page over the tabs.
  // Played out, the logo would come back, the bar would go, and a whole
  // second copy of the app — a second feed full of video players — would be
  // built on top of the first. Instead, once the account is known, every page
  // over the tabs closes and the app that is already there is shown again,
  // on the start page. (A real launch starts with nothing under this page, so
  // it never applies.) Everything that comes this way is someone getting into
  // the app — switching account, adding one, signing in again, a gate, an
  // invite — so it lands where a fresh open does, not on the feed. Pages that
  // mean the feed go there with goHome and never pass through here.
  const navigation = useNavigation();
  const [overTabs] = useState(() => {
    try {
      const below = (navigation.getState() as { routes?: { name: string }[] } | undefined)?.routes ?? [];
      return below.some((route) => route.name === '(tabs)');
    } catch {
      return false;
    }
  });
  const backToApp = overTabs && settled && !!currentUserId && onboardingComplete;
  useEffect(() => { if (backToApp) goToStart(); }, [backToApp]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      try {
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const message = hash.get('error_description') || new URLSearchParams(window.location.search).get('error_description');
        if (message) sessionStorage.setItem('courtside-auth-error', message);
      } catch { /* Nothing to carry forward. */ }
    }
    Animated.spring(rise, { toValue: 1, useNativeDriver: true, speed: 6, bounciness: 4 }).start();
    const timer = setTimeout(() => setHeld(true), HOLD_MS);
    return () => clearTimeout(timer);
  }, [rise]);

  // Someone signed in is on their way to the map (see startTab; after setup,
  // if that is still to do). Its engine, the one big download the map needs
  // in a browser, starts as soon as the sign-in is known — while the logo is
  // up and the account is still coming down — rather than once the map is
  // already on screen.
  useEffect(() => { if (currentUserId) preloadNearbyMap(); }, [currentUserId]);

  useEffect(() => {
    // Signed in and set up: straight into the app the moment the account is known (last time's saved
    // copy is enough), with no beat on the logo. The curtain it opens behind is this same mark, so the
    // phone's own picture can carry on dissolving over it (Oct 6, owner: "on the loading screen too long").
    // Anyone else: a beat on the mark. And the drawn cream copy (coming here later, from a sign-in) is
    // never cut short: on a phone the loading screen stays until the cream has finished fading.
    const intoApp = !!currentUserId && onboardingComplete;
    const waiting = (intoApp ? !held && !quickIn : !held) || (launchCover && !(intoApp && fromLaunch));
    if (!settled || waiting || gone || launchUpdate.holding) return;
    // Into the app: no fade here. The page it opens on is built behind the
    // shell's curtain — the same mark and name — and that curtain does the
    // one fade, once the page has drawn (see warmup). Fading here too showed
    // a blank beat in between, then the page all at once. (Over the app
    // already running, the page is already there: no curtain.)
    if (currentUserId && onboardingComplete) { if (!overTabs) raiseCurtain(); setGone(true); return; }
    Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setGone(true);
    });
  }, [settled, held, gone, opacity, currentUserId, onboardingComplete, overTabs, launchUpdate.holding, launchCover, quickIn, fromLaunch]);

  // On its way back to the app underneath: a plain page for the moment it takes, no logo.
  // Nothing to draw over (back into a running app, or already on the way in): let the phone's picture go.
  useEffect(() => { if (backToApp || gone) hideLaunch(); }, [backToApp, gone]);
  if (backToApp) return <View style={styles.splash} />;

  // Signed in, but the account never came down even after retries: the app
  // does not open on a guess (the quiz would overwrite what is saved). It
  // says so and offers another try.
  if (gone && currentUserId && isSupabaseConfigured && !remoteLoaded && !snapshotShown && error) {
    return (
      <View style={[styles.splash, { padding: spacing.xl, gap: spacing.md }]}>
        <BrandMark size={56} />
        <Text style={styles.failTitle}>Could not load your account</Text>
        <Text style={styles.failBody}>Check your connection and try again. Nothing you have saved is lost.</Text>
        <Button label={retrying ? 'Trying…' : 'Try again'} loading={retrying} onPress={async () => { setRetrying(true); try { await actions.retryLoad(); } finally { setRetrying(false); } }} />
        <Button label="Sign out" variant="ghost" onPress={() => leaveGently(() => actions.signOut())} />
      </View>
    );
  }
  if (gone) {
    // A ?code= from Google is still being exchanged for a session; give it a
    // beat rather than bouncing a successful sign-in to the sign-in form.
    if (!currentUserId && Platform.OS === 'web' && /[?&]code=/.test(window.location.search) && !settledCode) return null;
    if (!currentUserId) return <Redirect href="/sign-in" />;
    if (!onboardingComplete) return <Redirect href="/onboarding" />;
    // Into the app on its start page. Nothing is built under a real launch, so
    // Community starts on its own first section, Find Players, by itself.
    return <Redirect href={START_HREF} />;
  }

  return (
    <Animated.View onLayout={fromLaunch ? onThemedLayout : undefined} style={[styles.splash, { opacity }]}>
      {Platform.OS !== 'web' ? (
        // On a phone the themed screen is the launch picture's own logo and line, cut from it
        // and drawn the same way (cover), in the theme's colours: the cream fades into it with
        // nothing moving, on any size of phone (Oct 4, owner: theme fade back, no blip).
        <LaunchMark ink={colors.brand} faint={colors.launchLine} line={launchUpdate.downloading ? 'Getting the newest version' : 'Growing the game'} />
      ) : (
        <>
          <Animated.View style={[styles.brand, { opacity: rise, transform: [{ scale: rise.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }] }]}>
            <BrandMark size={76} />
            <Text style={styles.wordmark}>CourtSide</Text>
          </Animated.View>
          <Text style={styles.tagline}>{launchUpdate.downloading ? 'Getting the newest version' : 'Growing the game'}</Text>
        </>
      )}
      {launchCover && !fromLaunch ? (
        // Coming here later (a sign-in, a switch of account): the cream drawn copy, faded once laid out.
        <Animated.View pointerEvents="none" onLayout={startCoverFade} style={[StyleSheet.absoluteFill, styles.splash, launchStyles.launch, { opacity: cover }]}>
          <StatusBar style="dark" />
          <LaunchMark ink={lightColors.brand} faint={lightColors.launchLine} />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styleDefinitions = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sized and spaced as the launch picture draws them (mark 55 pt tall, name 30 pt, 29 pt apart), so the cross-fade does not jump.
  brand: { alignItems: 'center', gap: 22 },
  failTitle: { ...typography.title, color: colors.text, textAlign: 'center' },
  failBody: { ...typography.body, color: colors.textMuted, textAlign: 'center', maxWidth: 320 },
  wordmark: { fontSize: 30, ...font('700'), color: colors.brand, letterSpacing: -0.9 },
  tagline: {
    position: 'absolute',
    bottom: 91, // where the launch image draws it too
    fontSize: 12,
    ...font('600'),
    letterSpacing: 1.4,
    color: colors.textFaint,
    textTransform: 'uppercase',
  },
});

/**
 * The launch picture's own colours, for the copy of it that fades away on a
 * phone (see `cover`). Kept out of the themed styles on purpose: those swap every light-palette
 * colour for the theme's own, which would turn this cream back into navy.
 */
const launchStyles = StyleSheet.create({
  launch: { backgroundColor: lightColors.bg },
  wordmark: { color: lightColors.brand },
  tagline: { color: lightColors.textFaint },
});

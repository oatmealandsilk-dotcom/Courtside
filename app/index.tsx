import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Redirect, useNavigation } from 'expo-router';
import { isSupabaseConfigured } from '@/lib/supabase';
import { START_HREF, goToStart } from '@/features/navigation/startTab';
import { raiseCurtain } from '@/features/feed/warmup';
import { preloadNearbyMap } from '@/components/NearbyMap';

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
  const rise = useRef(new Animated.Value(Platform.OS === 'web' ? 0 : 1)).current;

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
    if (!settled || !held || gone) return;
    // Into the app: no fade here. The page it opens on is built behind the
    // shell's curtain — the same mark and name — and that curtain does the
    // one fade, once the page has drawn (see warmup). Fading here too showed
    // a blank beat in between, then the page all at once. (Over the app
    // already running, the page is already there: no curtain.)
    if (currentUserId && onboardingComplete) { if (!overTabs) raiseCurtain(); setGone(true); return; }
    Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setGone(true);
    });
  }, [settled, held, gone, opacity, currentUserId, onboardingComplete, overTabs]);

  // On its way back to the app underneath: a plain page for the moment it takes, no logo.
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
    // The launch screen is always CourtSide's own cream, whatever the theme:
    // it has to match the iPhone's launch picture (app.config.js splash), which
    // shows before any code runs and cannot know the theme. A themed launch
    // screen snapped from cream to, say, New York's navy and read as a white
    // flash. Now the two are one picture, and it fades into the theme as it goes.
    <Animated.View style={[styles.splash, launchStyles.launch, { opacity }]}>
      <StatusBar style="dark" />
      <Animated.View style={[styles.brand, { opacity: rise, transform: [{ scale: rise.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }] }]}>
        <BrandMark size={84} color={lightColors.brand} />
        <Text style={[styles.wordmark, launchStyles.wordmark]}>CourtSide</Text>
      </Animated.View>
      <Text style={[styles.tagline, launchStyles.tagline]}>Growing the game</Text>
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
  brand: { alignItems: 'center', gap: spacing.md },
  failTitle: { ...typography.title, color: colors.text, textAlign: 'center' },
  failBody: { ...typography.body, color: colors.textMuted, textAlign: 'center', maxWidth: 320 },
  wordmark: { fontSize: 34, ...font('700'), color: colors.brand, letterSpacing: -1 },
  tagline: {
    position: 'absolute',
    bottom: 96, // where the launch image draws it too
    fontSize: 12,
    ...font('600'),
    letterSpacing: 1.4,
    color: colors.textFaint,
    textTransform: 'uppercase',
  },
});

/**
 * The launch picture's own colours (see the comment on the launch screen).
 * Kept out of the themed styles on purpose: those swap every light-palette
 * colour for the theme's own, which would turn this cream back into navy.
 */
const launchStyles = StyleSheet.create({
  launch: { backgroundColor: lightColors.bg },
  wordmark: { color: lightColors.brand },
  tagline: { color: lightColors.textFaint },
});

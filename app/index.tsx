import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { isSupabaseConfigured } from '@/lib/supabase';

import { BrandMark } from '@/components/BrandMark';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography, font } from '@/theme';
import { Button } from '@/components/ui';

/** How long the mark stays up even when the data is instant — a beat, not a wait. */
const HOLD_MS = 450;
const FADE_MS = 260;

/**
 * Splash: the mark and the name, held for a moment, then faded out into
 * whatever comes next — sign-in for a new visitor, the feed for a returning
 * one. The fade is the whole transition; the next screen must not slide.
 */
export default function Index() {
  const styles = useThemedStyles(styleDefinitions);
  const { ready, currentUserId, onboardingComplete, remoteLoaded, error, actions } = useApp();
  const [retrying, setRetrying] = useState(false);
  // Signed in but the profile has not come down yet: the answer to "has this
  // person done the quiz" is not known, so hold the splash rather than guess.
  const settled = ready && (!currentUserId || !isSupabaseConfigured || remoteLoaded || !!error);
  const [held, setHeld] = useState(false);
  const [gone, setGone] = useState(false);
  const [settledCode, setSettledCode] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || !/[?&]code=/.test(window.location.search)) return;
    const timer = setTimeout(() => setSettledCode(true), 6000);
    return () => clearTimeout(timer);
  }, []);
  const opacity = useRef(new Animated.Value(1)).current;
  const rise = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    if (!settled || !held || gone) return;
    // Into the feed: no fade here. The feed opens behind its own curtain —
    // the same mark and name — and that curtain does the one fade, once the
    // first pages are in. Fading here too showed a blank beat in between.
    if (currentUserId && onboardingComplete) { setGone(true); return; }
    Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setGone(true);
    });
  }, [settled, held, gone, opacity, currentUserId, onboardingComplete]);

  // Signed in, but the account never came down even after retries: the app
  // does not open on a guess (the quiz would overwrite what is saved). It
  // says so and offers another try.
  if (gone && currentUserId && isSupabaseConfigured && !remoteLoaded && error) {
    return (
      <View style={[styles.splash, { padding: spacing.xl, gap: spacing.md }]}>
        <BrandMark size={56} />
        <Text style={styles.failTitle}>Could not load your account</Text>
        <Text style={styles.failBody}>Check your connection and try again. Nothing you have saved is lost.</Text>
        <Button label={retrying ? 'Trying…' : 'Try again'} loading={retrying} onPress={async () => { setRetrying(true); try { await actions.retryLoad(); } finally { setRetrying(false); } }} />
        <Button label="Sign out" variant="ghost" onPress={() => actions.signOut()} />
      </View>
    );
  }
  if (gone) {
    // A ?code= from Google is still being exchanged for a session; give it a
    // beat rather than bouncing a successful sign-in to the sign-in form.
    if (!currentUserId && Platform.OS === 'web' && /[?&]code=/.test(window.location.search) && !settledCode) return null;
    if (!currentUserId) return <Redirect href="/sign-in" />;
    if (!onboardingComplete) return <Redirect href="/onboarding" />;
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Animated.View style={[styles.splash, { opacity }]}>
      <Animated.View style={[styles.brand, { opacity: rise, transform: [{ scale: rise.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }] }]}>
        <BrandMark size={84} />
        <Text style={styles.wordmark}>CourtSide</Text>
      </Animated.View>
      <Text style={styles.tagline}>Growing the game</Text>
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

import { useThemedStyles } from '@/theme/ThemeProvider';
import { Wash } from '@/components/Wash';
import React, { useEffect, useState } from 'react';
import { BirthDateField } from '@/components/BirthDateField';
import { blockDevice, carryBirthDate, dropCarriedBirthDate, isDeviceBlocked, toBirthDate, yearsOld } from '@/features/age/ageCheck';
import { readableInk } from '@/lib/badges';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Submit } from '@/components/sheet/SheetForm';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BrandMark } from '@/components/BrandMark';
import { TermsCheck } from '@/components/TermsCheck';
import { Avatar, Button, Field } from '@/components/ui';
import { isSupabaseConfigured } from '@/lib/supabase';
import { remote, type HandleStatus } from '@/data/remote';
import { SigningInAs, SigningInWith } from '@/components/SigningInAs';
import { useLeave } from '@/components/LeaveCurtain';
import { useApp } from '@/store/AppContext';
import { useGateSpace } from '@/lib/useGateSpace';
import { KeyboardScrollContext, useKeyboardReveal } from '@/lib/keyboardScroll';
import { KEYBOARD_ROOM, useKeyboardRoom } from '@/lib/keyboardRoom';
import { useAndroidBack } from '@/lib/androidBack';
import { StatusShade } from '@/components/StatusShade';
import { colors, lift, radius, spacing, typography, font } from '@/theme';

type Mode = 'sign-in' | 'sign-up';

/**
 * Email and password against Supabase. If the project is not configured the
 * old demo sign-in by handle takes over, so the fixtures still work anywhere.
 */
export default function SignIn() {
  const styles = useThemedStyles(styleDefinitions);
  const { actions, currentUserId, savedAccounts } = useApp();
  // Logins remembered on this device come first, like Instagram's picker;
  // "Add account" from the accounts page arrives with ?add=1 to skip it.
  // A shared link or an invite arrives with ?mode=create (or ?mode=sign-in):
  // they have already seen what CourtSide is, so the form opens straight away.
  const { add, mode: asked } = useLocalSearchParams<{ add?: string; mode?: string }>();
  const [mode, setMode] = useState<Mode>(asked === 'create' ? 'sign-up' : 'sign-in');
  const { height: screenHeight } = useWindowDimensions();
  // Clear of the status bar at the top and the home bar at the bottom, the same as every page before the app.
  const space = useGateSpace();
  // The welcome's preview of the app fills whatever height the name, the line,
  // the gaps and the two buttons leave (about 297 points of them at the normal
  // text size), between 240 and 440. Its real height is read once it is laid
  // out, so a larger text size simply leaves the preview less room; this first
  // guess only sizes the cards before that. On a small phone like an iPhone SE
  // the cards also shrink a little, so the post still reads as a whole card
  // fading out rather than a sliver of one. The buttons never shrink.
  const [previewHeight, setPreviewHeight] = useState(() => Math.max(240, Math.min(440, screenHeight - space.top - space.bottom - 297)));
  const cardScale = Math.max(0.8, Math.min(1, previewHeight / 330));
  // The phone scrolls the box you tapped above the keyboard, as every Screen does.
  const keyboard = useKeyboardReveal();
  // Android: room under the form for the keyboard, so the lowest box can be scrolled clear of it.
  const keyboardRoom = useKeyboardRoom(space.bottom);
  const [useAnother, setUseAnother] = useState(false);
  const remembered = isSupabaseConfigured && !add && !useAnother && mode === 'sign-in' ? savedAccounts.filter((a) => a.id !== currentUserId) : [];
  const [switching, setSwitching] = useState<string | null>(null);
  // Continue with Apple or Google: the whole page answers, not the form's button.
  const [via, setVia] = useState<'apple' | 'google' | null>(null);
  // A first visit (no accounts on this device) opens on the welcome, not on a form.
  const [started, setStarted] = useState(asked === 'create' || asked === 'sign-in');
  // A link sent by email: the form gives way to a panel saying where it went.
  const [sent, setSent] = useState<{ kind: 'reset' | 'confirm'; to: string } | null>(null);
  const { leave, curtain } = useLeave();
  const switchingAccount = switching ? savedAccounts.find((a) => a.id === switching) ?? null : null;
  const pick = async (id: string) => {
    if (busy || switching) return;
    setSwitching(id);
    setError(null);
    try {
      await actions.switchAccount(id);
      // The account's picture settles into the page colour, then the app opens.
      leave(() => router.replace('/'));
    } catch (err) {
      // A login that expired on this phone is dropped from the list; the email form takes over.
      setError(err instanceof Error ? err.message : 'Could not switch accounts.');
      setSwitching(null);
    }
  };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [demoHandle, setDemoHandle] = useState('you');
  // New accounts give a date of birth before the account exists, so a child's details are never taken in.
  const [birth, setBirth] = useState({ month: '', day: '', year: '' });
  // Starts unticked, every time: agreeing has to be something you did.
  const [agreed, setAgreed] = useState(false);
  const [ageBlocked, setAgeBlocked] = useState(false);
  useEffect(() => { void isDeviceBlocked().then(setAgeBlocked); }, []);
  const birthDate = toBirthDate(birth.month, birth.day, birth.year);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Apple and Google sit at the top of the form, so what went wrong with them is said up there too.
  const [providerError, setProviderError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Coming back from Google, the session can land a moment after this screen
  // draws; leave as soon as it does instead of sitting on an empty form.
  useEffect(() => {
    if (currentUserId) router.replace('/');
  }, [currentUserId]);

  // Supabase reports a failed Google sign-in in the address bar, as
  // #error_description=…; the splash then forwards here with the bar
  // already cleared, so read it from the last address we came from.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    try {
      const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const fromQuery = new URLSearchParams(window.location.search);
      const stored = sessionStorage.getItem('courtside-auth-error');
      const message = fromHash.get('error_description') || fromQuery.get('error_description') || stored;
      if (message) {
        setProviderError(`Google sign-in did not go through: ${message.replace(/\+/g, ' ')}`);
        sessionStorage.removeItem('courtside-auth-error');
      }
    } catch { /* No storage, no message to show. */ }
  }, []);

  const cleanHandle = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  // The live check on a new handle: a beat after typing stops, ask whether it is free.
  const [handleStatus, setHandleStatus] = useState<HandleStatus | null>(null);
  useEffect(() => {
    setHandleStatus(null);
    if (!isSupabaseConfigured || mode !== 'sign-up' || cleanHandle.length < 2) return;
    let stale = false;
    const timer = setTimeout(() => { void remote.handleStatus(cleanHandle).then((s) => { if (!stale) setHandleStatus(s); }); }, 400);
    return () => { stale = true; clearTimeout(timer); };
  }, [cleanHandle, mode]);
  const handleGone = handleStatus === 'taken' || handleStatus === 'held';
  // 3 to 20 characters: new handles need at least 3, and the sign-up itself keeps only the first 20.
  const handleFits = /^[a-z0-9_]{3,20}$/.test(cleanHandle) && handleStatus !== 'invalid';
  const ready = isSupabaseConfigured
    ? email.includes('@') && password.length >= 6 && (mode === 'sign-in' || (name.trim().length > 0 && handleFits && !handleGone && !!birthDate && !ageBlocked && agreed))
    : demoHandle.trim().length > 0;

  // Apple's own button, iPhone only, above Google: App Review asks for it wherever another company's sign-in is offered.
  const [appleReady, setAppleReady] = useState(false);
  useEffect(() => { if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setAppleReady).catch(() => setAppleReady(false)); }, []);
  // Apple's button comes only in black or white: black on the light pages, white on the dark ones (Night, New York).
  const appleLook = readableInk(colors.bg) === '#FFFFFF' ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK;
  // A birthday already typed on the sign-up form goes along with Apple or
  // Google, so the age check does not ask for it again once the account
  // opens. Too young stops here, the same as the form's own button.
  const carryBirthday = async (): Promise<'carried' | 'none' | 'too-young'> => {
    // Each tap starts clean: nothing an earlier tap (or someone else's) carried goes along.
    dropCarriedBirthDate();
    if (mode !== 'sign-up' || !birthDate) return 'none';
    if (yearsOld(birthDate) < 13) {
      await blockDevice();
      setAgeBlocked(true);
      setProviderError("Sorry, you can't create a CourtSide account.");
      return 'too-young';
    }
    // A phone that has had an under-13 answer carries nothing: a new account
    // meets the birthday page, which says CourtSide is not available.
    if (ageBlocked || await isDeviceBlocked()) return 'none';
    carryBirthDate(birthDate);
    return 'carried';
  };
  const apple = async () => {
    if (busy || via) return;
    setVia('apple');
    setError(null);
    setProviderError(null);
    setNotice(null);
    const carried = await carryBirthday();
    if (carried === 'too-young') { setVia(null); return; }
    try {
      if (await actions.signInWithApple()) { leave(() => router.replace('/')); return; }
      if (carried === 'carried') dropCarriedBirthDate();
      setVia(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/cancel/i.test(message)) setProviderError(message);
      if (carried === 'carried') dropCarriedBirthDate();
      setVia(null);
    }
  };
  const google = async () => {
    if (busy || via) return;
    setVia('google');
    setError(null);
    setProviderError(null);
    setNotice(null);
    const carried = await carryBirthday();
    if (carried === 'too-young') { setVia(null); return; }
    try {
      const done = await actions.signInWithGoogle();
      // On the web a success leaves the page for Google's; on a phone the app opens here.
      if (done && Platform.OS !== 'web') { leave(() => router.replace('/')); return; }
      // Back from Google without a sign-in: say so on the phone, rather than leaving
      // the person on the form wondering whether it worked (one new player went
      // round again through "I already have an account" after this, Oct 1).
      if (!done) { if (carried === 'carried') dropCarriedBirthDate(); setVia(null); if (Platform.OS !== 'web') setProviderError('Google didn’t finish signing you in. Tap Google again to carry on.'); }
    } catch (err) {
      setProviderError(err instanceof Error ? err.message : 'Could not sign in with Google.');
      if (carried === 'carried') dropCarriedBirthDate();
      setVia(null);
    }
  };
  const forgot = async () => {
    if (busy) return;
    if (!email.includes('@')) { setError('Type your email above first, then tap Forgot password.'); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      await actions.requestPasswordReset(email);
      setSent({ kind: 'reset', to: email.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the reset email.');
    } finally { setBusy(false); }
  };

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!isSupabaseConfigured) {
        await actions.signIn(demoHandle);
      } else if (mode === 'sign-in') {
        await actions.signIn(email, password);
      } else {
        if (!birthDate) return;
        // Too young: no account is made, and this phone will not offer one again.
        if (yearsOld(birthDate) < 13) { await blockDevice(); setAgeBlocked(true); return; }
        // The birthday rides on the new account itself (see auth.signUp), so
        // nothing carried for Apple or Google earlier applies to this one.
        dropCarriedBirthDate();
        const result = await actions.signUp(email, password, name, cleanHandle, birthDate);
        if (result === 'confirm') {
          setSent({ kind: 'confirm', to: email.trim() });
          setMode('sign-in');
          return;
        }
      }
      leave(() => router.replace('/'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  const chooser = remembered.length > 0 && !sent;
  const welcome = !add && !started && !sent && !chooser && !useAnother;
  // Android's Back goes back a step on this page, the same as its own back
  // buttons: from "Check your inbox" to the form, from "another account" to
  // the saved ones, from the form to the welcome. From there it leaves the app.
  const backToForm = () => { setSent(null); setError(null); };
  const backToWelcome = () => { setStarted(false); setError(null); setProviderError(null); };
  useAndroidBack(() => {
    if (busy || via || switching) return true;
    if (sent) { backToForm(); return true; }
    if (useAnother) { setUseAnother(false); setError(null); setProviderError(null); return true; }
    if (started && !chooser) { backToWelcome(); return true; }
    return false;
  });
  // Autofill hints for Android's password manager (an iPhone keeps its own way; see Field).
  const fill = (hint: NonNullable<React.ComponentProps<typeof Field>['autoComplete']>) => (Platform.OS === 'android' ? hint : undefined);
  const begin = (next: Mode) => { setMode(next); setStarted(true); setError(null); setProviderError(null); };
  const title = chooser ? 'Welcome back' : mode === 'sign-up' ? 'Create your account' : 'Sign in';
  const line = chooser ? 'Pick an account to carry on.' : mode === 'sign-up' ? 'Free, and it takes a minute.' : 'Tennis clips, people to hit with, and real coaches.';

  return (
    <KeyboardScrollContext.Provider value={keyboard.reveal}>
    <View style={styles.root}>
      <Wash height={420} strength={0.85} />
      <ScrollView
        ref={keyboard.scroller}
        onScroll={keyboard.onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.scroll, { paddingTop: space.top, paddingBottom: space.bottom }]}
        keyboardShouldPersistTaps="handled"
        // The keyboard adds room below the form instead of squashing the page,
        // so the box you tapped can be scrolled clear of it (the line above
        // does the scrolling); a drag down the page puts the keyboard away.
        // Android's room is the empty box at the end (keyboardRoom).
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        keyboardDismissMode={Platform.OS === 'android' ? 'on-drag' : 'interactive'}
      >
        <Animated.View entering={FadeIn.duration(360)} style={styles.column}>
          {sent ? (
            // Where the link went, and what to do with it: a panel, not a line of green text.
            <View style={styles.inbox}>
              <View style={styles.inboxIcon}><Ionicons name="mail-open-outline" size={28} color={colors.brand} /></View>
              <Text style={styles.title}>Check your inbox</Text>
              <Text style={styles.inboxBody}>
                We sent a {sent.kind === 'reset' ? 'password reset link' : 'confirmation link'} to <Text style={styles.inboxTo}>{sent.to}</Text>.{' '}
                {sent.kind === 'reset' ? 'Follow the link to create a new password. It expires in one hour.' : 'Follow the link to confirm your email, then sign in here.'}
              </Text>
              <Text style={styles.inboxHint}>Didn’t get it? Check your spam folder{sent.kind === 'reset' ? ', or resend the email.' : '.'}</Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.inboxActions}>
                <Pressable accessibilityRole="button" onPress={backToForm} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                  <Text style={styles.secondaryText}>Back to sign in</Text>
                </Pressable>
                {sent.kind === 'reset' ? (
                  <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void forgot(); }} hitSlop={8} style={styles.linkButton}>
                    <Text style={styles.link}>{busy ? 'Sending…' : 'Resend email'}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : welcome ? (
            // Fills the screen between the two safe edges, so the buttons sit low, where a thumb is.
            <View style={[styles.welcome, { minHeight: screenHeight - space.top - space.bottom }]}>
                <View style={styles.welcomeTop}>
                  <Animated.View entering={FadeInDown.duration(520)} style={{ gap: spacing.md }}>
                    <View style={[styles.brandRow, { gap: 12 }]}>
                      <BrandMark size={42} />
                      <Text style={[styles.bigName, { fontSize: 42, lineHeight: 46, letterSpacing: -1.8, marginTop: 0 }]}>CourtSide</Text>
                    </View>
                    <Text style={[styles.bigLine, { fontSize: 18, lineHeight: 25 }]}>Your tennis, all in one place. Post your clips, find people to hit with, and ask real coaches.</Text>
                  </Animated.View>
                  {/* Three real screens — the forum, a post, the courts map — fanned like cards and fading into the buttons. */}
                  <View onLayout={(e) => setPreviewHeight(e.nativeEvent.layout.height)} style={styles.phoneWrap}>
                    {/* Each side card's tilt and offset sit on a plain holder around it: on a
                        phone, the fade-in would otherwise replace them, and both side cards
                        would land straight behind the front one. */}
                    <View style={[styles.phoneSlot, { zIndex: 1, transform: [{ translateX: -116 * cardScale }, { translateY: 32 * cardScale }, { rotate: '-7deg' }] }]}>
                      <Animated.View entering={FadeInDown.delay(260).duration(600)} style={[styles.phone, { width: 206 * cardScale, borderRadius: 28 * cardScale }]}>
                        <ExpoImage source={require('../../assets/welcome/forum-screen.jpg')} style={styles.phoneShot} contentFit="cover" accessibilityLabel="The Community forum: players' questions about gear and technique" />
                      </Animated.View>
                    </View>
                    <View style={[styles.phoneSlot, { zIndex: 1, transform: [{ translateX: 116 * cardScale }, { translateY: 32 * cardScale }, { rotate: '7deg' }] }]}>
                      <Animated.View entering={FadeInDown.delay(320).duration(600)} style={[styles.phone, { width: 206 * cardScale, borderRadius: 28 * cardScale }]}>
                        <ExpoImage source={require('../../assets/welcome/map-screen.jpg')} style={styles.phoneShot} contentFit="cover" accessibilityLabel="The map: tennis courts around Raleigh" />
                      </Animated.View>
                    </View>
                    <Animated.View entering={FadeInDown.delay(160).duration(600)} style={[styles.phoneSlot, styles.phone, { zIndex: 2, width: 258 * cardScale, borderRadius: 28 * cardScale }]}>
                      <ExpoImage source={require('../../assets/welcome/post-screen.jpg')} style={[styles.phoneShot, { aspectRatio: 540 / 836 }]} contentFit="cover" accessibilityLabel="A post in CourtSide: photos from a tennis session" />
                    </Animated.View>
                    <LinearGradient pointerEvents="none" colors={[`${colors.bg}00`, colors.bg]} style={styles.phoneFade} />
                  </View>
                </View>
              <Animated.View entering={FadeInDown.delay(320).duration(460)} style={styles.welcomeActions}>
                <Submit label="Create an account" onPress={() => begin('sign-up')} />
                <Pressable accessibilityRole="button" onPress={() => begin('sign-in')} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                  <Text style={styles.secondaryText}>I already have an account</Text>
                </Pressable>
              </Animated.View>
            </View>
          ) : (
            <>
              {started && !chooser ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={backToWelcome} hitSlop={12} style={styles.back}>
                  <Ionicons name="chevron-back" size={22} color={colors.text} />
                </Pressable>
              ) : null}
              <View style={styles.hero}>
                <BrandMark size={42} />
                <View style={{ gap: 6 }}>
                  <Text style={styles.title}>{title}</Text>
                  <Text style={styles.line}>{line}</Text>
                </View>
              </View>

              {chooser ? (
                <View style={styles.accounts}>
                  {remembered.map((account, index) => (
                    <Animated.View key={account.id} entering={FadeInDown.delay(80 + index * 60).duration(340)}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Sign in as ${account.name || account.handle}`}
                        onPress={() => pick(account.id)}
                        disabled={!!switching}
                        style={({ pressed }) => [styles.account, pressed && styles.pressed]}
                      >
                        <Avatar name={account.name || account.handle || '?'} seed={account.id} uri={account.avatarUrl} size={48} />
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={styles.accountName} numberOfLines={1}>{account.name || account.handle || account.email || 'Account'}</Text>
                          <Text style={styles.accountMeta} numberOfLines={1}>{account.handle ? `@${account.handle}` : account.email ?? ''}</Text>
                        </View>
                        {switching === account.id
                          ? <ActivityIndicator size="small" color={colors.brand} />
                          : <View style={styles.go}><Ionicons name="arrow-forward" size={16} color={colors.textMuted} /></View>}
                      </Pressable>
                    </Animated.View>
                  ))}
                  {error || providerError ? <Text style={styles.error}>{error ?? providerError}</Text> : null}
                  <Pressable accessibilityRole="button" onPress={() => setUseAnother(true)} style={({ pressed }) => [styles.secondary, { marginTop: spacing.sm }, pressed && styles.pressed]}>
                    <Ionicons name="add" size={18} color={colors.text} />
                    <Text style={styles.secondaryText}>Use another account</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => { setUseAnother(true); setMode('sign-up'); }} style={styles.switch}>
                    <Text style={styles.switchText}>New here? <Text style={styles.switchLink}>Create an account</Text></Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.form}>
                  {isSupabaseConfigured ? (
                    <>
              {/* Apple and Google first, full width and the same size, Apple on
                  top (App Review wants it at least as easy to find as any other
                  company's sign-in), then a clear line before the email form. */}
              {appleReady ? (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={mode === 'sign-up' ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP : AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={appleLook}
                  cornerRadius={26}
                  style={styles.provider}
                  onPress={apple}
                />
              ) : null}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={mode === 'sign-up' ? 'Sign up with Google' : 'Continue with Google'}
                        onPress={google}
                        disabled={busy || !!via}
                        style={({ pressed }) => [styles.secondary, styles.provider, styles.google, pressed && styles.pressed, (busy || !!via) && { opacity: 0.6 }]}
                      >
                        <Ionicons name="logo-google" size={18} color={colors.text} />
                        <Text style={styles.secondaryText}>{mode === 'sign-up' ? 'Sign up with Google' : 'Continue with Google'}</Text>
                      </Pressable>
                      {providerError ? <Text style={styles.error}>{providerError}</Text> : null}
                      {/* Android has no Sign in with Apple. Someone who made their account with
                          Apple on an iPhone gets in here with the email and a password set there. */}
                      {Platform.OS === 'android' && mode === 'sign-in' ? (
                        <Text style={styles.appleNote}>Made your account with Apple on an iPhone? On the iPhone, open Settings, then Account center, then Set a password. Then sign in here with that email and password.</Text>
                      ) : null}
                      <View style={styles.divider}>
                        <View style={styles.rule} />
                        <Text style={styles.dividerText}>or {mode === 'sign-up' ? 'sign up' : 'sign in'} with email</Text>
                        <View style={styles.rule} />
                      </View>
              {mode === 'sign-up' ? (
                <>
                  <Field soft value={name} onChangeText={setName} placeholder="Name" autoCapitalize="words" autoComplete={fill('name')} />
                  <Field
                    soft
                    value={handle}
                    onChangeText={setHandle}
                    placeholder="Username"
                    autoCapitalize="none"
                    autoComplete={fill('username-new')}
                    hint={handleGone ? `@${cleanHandle} is taken. Try another.`
                      : cleanHandle.length > 20 || handleStatus === 'invalid' ? 'Use 3 to 20 letters, numbers or underscores.'
                      : handleStatus === 'ok' ? `@${cleanHandle} is free`
                      : cleanHandle && cleanHandle !== handle ? `Will be @${cleanHandle}` : 'Letters, numbers and underscores.'}
                  />
                  <BirthDateField month={birth.month} day={birth.day} year={birth.year} onChange={setBirth} />
                  {ageBlocked ? <Text style={styles.ageNote}>Sorry, you can't create a CourtSide account.</Text> : null}
                </>
              ) : null}
                      <Field soft value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" keyboardType="email-address" autoComplete={fill('email')} />
                      <Field soft value={password} onChangeText={setPassword} placeholder={mode === 'sign-up' ? 'Password, at least 6 characters' : 'Password'} autoCapitalize="none" secureTextEntry onSubmitEditing={submit} autoComplete={fill(mode === 'sign-up' ? 'new-password' : 'password')} />
                      {mode === 'sign-in' ? (
                        <Pressable accessibilityRole="button" accessibilityLabel="Forgot password" onPress={forgot} hitSlop={8} style={styles.forgot}>
                          <Text style={styles.link}>Forgot password?</Text>
                        </Pressable>
                      ) : (
                        <TermsCheck checked={agreed} onChange={setAgreed} />
                      )}
                    </>
                  ) : (
            <Field
              label="Username"
              value={demoHandle}
              onChangeText={setDemoHandle}
              autoCapitalize="none"
              hint='Demo build — no accounts, no database. Try "you", "miraplays", "devbackhand" or "tomascoach".'
            />
                  )}
                  {error ? <Text style={styles.error}>{error}</Text> : null}
                  {notice ? <Text style={styles.notice}>{notice}</Text> : null}
                  <Submit label={!isSupabaseConfigured ? 'Enter' : mode === 'sign-in' ? 'Sign in' : 'Create account'} busyLabel={mode === 'sign-up' ? 'Creating your account…' : 'Signing in…'} onPress={() => { void submit(); }} disabled={!ready} busy={busy} />
                  {isSupabaseConfigured ? (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setError(null); setProviderError(null); setNotice(null); }}
                        style={styles.switch}
                      >
                        <Text style={styles.switchText}>
                          {mode === 'sign-in' ? 'New here? ' : 'Already have an account? '}
                          <Text style={styles.switchLink}>{mode === 'sign-in' ? 'Create an account' : 'Sign in'}</Text>
                        </Text>
                      </Pressable>
                    </>
                  ) : (
                    <Text style={styles.footnote}>Mock data only. Nothing you do here leaves the device.</Text>
                  )}
                </View>
              )}
            </>
          )}
        </Animated.View>
        {KEYBOARD_ROOM ? <Animated.View pointerEvents="none" style={keyboardRoom} /> : null}
      </ScrollView>
      <StatusShade wash={{ height: 420, strength: 0.85 }} />
      {via ? <SigningInWith provider={via} /> : null}
      {switchingAccount ? <SigningInAs name={switchingAccount.name} handle={switchingAccount.handle} avatarUrl={switchingAccount.avatarUrl} seed={switchingAccount.id} /> : null}
      {curtain}
    </View>
    </KeyboardScrollContext.Provider>
  );
}

const styleDefinitions = StyleSheet.create({
  ageNote: { ...typography.small, color: colors.danger },
  root: { flex: 1, backgroundColor: colors.bg },
  // The top and bottom padding come from useGateSpace, so they clear the status bar and the home bar.
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xl, justifyContent: 'center' },
  column: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: spacing.xxl },
  hero: { gap: spacing.lg },
  // The first visit: the name, the court, one line, two ways in.
  welcome: { gap: spacing.xl, justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  welcomeActions: { gap: spacing.md },
  // The name and line, then the preview. It grows into the free height rather
  // than being told it (flexGrow, not flex), so when there is too little room
  // the page scrolls instead of the buttons sliding over the preview.
  welcomeTop: { flexGrow: 1, gap: spacing.xl },
  // Three real screens, fanned, fading into the buttons; as tall as the room left, within 240 to 440.
  phoneWrap: { flexGrow: 1, minHeight: 240, maxHeight: 440, alignItems: 'center', overflow: 'hidden', marginHorizontal: -spacing.xl, paddingTop: spacing.md },
  // Where each card sits; the side cards' tilt goes on this holder, never on the card that fades in.
  phoneSlot: { position: 'absolute', top: spacing.md },
  // Width and corner radius are set where the cards are drawn: full size is 258 (front) and 206 (sides), scaled down on small phones.
  phone: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, boxShadow: '0px 18px 40px rgba(42, 36, 24, 0.16)' },
  phoneShot: { width: '100%', aspectRatio: 540 / 858 },
  phoneFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 120, zIndex: 3 },
  bigName: { ...font('600'), fontSize: 56, lineHeight: 60, letterSpacing: -2.4, color: colors.brand, marginTop: spacing.sm },
  bigLine: { ...typography.body, fontSize: 20, lineHeight: 28, letterSpacing: -0.3, color: colors.textMuted, maxWidth: 340 },
  back: { width: 36, height: 36, borderRadius: 18, marginBottom: -spacing.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, ...lift },
  title: { ...typography.display, fontSize: 32, letterSpacing: -1.1, color: colors.text },
  line: { ...typography.body, fontSize: 16, color: colors.textMuted, lineHeight: 23 },
  // Each remembered account is its own soft card, like the app's own cards.
  accounts: { gap: spacing.md },
  account: { ...lift, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: spacing.lg, paddingVertical: 14, borderRadius: 20, backgroundColor: colors.surface },
  accountName: { ...typography.bodyStrong, fontSize: 16, color: colors.text },
  accountMeta: { ...typography.small, color: colors.textMuted },
  go: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  pressed: { transform: [{ scale: 0.99 }], opacity: 0.9 },
  secondary: { ...lift, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, height: 52, borderRadius: radius.pill, backgroundColor: colors.surface },
  secondaryText: { ...typography.bodyStrong, fontSize: 16, color: colors.text },
  form: { gap: spacing.md },
  forgot: { alignSelf: 'flex-end', paddingVertical: 2 },
  link: { ...typography.smallStrong, fontSize: 14, color: colors.brand },
  linkButton: { alignSelf: 'center', paddingVertical: spacing.sm },
  error: { ...typography.small, color: colors.danger },
  notice: { ...typography.small, color: colors.success },
  // Apple's and Google's buttons: the same full width and height, so neither is the smaller way in.
  provider: { height: 52, width: '100%' },
  // Google's is outlined, so it reads as a button and not as one more white box to type in.
  google: { borderWidth: 1, borderColor: colors.borderStrong },
  // "or sign up with email", between two hairlines.
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.xs },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong },
  dividerText: { ...typography.small, color: colors.textMuted },
  appleNote: { ...typography.small, lineHeight: 19, color: colors.textMuted, textAlign: 'center' },
  switch: { alignSelf: 'center', paddingVertical: spacing.sm },
  switchText: { ...typography.small, fontSize: 14, color: colors.textMuted },
  switchLink: { ...typography.smallStrong, fontSize: 14, color: colors.brand },
  footnote: { ...typography.small, color: colors.textFaint, textAlign: 'center' },
  // The inbox panel: an envelope, where it went, what to do next.
  inbox: { gap: spacing.lg, alignItems: 'flex-start' },
  inboxIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  inboxBody: { ...typography.body, fontSize: 16, lineHeight: 24, color: colors.textMuted },
  inboxTo: { ...font('600'), color: colors.text },
  inboxHint: { ...typography.small, color: colors.textFaint },
  inboxActions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm },
});

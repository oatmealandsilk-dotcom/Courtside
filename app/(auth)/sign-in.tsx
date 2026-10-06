import { useThemedStyles } from '@/theme/ThemeProvider';
import { Wash } from '@/components/Wash';
import React, { useEffect, useState } from 'react';
import { BirthDateField } from '@/components/BirthDateField';
import { blockDevice, carryBirthDate, dropCarriedBirthDate, isDeviceBlocked, toBirthDate, yearsOld } from '@/features/age/ageCheck';
import { readableInk } from '@/lib/badges';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Submit } from '@/components/sheet/SheetForm';
import * as AppleAuthentication from 'expo-apple-authentication';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BrandMark } from '@/components/BrandMark';
import { TermsCheck } from '@/components/TermsCheck';
import { Avatar, Button, Field } from '@/components/ui';
import { isSupabaseConfigured } from '@/lib/supabase';
import { auth as remoteAuth, remote, type HandleStatus } from '@/data/remote';
import { BLOCKED_WORDS_NOTE } from '@/features/hiddenWords/hiddenWords';
import { SigningInAs, SigningInWith } from '@/components/SigningInAs';
import { useLeave } from '@/components/LeaveCurtain';
import { peekReferrer } from '@/features/invite/referral';
import { useApp } from '@/store/AppContext';
import { useGateSpace } from '@/lib/useGateSpace';
import { KeyboardScrollContext, useKeyboardReveal } from '@/lib/keyboardScroll';
import { KEYBOARD_ROOM, useKeyboardRoom } from '@/lib/keyboardRoom';
import { useAndroidBack } from '@/lib/androidBack';
import { StatusShade } from '@/components/StatusShade';
import { Welcome } from '@/features/welcome/Welcome';
import { colors, lift, radius, spacing, typography, font } from '@/theme';

type Mode = 'sign-in' | 'sign-up';

/** A username made from a name: "Alex Reed" → "alexreed" (accents off, letters and numbers only, 20 at most); too short to use, nothing. */
function suggestedHandle(name: string): string {
  const plainName = typeof name.normalize === 'function' ? name.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : name;
  const handle = plainName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  return handle.length >= 3 ? handle : '';
}

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
  // Clear of the status bar at the top and the home bar at the bottom, the same as every page before the app.
  const space = useGateSpace();
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
      setError(err instanceof Error ? err.message : 'Could not switch accounts.');
      setSwitching(null);
      // A login that expired on this phone is dropped from the list; the email
      // form takes over, with its email filled in and the reason above the
      // button (with no saved login left, the first-visit welcome showed instead).
      if ((err as { expired?: boolean } | null)?.expired) {
        setStarted(true);
        setMode('sign-in');
        setEmail(savedAccounts.find((a) => a.id === id)?.email ?? '');
      }
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

  // Arrived from a player's invite link (the join page kept their handle):
  // say who, as the website does, on a line of its own under the title's.
  // Only once the server says that handle is a real account, so a made-up
  // link never puts a word on this page. The line's room is kept from the
  // moment a handle is found on the phone (a quick read), while the server
  // answers, so the form under it never moves when the words fade in; a
  // handle the server calls free leaves that room empty rather than pull the
  // form back up under a thumb.
  const [inviteRoom, setInviteRoom] = useState(false);
  const [invitedBy, setInvitedBy] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void peekReferrer().then(async (kept) => {
      const handle = kept && /^[a-z0-9_]{2,24}$/.test(kept) ? kept : null;
      if (!handle || !live) return;
      setInviteRoom(true);
      const real = !isSupabaseConfigured || ['taken', 'held'].includes((await remote.handleStatus(handle).catch(() => null)) ?? '');
      if (live && real) setInvitedBy(handle);
    }).catch(() => undefined);
    return () => { live = false; };
  }, []);

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
        const said = message.replace(/\+/g, ' ');
        // An emailed link (confirming an account, a new password, a new email)
        // that has expired or was used already comes back the same way as a
        // Google sign-in that failed: each is named for what it was.
        const fromEmail = /email link|otp/i.test(said) || /otp/i.test(fromHash.get('error_code') ?? '');
        setProviderError(fromEmail ? `That email link did not work: ${said}.` : `Google sign-in did not go through: ${said}`);
        // The form, which shows it, opens straight away: the first-visit
        // welcome has no room for it, and its buttons would clear it.
        setStarted(true);
        sessionStorage.removeItem('courtside-auth-error');
      }
    } catch { /* No storage, no message to show. */ }
  }, []);

  // The username follows the name until it is typed in itself (Oct 5): "Alex
  // Reed" offers @alexreed, and if that is taken, @alexreed2 and on. Typing
  // in the box makes it yours, and it stops following.
  const [handleTyped, setHandleTyped] = useState(false);
  const [handleTry, setHandleTry] = useState(0);
  const handleBase = suggestedHandle(name);
  useEffect(() => { setHandleTry(0); }, [handleBase]);
  useEffect(() => {
    if (handleTyped || mode !== 'sign-up') return;
    setHandle(handleBase ? (handleTry ? `${handleBase.slice(0, 18)}${handleTry + 1}` : handleBase) : '');
  }, [handleBase, handleTry, handleTyped, mode]);
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
  // A suggested username already taken: the next one along, a few times, before leaving it to them.
  useEffect(() => {
    if (!handleTyped && (handleGone || handleStatus === 'words') && handleTry < 5) setHandleTry((n) => n + 1);
  }, [handleGone, handleStatus, handleTyped]); // eslint-disable-line react-hooks/exhaustive-deps
  // 3 to 20 characters: new handles need at least 3, and the sign-up itself keeps only the first 20.
  // 'words': CourtSide refuses words in it (migration 117); said here, so a new account is never quietly given another handle.
  const handleFits = /^[a-z0-9_]{3,20}$/.test(cleanHandle) && handleStatus !== 'invalid' && handleStatus !== 'words';
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
    if (mode !== 'sign-up') return 'none';
    if (birthDate && yearsOld(birthDate) < 13) {
      await blockDevice();
      setAgeBlocked(true);
      setProviderError("Sorry, you can't create a CourtSide account.");
      return 'too-young';
    }
    // A phone that has had an under-13 answer makes no new account, with or
    // without a date typed, the same as the form's own button. (Before, a new
    // Apple or Google account was made and then stuck on the birthday page.)
    if (ageBlocked || await isDeviceBlocked()) {
      setAgeBlocked(true);
      setProviderError("Sorry, you can't create a CourtSide account.");
      return 'too-young';
    }
    if (!birthDate) return 'none';
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

  // Confirm email on (an owner switch in Supabase): the account waits for the
  // link in the email. Once it is tapped (here or anywhere), Continue signs in
  // with the email and password typed a moment ago, so nobody signs in twice.
  const canContinue = sent?.kind === 'confirm' && password.length >= 6;
  const confirmed = async () => {
    if (busy || !sent) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await actions.signIn(sent.to, password);
      leave(() => router.replace('/'));
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(/confirm/i.test(message) ? 'Not confirmed yet. Tap the link in the email first, then come back here.' : message || 'Could not sign in.');
    } finally { setBusy(false); }
  };
  // Its own flag, so "Resend email" and Continue never both read as busy at once.
  const [resending, setResending] = useState(false);
  const resendConfirm = async () => {
    if (resending || !sent) return;
    setResending(true); setError(null); setNotice(null);
    try {
      await remoteAuth.resendConfirmation(sent.to);
      setNotice('Sent again.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the email again.');
    } finally { setResending(false); }
  };
  const chooser = remembered.length > 0 && !sent;
  const welcome = !add && !started && !sent && !chooser && !useAnother;
  // Android's Back goes back a step on this page, the same as its own back
  // buttons: from "Check your inbox" to the form, from "another account" to
  // the saved ones, from the form to the welcome. From there it leaves the app.
  const backToForm = () => { setSent(null); setError(null); };
  const backToWelcome = () => { setStarted(false); setError(null); setProviderError(null); };
  // "Use another account" or "New here?" from the saved accounts goes back to them.
  const backToAccounts = () => { setUseAnother(false); setMode('sign-in'); setError(null); setProviderError(null); };
  // The form's back arrow: to the saved accounts, from "another account" or
  // from Account center's Add account (which has already logged you out);
  // otherwise to the welcome. An iPhone has no other way back from these.
  const showBack = (started && !chooser) || useAnother || !!add;
  const goBackHere = () => {
    if (useAnother) backToAccounts();
    else if (add) { setMode('sign-in'); setError(null); setProviderError(null); router.replace('/sign-in'); }
    else backToWelcome();
  };
  useAndroidBack(() => {
    if (busy || via || switching) return true;
    if (sent) { backToForm(); return true; }
    if (showBack) { goBackHere(); return true; }
    return false;
  });
  // Autofill hints for Android's password manager (an iPhone keeps its own way; see Field).
  const fill = (hint: NonNullable<React.ComponentProps<typeof Field>['autoComplete']>) => (Platform.OS === 'android' ? hint : undefined);
  const begin = (next: Mode) => { setMode(next); setStarted(true); setError(null); setProviderError(null); };
  const title = chooser ? 'Welcome back' : mode === 'sign-up' ? 'Create your account' : 'Sign in';
  const line = chooser ? 'Pick an account to carry on.' : mode === 'sign-up' ? 'Free, and it takes a minute.' : 'Tennis clips, people to hit with, and real coaches.';

  // The first visit: one big court with the name on it, one line, two ways in (src/features/welcome).
  if (welcome) {
    return (
      <View style={styles.root}>
        <Welcome onCreate={() => begin('sign-up')} onLogIn={() => begin('sign-in')} />
        {via ? <SigningInWith provider={via} /> : null}
        {switchingAccount ? <SigningInAs name={switchingAccount.name} handle={switchingAccount.handle} avatarUrl={switchingAccount.avatarUrl} seed={switchingAccount.id} /> : null}
        {curtain}
      </View>
    );
  }

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
                {sent.kind === 'reset' ? 'Follow the link to create a new password. It expires in one hour.'
                  : canContinue ? 'Tap the link in it, then come back here and tap Continue.' : 'Follow the link to confirm your email, then sign in here.'}
              </Text>
              <Text style={styles.inboxHint}>Didn’t get it? Check your spam folder, or resend the email.</Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {notice ? <Text style={styles.notice}>{notice}</Text> : null}
              <View style={styles.inboxActions}>
                {canContinue ? (
                  // Confirmed in the email (on any phone or browser): straight in, with the password typed a moment ago.
                  <Button label={busy ? 'Signing in…' : 'Continue'} disabled={busy} onPress={() => { void confirmed(); }} full />
                ) : (
                  <Pressable accessibilityRole="button" onPress={backToForm} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                    <Text style={styles.secondaryText}>Back to sign in</Text>
                  </Pressable>
                )}
                {sent.kind === 'reset' ? (
                  <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void forgot(); }} hitSlop={8} style={styles.linkButton}>
                    <Text style={styles.link}>{busy ? 'Sending…' : 'Resend email'}</Text>
                  </Pressable>
                ) : (
                  <Pressable accessibilityRole="button" disabled={resending} onPress={() => { void resendConfirm(); }} hitSlop={8} style={styles.linkButton}>
                    <Text style={styles.link}>{resending ? 'Sending…' : 'Resend email'}</Text>
                  </Pressable>
                )}
                {/* With Continue in its place, still a way back to the form (a mistyped email, another
                    account): an iPhone and a browser have no other back on this page. */}
                {canContinue ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Wrong email? Go back" disabled={busy} onPress={backToForm} hitSlop={8} style={styles.linkButton}>
                    <Text style={styles.quietLink}>Wrong email? Go back</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : (
            <>
              {showBack ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={goBackHere} hitSlop={12} style={styles.back}>
                  <Ionicons name="chevron-back" size={22} color={colors.text} />
                </Pressable>
              ) : null}
              <View style={styles.hero}>
                <BrandMark size={42} />
                <View style={{ gap: 6 }}>
                  <Text style={styles.title}>{title}</Text>
                  <Text style={styles.line}>{line}</Text>
                  {!chooser && mode === 'sign-up' && inviteRoom ? (
                    <View style={styles.invitedRoom}>
                      {invitedBy ? (
                        <Animated.Text entering={FadeIn.duration(280)} numberOfLines={1} style={styles.line}>
                          Invited by <Text style={styles.invitedHandle}>@{invitedBy}</Text>
                        </Animated.Text>
                      ) : null}
                    </View>
                  ) : null}
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
                    onChangeText={(t) => { setHandleTyped(true); setHandle(t); }}
                    placeholder="Username"
                    autoCapitalize="none"
                    autoComplete={fill('username-new')}
                    hint={handleGone ? `@${cleanHandle} is taken. Try another.`
                      : cleanHandle.length > 20 || handleStatus === 'invalid' ? 'Use 3 to 20 letters, numbers or underscores.'
                      : handleStatus === 'words' ? BLOCKED_WORDS_NOTE
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
  back: { width: 36, height: 36, borderRadius: 18, marginBottom: -spacing.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, ...lift },
  title: { ...typography.display, fontSize: 32, letterSpacing: -1.1, color: colors.text },
  line: { ...typography.body, fontSize: 16, color: colors.textMuted, lineHeight: 23 },
  // One line's room for "Invited by @handle", kept while the server checks the handle.
  invitedRoom: { height: 23 },
  invitedHandle: { ...typography.bodyStrong, fontSize: 16, lineHeight: 23, color: colors.text },
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
  quietLink: { ...typography.small, fontSize: 14, color: colors.textMuted },
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

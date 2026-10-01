import { useThemedStyles } from '@/theme/ThemeProvider';
import { Wash } from '@/components/Wash';
import React, { useEffect, useState } from 'react';
import { BirthDateField } from '@/components/BirthDateField';
import { blockDevice, isDeviceBlocked, toBirthDate, yearsOld } from '@/features/age/ageCheck';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
import { colors, lift, radius, spacing, typography, font } from '@/theme';

type Mode = 'sign-in' | 'sign-up';

/**
 * Email and password against Supabase. If the project is not configured the
 * old demo sign-in by handle takes over, so the fixtures still work anywhere.
 */
export default function SignIn() {
  const styles = useThemedStyles(styleDefinitions);
  const { actions, currentUserId, savedAccounts } = useApp();
  const [mode, setMode] = useState<Mode>('sign-in');
  // Logins remembered on this device come first, like Instagram's picker;
  // "Add account" from the accounts page arrives with ?add=1 to skip it.
  const { add } = useLocalSearchParams<{ add?: string }>();
  const { height: screenHeight } = useWindowDimensions();
  const [useAnother, setUseAnother] = useState(false);
  const remembered = isSupabaseConfigured && !add && !useAnother && mode === 'sign-in' ? savedAccounts.filter((a) => a.id !== currentUserId) : [];
  const [switching, setSwitching] = useState<string | null>(null);
  // Continue with Apple or Google: the whole page answers, not the form's button.
  const [via, setVia] = useState<'apple' | 'google' | null>(null);
  // A first visit (no accounts on this device) opens on the welcome, not on a form.
  const [started, setStarted] = useState(false);
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
        setError(`Google sign-in did not go through: ${message.replace(/\+/g, ' ')}`);
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
  const ready = isSupabaseConfigured
    ? email.includes('@') && password.length >= 6 && (mode === 'sign-in' || (name.trim().length > 0 && cleanHandle.length >= 2 && !handleGone && !!birthDate && !ageBlocked && agreed))
    : demoHandle.trim().length > 0;

  // Apple's own button, iPhone only, above Google: App Review asks for it wherever another company's sign-in is offered.
  const [appleReady, setAppleReady] = useState(false);
  useEffect(() => { if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setAppleReady).catch(() => setAppleReady(false)); }, []);
  const apple = async () => {
    if (busy || via) return;
    setVia('apple');
    setError(null);
    setNotice(null);
    try {
      if (await actions.signInWithApple()) { leave(() => router.replace('/')); return; }
      setVia(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/cancel/i.test(message)) setError(message);
      setVia(null);
    }
  };
  const google = async () => {
    if (busy || via) return;
    setVia('google');
    setError(null);
    setNotice(null);
    try {
      const done = await actions.signInWithGoogle();
      // On the web a success leaves the page for Google's; on a phone the app opens here.
      if (done && Platform.OS !== 'web') { leave(() => router.replace('/')); return; }
      if (!done) setVia(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in with Google.');
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
  const begin = (next: Mode) => { setMode(next); setStarted(true); setError(null); };
  const title = chooser ? 'Welcome back' : mode === 'sign-up' ? 'Create your account' : 'Sign in';
  const line = chooser ? 'Pick an account to carry on.' : mode === 'sign-up' ? 'Free, and it takes a minute.' : 'Tennis clips, people to hit with, and real coaches.';

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Wash height={420} strength={0.85} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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
                <Pressable accessibilityRole="button" onPress={() => { setSent(null); setError(null); }} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
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
            <View style={[styles.welcome, { minHeight: screenHeight - spacing.xxl * 2 }]}>
                <View style={{ flex: 1, gap: spacing.xl }}>
                  <Animated.View entering={FadeInDown.duration(520)} style={{ gap: spacing.md }}>
                    <View style={[styles.brandRow, { gap: 12 }]}>
                      <BrandMark size={42} />
                      <Text style={[styles.bigName, { fontSize: 42, lineHeight: 46, letterSpacing: -1.8, marginTop: 0 }]}>CourtSide</Text>
                    </View>
                    <Text style={[styles.bigLine, { fontSize: 18, lineHeight: 25 }]}>Your tennis, all in one place. Post your clips, find people to hit with, and ask real coaches.</Text>
                  </Animated.View>
                  {/* Three real screens — the forum, a post, the courts map — fanned like cards and fading into the buttons. */}
                  <View style={[styles.phoneWrap, { height: Math.max(240, Math.min(440, screenHeight - 396)) }]}>
                    <Animated.View entering={FadeInDown.delay(260).duration(600)} style={[styles.phone, styles.phoneSide, { transform: [{ translateX: -116 }, { translateY: 32 }, { rotate: '-7deg' }] }]}>
                      <ExpoImage source={require('../../assets/welcome/forum-screen.jpg')} style={styles.phoneShot} contentFit="cover" accessibilityLabel="The Community forum: players' questions about gear and technique" />
                    </Animated.View>
                    <Animated.View entering={FadeInDown.delay(320).duration(600)} style={[styles.phone, styles.phoneSide, { transform: [{ translateX: 116 }, { translateY: 32 }, { rotate: '7deg' }] }]}>
                      <ExpoImage source={require('../../assets/welcome/map-screen.jpg')} style={styles.phoneShot} contentFit="cover" accessibilityLabel="The map: tennis courts around Raleigh" />
                    </Animated.View>
                    <Animated.View entering={FadeInDown.delay(160).duration(600)} style={[styles.phone, styles.phoneFront]}>
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
                <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => { setStarted(false); setError(null); }} hitSlop={12} style={styles.back}>
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
                  {error ? <Text style={styles.error}>{error}</Text> : null}
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
              {mode === 'sign-up' ? (
                <>
                  <Field soft value={name} onChangeText={setName} placeholder="Name" autoCapitalize="words" />
                  <Field
                    soft
                    value={handle}
                    onChangeText={setHandle}
                    placeholder="Handle"
                    autoCapitalize="none"
                    hint={handleGone ? `@${cleanHandle} is taken. Try another.`
                      : handleStatus === 'ok' ? `@${cleanHandle} is free`
                      : cleanHandle && cleanHandle !== handle ? `Will be @${cleanHandle}` : 'Letters, numbers and underscores.'}
                  />
                  <BirthDateField month={birth.month} day={birth.day} year={birth.year} onChange={setBirth} />
                  {ageBlocked ? <Text style={styles.ageNote}>Sorry, you can't create a CourtSide account.</Text> : null}
                </>
              ) : null}
                      <Field soft value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" keyboardType="email-address" />
                      <Field soft value={password} onChangeText={setPassword} placeholder={mode === 'sign-up' ? 'Password, at least 6 characters' : 'Password'} autoCapitalize="none" secureTextEntry onSubmitEditing={submit} />
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
              label="Handle"
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
                      <Text style={styles.or}>or</Text>
              {appleReady ? (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={mode === 'sign-up' ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP : AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={12}
                  style={styles.apple}
                  onPress={apple}
                />
              ) : null}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Continue with Google"
                        onPress={google}
                        disabled={busy || !!via}
                        style={({ pressed }) => [styles.secondary, pressed && styles.pressed, (busy || !!via) && { opacity: 0.6 }]}
                      >
                        <Ionicons name="logo-google" size={18} color={colors.text} />
                        <Text style={styles.secondaryText}>Continue with Google</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setError(null); setNotice(null); }}
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
      </ScrollView>
      {via ? <SigningInWith provider={via} /> : null}
      {switchingAccount ? <SigningInAs name={switchingAccount.name} handle={switchingAccount.handle} avatarUrl={switchingAccount.avatarUrl} seed={switchingAccount.id} /> : null}
      {curtain}
    </KeyboardAvoidingView>
  );
}

const styleDefinitions = StyleSheet.create({
  ageNote: { ...typography.small, color: colors.danger },
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl, justifyContent: 'center' },
  column: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: spacing.xxl },
  hero: { gap: spacing.lg },
  // The first visit: the name, the court, one line, two ways in.
  welcome: { gap: spacing.xl, justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  welcomeActions: { gap: spacing.md },
  // Three real screens, fanned, fading into the buttons.
  phoneWrap: { alignItems: 'center', overflow: 'hidden', marginHorizontal: -spacing.xl, paddingTop: spacing.md },
  phone: { position: 'absolute', top: spacing.md, borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, boxShadow: '0px 18px 40px rgba(42, 36, 24, 0.16)' },
  phoneFront: { width: 258, zIndex: 2 },
  phoneSide: { width: 206, zIndex: 1 },
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
  or: { ...typography.small, color: colors.textFaint, textAlign: 'center' },
  error: { ...typography.small, color: colors.danger },
  notice: { ...typography.small, color: colors.success },
  apple: { height: 52, width: '100%' },
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

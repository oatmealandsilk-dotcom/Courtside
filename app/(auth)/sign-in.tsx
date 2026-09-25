import { useThemedStyles } from '@/theme/ThemeProvider';
import { Wash } from '@/components/Wash';
import React, { useEffect, useState } from 'react';
import { BirthDateField } from '@/components/BirthDateField';
import { blockDevice, isDeviceBlocked, toBirthDate, yearsOld } from '@/features/age/ageCheck';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { BrandMark } from '@/components/BrandMark';
import { TermsCheck } from '@/components/TermsCheck';
import { Avatar, Button, Field } from '@/components/ui';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography, font } from '@/theme';

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
  const [useAnother, setUseAnother] = useState(false);
  const remembered = isSupabaseConfigured && !add && !useAnother && mode === 'sign-in' ? savedAccounts.filter((a) => a.id !== currentUserId) : [];
  const [switching, setSwitching] = useState<string | null>(null);
  const pick = async (id: string) => {
    if (busy || switching) return;
    setSwitching(id);
    setError(null);
    try {
      await actions.switchAccount(id);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not switch accounts.');
    } finally {
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
  const ready = isSupabaseConfigured
    ? email.includes('@') && password.length >= 6 && (mode === 'sign-in' || (name.trim().length > 0 && cleanHandle.length >= 2 && !!birthDate && !ageBlocked && agreed))
    : demoHandle.trim().length > 0;

  const google = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const done = await actions.signInWithGoogle();
      if (done && Platform.OS !== 'web') router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in with Google.');
      // On the web a success leaves the page; a failure stays, so the form must come back.
      setBusy(false);
    } finally {
      if (Platform.OS !== 'web') setBusy(false);
    }
  };
  const forgot = async () => {
    if (busy) return;
    if (!email.includes('@')) { setError('Type your email above first, then tap Forgot password.'); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      await actions.requestPasswordReset(email);
      setNotice('Check your email for a link. It signs you in so you can set a new password.');
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
        const result = await actions.signUp(email, password, name, cleanHandle);
        if (result !== 'confirm') await actions.confirmBirthDate(birthDate);
        if (result === 'confirm') {
          setNotice('Check your email for a confirmation link, then sign in.');
          setMode('sign-in');
          return;
        }
      }
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Wash height={420} strength={0.85} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <BrandMark size={56} />
          <Text style={styles.wordmark}>CourtSide</Text>
          <Text style={styles.tagline}>
            Log your tennis, ask the questions nobody answers well, and get coaching that actually knows your game.
          </Text>
        </View>

        {remembered.length ? (
          <View style={styles.accounts}>
            {remembered.map((account, index) => (
              <Pressable
                key={account.id}
                accessibilityRole="button"
                accessibilityLabel={`Sign in as ${account.name || account.handle}`}
                onPress={() => pick(account.id)}
                disabled={!!switching}
                style={({ pressed }) => [styles.account, index > 0 && styles.accountBorder, pressed && { backgroundColor: colors.surfaceAlt }]}
              >
                <Avatar name={account.name || account.handle || '?'} seed={account.id} uri={account.avatarUrl} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.accountName}>{account.name || account.handle || account.email || 'Account'}</Text>
                  <Text style={styles.accountMeta}>{account.handle ? `@${account.handle}` : account.email ?? ''}</Text>
                </View>
                {switching === account.id ? <Text style={styles.accountMeta}>Signing in…</Text> : <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />}
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" onPress={() => setUseAnother(true)} style={[styles.account, styles.accountBorder]}>
              <View style={styles.plus}><Ionicons name="add" size={20} color={colors.brand} /></View>
              <Text style={[styles.accountName, { flex: 1 }]}>Use another account</Text>
            </Pressable>
            {error ? <Text style={[styles.error, { paddingHorizontal: spacing.lg, paddingBottom: spacing.md }]}>{error}</Text> : null}
          </View>
        ) : null}

        <View style={[styles.form, remembered.length > 0 && { display: 'none' }]}>
          {isSupabaseConfigured ? (
            <>
              {mode === 'sign-up' ? (
                <>
                  <Field label="Name" value={name} onChangeText={setName} placeholder="Mira Okafor" autoCapitalize="words" />
                  <Field
                    label="Handle"
                    value={handle}
                    onChangeText={setHandle}
                    placeholder="miraplays"
                    autoCapitalize="none"
                    hint={cleanHandle && cleanHandle !== handle ? `Will be @${cleanHandle}` : 'Letters, numbers and underscores.'}
                  />
                  <BirthDateField month={birth.month} day={birth.day} year={birth.year} onChange={setBirth} />
                  {ageBlocked ? <Text style={styles.ageNote}>Sorry, you can't create a CourtSide account.</Text> : null}
                </>
              ) : null}
              <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" />
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder={mode === 'sign-up' ? 'At least 6 characters' : '••••••••'}
                autoCapitalize="none"
                secureTextEntry
                onSubmitEditing={submit}
              />
              {mode === 'sign-in' ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Forgot password" onPress={forgot} hitSlop={8} style={{ alignSelf: 'flex-end' }}>
                  <Text style={styles.forgot}>Forgot password?</Text>
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
              placeholder="you"
              autoCapitalize="none"
              hint='Demo build — no accounts, no database. Try "you", "miraplays", "devbackhand" or "tomascoach".'
            />
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <Button
            label={!isSupabaseConfigured ? 'Enter' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
            onPress={submit}
            loading={busy}
            disabled={!ready}
            full
          />
          {isSupabaseConfigured ? (
            <>
              <View style={styles.divider}>
                <View style={styles.rule} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.rule} />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Continue with Google"
                onPress={google}
                disabled={busy}
                style={({ pressed }) => [styles.google, pressed && { backgroundColor: colors.surfaceAlt }, busy && { opacity: 0.6 }]}
              >
                <Ionicons name="logo-google" size={19} color={colors.text} />
                <Text style={styles.googleText}>Continue with Google</Text>
              </Pressable>
            </>
          ) : null}
          {isSupabaseConfigured ? (
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
          ) : null}
        </View>

        <Text style={styles.footnote}>
          {isSupabaseConfigured ? 'Your posts, stories and follows are saved to your account.' : 'Mock data only. Nothing you do here leaves the device.'}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styleDefinitions = StyleSheet.create({
  ageNote: { ...typography.small, color: colors.danger },
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, padding: spacing.xl, justifyContent: 'center', gap: spacing.xxl, maxWidth: 520, width: '100%', alignSelf: 'center' },
  hero: { gap: spacing.md },
  wordmark: { fontSize: 44, ...font('700'), color: colors.brand, letterSpacing: -1.4 },
  tagline: { ...typography.body, color: colors.textMuted, lineHeight: 23, maxWidth: 380 },
  form: { gap: spacing.lg },
  accounts: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden', marginBottom: spacing.lg },
  account: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 60 },
  accountBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  accountName: { ...typography.bodyStrong, color: colors.text },
  accountMeta: { ...typography.small, color: colors.textFaint },
  plus: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  error: { ...typography.small, color: colors.danger },
  forgot: { ...typography.small, color: colors.brand, fontWeight: '600' },
  notice: { ...typography.small, color: colors.success },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong },
  dividerText: { ...typography.small, color: colors.textFaint },
  google: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 50,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  googleText: { ...typography.bodyStrong, color: colors.text },
  switch: { alignSelf: 'center', paddingVertical: spacing.sm },
  switchText: { ...typography.small, color: colors.textMuted },
  switchLink: { ...typography.smallStrong, color: colors.brand },
  footnote: { ...typography.small, color: colors.textFaint, textAlign: 'center' },
});

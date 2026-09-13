import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { BrandMark } from '@/components/BrandMark';
import { Button, Field } from '@/components/ui';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';

type Mode = 'sign-in' | 'sign-up';

/**
 * Email and password against Supabase. If the project is not configured the
 * old demo sign-in by handle takes over, so the fixtures still work anywhere.
 */
export default function SignIn() {
  const styles = useThemedStyles(styleDefinitions);
  const { actions } = useApp();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [demoHandle, setDemoHandle] = useState('you');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const cleanHandle = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const ready = isSupabaseConfigured
    ? email.includes('@') && password.length >= 6 && (mode === 'sign-in' || (name.trim().length > 0 && cleanHandle.length >= 2))
    : demoHandle.trim().length > 0;

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
        const result = await actions.signUp(email, password, name, cleanHandle);
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
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <BrandMark size={56} />
          <Text style={styles.wordmark}>CourtSide</Text>
          <Text style={styles.tagline}>
            Log your tennis, ask the questions nobody answers well, and get coaching that actually knows your game.
          </Text>
        </View>

        <View style={styles.form}>
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
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, padding: spacing.xl, justifyContent: 'center', gap: spacing.xxl, maxWidth: 520, width: '100%', alignSelf: 'center' },
  hero: { gap: spacing.md },
  wordmark: { fontSize: 44, fontWeight: '800', color: colors.brand, letterSpacing: -1.4 },
  tagline: { ...typography.body, color: colors.textMuted, lineHeight: 23, maxWidth: 380 },
  form: { gap: spacing.lg },
  error: { ...typography.small, color: colors.danger },
  notice: { ...typography.small, color: colors.success },
  switch: { alignSelf: 'center', paddingVertical: spacing.sm },
  switchText: { ...typography.small, color: colors.textMuted },
  switchLink: { ...typography.smallStrong, color: colors.brand },
  footnote: { ...typography.small, color: colors.textFaint, textAlign: 'center' },
});

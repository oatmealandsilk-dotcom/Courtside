import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button, Field } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';

export default function SignIn() {
  const styles = useThemedStyles(styleDefinitions);
  const { actions } = useApp();
  const [handle, setHandle] = useState('you');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await actions.signIn(handle);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.hero}>
        <Text style={styles.wordmark}>CourtSide</Text>
        <Text style={styles.tagline}>
          Log your tennis, ask the questions nobody answers well, and get coaching that actually knows
          your game.
        </Text>
      </View>

      <View style={styles.form}>
        <Field
          label="Handle"
          value={handle}
          onChangeText={setHandle}
          placeholder="you"
          autoCapitalize="none"
          hint='Demo build — no accounts, no database. Try "you", "miraplays", "devbackhand" or "tomascoach".'
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label="Enter" onPress={submit} loading={busy} full />
      </View>

      <Text style={styles.footnote}>
        Mock data only. Nothing you do here leaves the device.
      </Text>
    </KeyboardAvoidingView>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: spacing.xl, justifyContent: 'center', gap: spacing.xxxl },
  hero: { gap: spacing.md },
  wordmark: { fontSize: 44, fontWeight: '800', color: colors.brand, letterSpacing: -1.4 },
  tagline: { ...typography.body, color: colors.textMuted, lineHeight: 23, maxWidth: 380 },
  form: { gap: spacing.lg },
  error: { ...typography.small, color: colors.danger },
  footnote: { ...typography.small, color: colors.textFaint, textAlign: 'center' },
});

import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BrandMark } from '@/components/BrandMark';
import { Button, Field, Screen } from '@/components/ui';
import { joinWaitlist, type WaitlistResult } from '@/data/remote';
import { isSupabaseConfigured } from '@/lib/supabase';
import { colors, radius, spacing, typography } from '@/theme';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Where a link posted outside the app lands: no account, no tour of the app,
 * just an address to write to when CourtSide opens. It sits outside the tabs
 * and outside sign-in, so /waitlist works for someone who has never been here.
 */
export default function Waitlist() {
  const styles = useThemedStyles(styleDefinitions);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [joined, setJoined] = useState<WaitlistResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!EMAIL.test(email.trim())) {
      setError('That address does not look right.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      setJoined(await joinWaitlist({ email, name, note }));
    } catch {
      setError('Could not reach the server. Try again in a moment.');
    } finally {
      setSending(false);
    }
  };

  if (joined) {
    return (
      <Screen title="You're on the list" compactTitle>
        <View style={styles.done}>
          <BrandMark size={56} />
          <Text style={styles.doneBody}>
            {joined === 'already-joined'
              ? 'You were already on it — nothing lost. We will write to you when there is something worth trying.'
              : 'We will write to you when there is something worth trying. Nothing else, ever.'}
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title="Join the waitlist"
      subtitle="CourtSide is still being built. Leave an address and we will tell you when it opens."
      compactTitle
    >
      <View style={styles.form}>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
        />
        <Field label="Name (optional)" value={name} onChangeText={setName} placeholder="What to call you" autoCapitalize="words" />
        <Field
          label="What would make you use this? (optional)"
          value={note}
          onChangeText={setNote}
          placeholder="The thing you wish existed"
          multiline
          minHeight={96}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!isSupabaseConfigured ? (
          <Text style={styles.notice}>This is a demo build with no database behind it, so nothing can be saved here.</Text>
        ) : null}
        <Button
          label={sending ? 'Adding you…' : 'Join the waitlist'}
          onPress={submit}
          loading={sending}
          disabled={!isSupabaseConfigured}
          full
        />
        <Text style={styles.fine}>Your address is only ever used to tell you about CourtSide.</Text>
      </View>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  form: { gap: spacing.lg },
  error: { ...typography.small, color: colors.danger },
  notice: {
    ...typography.small,
    color: colors.textMuted,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  fine: { ...typography.caption, color: colors.textFaint, textAlign: 'center' },
  done: { alignItems: 'center', gap: spacing.lg, paddingTop: spacing.xl },
  doneBody: { ...typography.body, color: colors.textMuted, textAlign: 'center', maxWidth: 340 },
});

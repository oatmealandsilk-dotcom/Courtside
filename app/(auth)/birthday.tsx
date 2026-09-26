import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/BrandMark';
import { BirthDateField } from '@/components/BirthDateField';
import { Button } from '@/components/ui';
import { isDeviceBlocked, toBirthDate } from '@/features/age/ageCheck';
import { useLeave } from '@/components/LeaveCurtain';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

/**
 * The age check, asked once of every account. The question is neutral — it
 * does not say which answers pass — and the date stays private. Under 13 the
 * account is removed and this phone will not ask again.
 */
export default function Birthday() {
  const { leave, curtain } = useLeave();
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { currentUserId, actions } = useApp();
  const [date, setDate] = useState({ month: '', day: '', year: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  useEffect(() => { void isDeviceBlocked().then((b) => { if (b) setBlocked(true); }); }, []);

  const submit = async () => {
    if (busy) return;
    const birthDate = toBirthDate(date.month, date.day, date.year);
    if (!birthDate) { setError('Enter a real date, like 04 17 2008.'); return; }
    setBusy(true);
    setError('');
    try {
      const result = await actions.confirmBirthDate(birthDate);
      if (result === 'under13') { setBlocked(true); return; }
      leave(() => router.replace('/'));
    } catch {
      setError('Could not save that. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (blocked) {
    return (
      <View style={[styles.root, styles.centre, { paddingTop: insets.top + spacing.xl }]}>
        <BrandMark size={56} />
        <Text style={styles.title}>CourtSide isn't available to you yet</Text>
        <Text style={styles.lead}>You need to be a bit older to have an account. Nothing you entered has been kept.</Text>
        {currentUserId ? null : <Button label="Back to sign in" variant="ghost" onPress={() => router.replace('/sign-in')} />}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xxl }]} keyboardShouldPersistTaps="handled">
        <BrandMark size={44} />
        <Text style={styles.title}>When's your birthday?</Text>
        <Text style={styles.lead}>It stays private and never shows on your profile.</Text>
        <BirthDateField month={date.month} day={date.day} year={date.year} onChange={setDate} onSubmit={submit} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label="Continue" loading={busy} disabled={!date.month || !date.day || date.year.length !== 4} onPress={submit} full />
      </ScrollView>
      {curtain}
    </KeyboardAvoidingView>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  centre: { alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.lg, maxWidth: 460, width: '100%', alignSelf: 'center' },
  title: { ...typography.title, color: colors.text, textAlign: 'left' },
  lead: { ...typography.body, color: colors.textMuted },
  error: { ...typography.small, color: colors.danger },
});

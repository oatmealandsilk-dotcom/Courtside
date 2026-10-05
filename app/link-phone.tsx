import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { CourtSpinner } from '@/components/CourtSpinner';
import { Button, Screen } from '@/components/ui';
import { showPhone, toE164 } from '@/features/contacts/phoneNumber';
import { confirm } from '@/lib/confirm';
import { goBack } from '@/lib/goBack';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, typography } from '@/theme';

/**
 * Linking your phone number, so friends who have it in their contacts can
 * find you (Find friends, migration 88). A 6-digit code is texted to prove
 * the number is yours; it is never shown on your profile.
 */
export default function LinkPhone() {
  const styles = useThemedStyles(styleDefinitions);
  const { actions, prefs } = useApp();
  // "Let people find me from their contacts" off (migration 89): a linked number finds no one to you, so this never says it does.
  const findable = prefs.contactsFindable;
  const [linked, setLinked] = useState<string | null | undefined>(undefined);
  const [typed, setTyped] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { void actions.myPhone().then(setLinked).catch(() => setLinked(null)); }, [actions]);

  const number = toE164(typed);
  const send = async () => {
    if (!number || busy) return;
    setBusy(true);
    setError('');
    try {
      await actions.startPhoneLink(number);
      setSentTo(number);
      setCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t go through. Try again.');
    } finally { setBusy(false); }
  };
  const check = async (entered = code) => {
    if (!sentTo || entered.length < 6 || busy) return;
    setBusy(true);
    setError('');
    try {
      await actions.confirmPhoneLink(sentTo, entered);
      showToast({ title: 'Phone number linked', body: findable ? 'Friends with it in their contacts can find you now.' : 'No one finds you by it while “Let people find me from their contacts” is off.', icon: 'checkmark-circle-outline' });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code didn’t work.');
      setBusy(false);
    }
  };
  const remove = () => confirm({
    title: 'Remove your phone number?',
    message: 'Friends won’t find you from their contacts by your number any more.',
    confirmLabel: 'Remove',
    destructive: true,
    onConfirm: async () => {
      try { await actions.unlinkPhone(); setLinked(null); showToast({ title: 'Phone number removed', icon: 'trash-outline' }); }
      catch (e) { setError(e instanceof Error ? e.message : 'That didn’t go through.'); }
    },
  });

  return (
    <Screen title="Phone number" compactTitle onBack={() => goBack()}>
      {linked === undefined ? <View style={styles.wait}><CourtSpinner size={28} /></View> : linked && !sentTo ? (
        <View style={styles.body}>
          <View style={styles.card}>
            <Ionicons name="checkmark-circle" size={22} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.head}>{showPhone(linked)}</Text>
              <Text style={styles.sub}>{findable
                ? 'Linked. Friends with this number in their contacts can find you. It’s never shown on your profile.'
                : 'Linked. No one finds you by it while “Let people find me from their contacts” is off in Settings. It’s never shown on your profile.'}</Text>
            </View>
          </View>
          <Button label="Change number" variant="secondary" onPress={() => setLinked(null)} full />
          <Button label="Remove number" variant="ghost" onPress={remove} full />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      ) : !sentTo ? (
        <View style={styles.body}>
          <Text style={styles.lead}>Link your number so friends who have it saved can find you on CourtSide. We’ll text you a code to check it’s yours. It’s never shown on your profile.</Text>
          <View style={styles.field}>
            <Ionicons name="call-outline" size={18} color={colors.textMuted} />
            <TextInput value={typed} onChangeText={(t) => { setTyped(t); setError(''); }} placeholder="(919) 555-1234" placeholderTextColor={colors.textFaint}
              keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" autoFocus accessibilityLabel="Phone number"
              returnKeyType="send" onSubmitEditing={() => void send()} editable={!busy} style={styles.input} />
          </View>
          <Text style={styles.note}>Outside the US or Canada? Start with + and your country code.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label={busy ? 'Sending…' : 'Text me a code'} onPress={() => void send()} disabled={!number} loading={busy} full />
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={styles.lead}>We texted a 6-digit code to {showPhone(sentTo)}.</Text>
          <View style={styles.field}>
            <Ionicons name="keypad-outline" size={18} color={colors.textMuted} />
            <TextInput value={code} onChangeText={(t) => { const c = t.replace(/\D/g, '').slice(0, 6); setCode(c); setError(''); if (c.length === 6) void check(c); }}
              placeholder="123456" placeholderTextColor={colors.textFaint} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp"
              autoFocus maxLength={6} accessibilityLabel="Code" editable={!busy} style={[styles.input, styles.code]} />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label={busy ? 'Checking…' : 'Confirm'} onPress={() => void check()} disabled={code.length < 6} loading={busy} full />
          <Button label="Send a new code" variant="ghost" onPress={() => void send()} disabled={busy} full />
          <Button label="Use a different number" variant="ghost" onPress={() => { setSentTo(null); setError(''); }} disabled={busy} full />
        </View>
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  wait: { paddingVertical: 60, alignItems: 'center' },
  body: { gap: spacing.md },
  lead: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  field: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 52, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, fontSize: 17, color: colors.text, paddingVertical: 0 },
  code: { letterSpacing: 6, ...font('600') },
  note: { ...typography.small, color: colors.textFaint, marginTop: -4 },
  error: { ...typography.small, color: colors.danger },
  card: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.surface },
  head: { ...typography.bodyStrong, color: colors.text },
  sub: { ...typography.small, color: colors.textMuted, lineHeight: 19, marginTop: 2 },
});

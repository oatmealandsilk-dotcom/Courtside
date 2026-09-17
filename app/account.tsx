import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, Button, Field, Screen } from '@/components/ui';
import { isSupabaseConfigured } from '@/lib/supabase';
import { shareOutside } from '@/lib/shareOutside';
import { formatDate } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import * as toast from '@/lib/toast';
import { colors, radius, spacing, typography } from '@/theme';

type Sheet = 'password' | 'email' | 'delete' | null;

/**
 * Account centre — the account itself, as distinct from the profile people
 * see. Who you sign in as, how, what we hold, and the two irreversible
 * buttons at the bottom.
 */
export default function AccountCentre() {
  const { reset } = useLocalSearchParams<{ reset?: string }>();
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, actions } = useApp();
  const [info, setInfo] = useState<Awaited<ReturnType<typeof actions.accountInfo>>>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [email, setEmail] = useState('');
  const [confirmWord, setConfirmWord] = useState('');

  useEffect(() => {
    actions.accountInfo().then(setInfo).catch(() => setInfo(null));
  }, [actions]);

  const say = (text: string) => { setNotice(text); setError(''); setTimeout(() => setNotice(''), 3000); };
  const run = async (work: () => Promise<void>, done: string) => {
    setBusy(true);
    setError('');
    try {
      await work();
      setSheet(null);
      say(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const hasGoogle = info?.providers.includes('google') ?? false;
  const hasEmail = info?.providers.includes('email') ?? false;

  const download = async () => {
    const data = JSON.stringify(actions.exportData(), null, 2);
    if (Platform.OS === 'web') {
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `courtside-${currentUser?.handle ?? 'me'}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      say('Your data is downloading.');
      return;
    }
    await shareOutside('My CourtSide data', data);
  };

  const row = (icon: keyof typeof Ionicons.glyphMap, label: string, detail?: string, onPress?: () => void, danger = false, index = 0) => (
    <Pressable
      key={label}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={label}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, index > 0 && styles.rowBorder, pressed && onPress ? { backgroundColor: colors.surfaceAlt } : null]}
    >
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.text} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textFaint} /> : null}
    </Pressable>
  );

  return (
    <Screen title="Account center" compactTitle onBack={() => goBack()}>
      {currentUser ? (
        <View style={styles.hero}>
          <Avatar name={currentUser.name} seed={currentUser.avatarSeed} uri={currentUser.avatarUrl} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName}>{currentUser.name}</Text>
            <Text style={styles.heroMeta}>@{currentUser.handle}{info?.email ? ` · ${info.email}` : ''}</Text>
            {info ? <Text style={styles.heroMeta}>Member since {formatDate(info.createdAt)}</Text> : null}
          </View>
        </View>
      ) : null}

      {!isSupabaseConfigured ? <Text style={styles.demo}>Demo build — there is no real account behind this screen, so the sign-in and password options are shown but do nothing.</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <Text style={styles.sectionTitle}>PERSONAL DETAILS</Text>
      <View style={styles.card}>
        {row('person-outline', 'Name, bio and location', currentUser?.name, () => router.push('/edit-profile'), false, 0)}
        {row('at-outline', 'Handle', `@${currentUser?.handle ?? ''} · cannot be changed yet`, undefined, false, 1)}
        {row('mail-outline', 'Email', info?.email ? `${info.email}${info.emailConfirmed ? '' : ' · not confirmed'}` : 'Not signed in', isSupabaseConfigured ? () => { setEmail(info?.email ?? ''); setSheet('email'); } : undefined, false, 2)}
      </View>

      <Text style={styles.sectionTitle}>PASSWORD AND SIGN-IN</Text>
      <View style={styles.card}>
        {row('key-outline', 'Change password', hasEmail ? 'Email and password sign-in' : 'Set a password to sign in without Google', isSupabaseConfigured ? () => { setPassword(''); setPassword2(''); setSheet('password'); } : undefined, false, 0)}
        {row('logo-google', hasGoogle ? 'Google' : 'Link Google', hasGoogle ? 'Connected — you can sign in with Google' : 'Sign in with your Google account as well', !hasGoogle && isSupabaseConfigured ? () => run(() => actions.linkGoogle(), 'Follow the Google prompt to finish linking.') : undefined, false, 1)}
        {row('time-outline', 'Last sign-in', info?.lastSignInAt ? formatDate(info.lastSignInAt) : '—', undefined, false, 2)}
        {row('log-out-outline', 'Log out of all devices', 'Signs you out everywhere, including this one', () => run(async () => { await actions.signOutEverywhere(); router.replace('/sign-in'); }, 'Signed out everywhere.'), false, 3)}
      </View>

      <Text style={styles.sectionTitle}>YOUR INFORMATION</Text>
      <View style={styles.card}>
        {row('download-outline', 'Download your data', 'Profile, posts, questions, hits, messages — as one file', () => { void download(); }, false, 0)}
        {row('sparkles-outline', 'What the coach remembers', 'Notes the AI coach keeps about you', () => toast.show({ title: 'AI coach is coming soon', body: 'A weekly plan and a coach to ask, coming soon', icon: 'sparkles' }), false, 1)}
        {row('shield-checkmark-outline', 'Privacy center', 'What we store and who can see it', () => router.push('/privacy'), false, 2)}
        {row('card-outline', 'Payment methods', undefined, () => router.push('/payments'), false, 3)}
      </View>

      <Text style={styles.sectionTitle}>ACCOUNT</Text>
      <View style={styles.card}>
        {row('swap-horizontal-outline', 'Switch account', 'Pick another login saved on this phone', () => router.push('/accounts'), false, 0)}
        {row('trash-outline', 'Delete account', 'Removes your profile, posts and messages. Cannot be undone.', () => { setConfirmWord(''); setSheet('delete'); }, true, 1)}
      </View>

      <Modal visible={sheet !== null} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <Pressable accessibilityLabel="Close" onPress={() => !busy && setSheet(null)} style={styles.backdrop}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            {sheet === 'password' ? (
              <>
                <Text style={styles.sheetTitle}>Change password</Text>
                {reset ? <Text style={styles.resetNote}>You came from the reset email. Set your new password here.</Text> : null}
                <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" placeholder="At least 6 characters" />
                <Field label="Again" value={password2} onChangeText={setPassword2} secureTextEntry autoCapitalize="none" placeholder="Same again" />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button label="Save password" loading={busy} disabled={password.length < 6 || password !== password2} onPress={() => run(() => actions.changePassword(password), 'Password changed.')} full />
              </>
            ) : null}
            {sheet === 'email' ? (
              <>
                <Text style={styles.sheetTitle}>Change email</Text>
                <Text style={styles.sheetNote}>We send a confirmation to the new address. The change lands when you tap the link.</Text>
                <Field label="New email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button label="Send confirmation" loading={busy} disabled={!email.includes('@') || email.trim() === info?.email} onPress={() => run(() => actions.changeEmail(email), 'Check the new address for a confirmation link.')} full />
              </>
            ) : null}
            {sheet === 'delete' ? (
              <>
                <Text style={[styles.sheetTitle, { color: colors.danger }]}>Delete your account?</Text>
                <Text style={styles.sheetNote}>Your profile, posts, clips, hits, questions and messages are removed for good. Coaches keep records of paid sessions. Type DELETE to confirm.</Text>
                <Field value={confirmWord} onChangeText={setConfirmWord} autoCapitalize="none" placeholder="DELETE" />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button label="Delete my account" variant="danger" loading={busy} disabled={confirmWord.trim() !== 'DELETE'} onPress={() => run(async () => { await actions.deleteAccount(); router.replace('/'); }, 'Account deleted.')} full />
              </>
            ) : null}
            <Button label="Cancel" variant="ghost" onPress={() => setSheet(null)} disabled={busy} full />
          </View>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  resetNote: { ...typography.small, color: colors.brand, fontWeight: '600' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.lg },
  heroName: { ...typography.heading, color: colors.text },
  heroMeta: { ...typography.small, color: colors.textMuted },
  demo: { ...typography.small, color: colors.textFaint, lineHeight: 19, paddingBottom: spacing.md },
  notice: { ...typography.small, color: colors.success, paddingBottom: spacing.sm },
  sectionTitle: { ...typography.caption, color: colors.textFaint, letterSpacing: 1, paddingTop: spacing.md, paddingBottom: spacing.sm },
  card: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 52 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowLabel: { ...typography.body, color: colors.text },
  rowDetail: { ...typography.small, color: colors.textFaint },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md, maxWidth: 520, width: '100%', alignSelf: 'center' },
  sheetTitle: { ...typography.heading, color: colors.text },
  sheetNote: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  error: { ...typography.small, color: colors.danger },
});

import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BrandMark } from '@/components/BrandMark';
import { Wash } from '@/components/Wash';
import { SheetTitle, Submit } from '@/components/sheet/SheetForm';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar, Button, Field, Screen } from '@/components/ui';
import { isSupabaseConfigured } from '@/lib/supabase';
import { shareOutside } from '@/lib/shareOutside';
import { formatDate } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import * as toast from '@/lib/toast';
import { useAiCoachOn } from '@/features/aiCoach/switch';
import { colors, radius, spacing, typography, lift } from '@/theme';

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
  const aiCoachOn = useAiCoachOn();
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
      style={({ pressed }) => [styles.row, pressed && onPress ? { backgroundColor: colors.surfaceAlt } : null]}
    >
      <View style={styles.lead}><Ionicons name={icon} size={20} color={danger ? colors.danger : colors.text} /></View>
      <View style={[styles.rowBody, index > 0 && styles.rowBorder]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
          {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
        </View>
        {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textFaint} /> : null}
      </View>
    </Pressable>
  );

  // Straight off the reset email: a page of its own, not a sheet over settings.
  if (reset) return <ResetPage email={info?.email} onSave={(pw) => actions.changePassword(pw)} />;

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

      {!isSupabaseConfigured ? <Text style={styles.demo}>This is the demo build. There is no real account behind this screen, so the sign-in and password options do nothing.</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <Text style={styles.sectionTitle}>Personal details</Text>
      <View style={styles.card}>
        {row('person-outline', 'Name, bio and location', currentUser?.name, () => router.push('/edit-profile'), false, 0)}
        {row('at-outline', 'Handle', `@${currentUser?.handle ?? ''} · once every 30 days`, () => router.push('/change-handle'), false, 1)}
        {row('mail-outline', 'Email', info?.email ? `${info.email}${info.emailConfirmed ? '' : ' · not confirmed'}` : 'Not signed in', isSupabaseConfigured ? () => { setEmail(info?.email ?? ''); setSheet('email'); } : undefined, false, 2)}
      </View>

      <Text style={styles.sectionTitle}>Password and sign-in</Text>
      <View style={styles.card}>
        {row('key-outline', 'Change password', hasEmail ? 'Email and password sign-in' : 'Set a password to sign in without Google', isSupabaseConfigured ? () => { setPassword(''); setPassword2(''); setSheet('password'); } : undefined, false, 0)}
        {row('logo-google', hasGoogle ? 'Google' : 'Link Google', hasGoogle ? 'Connected. You can sign in with Google' : 'Sign in with your Google account as well', !hasGoogle && isSupabaseConfigured ? () => run(() => actions.linkGoogle(), 'Follow the Google prompt to finish linking.') : undefined, false, 1)}
        {row('time-outline', 'Last sign-in', info?.lastSignInAt ? formatDate(info.lastSignInAt) : '—', undefined, false, 2)}
        {row('log-out-outline', 'Log out of all devices', 'Signs you out everywhere, including this one', () => run(async () => { await actions.signOutEverywhere(); router.replace('/sign-in'); }, 'Signed out everywhere.'), false, 3)}
      </View>

      <Text style={styles.sectionTitle}>Your information</Text>
      <View style={styles.card}>
        {row('download-outline', 'Download your data', 'Profile, posts, questions, instants and messages, in one file', () => { void download(); }, false, 0)}
        {row('sparkles-outline', 'What the coach remembers', 'Notes the AI coach keeps about you', () => (aiCoachOn ? router.push('/coach-memory') : toast.show({ title: 'AI coach is coming soon', body: 'A weekly plan and a coach to ask about your game', icon: 'sparkles' })), false, 1)}
        {row('shield-checkmark-outline', 'Privacy center', 'What we store and who can see it', () => router.push('/privacy'), false, 2)}
        {row('card-outline', 'Payments', 'Coaching you have paid for, and refunds', () => router.push('/payments'), false, 3)}
      </View>

      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.card}>
        {row('swap-horizontal-outline', 'Switch account', 'Pick another login saved on this phone', () => router.push('/accounts'), false, 0)}
        {row('trash-outline', 'Delete account', 'Removes your profile, posts and messages. Cannot be undone.', () => { setConfirmWord(''); setSheet('delete'); }, true, 1)}
      </View>

      <Modal visible={sheet !== null} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        {/* The dimmed page behind is its own button, beside the sheet rather than around it:
            wrapped around it, a click in a password box also counted as a click on the page and closed the sheet. */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
          <Pressable accessibilityLabel="Close" onPress={() => !busy && setSheet(null)} style={StyleSheet.absoluteFill} />
          <View style={styles.sheet}>
            <Wash height={240} strength={0.8} />
            {sheet === 'password' ? (
              <>
                <SheetTitle title="Change password" line={info?.email ? `Create a new password for ${info.email}.` : undefined} onClose={() => setSheet(null)} />
                <View style={styles.sheetBody}>
                  <PasswordFields password={password} again={password2} onPassword={setPassword} onAgain={setPassword2} onSubmit={() => { if (password.length >= 6 && password === password2) void run(() => actions.changePassword(password), 'Password updated.'); }} />
                  {error ? <Text style={styles.error}>{error}</Text> : null}
                  <Submit label="Update password" busy={busy} disabled={password.length < 6 || password !== password2} onPress={() => { void run(() => actions.changePassword(password), 'Password updated.'); }} />
                </View>
              </>
            ) : null}
            {sheet === 'email' ? (
              <>
                <SheetTitle title="Change email" line="We send a link to the new address; the change lands when you tap it." onClose={() => setSheet(null)} />
                <View style={styles.sheetBody}>
                  <Field soft value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="New email" />
                  {error ? <Text style={styles.error}>{error}</Text> : null}
                  <Submit label="Send the link" busy={busy} disabled={!email.includes('@') || email.trim() === info?.email} onPress={() => { void run(() => actions.changeEmail(email), 'Check the new address for a confirmation link.'); }} />
                </View>
              </>
            ) : null}
            {sheet === 'delete' ? (
              <>
                <SheetTitle title="Delete your account?" line="This can't be undone." onClose={() => setSheet(null)} />
                <View style={styles.sheetBody}>
                  <Text style={styles.sheetNote}>Your profile, posts, clips, instants, questions and messages are removed for good. Coaches keep records of paid sessions. Type DELETE to confirm.</Text>
                  <Field soft value={confirmWord} onChangeText={setConfirmWord} autoCapitalize="none" placeholder="DELETE" />
                  {error ? <Text style={styles.error}>{error}</Text> : null}
                  <Button label="Delete my account" variant="danger" loading={busy} disabled={confirmWord.trim() !== 'DELETE'} onPress={() => run(async () => { await actions.deleteAccount(); router.replace('/'); }, 'Account deleted.')} full />
                </View>
              </>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

/** Two soft fields and two live ticks, so it is plain when the password will do. */
function PasswordFields({ password, again, onPassword, onAgain, onSubmit }: { password: string; again: string; onPassword: (v: string) => void; onAgain: (v: string) => void; onSubmit: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const [show, setShow] = useState(false);
  const long = password.length >= 6;
  const same = password.length > 0 && password === again;
  const tick = (ok: boolean, label: string) => (
    <View style={styles.tick}>
      <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={ok ? colors.brand : colors.textFaint} />
      <Text style={[styles.tickText, ok && styles.tickTextOn]}>{label}</Text>
    </View>
  );
  return (
    <View style={{ gap: spacing.md }}>
      <Field soft value={password} onChangeText={onPassword} secureTextEntry={!show} autoCapitalize="none" placeholder="New password" />
      <Field soft value={again} onChangeText={onAgain} secureTextEntry={!show} autoCapitalize="none" placeholder="Confirm new password" onSubmitEditing={onSubmit} />
      <View style={styles.ticks}>
        <View style={{ gap: 6 }}>
          {tick(long, 'At least 6 characters')}
          {tick(same, 'Passwords match')}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={show ? 'Hide passwords' : 'Show passwords'} hitSlop={8} onPress={() => setShow((v) => !v)} style={styles.show}>
          <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={17} color={colors.textMuted} />
          <Text style={styles.showText}>{show ? 'Hide' : 'Show'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Where the reset email lands: one calm page in the sign-in page's look, the
 * mark, two fields, and then a clear "saved" with the way into the app.
 */
function ResetPage({ email, onSave }: { email?: string; onSave: (password: string) => Promise<void> }) {
  const styles = useThemedStyles(styleDefinitions);
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const ok = password.length >= 6 && password === again;
  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError('');
    try { await onSave(password); setDone(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'That didn’t save. Try again.'); }
    finally { setBusy(false); }
  };
  return (
    <View style={styles.page}>
      <Wash height={420} strength={0.85} />
      <ScrollView contentContainerStyle={styles.pageScroll} keyboardShouldPersistTaps="handled">
        <Animated.View key={done ? 'done' : 'form'} entering={FadeIn.duration(320)} style={styles.column}>
          {done ? (
            <>
              <View style={styles.doneIcon}><Ionicons name="checkmark" size={30} color={colors.brand} /></View>
              <View style={{ gap: 6 }}>
                <Text style={styles.pageTitle}>Password updated</Text>
                <Text style={styles.pageLine}>You’re all set. Use your new password the next time you sign in{email ? ` with ${email}` : ''}.</Text>
              </View>
              <Submit label="Continue to CourtSide" onPress={() => router.replace('/')} />
            </>
          ) : (
            <>
              <View style={{ gap: spacing.lg }}>
                <BrandMark size={42} />
                <View style={{ gap: 6 }}>
                  <Text style={styles.pageTitle}>Reset your password</Text>
                  <Text style={styles.pageLine}>{email ? `Create a new password for ${email}.` : 'Create a new password for your CourtSide account.'}</Text>
                </View>
              </View>
              <View style={{ gap: spacing.lg }}>
                <PasswordFields password={password} again={again} onPassword={setPassword} onAgain={setAgain} onSubmit={() => { void save(); }} />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Submit label="Update password" busy={busy} disabled={!ok} onPress={() => { void save(); }} />
                <Pressable accessibilityRole="button" onPress={() => router.replace('/')} hitSlop={8} style={{ alignSelf: 'center' }}>
                  <Text style={styles.notNow}>Cancel</Text>
                </Pressable>
              </View>
            </>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.lg },
  heroName: { ...typography.heading, color: colors.text },
  heroMeta: { ...typography.small, color: colors.textMuted },
  demo: { ...typography.small, color: colors.textFaint, lineHeight: 19, paddingBottom: spacing.md },
  notice: { ...typography.small, color: colors.success, paddingBottom: spacing.sm },
  // The way Settings reads: sentence-case labels, borderless grouped lists a
  // shade off the page, hairlines that start past the icons.
  sectionTitle: { ...typography.smallStrong, color: colors.textMuted, paddingHorizontal: spacing.sm, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  card: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'stretch', paddingLeft: spacing.lg },
  lead: { width: 26, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52, paddingVertical: 11, paddingRight: spacing.lg },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowLabel: { ...typography.body, color: colors.text },
  rowDetail: { ...typography.small, color: colors.textFaint },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: spacing.lg, paddingBottom: spacing.xxl, maxWidth: 520, width: '100%', alignSelf: 'center', overflow: 'hidden' },
  sheetBody: { padding: spacing.lg, gap: spacing.lg },
  ticks: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 4 },
  tick: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tickText: { ...typography.small, color: colors.textFaint },
  tickTextOn: { color: colors.text },
  show: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 2 },
  showText: { ...typography.smallStrong, color: colors.textMuted },
  page: { flex: 1, backgroundColor: colors.bg },
  pageScroll: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl, justifyContent: 'center' },
  column: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: spacing.xxl },
  pageTitle: { ...typography.display, fontSize: 32, letterSpacing: -1.1, color: colors.text },
  pageLine: { ...typography.body, fontSize: 16, lineHeight: 23, color: colors.textMuted },
  doneIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  notNow: { ...typography.smallStrong, fontSize: 14, color: colors.textMuted },
  sheetNote: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  error: { ...typography.small, color: colors.danger },
});

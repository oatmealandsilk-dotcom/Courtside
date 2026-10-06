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
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { formatDate } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { confirm } from '@/lib/confirm';
import { useAiCoachOn } from '@/features/aiCoach/switch';
import { usePaidBooking } from '@/features/coaching/bookings';
import { useGateSpace } from '@/lib/useGateSpace';
import { KeyboardScrollContext, useKeyboardReveal } from '@/lib/keyboardScroll';
import { KEYBOARD_ROOM, useKeyboardRoom } from '@/lib/keyboardRoom';
import { StatusShade } from '@/components/StatusShade';
import { colors, radius, spacing, typography, lift } from '@/theme';
import { useModalSheetBottom } from '@/lib/modalSheet';

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
  const paidBooking = usePaidBooking();
  const [info, setInfo] = useState<Awaited<ReturnType<typeof actions.accountInfo>>>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  // The sheets clear Android's navigation bar, and a message meanwhile shows as the phone's own alert (modalSheet).
  const sheetBottom = useModalSheetBottom(sheet !== null, spacing.xxl);
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

  // Link Google. On a phone the Google sheet has already closed (linked or
  // not) by the time this resolves, so the row and the line under the title
  // say which at once; before, they said to follow a prompt that had gone,
  // and the row said Link until the page was opened again. On the web the
  // page itself goes to Google and comes back here.
  const linkGoogle = async () => {
    if (Platform.OS === 'web') { await run(() => actions.linkGoogle(), 'Follow the Google prompt to finish linking.'); return; }
    setBusy(true);
    setError('');
    try {
      await actions.linkGoogle();
      const next = await actions.accountInfo().catch(() => null);
      if (next) setInfo(next);
      say(next?.providers.includes('google') ? 'Google linked.' : 'Google was not linked.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const hasGoogle = info?.providers.includes('google') ?? false;
  const hasEmail = info?.providers.includes('email') ?? false;
  // On an iPhone, deleting an account made with Apple asks Apple to confirm once more (so CourtSide leaves the Apple ID too).
  const appleConfirm = Platform.OS === 'ios' && (info?.providers.includes('apple') ?? false);

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
    if (Platform.OS === 'android') {
      // Android's plain share sends only words: the whole file pasted into a
      // message, and for a big account too long for Android to hand over at
      // all. So it goes as a file, the way a post's original does (Oct 5).
      try {
        const file = new File(Paths.cache, `courtside-${currentUser?.handle ?? 'me'}.json`);
        if (file.exists) file.delete();
        file.create();
        file.write(data);
        await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'My CourtSide data' });
      } catch {
        setError('Your data could not be prepared. Try again in a moment.');
      }
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
      <View style={styles.lead}><Ionicons name={icon} size={19} color={danger ? colors.danger : colors.textMuted} /></View>
      <View style={[styles.rowBody, index > 0 && styles.rowBorder]}>
        <Text style={[styles.rowLabel, danger && { color: colors.danger }]} numberOfLines={1}>{label}</Text>
        {detail ? <Text style={styles.rowDetail} numberOfLines={1}>{detail}</Text> : null}
        {onPress ? <Ionicons name="chevron-forward" size={15} color={colors.textFaint} /> : null}
      </View>
    </Pressable>
  );

  // Straight off the reset email: a page of its own, not a sheet over settings.
  if (reset) return <ResetPage email={info?.email} onSave={(pw) => actions.changePassword(pw)} />;

  return (
    <Screen title="Account center" compactTitle onBack={() => goBack()}>
      {currentUser ? (
        <View style={styles.hero}>
          <Avatar name={currentUser.name} seed={currentUser.avatarSeed} uri={currentUser.avatarUrl} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName}>{currentUser.name}</Text>
            <Text style={styles.heroMeta}>@{currentUser.handle}</Text>
          </View>
        </View>
      ) : null}

      {!isSupabaseConfigured ? <Text style={styles.demo}>This is the demo build. There is no real account behind this screen, so the sign-in and password options do nothing.</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <Text style={styles.sectionTitle}>Profile</Text>
      <View style={styles.card}>
        {row('person-outline', 'Name, bio and city', undefined, () => router.push('/edit-profile'), false, 0)}
        {row('at-outline', 'Handle', `@${currentUser?.handle ?? ''}`, () => router.push('/change-handle'), false, 1)}
        {row('mail-outline', 'Email', info?.email ? (info.emailConfirmed ? info.email : 'Not confirmed') : undefined, isSupabaseConfigured ? () => { setEmail(info?.email ?? ''); setSheet('email'); } : undefined, false, 2)}
      </View>

      <Text style={styles.sectionTitle}>Sign-in</Text>
      <View style={styles.card}>
        {row('key-outline', hasEmail ? 'Change password' : 'Set a password', undefined, isSupabaseConfigured ? () => { setPassword(''); setPassword2(''); setSheet('password'); } : undefined, false, 0)}
        {/* Android (Oct 5): linking Google there would bring the login back in an address any
            Android app can claim, so the row only shows once it is linked (on an iPhone or the website). */}
        {Platform.OS !== 'android' || hasGoogle ? row('logo-google', 'Google', hasGoogle ? 'Connected' : 'Link', !hasGoogle && isSupabaseConfigured ? () => { void linkGoogle(); } : undefined, false, 1) : null}
        {row('time-outline', 'Last sign-in', info?.lastSignInAt ? formatDate(info.lastSignInAt) : undefined, undefined, false, 2)}
        {row('log-out-outline', 'Log out everywhere', undefined, () => confirm({ title: 'Log out everywhere?', message: "You'll be logged out on every phone and computer, this one included.", confirmLabel: 'Log out', destructive: true, onConfirm: () => run(async () => { await actions.signOutEverywhere(); router.replace('/sign-in'); }, 'Signed out everywhere.') }), false, 3)}
      </View>

      <Text style={styles.sectionTitle}>Your data</Text>
      <View style={styles.card}>
        {/* Payments and Coach memory only show once there is something behind them: paid booking
            open to this person, and the AI coach switched on (confirmed, not just "not off yet").
            Nothing here says "coming soon" (App Review 2.1, Oct 5). */}
        {[
          row('shield-checkmark-outline', 'Privacy', undefined, () => router.push('/privacy'), false, 0),
          paidBooking ? row('card-outline', 'Payments', undefined, () => router.push('/payments'), false, 1) : null,
          aiCoachOn === true ? row('sparkles-outline', 'Coach memory', undefined, () => router.push('/coach-memory'), false, 1) : null,
          row('download-outline', 'Download your data', undefined, () => { void download(); }, false, 1),
        ].filter(Boolean)}
      </View>

      <View style={[styles.card, { marginTop: spacing.xl }]}>
        {row('swap-horizontal-outline', 'Switch account', undefined, () => router.push('/accounts'), false, 0)}
        {row('trash-outline', 'Delete account', undefined, () => { setConfirmWord(''); setSheet('delete'); }, true, 1)}
      </View>

      <Modal visible={sheet !== null} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        {/* The dimmed page behind is its own button, beside the sheet rather than around it:
            wrapped around it, a click in a password box also counted as a click on the page and closed the sheet. */}
        {/* Android (edge to edge) does not shrink the sheet's window for the keyboard either, so it is lifted the same way. */}
        <KeyboardAvoidingView behavior={Platform.OS === 'web' ? undefined : 'padding'} style={styles.backdrop}>
          <Pressable accessibilityLabel="Close" onPress={() => !busy && setSheet(null)} style={StyleSheet.absoluteFill} />
          <View style={[styles.sheet, { paddingBottom: sheetBottom }]}>
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
                  <Text style={styles.sheetNote}>Your profile, posts, clips, Instants, questions and messages are removed for good.{paidBooking ? ' Coaches keep records of paid sessions.' : ''} Type DELETE to confirm.{appleConfirm ? ' Apple then asks you to confirm once more, so CourtSide is also removed from your Apple ID.' : ''}</Text>
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
  // No header bar here either: the same clearance from the status bar and home bar as sign-in.
  const space = useGateSpace();
  // The phone scrolls the box you tapped above the keyboard, as every Screen does.
  const keyboard = useKeyboardReveal();
  // Android: room under the fields for the keyboard (see keyboardRoom).
  const keyboardRoom = useKeyboardRoom(space.bottom);
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
    <KeyboardScrollContext.Provider value={keyboard.reveal}>
    <View style={styles.page}>
      <Wash height={420} strength={0.85} />
      <ScrollView
        ref={keyboard.scroller}
        onScroll={keyboard.onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.pageScroll, { paddingTop: space.top, paddingBottom: space.bottom }]}
        keyboardShouldPersistTaps="handled"
        // The keyboard adds room below the fields, so the box you tapped and the
        // Update button can be scrolled clear of it; a drag down puts it away.
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        keyboardDismissMode={Platform.OS === 'android' ? 'on-drag' : 'interactive'}
      >
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
        {KEYBOARD_ROOM ? <Animated.View pointerEvents="none" style={keyboardRoom} /> : null}
      </ScrollView>
      <StatusShade wash={{ height: 420, strength: 0.85 }} />
    </View>
    </KeyboardScrollContext.Provider>
  );
}

const styleDefinitions = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.sm },
  heroName: { ...typography.heading, color: colors.text },
  heroMeta: { ...typography.small, color: colors.textMuted },
  demo: { ...typography.small, color: colors.textFaint, lineHeight: 19, paddingBottom: spacing.md },
  notice: { ...typography.small, color: colors.success, paddingBottom: spacing.sm },
  // Quiet, the way Settings reads: short labels, the value at the right,
  // flat grouped lists with a hairline edge instead of a raised shadow.
  sectionTitle: { ...typography.small, color: colors.textFaint, paddingHorizontal: spacing.sm, paddingTop: spacing.xl, paddingBottom: 6 },
  card: { borderRadius: 16, backgroundColor: colors.surface, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'stretch', paddingLeft: spacing.lg },
  lead: { width: 22, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingVertical: 10, paddingRight: spacing.md },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowLabel: { ...typography.body, fontSize: 15, color: colors.text, flex: 1 },
  rowDetail: { ...typography.small, fontSize: 14, color: colors.textFaint, maxWidth: '55%' },
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
  // Top and bottom padding come from useGateSpace, clear of the status bar and the home bar.
  pageScroll: { flexGrow: 1, paddingHorizontal: spacing.xl, justifyContent: 'center' },
  column: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: spacing.xxl },
  pageTitle: { ...typography.display, fontSize: 32, letterSpacing: -1.1, color: colors.text },
  pageLine: { ...typography.body, fontSize: 16, lineHeight: 23, color: colors.textMuted },
  doneIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  notNow: { ...typography.smallStrong, fontSize: 14, color: colors.textMuted },
  sheetNote: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  error: { ...typography.small, color: colors.danger },
});

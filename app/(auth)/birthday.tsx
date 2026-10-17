import React, { useEffect, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { BrandMark } from '@/components/BrandMark';
import { BirthDateField } from '@/components/BirthDateField';
import { Button } from '@/components/ui';
import { isDeviceBlocked, toBirthDate } from '@/features/age/ageCheck';
import { useLeave } from '@/components/LeaveCurtain';
import { useApp } from '@/store/AppContext';
import { useGateSpace } from '@/lib/useGateSpace';
import { useAndroidBack } from '@/lib/androidBack';
import { goBack } from '@/lib/goBack';
import { StatusShade } from '@/components/StatusShade';
import { KeyboardScrollContext, useKeyboardReveal } from '@/lib/keyboardScroll';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

/**
 * The age check. The birthday is optional (Oct 17: Apple turned down build
 * 17 under 5.1.1(v), "Update the app to not require users to provide ...
 * Date of birth"): "Skip for now" asks only "Are you 13 or older?", a yes or
 * no, and the app goes on with the teen rules until a birthday is added in
 * Settings, Account center (which opens this same page, ?from=settings).
 * The date stays private. Under 13, by date or by answer, the account is
 * removed and this phone will not ask again.
 */
export default function Birthday() {
  const { leave, curtain } = useLeave();
  const styles = useThemedStyles(styleDefinitions);
  // Clear of the status bar and the home bar, the same as every page before the app.
  const space = useGateSpace();
  // The date boxes are scrolled clear of the keyboard as they are tapped (a short phone, a big keyboard).
  const keyboard = useKeyboardReveal();
  const { currentUserId, currentUser, actions } = useApp();
  // Opened from Settings to add a birthday later: a page on top of the app, with a way back.
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromSettings = from === 'settings';
  const [date, setDate] = useState({ month: '', day: '', year: '' });
  // 'date': the birthday boxes. 'skip': "Are you 13 or older?" instead.
  const [step, setStep] = useState<'date' | 'skip'>('date');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  // Android's Back leaves the app, as on any first page (see agree.tsx): this
  // is the age check every new account is shown. From Settings it goes back
  // there; on the 13-or-older question it goes back to the birthday boxes.
  useAndroidBack(() => {
    if (step === 'skip') { setStep('date'); setError(''); return true; }
    if (fromSettings) { goBack(); return true; }
    BackHandler.exitApp();
    return true;
  });
  useEffect(() => { void isDeviceBlocked().then((b) => { if (b) setBlocked(true); }); }, []);
  // An account that opened on a phone after its under-13 answer, with no age
  // on file (a new Apple or Google sign-in takes no birthday first): one made
  // just now is removed, the same as an under-13 answer removes one, so
  // nothing of it is kept. Any other can sign out with the button below.
  const noAge = !!currentUser && !currentUser.ageGroup;
  useEffect(() => { if (blocked && currentUserId && noAge) void actions.removeNewAccountOnBlockedPhone(); }, [blocked, currentUserId, noAge, actions]);
  // The age is on file after all (the sign-up form's birthday was saved a
  // moment after this page opened): carry on into the app rather than ask again.
  useEffect(() => { if (currentUser?.ageGroup && !blocked && !fromSettings) leave(() => router.replace('/')); }, [currentUser?.ageGroup, blocked, fromSettings, leave]);
  const done = () => (fromSettings ? goBack() : leave(() => router.replace('/')));

  const submit = async () => {
    if (busy) return;
    const birthDate = toBirthDate(date.month, date.day, date.year);
    if (!birthDate) { setError('Enter a real date, like 04 17 2008.'); return; }
    setBusy(true);
    setError('');
    try {
      const result = await actions.confirmBirthDate(birthDate);
      if (result === 'under13') { setBlocked(true); return; }
      done();
    } catch {
      setError('Could not save that. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  const over13 = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await actions.skipBirthday();
      leave(() => router.replace('/'));
    } catch {
      setError('Could not save that. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  const under13 = async () => {
    if (busy) return;
    setBusy(true);
    try { await actions.declareUnder13(); } finally { setBusy(false); setBlocked(true); }
  };

  if (blocked) {
    return (
      <View style={[styles.root, styles.centre, { paddingTop: space.top }]}>
        <BrandMark size={56} />
        <Text style={styles.title}>CourtSide isn't available to you yet</Text>
        <Text style={styles.lead}>You need to be a bit older to have an account. Nothing you entered has been kept.</Text>
        {/* Signed in, there was no way off this page: the account signs out here. */}
        {currentUserId
          ? <Button label="Sign out" variant="ghost" onPress={() => leave(() => { actions.signOut(); router.replace('/sign-in'); })} />
          : <Button label="Back to sign in" variant="ghost" onPress={() => router.replace('/sign-in')} />}
        {curtain}
      </View>
    );
  }

  if (step === 'skip') {
    // Two answers of the same size: the question does not lean towards either.
    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: space.top, paddingBottom: space.bottom }]}>
          <BrandMark size={44} />
          <Text style={styles.title}>Are you 13 or older?</Text>
          <Text style={styles.lead}>No birthday needed.</Text>
          <View style={styles.answers}>
            <Button label="I'm 13 or older" variant="secondary" loading={busy} onPress={() => { void over13(); }} full />
            <Button label="I'm under 13" variant="secondary" disabled={busy} onPress={() => { void under13(); }} full />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {/* Said plainly, before they choose: what no birthday means. */}
          <Text style={styles.small}>
            Without a birthday you get the same protections as players under 18: your account starts private, only people you follow can message you, and on the map only friends who follow you back see you. You can add your birthday anytime in Settings → Account center.
          </Text>
          <Pressable accessibilityRole="button" onPress={() => { setStep('date'); setError(''); }} hitSlop={8} style={styles.linkWrap}>
            <Text style={styles.link}>Add my birthday instead</Text>
          </Pressable>
        </ScrollView>
        <StatusShade />
        {curtain}
      </View>
    );
  }

  return (
    <KeyboardScrollContext.Provider value={Platform.OS === 'web' ? null : keyboard.reveal}>
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
      <ScrollView ref={keyboard.scroller} onScroll={keyboard.onScroll} scrollEventThrottle={16} contentContainerStyle={[styles.scroll, { paddingTop: space.top, paddingBottom: space.bottom }]} keyboardShouldPersistTaps="handled">
        <BrandMark size={44} />
        <Text style={styles.title}>When's your birthday?</Text>
        {/* Why we ask, honestly, and that it is up to them (Oct 17). */}
        <Text style={styles.lead}>Optional. It helps us keep younger players safe, and it stays private: it never shows on your profile.</Text>
        <Text style={styles.small}>At 18 and over it opens up meeting new players: being seen on the map by players nearby and hearing from players you don't follow yet.</Text>
        <BirthDateField month={date.month} day={date.day} year={date.year} onChange={setDate} onSubmit={submit} label="Birthday (optional)" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.answers}>
          <Button label={fromSettings ? 'Save' : 'Continue'} loading={busy} disabled={!date.month || !date.day || date.year.length !== 4} onPress={submit} full />
          {fromSettings
            ? <Button label="Not now" variant="ghost" disabled={busy} onPress={() => goBack()} full />
            : <Button label="Skip for now" variant="ghost" disabled={busy} onPress={() => { setStep('skip'); setError(''); }} full />}
        </View>
      </ScrollView>
      {/* With the keyboard up the page can scroll; it stops at the status bar, not under the clock. */}
      <StatusShade />
      {curtain}
    </KeyboardAvoidingView>
    </KeyboardScrollContext.Provider>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  centre: { alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.lg, maxWidth: 460, width: '100%', alignSelf: 'center' },
  title: { ...typography.title, color: colors.text, textAlign: 'left' },
  lead: { ...typography.body, color: colors.textMuted },
  small: { ...typography.small, color: colors.textMuted },
  answers: { gap: spacing.sm },
  linkWrap: { alignSelf: 'flex-start' },
  link: { ...typography.smallStrong, color: colors.text, textDecorationLine: 'underline' },
  error: { ...typography.small, color: colors.danger },
});

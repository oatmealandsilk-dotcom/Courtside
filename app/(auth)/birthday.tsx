import React, { useEffect, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/ui';
import { AgeReadout, AnswerCard, FooterFade, PrivacyLine, ProtectionsCard, Rise, UnlockCard } from '@/components/age/AgeBits';
import { BirthdaySegments } from '@/components/age/BirthdaySegments';
import { DateWheel, EMPTY_WHEEL, type WheelDate } from '@/components/age/DateWheel';
import { isDeviceBlocked, toBirthDate } from '@/features/age/ageCheck';
import { birthdayLook } from '@/features/age/birthdayLook';
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
 *
 * Redrawn Oct 17 (owner: "Make the UI of the what's your birthday and are
 * you 13 years or older ... a lot better"), in two designs to choose from on
 * the website with ?bdaylook=a (a date wheel) or ?bdaylook=b (three big
 * boxes, the one phones get); see birthdayLook.ts. Both keep Skip for now as plain to see as
 * Continue, and the two answers to the 13 question exactly alike.
 */
export default function Birthday() {
  const { leave, curtain } = useLeave();
  const styles = useThemedStyles(styleDefinitions);
  const look = birthdayLook();
  // Clear of the status bar and the home bar, the same as every page before the app.
  const space = useGateSpace();
  // A short phone (an iPhone SE): the mark goes, the wheel is a little lower and the 18+ card is
  // tighter, so the buttons never leave the screen and "works without it" is never hidden under them.
  const short = useWindowDimensions().height < 720;
  // The date boxes are scrolled clear of the keyboard as they are tapped (a short phone, a big keyboard).
  const keyboard = useKeyboardReveal();
  const { currentUserId, currentUser, actions } = useApp();
  // Opened from Settings to add a birthday later: a page on top of the app, with a way back.
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromSettings = from === 'settings';
  const [date, setDate] = useState({ month: '', day: '', year: '' });
  // The wheel starts on "Month / Day / Year", no date at all; Continue waits until all three are picked.
  const [wheel, setWheel] = useState<WheelDate>(EMPTY_WHEEL);
  // 'date': the birthday. 'skip': "Are you 13 or older?" instead.
  const [step, setStep] = useState<'date' | 'skip'>('date');
  const [answer, setAnswer] = useState<'over' | 'under' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  // Android's Back leaves the app, as on any first page (see agree.tsx): this
  // is the age check every new account is shown. From Settings it goes back
  // there; on the 13-or-older question it goes back to the birthday.
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

  // The date as typed or as rolled, in one shape.
  const parts = look === 'a'
    ? (wheel.month !== null && wheel.day !== null && wheel.year !== null
      ? { month: String(wheel.month + 1), day: String(wheel.day), year: String(wheel.year) }
      : { month: '', day: '', year: '' })
    : date;
  const ready = !!parts.month && !!parts.day && parts.year.length === 4 && !!toBirthDate(parts.month, parts.day, parts.year);

  const submit = async () => {
    if (busy) return;
    const birthDate = toBirthDate(parts.month, parts.day, parts.year);
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
        <Text style={[styles.title, styles.centred]}>CourtSide isn't available to you yet</Text>
        <Text style={[styles.lead, styles.centred]}>You need to be a bit older to have an account. Nothing you entered has been kept.</Text>
        {/* Signed in, there was no way off this page: the account signs out here. */}
        {currentUserId
          ? <Button label="Sign out" variant="ghost" onPress={() => leave(() => { actions.signOut(); router.replace('/sign-in'); })} />
          : <Button label="Back to sign in" variant="ghost" onPress={() => router.replace('/sign-in')} />}
        {curtain}
      </View>
    );
  }

  if (step === 'skip') {
    // Two answers drawn exactly alike: the question does not lean towards either.
    return (
      <View style={styles.root}>
        <ScrollView style={styles.fill} contentContainerStyle={[styles.scroll, short && styles.scrollShort, { paddingTop: space.top }]}>
          <Rise style={styles.head}>
            {short ? null : <BrandMark size={40} />}
            <Text style={styles.title}>Are you 13 or older?</Text>
            <Text style={styles.lead}>No birthday needed. Just pick one.</Text>
          </Rise>
          <Rise delay={70} style={styles.answers}>
            <View accessibilityRole="radiogroup" aria-label="Are you 13 or older?" style={styles.answers}>
              <AnswerCard badge="13+" title="I'm 13 or older" detail="13 or older today" selected={answer === 'over'} disabled={busy} onPress={() => { setAnswer('over'); setError(''); }} />
              <AnswerCard badge="<13" title="I'm under 13" detail="12 or younger today" selected={answer === 'under'} disabled={busy} onPress={() => { setAnswer('under'); setError(''); }} />
            </View>
          </Rise>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Rise delay={140}>
            <ProtectionsCard />
          </Rise>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: space.footer }]}>
          <FooterFade />
          <Button
            label="Continue"
            loading={busy}
            disabled={!answer}
            onPress={() => { if (answer === 'over') void over13(); else if (answer === 'under') void under13(); }}
            full
          />
          {/* The way back to the birthday stays in sight on the shortest phone, under Continue. */}
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setStep('date'); setError(''); setAnswer(null); }} hitSlop={10} style={styles.linkWrap}>
            <Text style={styles.link}>Add my birthday instead</Text>
          </Pressable>
        </View>
        <StatusShade />
        {curtain}
      </View>
    );
  }

  return (
    <KeyboardScrollContext.Provider value={Platform.OS === 'web' ? null : keyboard.reveal}>
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
      <ScrollView ref={keyboard.scroller} onScroll={keyboard.onScroll} scrollEventThrottle={16} style={styles.fill} contentContainerStyle={[styles.scroll, short && styles.scrollShort, { paddingTop: space.top }]} keyboardShouldPersistTaps="handled">
        <Rise style={styles.head}>
          {short ? null : <BrandMark size={40} />}
          <Text style={styles.title}>{fromSettings ? 'Add your birthday' : "When's your birthday?"}</Text>
          {/* Why we ask, honestly, and that it is up to them (Oct 17). */}
          {/* On a short phone the 18+ card drops its last line, so it is said here instead. */}
          <Text style={styles.lead}>{short ? 'Optional. It helps us keep younger players safe. Everything works without it.' : 'Optional. It helps us keep younger players safe.'}</Text>
        </Rise>
        <Rise delay={70} style={styles.picker}>
          {look === 'a'
            ? <DateWheel value={wheel} onChange={(next) => { setWheel(next); setError(''); }} rowHeight={short ? 34 : 42} label="Birthday (optional)" />
            : <BirthdaySegments value={date} onChange={(next) => { setDate(next); setError(''); }} onSubmit={() => { if (ready) void submit(); }} />}
          <AgeReadout {...parts} error={error} hint={look === 'a' ? 'Roll each wheel to your birthday' : 'Month, day and year'} />
          <PrivacyLine />
        </Rise>
        <Rise delay={140}>
          <UnlockCard compact={short} />
        </Rise>
      </ScrollView>
      {/* Continue and Skip for now stay on screen, side by side in weight, whatever the page's length. */}
      <View style={[styles.footer, { paddingBottom: space.footer }]}>
        <FooterFade />
        <Button label={fromSettings ? 'Save' : 'Continue'} loading={busy} disabled={!ready} onPress={() => { void submit(); }} full />
        {fromSettings
          ? <Button label="Not now" variant="secondary" disabled={busy} onPress={() => goBack()} full />
          : <Button label="Skip for now" variant="secondary" disabled={busy} onPress={() => { setStep('skip'); setError(''); }} full />}
      </View>
      {/* With the keyboard up the page can scroll; it stops at the status bar, not under the clock. */}
      <StatusShade />
      {curtain}
    </KeyboardAvoidingView>
    </KeyboardScrollContext.Provider>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  centre: { alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  centred: { textAlign: 'center' },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, gap: spacing.xl, maxWidth: 460, width: '100%', alignSelf: 'center' },
  scrollShort: { gap: spacing.lg },
  head: { gap: spacing.sm },
  title: { ...typography.display, color: colors.text, marginTop: spacing.xs },
  lead: { ...typography.body, color: colors.textMuted, lineHeight: 21 },
  picker: { gap: spacing.md },
  answers: { gap: spacing.md },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.sm, maxWidth: 460, width: '100%', alignSelf: 'center' },
  linkWrap: { alignSelf: 'center', paddingVertical: spacing.xs },
  link: { ...typography.smallStrong, color: colors.textMuted, textDecorationLine: 'underline' },
  error: { ...typography.small, color: colors.danger },
});

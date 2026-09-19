import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';

import { goBack } from '@/lib/goBack';
import { Button, Field, Screen } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import type { CoachApplication, CoachSpecialty } from '@/data/types';
import * as haptics from '@/lib/haptics';
import { colors, radius, spacing, typography } from '@/theme';

const SPECIALTIES: { value: CoachSpecialty; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'serve', label: 'Serve', icon: 'arrow-up-circle-outline' },
  { value: 'forehand', label: 'Forehand', icon: 'arrow-forward-circle-outline' },
  { value: 'backhand', label: 'Backhand', icon: 'arrow-back-circle-outline' },
  { value: 'volleys', label: 'Volleys', icon: 'hand-left-outline' },
  { value: 'footwork', label: 'Footwork', icon: 'footsteps-outline' },
  { value: 'strategy', label: 'Strategy', icon: 'grid-outline' },
  { value: 'mental', label: 'Mental', icon: 'bulb-outline' },
  { value: 'fitness', label: 'Fitness', icon: 'barbell-outline' },
  { value: 'juniors', label: 'Juniors', icon: 'people-outline' },
];

const STEPS = [
  { title: 'About you', lead: 'How we reach you about your application.' },
  { title: 'Your rating', lead: 'A link to your rating page, so we can check it in one click.' },
  { title: 'Your coaching', lead: 'Experience, certifications, and what you teach.' },
  { title: 'Proof', lead: 'A résumé and people who can vouch for you. Both help.' },
  { title: 'How you coach', lead: 'The first thing players read on your listing.' },
  { title: 'Review', lead: 'Check it over, then send it in.' },
];

const ABOUT_MIN = 40;

/** "app.utrsports.net/profiles/123" and "https://…" both become a full link. */
const asLink = (raw: string) => {
  const s = raw.trim();
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};
// A UTR profile lives on utrsports.net; an NTRP rating on usta.com.
const isUtrLink = (raw: string) => /^https?:\/\/([a-z0-9-]+\.)*utrsports\.net\/\S+/i.test(asLink(raw));
const isUstaLink = (raw: string) => /^https?:\/\/([a-z0-9-]+\.)*usta\.com\/\S*/i.test(asLink(raw));

const STATUS_TEXT: Record<CoachApplication['status'], { title: string; body: string; icon: keyof typeof Ionicons.glyphMap }> = {
  submitted: { title: 'Application received', body: 'We review credentials, ratings and references by hand. You will get a notification here when there is news, and we will email or call if we need anything more.', icon: 'checkmark' },
  'in-review': { title: 'Being reviewed', body: 'Someone is going through your application now. You will get a notification here when it is decided.', icon: 'time-outline' },
  approved: { title: 'You are approved', body: 'Welcome to CourtSide coaching. Your coach badge and listing are on their way.', icon: 'ribbon' },
  rejected: { title: 'Not approved this time', body: 'Thanks for applying. The notification we sent explains why, and you are welcome to apply again later.', icon: 'close' },
};

/**
 * Applying to coach, one step at a time, the way the setup quiz works: a
 * progress line along the top, one short page per topic, Continue checks
 * the page before moving on and says exactly what is missing, and a review
 * page shows everything before it is sent. The rating step asks for a link
 * to the applicant's UTR or USTA page, so a reviewer can check it in a click.
 */
export default function CoachApply() {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { currentUser, coachApplications, actions } = useApp();
  const existing = coachApplications.find((a) => a.userId === currentUser?.id);

  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState(currentUser?.name ?? '');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [utr, setUtr] = useState('');
  const [utrLink, setUtrLink] = useState('');
  const [ntrp, setNtrp] = useState('');
  const [ntrpLink, setNtrpLink] = useState('');
  const [whereOpen, setWhereOpen] = useState(false);
  const [years, setYears] = useState('');
  const [certifications, setCertifications] = useState('');
  const [specialties, setSpecialties] = useState<CoachSpecialty[]>([]);
  const [clients, setClients] = useState('');
  const [resume, setResume] = useState<{ uri: string; name: string; mimeType?: string } | null>(null);
  const [references, setReferences] = useState('');
  const [about, setAbout] = useState('');
  // A page's problems show only after Continue was tapped on it, never while someone is still typing.
  const [tried, setTried] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const progress = useRef(new Animated.Value(1 / STEPS.length)).current;
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(progress, { toValue: (step + 1) / STEPS.length, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step, progress, fade]);

  // "8", "8 years" and "about 8" all mean 8.
  const yearsNumber = Number((years.match(/\d+/) ?? ['0'])[0]);

  /** What is wrong on each page, field by field; an empty object means the page is complete. */
  const problems = (page: number): Record<string, string> => {
    const p: Record<string, string> = {};
    if (page === 0) {
      if (fullName.trim().length < 3) p.fullName = 'Your full name, as on your ID.';
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) p.email = 'An email we can reach you at.';
      if (phone.replace(/\D/g, '').length < 7) p.phone = 'A phone number, in case we need to call.';
    }
    if (page === 1) {
      if (utrLink.trim() && !isUtrLink(utrLink)) p.utrLink = 'That does not look like a UTR profile link. It starts with app.utrsports.net/profiles/…';
      if (ntrpLink.trim() && !isUstaLink(ntrpLink)) p.ntrpLink = 'That does not look like a USTA link. It should be a page on usta.com.';
      if (!utrLink.trim() && !ntrpLink.trim()) p.rating = 'Add a link to your UTR profile or your USTA rating page, at least one.';
    }
    if (page === 2) {
      if (yearsNumber <= 0) p.years = 'How many years you have coached, as a number.';
      if (certifications.trim().length < 4) p.certifications = 'Your certifications, or "none yet".';
      if (!specialties.length) p.specialties = 'Pick at least one thing you coach.';
    }
    if (page === 4) {
      if (about.trim().length < ABOUT_MIN) p.about = `A little more, please: ${ABOUT_MIN - about.trim().length} more characters.`;
    }
    return p;
  };
  const shown = (page: number) => (tried.has(page) ? problems(page) : {});
  const now = shown(step);

  const next = () => {
    const p = problems(step);
    if (Object.keys(p).length) {
      setTried((t) => new Set(t).add(step));
      haptics.untap();
      return;
    }
    haptics.tap();
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const back = () => (step === 0 ? goBack() : setStep((s) => s - 1));

  const submit = async () => {
    if (busy) return;
    // Every page is checked again; the first one with a problem opens.
    const firstBad = [0, 1, 2, 4].find((page) => Object.keys(problems(page)).length > 0);
    if (firstBad !== undefined) {
      setTried((t) => new Set(t).add(firstBad));
      setStep(firstBad);
      return;
    }
    setBusy(true);
    setSendError('');
    try {
      await actions.submitCoachApplication({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        utr: utr.trim() || undefined,
        ntrp: ntrp.trim() || undefined,
        utrLink: utrLink.trim() ? asLink(utrLink) : undefined,
        ntrpLink: ntrpLink.trim() ? asLink(ntrpLink) : undefined,
        yearsCoaching: yearsNumber,
        certifications: certifications.trim(),
        resumeLabel: resume?.name,
        currentClients: clients.trim(),
        specialties,
        references: references.trim(),
        about: about.trim(),
      }, resume ?? undefined);
      setSubmitted(true);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Could not send your application. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const pickResume = async () => {
    if (resume) { setResume(null); return; }
    const picked = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], copyToCacheDirectory: true });
    const file = !picked.canceled ? picked.assets[0] : undefined;
    if (file) setResume({ uri: file.uri, name: file.name, mimeType: file.mimeType ?? undefined });
  };

  // Already applied (or just did): where it stands, instead of the form.
  if (submitted || existing) {
    const status = STATUS_TEXT[existing?.status ?? 'submitted'];
    const stage = ({ submitted: 0, 'in-review': 1, approved: 3, rejected: -1 } as const)[existing?.status ?? 'submitted'];
    return (
      <Screen title="Your application" compactTitle onBack={() => goBack()}>
        <View style={styles.done}>
          <View style={[styles.doneIcon, existing?.status === 'rejected' && { backgroundColor: colors.textMuted }]}>
            <Ionicons name={status.icon} size={32} color={colors.brandInk} />
          </View>
          <Text style={styles.doneTitle}>{status.title}</Text>
          <Text style={styles.doneBody}>{status.body}</Text>
          {stage >= 0 ? (
            <View style={styles.stepsCard}>
              {['Identity and credential check', 'Rating check (UTR / NTRP)', 'Reference call', 'Listed as a coach on CourtSide'].map((label, index) => (
                <View key={label} style={styles.stepRow}>
                  <View style={[styles.stepDot, index <= stage && styles.stepDotOn]}>
                    {index < stage ? <Ionicons name="checkmark" size={14} color={colors.brandInk} /> : <Text style={[styles.stepNum, index <= stage && { color: colors.brandInk }]}>{index + 1}</Text>}
                  </View>
                  <Text style={styles.stepLabel}>{label}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <Button label="Back to coaching" onPress={() => router.replace('/(tabs)/coaches')} full />
        </View>
      </Screen>
    );
  }

  const last = step === STEPS.length - 1;
  const error = (key: string) => (now[key] ? <Text style={styles.fieldError}>{now[key]}</Text> : null);

  return (
    <KeyboardAvoidingView style={[styles.root, { paddingTop: insets.top + spacing.sm }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.head}>
        <View style={styles.topRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={step === 0 ? 'Close' : 'Back'} onPress={back} hitSlop={10}>
            <Ionicons name={step === 0 ? 'close' : 'chevron-back'} size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.kicker}>Apply to coach</Text>
          <Text style={styles.count}>{step + 1} / {STEPS.length}</Text>
        </View>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
        </View>
        <Text style={styles.title}>{STEPS[step].title}</Text>
        <Text style={styles.lead}>{STEPS[step].lead}</Text>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Animated.View style={{ gap: spacing.lg, opacity: fade }}>
          {step === 0 ? (
            <>
              <View>
                <Field label="Full legal name" value={fullName} onChangeText={setFullName} placeholder="As it appears on your ID" autoCapitalize="words" />
                {error('fullName')}
              </View>
              <View>
                <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" />
                {error('email')}
              </View>
              <View>
                <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="+1 555 010 0100" keyboardType="phone-pad" />
                {error('phone')}
              </View>
              <View style={styles.note}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
                <Text style={styles.noteText}>Only the CourtSide team sees these. They never show on your listing.</Text>
              </View>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <View style={styles.ratingCard}>
                <View style={styles.ratingHead}>
                  <View style={styles.ratingBadge}><Text style={styles.ratingBadgeText}>UTR</Text></View>
                  <Text style={styles.ratingTitle}>Universal Tennis Rating</Text>
                </View>
                <Field label="Your UTR profile link" value={utrLink} onChangeText={setUtrLink} placeholder="app.utrsports.net/profiles/1234567" autoCapitalize="none" keyboardType="url" />
                {error('utrLink')}
                <Field label="Your UTR (optional)" value={utr} onChangeText={setUtr} placeholder="e.g. 11.2" keyboardType="decimal-pad" />
                {isUtrLink(utrLink) ? <LinkCheck url={asLink(utrLink)} styles={styles} /> : null}
              </View>
              <View style={styles.ratingCard}>
                <View style={styles.ratingHead}>
                  <View style={styles.ratingBadge}><Text style={styles.ratingBadgeText}>NTRP</Text></View>
                  <Text style={styles.ratingTitle}>USTA NTRP rating</Text>
                </View>
                <Field label="Your USTA rating page link" value={ntrpLink} onChangeText={setNtrpLink} placeholder="A page on usta.com showing your rating" autoCapitalize="none" keyboardType="url" />
                {error('ntrpLink')}
                <Field label="Your NTRP (optional)" value={ntrp} onChangeText={setNtrp} placeholder="e.g. 5.0" keyboardType="decimal-pad" />
                {isUstaLink(ntrpLink) ? <LinkCheck url={asLink(ntrpLink)} styles={styles} /> : null}
              </View>
              {error('rating')}
              <Pressable accessibilityRole="button" onPress={() => setWhereOpen((o) => !o)} style={styles.where}>
                <Ionicons name={whereOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.brand} />
                <Text style={styles.whereText}>Where do I find my link?</Text>
              </Pressable>
              {whereOpen ? (
                <View style={styles.note}>
                  <Text style={styles.noteText}>
                    UTR: open app.utrsports.net, go to your own profile, and copy the address from the top of the page. It ends in a number, like /profiles/1234567.{'\n\n'}
                    NTRP: sign in on usta.com, open the page that shows your NTRP rating, and copy its address.
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}

          {step === 2 ? (
            <>
              <View>
                <Field label="Years coaching" value={years} onChangeText={setYears} placeholder="e.g. 8" keyboardType="number-pad" />
                {error('years')}
              </View>
              <View>
                <Field label="Certifications" value={certifications} onChangeText={setCertifications} placeholder="PTR Professional, USPTA Elite, ITF Level 2…" multiline minHeight={80} />
                {error('certifications')}
              </View>
              <View style={styles.group}>
                <Text style={styles.label}>What you coach</Text>
                <View style={styles.tiles}>
                  {SPECIALTIES.map(({ value, label, icon }) => {
                    const on = specialties.includes(value);
                    return (
                      <Pressable
                        key={value}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={label}
                        onPress={() => { haptics.tap(); setSpecialties((prev) => (prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value])); }}
                        style={[styles.tile, on && styles.tileOn]}
                      >
                        <Ionicons name={icon} size={22} color={on ? colors.brandInk : colors.brand} />
                        <Text style={[styles.tileText, on && { color: colors.brandInk }]}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {error('specialties')}
              </View>
              <Field label="Current clients (optional)" value={clients} onChangeText={setClients} placeholder="Roughly how many players, and at what levels." multiline minHeight={70} />
            </>
          ) : null}

          {step === 3 ? (
            <>
              <View style={styles.group}>
                <Text style={styles.label}>Résumé or CV</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={resume ? 'Remove résumé' : 'Attach résumé'} onPress={() => { void pickResume(); }} style={[styles.upload, resume && styles.uploadOn]}>
                  <Ionicons name={resume ? 'document-text' : 'cloud-upload-outline'} size={24} color={resume ? colors.brand : colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.uploadTitle} numberOfLines={1}>{resume?.name ?? 'Attach your résumé'}</Text>
                    <Text style={styles.uploadNote}>{resume ? 'Tap to remove' : 'PDF or Word, up to 10 MB. Kept private.'}</Text>
                  </View>
                  {resume ? <Ionicons name="close-circle" size={20} color={colors.textMuted} /> : null}
                </Pressable>
              </View>
              <Field label="References" value={references} onChangeText={setReferences} placeholder="Two people we can contact: name, role, and email or phone." multiline minHeight={100} />
            </>
          ) : null}

          {step === 4 ? (
            <View>
              <Field label="How you coach" value={about} onChangeText={setAbout} placeholder="What players come to you for, and what actually changes after they work with you." multiline minHeight={180} />
              <Text style={[styles.counter, about.trim().length >= ABOUT_MIN && { color: colors.success }]}>
                {about.trim().length >= ABOUT_MIN ? '✓ ' : ''}{about.trim().length} characters{about.trim().length < ABOUT_MIN ? ` · ${ABOUT_MIN} minimum` : ''}
              </Text>
              {error('about')}
            </View>
          ) : null}

          {step === 5 ? (
            <>
              {[
                { page: 0, title: 'About you', rows: [['Name', fullName], ['Email', email], ['Phone', phone]] },
                { page: 1, title: 'Your rating', rows: [['UTR', [utr, utrLink && asLink(utrLink)].filter(Boolean).join(' · ') || '—'], ['NTRP', [ntrp, ntrpLink && asLink(ntrpLink)].filter(Boolean).join(' · ') || '—']] },
                { page: 2, title: 'Your coaching', rows: [['Years', String(yearsNumber)], ['Certifications', certifications], ['Coaches', specialties.map((s) => SPECIALTIES.find((x) => x.value === s)?.label ?? s).join(', ')], ['Clients', clients || '—']] },
                { page: 3, title: 'Proof', rows: [['Résumé', resume?.name ?? '—'], ['References', references || '—']] },
                { page: 4, title: 'How you coach', rows: [['', about]] },
              ].map((section) => (
                <View key={section.title} style={styles.reviewCard}>
                  <View style={styles.reviewHead}>
                    <Text style={styles.reviewTitle}>{section.title}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${section.title}`} onPress={() => setStep(section.page)} hitSlop={8}>
                      <Text style={styles.reviewEdit}>Edit</Text>
                    </Pressable>
                  </View>
                  {section.rows.map(([k, v]) => (
                    <View key={k || 'text'} style={styles.reviewRow}>
                      {k ? <Text style={styles.reviewKey}>{k}</Text> : null}
                      <Text style={styles.reviewValue} numberOfLines={k ? 3 : 6}>{v}</Text>
                    </View>
                  ))}
                </View>
              ))}
              <Text style={styles.agree}>
                By applying you agree to identity verification. Paid sessions are not offered yet; if they are later, they will come with their own terms.
              </Text>
              {sendError ? <Text style={styles.fieldError}>{sendError}</Text> : null}
            </>
          ) : null}
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {step > 0 ? <Button label="Back" variant="ghost" onPress={back} /> : <View />}
        <Button label={last ? (busy ? 'Sending…' : 'Submit application') : 'Continue'} loading={busy} onPress={() => { if (last) void submit(); else next(); }} />
      </View>
    </KeyboardAvoidingView>
  );
}

/** Once a rating link looks right, a way to open it and make sure it is the right page. */
function LinkCheck({ url, styles }: { url: string; styles: ReturnType<typeof useThemedStyles<typeof styleDefinitions>> }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(url); }} style={styles.linkCheck}>
      <Ionicons name="open-outline" size={15} color={colors.brand} />
      <Text style={styles.linkCheckText}>Open it to check it is your page</Text>
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { paddingHorizontal: spacing.xl, gap: spacing.xs, paddingBottom: spacing.md, maxWidth: 560, width: '100%', alignSelf: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  kicker: { ...typography.smallStrong, color: colors.textMuted },
  count: { ...typography.small, color: colors.textFaint, fontVariant: ['tabular-nums'], minWidth: 24, textAlign: 'right' },
  track: { height: 3, borderRadius: 2, backgroundColor: colors.surfaceAlt, marginBottom: spacing.md, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.brand },
  title: { ...typography.display, color: colors.text },
  lead: { ...typography.small, color: colors.textMuted },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xl, maxWidth: 560, width: '100%', alignSelf: 'center' },
  group: { gap: spacing.sm },
  label: { ...typography.smallStrong, color: colors.textMuted },
  fieldError: { ...typography.small, color: colors.danger, marginTop: 6 },
  note: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  noteText: { ...typography.small, color: colors.textMuted, flex: 1, lineHeight: 19 },
  ratingCard: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  ratingHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ratingBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, backgroundColor: colors.brand },
  ratingBadgeText: { ...typography.caption, color: colors.brandInk, letterSpacing: 0.6 },
  ratingTitle: { ...typography.bodyStrong, color: colors.text },
  where: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  whereText: { ...typography.smallStrong, color: colors.brand },
  linkCheck: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  linkCheckText: { ...typography.smallStrong, color: colors.brand },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { width: '31.5%', alignItems: 'center', gap: 6, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tileOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tileText: { ...typography.smallStrong, color: colors.text },
  upload: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, backgroundColor: colors.surface },
  uploadOn: { borderStyle: 'solid', borderColor: colors.brand, backgroundColor: colors.brandDim },
  uploadTitle: { ...typography.bodyStrong, color: colors.text },
  uploadNote: { ...typography.small, color: colors.textMuted },
  counter: { ...typography.small, color: colors.textFaint, marginTop: 6, textAlign: 'right' },
  reviewCard: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  reviewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewTitle: { ...typography.bodyStrong, color: colors.text },
  reviewEdit: { ...typography.smallStrong, color: colors.brand },
  reviewRow: { flexDirection: 'row', gap: spacing.md },
  reviewKey: { ...typography.small, color: colors.textFaint, width: 92 },
  reviewValue: { ...typography.small, color: colors.text, flex: 1, lineHeight: 19 },
  agree: { ...typography.small, color: colors.textFaint, lineHeight: 18 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, maxWidth: 560, width: '100%', alignSelf: 'center' },
  done: { gap: spacing.lg, paddingTop: spacing.xl, alignItems: 'center' },
  doneIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { ...typography.title, color: colors.text, textAlign: 'center' },
  doneBody: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  stepsCard: { alignSelf: 'stretch', gap: spacing.lg, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  stepDotOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  stepNum: { ...typography.caption, color: colors.textMuted },
  stepLabel: { ...typography.body, color: colors.text, flex: 1 },
});

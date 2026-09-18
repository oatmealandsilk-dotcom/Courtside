import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';

import { Button, Chip, Field, Screen } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import type { CoachSpecialty } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

const SPECIALTIES: CoachSpecialty[] = [
  'serve',
  'forehand',
  'backhand',
  'volleys',
  'footwork',
  'strategy',
  'mental',
  'fitness',
  'juniors',
];

/**
 * Coach onboarding. We collect enough to verify a real person with a real
 * playing and coaching history before they can charge anyone.
 */
export default function CoachApply() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, coachApplications, actions } = useApp();
  const existing = coachApplications.find((a) => a.userId === currentUser?.id);

  const [fullName, setFullName] = useState(currentUser?.name ?? '');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [utr, setUtr] = useState('');
  const [ntrp, setNtrp] = useState('');
  const [years, setYears] = useState('');
  const [certifications, setCertifications] = useState('');
  const [resume, setResume] = useState<{ uri: string; name: string; mimeType?: string } | null>(null);
  const [clients, setClients] = useState('');
  const [specialties, setSpecialties] = useState<CoachSpecialty[]>([]);
  const [references, setReferences] = useState('');
  const [about, setAbout] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState('');
  // After a first tap on Submit, whatever is still missing is listed right above the button.
  const [showMissing, setShowMissing] = useState(false);

  const toggleSpecialty = (value: CoachSpecialty) =>
    setSpecialties((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
    );

  // "8", "8 years" and "about 8" all mean 8.
  const yearsNumber = Number((years.match(/\d+/) ?? ['0'])[0]);
  // What still stops the application, in the order the boxes appear.
  const missing = [
    fullName.trim().length > 2 ? null : 'your full name',
    /^\S+@\S+\.\S+$/.test(email.trim()) ? null : 'a valid email',
    phone.replace(/\D/g, '').length >= 7 ? null : 'a phone number',
    yearsNumber > 0 ? null : 'years coaching (a number)',
    certifications.trim().length > 3 ? null : 'your certifications',
    specialties.length > 0 ? null : 'at least one thing you coach',
    about.trim().length > 40 ? null : `a few more words on how you coach (${Math.max(0, 41 - about.trim().length)} more characters)`,
  ].filter((m): m is string => m !== null);
  const canSubmit = missing.length === 0;

  const submit = async () => {
    if (busy) return;
    if (!canSubmit) { setShowMissing(true); return; }
    setBusy(true);
    setSendError('');
    try {
      await actions.submitCoachApplication({
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      utr: utr.trim() || undefined,
      ntrp: ntrp.trim() || undefined,
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

  if (submitted || existing) {
    return (
      <Screen title="Application" compactTitle onBack={() => goBack()}>
        <View style={styles.done}>
          <View style={styles.doneIcon}>
            <Ionicons name="checkmark" size={34} color={colors.brandInk} />
          </View>
          <Text style={styles.doneTitle}>Application received</Text>
          <Text style={styles.doneBody}>
            We review credentials, playing history, and references by hand. You will hear back
            here in the app, and by email or phone if we need anything more.
          </Text>
          <View style={styles.stepsCard}>
            {[
              'Identity and credential check',
              'Rating verification (UTR / NTRP)',
              'Reference call',
              'Listed as a coach on CourtSide',
            ].map((step, index) => (
              <View key={step} style={styles.step}>
                <View style={[styles.stepDot, index === 0 && styles.stepDotActive]}>
                  <Text style={[styles.stepNum, index === 0 && { color: colors.brandInk }]}>
                    {index + 1}
                  </Text>
                </View>
                <Text style={styles.stepLabel}>{step}</Text>
              </View>
            ))}
          </View>
          <Button label="Back to coaching" onPress={() => router.replace('/(tabs)/coaches')} full />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title="Apply to be a coach"
      subtitle="Verified coaches get a badge and a listing"
      compactTitle
      onBack={() => goBack()}
    >
      <View style={styles.intro}>
        <Ionicons name="shield-checkmark" size={20} color={colors.brand} />
        <Text style={styles.introText}>
          Every coach on CourtSide is verified by hand. We check credentials, ratings, and
          references before anyone is listed as a coach.
        </Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.sectionTitle}>WHO YOU ARE</Text>
        <Field label="Full legal name" value={fullName} onChangeText={setFullName} placeholder="As it appears on your ID" />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="+1 555 010 0100" keyboardType="phone-pad" />

        <Text style={styles.sectionTitle}>YOUR PLAYING LEVEL</Text>
        <View style={styles.pair}>
          <View style={{ flex: 1 }}>
            <Field label="UTR" value={utr} onChangeText={setUtr} placeholder="e.g. 11.2" keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="NTRP" value={ntrp} onChangeText={setNtrp} placeholder="e.g. 5.0" keyboardType="decimal-pad" />
          </View>
        </View>
        <Text style={styles.hint}>
          At least one rating is strongly recommended — it is what we verify against.
        </Text>

        <Text style={styles.sectionTitle}>YOUR COACHING</Text>
        <Field label="Years coaching" value={years} onChangeText={setYears} placeholder="e.g. 8" keyboardType="number-pad" />
        <Field
          label="Certifications"
          value={certifications}
          onChangeText={setCertifications}
          placeholder="PTR Professional, USPTA Elite, ITF Level 2…"
          multiline
          minHeight={80}
        />

        <View style={styles.group}>
          <Text style={styles.label}>What you coach</Text>
          <View style={styles.row}>
            {SPECIALTIES.map((value) => (
              <Chip
                key={value}
                label={value}
                selected={specialties.includes(value)}
                onPress={() => toggleSpecialty(value)}
                small
              />
            ))}
          </View>
        </View>

        <View style={styles.group}>
          <Text style={styles.label}>Résumé or CV</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={resume ? 'Replace résumé' : 'Attach résumé'}
            onPress={async () => {
              if (resume) { setResume(null); return; }
              const picked = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], copyToCacheDirectory: true });
              const file = !picked.canceled ? picked.assets[0] : undefined;
              if (file) setResume({ uri: file.uri, name: file.name, mimeType: file.mimeType ?? undefined });
            }}
            style={styles.upload}
          >
            <Ionicons
              name={resume ? 'document-text' : 'cloud-upload-outline'}
              size={22}
              color={resume ? colors.brand : colors.textMuted}
            />
            <Text style={styles.uploadText} numberOfLines={1}>{resume?.name ?? 'Attach your résumé (PDF or Word)'}</Text>
            {resume ? <Ionicons name="close" size={18} color={colors.textMuted} /> : null}
          </Pressable>
        </View>

        <Field
          label="Current clients"
          value={clients}
          onChangeText={setClients}
          placeholder="Roughly how many players you work with, and at what levels."
          multiline
          minHeight={80}
        />
        <Field
          label="References"
          value={references}
          onChangeText={setReferences}
          placeholder="Two people we can contact — name, role, and email."
          multiline
          minHeight={80}
        />
        <Field
          label="How you coach"
          value={about}
          onChangeText={setAbout}
          placeholder="What players come to you for, and what actually changes after they work with you. This is what players read first."
          multiline
          minHeight={130}
        />

        {showMissing && missing.length ? (
          <Text style={styles.missing}>Still needed: {missing.join(', ')}.</Text>
        ) : null}
        {sendError ? <Text style={styles.missing}>{sendError}</Text> : null}
        {/* Always tappable: a tap with something missing says what, rather than doing nothing. */}
        <Button label={busy ? 'Sending…' : 'Submit application'} loading={busy} onPress={submit} full />
        <Text style={styles.hint}>
          By applying you agree to identity verification. Paid sessions are not offered yet; if they
          are later, they will come with their own terms.
        </Text>
      </View>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  intro: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandDim,
    marginBottom: spacing.lg,
  },
  introText: { ...typography.small, color: colors.text, flex: 1, lineHeight: 19 },
  form: { gap: spacing.lg },
  sectionTitle: { ...typography.caption, color: colors.textMuted, letterSpacing: 1.3, paddingTop: spacing.md },
  group: { gap: spacing.sm },
  label: { ...typography.smallStrong, color: colors.textMuted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pair: { flexDirection: 'row', gap: spacing.md },
  missing: { ...typography.small, color: colors.danger, lineHeight: 18 },
  hint: { ...typography.small, color: colors.textFaint, lineHeight: 18 },
  upload: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  uploadText: { ...typography.small, color: colors.textMuted, flex: 1 },
  done: { gap: spacing.lg, paddingTop: spacing.xl, alignItems: 'center' },
  doneIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneTitle: { ...typography.title, color: colors.text },
  doneBody: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  stepsCard: {
    alignSelf: 'stretch',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  stepNum: { ...typography.caption, color: colors.textMuted },
  stepLabel: { ...typography.small, color: colors.text, flex: 1 },
});

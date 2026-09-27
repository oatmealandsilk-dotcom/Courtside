import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button, Chip, EmptyState, Field, Screen, Toggle } from '@/components/ui';
import type { CoachService, CoachSpecialty } from '@/data/types';
import { confirmAction } from '@/lib/confirm';
import { goBack } from '@/lib/goBack';
import { money } from '@/lib/format';
import { isOpen, KIND_LABEL, SPECIALTY_LABEL, turnaround, usePayments } from '@/features/coaching/bookings';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, typography, lift } from '@/theme';

const KINDS = Object.keys(KIND_LABEL) as CoachService['kind'][];
const SPECIALTIES = Object.keys(SPECIALTY_LABEL) as CoachSpecialty[];
const TURNAROUNDS = [24, 48, 72, 168];
type Draft = { id: string; kind: CoachService['kind']; title: string; description: string; price: string; turnaroundHours: number; active: boolean };
const blank = (): Draft => ({ id: `new-${Date.now()}`, kind: 'video-review', title: '', description: '', price: '', turnaroundHours: 48, active: true });

/**
 * A coach's own studio: the four steps to being bookable (your page,
 * services, payouts, listed), the page's words, the services with their
 * prices, and payouts through Stripe. One calm page, grouped lists, no
 * boxed cards.
 */
export default function CoachStudio() {
  const styles = useThemedStyles(styleDefinitions);
  const { stripe: cameBack } = useLocalSearchParams<{ stripe?: string }>();
  const { coaches, coachingRequests, currentUserId, currentUser, actions } = useApp();
  const payments = usePayments();
  const coach = coaches.find((c) => c.userId === currentUserId);

  const [headline, setHeadline] = useState('');
  const [credentials, setCredentials] = useState('');
  const [specialties, setSpecialties] = useState<CoachSpecialty[]>([]);
  const [years, setYears] = useState('');
  const [reply, setReply] = useState(48);
  const filled = useRef(false);
  useEffect(() => {
    if (!coach || filled.current) return;
    filled.current = true;
    setHeadline(coach.headline);
    setCredentials(coach.credentials.join('\n'));
    setSpecialties(coach.specialties);
    setYears(coach.yearsCoaching ? String(coach.yearsCoaching) : '');
    setReply(coach.responseTimeHours);
  }, [coach]);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  // Back from Stripe's payout setup: ask Stripe how it went.
  const checked = useRef(false);
  useEffect(() => {
    if (!coach || checked.current || !cameBack) return;
    checked.current = true;
    setBusy('payouts');
    void actions.checkPayouts().catch(() => false).finally(() => setBusy(null));
  }, [coach, cameBack, actions]);

  if (!coach) {
    return (
      <Screen title="Coach studio" compactTitle onBack={() => goBack()}>
        <EmptyState icon="ribbon-outline" title="For approved coaches" body="Coaches on CourtSide are checked by hand. Apply, and once you are approved your studio opens here." />
        {!currentUser?.isCoach ? <Button label="Apply to coach" onPress={() => router.push('/coach-apply')} full /> : null}
      </Screen>
    );
  }

  const offered = coach.services.filter((s) => (s as { active?: boolean }).active !== false);
  const open = coachingRequests.filter((r) => (r.coachUserId === currentUserId || r.coachId === coach.id) && isOpen(r)).length;
  const steps = [
    { done: !!coach.headline.trim() && coach.specialties.length > 0, title: 'Your page', body: 'A headline and what you coach.' },
    { done: offered.length > 0, title: 'Services', body: offered.length ? `${offered.length} on offer.` : 'At least one thing players can book.' },
    { done: !!coach.payoutsReady, title: 'Payouts', body: coach.payoutsReady ? 'Stripe pays you out.' : 'Connect a bank account through Stripe.' },
  ];
  const canList = steps.every((s) => s.done);

  const run = async (key: string, work: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    setError('');
    setSaved('');
    try { await work(); if (done) setSaved(done); } catch (e) { setError(e instanceof Error ? e.message : 'That did not save. Try again.'); } finally { setBusy(null); }
  };

  const savePage = () => run('page', () => actions.saveCoachListing({
    headline: headline.trim(),
    credentials: credentials.split('\n').map((c) => c.trim()).filter(Boolean).slice(0, 8),
    specialties,
    yearsCoaching: Math.max(0, Math.min(70, Number(years) || 0)),
    responseTimeHours: reply,
  }), 'Saved.');

  const priceCents = draft ? Math.round(Number(draft.price.replace(/[^0-9.]/g, '')) * 100) : 0;
  const draftOk = !!draft && draft.title.trim().length >= 2 && priceCents >= 500 && priceCents <= 100000;
  // What the coach keeps: the price, less CourtSide's share and Stripe's card fee (about 2.9% + 30¢).
  const keeps = priceCents ? Math.max(0, priceCents - Math.round(priceCents * payments.feePercent / 100) - Math.round(priceCents * 0.029 + 30)) : 0;
  const saveDraft = () => {
    if (!draft || !draftOk) return;
    void run('service', async () => {
      await actions.saveCoachService({ id: draft.id, kind: draft.kind, title: draft.title.trim(), description: draft.description.trim(), priceCents, turnaroundHours: draft.turnaroundHours, active: draft.active });
      setDraft(null);
    });
  };
  const removeDraft = () => {
    if (!draft) return;
    confirmAction('Remove this service?', 'Players will not be able to book it. Bookings already paid for are not affected.', 'Remove', () => {
      void run('service', async () => { await actions.removeCoachService(draft.id); setDraft(null); });
    });
  };

  return (
    <Screen title="Coach studio" compactTitle onBack={() => goBack()}>
      {/* --------------------------------------------------------- steps */}
      <View style={styles.group}>
        {steps.map((s, index) => (
          <View key={s.title} style={[styles.step, index > 0 && styles.line]}>
            <View style={[styles.tick, s.done && styles.tickDone]}>{s.done ? <Ionicons name="checkmark" size={14} color={colors.brandInk} /> : <Text style={styles.tickNum}>{index + 1}</Text>}</View>
            <View style={styles.rowWords}>
              <Text style={styles.rowTitle}>{s.title}</Text>
              <Text style={styles.meta}>{s.body}</Text>
            </View>
          </View>
        ))}
        <View style={[styles.step, styles.line]}>
          <View style={[styles.tick, coach.listed && styles.tickDone]}>{coach.listed ? <Ionicons name="checkmark" size={14} color={colors.brandInk} /> : <Text style={styles.tickNum}>4</Text>}</View>
          <View style={styles.rowWords}>
            <Text style={styles.rowTitle}>Listed</Text>
            <Text style={styles.meta}>{coach.listed ? 'Players can find and book you.' : canList ? 'Turn on to appear on the Coaching tab.' : 'Opens once the three steps above are done.'}</Text>
          </View>
          <Toggle
            value={!!coach.listed}
            disabled={!canList || busy === 'listed'}
            accessibilityLabel="Listed on the Coaching tab"
            onChange={(next) => void run('listed', () => actions.saveCoachListing({ listed: next }))}
          />
        </View>
      </View>
      <View style={styles.links}>
        <Pressable accessibilityRole="link" onPress={() => router.push('/coach-bookings')} style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}>
          <Ionicons name="file-tray-full-outline" size={18} color={colors.text} />
          <Text style={styles.linkText}>Bookings{open ? ` · ${open} open` : ''}</Text>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => router.push(`/coach/${coach.id}`)} style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}>
          <Ionicons name="eye-outline" size={18} color={colors.text} />
          <Text style={styles.linkText}>See your page</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* ------------------------------------------------------- your page */}
      <Text style={styles.sectionTitle}>Your page</Text>
      <View style={styles.form}>
        <Field label="Headline" value={headline} onChangeText={setHeadline} placeholder="Serve and first-strike tennis for 3.5 to 4.5 players" />
        <Field label="Credentials, one per line" value={credentials} onChangeText={setCredentials} placeholder={'PTR Professional\nFormer D1, NC State'} multiline minHeight={80} />
        <Text style={styles.fieldLabel}>What you coach</Text>
        <View style={styles.chips}>
          {SPECIALTIES.map((s) => (
            <Chip key={s} label={SPECIALTY_LABEL[s]} selected={specialties.includes(s)} onPress={() => setSpecialties((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))} />
          ))}
        </View>
        <View style={styles.pair}>
          <View style={{ width: 120 }}><Field label="Years coaching" value={years} onChangeText={setYears} keyboardType="number-pad" placeholder="6" /></View>
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Text style={styles.fieldLabel}>You usually reply within</Text>
            <View style={styles.chips}>{TURNAROUNDS.map((h) => <Chip key={h} small label={turnaround(h)} selected={reply === h} onPress={() => setReply(h)} />)}</View>
          </View>
        </View>
        <Button label={busy === 'page' ? 'Saving…' : 'Save your page'} onPress={savePage} loading={busy === 'page'} full />
        {saved ? <Text style={styles.saved}>{saved}</Text> : null}
      </View>

      {/* -------------------------------------------------------- services */}
      <Text style={styles.sectionTitle}>Services</Text>
      {coach.services.length ? (
        <View style={styles.group}>
          {coach.services.map((s, index) => {
            const active = (s as { active?: boolean }).active !== false;
            return (
              <Pressable
                key={s.id}
                accessibilityRole="button"
                onPress={() => setDraft({ id: s.id, kind: s.kind, title: s.title, description: s.description, price: String(s.priceCents / 100), turnaroundHours: s.turnaroundHours, active })}
                style={({ pressed }) => [styles.step, index > 0 && styles.line, pressed && { backgroundColor: colors.surfaceAlt }]}
              >
                <View style={styles.rowWords}>
                  <Text style={[styles.rowTitle, !active && { color: colors.textFaint }]}>{s.title}</Text>
                  <Text style={styles.meta}>{KIND_LABEL[s.kind]} · within {turnaround(s.turnaroundHours)}{active ? '' : ' · paused'}</Text>
                </View>
                <Text style={styles.price}>{money(s.priceCents)}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </Pressable>
            );
          })}
        </View>
      ) : <Text style={styles.muted}>Nothing yet. Most coaches start with one video review and one written answer.</Text>}

      {draft ? (
        <View style={[styles.form, styles.editor]}>
          <Text style={styles.fieldLabel}>Kind</Text>
          <View style={styles.chips}>{KINDS.map((k) => <Chip key={k} label={KIND_LABEL[k]} selected={draft.kind === k} onPress={() => setDraft({ ...draft, kind: k })} />)}</View>
          <Field label="Title" value={draft.title} onChangeText={(v) => setDraft({ ...draft, title: v })} placeholder="Serve video review" />
          <Field label="What the player gets" value={draft.description} onChangeText={(v) => setDraft({ ...draft, description: v })} placeholder="Send one clip of 10 serves from behind. You get a written breakdown and two drills." multiline minHeight={80} />
          <View style={styles.pair}>
            <View style={{ width: 120 }}><Field label="Price ($)" value={draft.price} onChangeText={(v) => setDraft({ ...draft, price: v })} keyboardType="decimal-pad" placeholder="40" /></View>
            <View style={{ flex: 1, gap: spacing.sm }}>
              <Text style={styles.fieldLabel}>Answered within</Text>
              <View style={styles.chips}>{TURNAROUNDS.map((h) => <Chip key={h} small label={turnaround(h)} selected={draft.turnaroundHours === h} onPress={() => setDraft({ ...draft, turnaroundHours: h })} />)}</View>
            </View>
          </View>
          <Text style={styles.meta}>
            {priceCents && (priceCents < 500 || priceCents > 100000) ? 'Prices run from $5 to $1,000.'
              : priceCents ? `You receive about ${money(keeps)}. CourtSide keeps ${payments.feePercent}%, and Stripe takes about 2.9% + 30¢ for the card.` : 'Set a price between $5 and $1,000.'}
          </Text>
          <View style={styles.toggleRow}>
            <Text style={styles.rowTitle}>Offered</Text>
            <Toggle value={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} accessibilityLabel="Offered" />
          </View>
          <Button label={busy === 'service' ? 'Saving…' : 'Save service'} onPress={saveDraft} disabled={!draftOk} loading={busy === 'service'} full />
          <View style={styles.editorFoot}>
            <Pressable accessibilityRole="button" onPress={() => setDraft(null)} hitSlop={8}><Text style={styles.quiet}>Cancel</Text></Pressable>
            {coach.services.some((s) => s.id === draft.id) ? <Pressable accessibilityRole="button" onPress={removeDraft} hitSlop={8}><Text style={[styles.quiet, { color: colors.danger }]}>Remove</Text></Pressable> : null}
          </View>
        </View>
      ) : (
        <Button label="Add a service" variant="secondary" onPress={() => setDraft(blank())} style={{ marginTop: spacing.md }} full />
      )}

      {/* --------------------------------------------------------- payouts */}
      <Text style={styles.sectionTitle}>Payouts</Text>
      {payments.on === false ? (
        <Text style={styles.muted}>Payouts open once CourtSide switches payments on. Your page and services can be ready before then.</Text>
      ) : coach.payoutsReady ? (
        <View style={styles.form}>
          <Text style={styles.body}>Payouts are on. Each booking’s money lands in your bank a few days after it is paid, less CourtSide’s {payments.feePercent}% and Stripe’s card fee.</Text>
          <Button label="Open your Stripe dashboard" variant="secondary" onPress={() => void run('payouts', actions.openPayoutDashboard)} loading={busy === 'payouts'} full />
        </View>
      ) : (
        <View style={styles.form}>
          <Text style={styles.body}>
            {coach.payoutsStarted
              ? 'Stripe needs a few more details before it can pay you. It takes a couple of minutes.'
              : 'CourtSide pays coaches through Stripe, which handles the money, your bank details and tax forms. Setup takes about five minutes: your name, date of birth, the last four of your SSN and a bank account.'}
          </Text>
          <Button
            label={busy === 'payouts' ? 'Opening Stripe…' : coach.payoutsStarted ? 'Continue with Stripe' : 'Set up payouts'}
            onPress={() => void run('payouts', actions.setupPayouts)}
            loading={busy === 'payouts'}
            full
          />
        </View>
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  group: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  tick: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  tickDone: { backgroundColor: colors.brand, borderColor: colors.brand },
  tickNum: { fontSize: 12, ...font('600'), color: colors.textMuted },
  rowWords: { flex: 1, gap: 2, minWidth: 0 },
  rowTitle: { ...typography.body, ...font('500'), color: colors.text },
  meta: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  price: { ...typography.bodyStrong, color: colors.text, fontVariant: ['tabular-nums'] },
  links: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  linkRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, height: 44, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  linkText: { ...typography.smallStrong, color: colors.text },
  sectionTitle: { ...typography.heading, color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.md },
  form: { gap: spacing.md },
  editor: { marginTop: spacing.lg, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.bgElevated },
  editorFoot: { flexDirection: 'row', justifyContent: 'space-between' },
  fieldLabel: { ...typography.smallStrong, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pair: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  body: { ...typography.body, color: colors.text, lineHeight: 22 },
  muted: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  quiet: { ...typography.smallStrong, color: colors.textMuted },
  saved: { ...typography.small, color: colors.success, textAlign: 'center' },
  error: { ...typography.small, color: colors.danger, marginTop: spacing.md },
});

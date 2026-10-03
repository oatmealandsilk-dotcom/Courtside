import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { Button, Chip, EmptyState, Field, Screen, Toggle, SegmentedControl } from '@/components/ui';
import { BrandWash } from '@/components/ui/BrandWash';
import { CourtSpinner } from '@/components/CourtSpinner';
import { BookingsPanel } from './coach-bookings';
import { QuestionsPanel } from './coach-inbox';
import type { CoachService, CoachSpecialty } from '@/data/types';
import { confirm } from '@/lib/confirm';
import { goBack } from '@/lib/goBack';
import { money } from '@/lib/format';
import * as haptics from '@/lib/haptics';
import { isOpen, KIND_LABEL, SPECIALTY_LABEL, turnaround, usePayments } from '@/features/coaching/bookings';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, typography, lift } from '@/theme';

const KINDS = Object.keys(KIND_LABEL) as CoachService['kind'][];
const SPECIALTIES = Object.keys(SPECIALTY_LABEL) as CoachSpecialty[];
const TURNAROUNDS = [24, 48, 72, 168];
/** Each kind of service's small picture, on its card. */
const KIND_ICON: Record<CoachService['kind'], keyof typeof Ionicons.glyphMap> = {
  'video-review': 'videocam-outline',
  'written-qa': 'create-outline',
  'live-session': 'calendar-outline',
  plan: 'reader-outline',
};
type Draft = { id: string; kind: CoachService['kind']; title: string; description: string; price: string; turnaroundHours: number; active: boolean };
const blank = (): Draft => ({ id: `new-${Date.now()}`, kind: 'video-review', title: '', description: '', price: '', turnaroundHours: 48, active: true });
/** Where the checklist's steps jump to. */
type Section = 'page' | 'services' | 'payouts';
/** The page's Save button: nothing to save, edits waiting, saving, just saved. */
type SaveState = 'clean' | 'dirty' | 'saving' | 'done';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Credentials as saved: one per line, blank lines dropped, eight at most. */
const credentialList = (text: string) => text.split('\n').map((c) => c.trim()).filter(Boolean).slice(0, 8);
const yearsNumber = (text: string) => Math.max(0, Math.min(70, Number(text) || 0));

/**
 * A coach's own studio: the four steps to being bookable (your page,
 * services, payouts, listed), each a tap away from its section; the page's
 * words; the services with their prices, as cards; and payouts through
 * Stripe. The Save button says whether there is anything to save, shows the
 * save happening, and lands on a tick.
 */
export default function CoachStudio() {
  const styles = useThemedStyles(styleDefinitions);
  const { stripe: cameBack } = useLocalSearchParams<{ stripe?: string }>();
  const { coaches, coachingRequests, coachQuestions, currentUserId, currentUser, actions } = useApp();
  const payments = usePayments();
  const coach = coaches.find((c) => c.userId === currentUserId);

  // The form starts from the saved page, so it opens with nothing to save.
  const [headline, setHeadline] = useState(() => coach?.headline ?? '');
  const [credentials, setCredentials] = useState(() => coach?.credentials.join('\n') ?? '');
  const [specialties, setSpecialties] = useState<CoachSpecialty[]>(() => coach?.specialties ?? []);
  const [years, setYears] = useState(() => (coach?.yearsCoaching ? String(coach.yearsCoaching) : ''));
  const [reply, setReply] = useState(() => coach?.responseTimeHours ?? 48);
  const filled = useRef(!!coach);
  useEffect(() => {
    if (!coach || filled.current) return;
    filled.current = true;
    setHeadline(coach.headline);
    setCredentials(coach.credentials.join('\n'));
    setSpecialties(coach.specialties);
    setYears(coach.yearsCoaching ? String(coach.yearsCoaching) : '');
    setReply(coach.responseTimeHours);
  }, [coach]);

  // One place for a coach: what is waiting (paid bookings, free questions) and their page.
  const [tab, setTab] = useState<'bookings' | 'questions' | 'page' | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // What went wrong, said under the part it went wrong in.
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  // The page's save: under way, or just done (the tick shows for a moment, then settles).
  const [pageSave, setPageSave] = useState<'idle' | 'saving' | 'done'>('idle');
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);

  // The checklist's steps scroll to their section: where each one starts on the page.
  const scrollRef = useRef<ScrollView | null>(null);
  const rootY = useRef(0);
  const sectionY = useRef<Record<Section, number>>({ page: 0, services: 0, payouts: 0 });
  const mark = (section: Section) => (e: LayoutChangeEvent) => { sectionY.current[section] = e.nativeEvent.layout.y; };
  const jump = (section: Section) => scrollRef.current?.scrollTo({ y: Math.max(0, rootY.current + sectionY.current[section] - spacing.md), animated: true });

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
      // The same scroller as the studio below: this page can draw first, before the coach has loaded, and the scroller is kept.
      <Screen title="Coach studio" compactTitle onBack={() => goBack()} scrollRef={scrollRef}>
        <EmptyState icon="ribbon-outline" title="For approved coaches" body="Coaches on CourtSide are checked by hand. Apply, and once you are approved your studio opens here." />
        {!currentUser?.isCoach ? <Button label="Apply to coach" onPress={() => router.push('/coach-apply')} full /> : null}
      </Screen>
    );
  }

  const offered = coach.services.filter((s) => (s as { active?: boolean }).active !== false);
  const steps: { done: boolean; title: string; body: string; section: Section }[] = [
    { done: !!coach.headline.trim() && coach.specialties.length > 0, title: 'Your page', body: 'A headline and what you coach.', section: 'page' },
    { done: offered.length > 0, title: 'Services', body: offered.length ? `${offered.length} on offer.` : 'At least one thing players can book.', section: 'services' },
    {
      done: !!coach.payoutsReady,
      title: 'Payouts',
      body: coach.payoutsReady ? 'Stripe pays you out.' : payments.on === false ? 'Opens once payments are on.' : 'Connect a bank account through Stripe.',
      section: 'payouts',
    },
  ];
  // Payouts are needed to take bookings, not to be listed: a coach can appear with “booking opens soon” first.
  const canList = steps[0].done && steps[1].done;
  const doneCount = steps.filter((s) => s.done).length + (coach.listed ? 1 : 0);

  const run = async (key: string, work: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try { await work(); } catch (e) { setError({ key, message: e instanceof Error ? e.message : 'That did not save. Try again.' }); } finally { setBusy(null); }
  };

  // What Save would send, and whether it differs from the page as saved.
  const pagePatch = {
    headline: headline.trim(),
    credentials: credentialList(credentials),
    specialties,
    yearsCoaching: yearsNumber(years),
    responseTimeHours: reply,
  };
  const dirty = filled.current && (
    pagePatch.headline !== coach.headline.trim()
    || pagePatch.credentials.join('\n') !== coach.credentials.join('\n')
    || [...specialties].sort().join() !== [...coach.specialties].sort().join()
    || pagePatch.yearsCoaching !== (coach.yearsCoaching || 0)
    || reply !== coach.responseTimeHours
  );
  const saveState: SaveState = pageSave === 'saving' ? 'saving' : pageSave === 'done' && !dirty ? 'done' : dirty ? 'dirty' : 'clean';
  const savePage = async () => {
    if (pageSave === 'saving' || !dirty) return;
    if (settle.current) clearTimeout(settle.current);
    setPageSave('saving');
    setError(null);
    try {
      // Long enough to see it happen, even when the save itself is instant.
      await Promise.all([actions.saveCoachListing(pagePatch), wait(450)]);
      if (Platform.OS !== 'web') haptics.reward();
      setPageSave('done');
      settle.current = setTimeout(() => setPageSave('idle'), 1600);
    } catch (e) {
      setPageSave('idle');
      setError({ key: 'page', message: e instanceof Error ? e.message : 'That did not save. Try again.' });
    }
  };

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
    confirm({ title: 'Remove this service?', message: 'Players can’t book it any more. Paid bookings aren’t affected.', confirmLabel: 'Remove', destructive: true, onConfirm: () => {
      void run('service', async () => { await actions.removeCoachService(draft.id); setDraft(null); });
    } });
  };
  const errorFor = (key: string) => (error?.key === key ? <Text style={styles.error}>{error.message}</Text> : null);

  const openCount = coachingRequests.filter((r) => (r.paidAt || !r.priceCents) && (r.coachId === coach.id || r.coachUserId === currentUserId) && isOpen(r)).length;
  const waitingCount = coachQuestions.filter((q) => !q.resolved && q.replyIds.length === 0).length;
  // Opens on whatever is waiting; with nothing waiting, on the page itself.
  const shownTab = tab ?? (openCount ? 'bookings' : waitingCount ? 'questions' : 'page');

  // The service editor: in place of the card being edited, or under the list for a new one.
  const editor = draft ? (
    <View style={styles.editor}>
      <Text style={styles.label}>Kind</Text>
      <View style={styles.chips}>{KINDS.map((k) => <Chip key={k} label={KIND_LABEL[k]} selected={draft.kind === k} onPress={() => setDraft({ ...draft, kind: k })} />)}</View>
      <Field label="Title" value={draft.title} onChangeText={(v) => setDraft({ ...draft, title: v })} />
      <Field label="What the player gets" value={draft.description} onChangeText={(v) => setDraft({ ...draft, description: v })} multiline minHeight={80} />
      <View style={styles.priceRow}>
        <View style={styles.priceBox}><Field label="Price ($)" value={draft.price} onChangeText={(v) => setDraft({ ...draft, price: v })} keyboardType="decimal-pad" /></View>
        {/* Nothing beside an empty Price box; once there is a number, the range check or the payout. */}
        <Text style={[styles.meta, styles.priceNote]}>
          {!priceCents ? 'Prices run from $5 to $1,000.'
            : priceCents < 500 || priceCents > 100000 ? 'Prices run from $5 to $1,000.'
            : `You receive about ${money(keeps)}. CourtSide keeps ${payments.feePercent}%, and Stripe takes about 2.9% + 30¢ for the card.`}
        </Text>
      </View>
      <Text style={styles.label}>Answered within</Text>
      <Options value={draft.turnaroundHours} options={TURNAROUNDS} onChange={(h) => setDraft({ ...draft, turnaroundHours: h })} label="Answered within" />
      <View style={styles.toggleRow}>
        <View style={styles.rowWords}>
          <Text style={styles.rowTitle}>Offered</Text>
          <Text style={styles.meta}>{draft.active ? 'Players can book it.' : 'Paused: hidden from your page.'}</Text>
        </View>
        <Toggle value={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} accessibilityLabel="Offered" />
      </View>
      <Button label={busy === 'service' ? 'Saving…' : 'Save service'} onPress={saveDraft} disabled={!draftOk} loading={busy === 'service'} full />
      {errorFor('service')}
      <View style={styles.editorFoot}>
        <Pressable accessibilityRole="button" onPress={() => setDraft(null)} hitSlop={8}><Text style={styles.quiet}>Cancel</Text></Pressable>
        {coach.services.some((s) => s.id === draft.id) ? <Pressable accessibilityRole="button" onPress={removeDraft} hitSlop={8}><Text style={[styles.quiet, { color: colors.danger }]}>Remove</Text></Pressable> : null}
      </View>
    </View>
  ) : null;

  return (
    <Screen title="Coach studio" compactTitle onBack={() => goBack()} scrollRef={scrollRef}>
      <SegmentedControl
        value={shownTab}
        onChange={setTab}
        segments={[
          { value: 'bookings', label: openCount ? `Bookings · ${openCount}` : 'Bookings' },
          { value: 'questions', label: waitingCount ? `Questions · ${waitingCount}` : 'Questions' },
          { value: 'page', label: 'Your page' },
        ]}
      />
      <View style={{ height: spacing.lg }} />
      {shownTab === 'bookings' ? <BookingsPanel /> : shownTab === 'questions' ? <QuestionsPanel /> : (
      <View onLayout={(e) => { rootY.current = e.nativeEvent.layout.y; }}>
        {/* ------------------------------------------------- the checklist */}
        <View style={styles.card}>
          <View style={styles.checkHead}>
            <View style={styles.rowWords}>
              <Text style={styles.cardTitle}>{doneCount === 4 ? 'You’re all set' : 'Getting bookable'}</Text>
              <Text style={styles.meta}>{doneCount} of 4 done</Text>
            </View>
            <Pressable accessibilityRole="link" accessibilityLabel="See your page as players see it" hitSlop={6} onPress={() => router.push(`/coach/${coach.id}`)} style={({ pressed }) => [styles.preview, pressed && styles.pressed]}>
              <Ionicons name="eye-outline" size={16} color={colors.text} />
              <Text style={styles.previewText}>See your page</Text>
            </Pressable>
          </View>
          <View style={styles.progress}>
            {[0, 1, 2, 3].map((i) => <View key={i} style={[styles.progressBit, i < doneCount && styles.progressOn]} />)}
          </View>
          {steps.map((s, index) => (
            <Pressable
              key={s.title}
              accessibilityRole="button"
              accessibilityLabel={`${s.title}: ${s.done ? 'done' : 'to do'}. ${s.body} Go to ${s.title}`}
              onPress={() => jump(s.section)}
              style={({ pressed }) => [styles.step, styles.line, pressed && styles.stepPressed]}
            >
              <View style={[styles.tick, s.done && styles.tickDone]}>{s.done ? <Ionicons name="checkmark" size={14} color={colors.brandInk} /> : <Text style={styles.tickNum}>{index + 1}</Text>}</View>
              <View style={styles.rowWords}>
                <Text style={styles.rowTitle}>{s.title}</Text>
                <Text style={styles.meta}>{s.body}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </Pressable>
          ))}
          <View style={[styles.step, styles.line]}>
            <View style={[styles.tick, coach.listed && styles.tickDone]}>{coach.listed ? <Ionicons name="checkmark" size={14} color={colors.brandInk} /> : <Text style={styles.tickNum}>4</Text>}</View>
            <View style={styles.rowWords}>
              <Text style={styles.rowTitle}>Listed</Text>
              <Text style={styles.meta}>{coach.listed ? (coach.payoutsReady ? 'Players can find and book you.' : 'Players can find you. Booking opens once payouts are set up.') : canList ? 'Turn on to appear on the Coaching tab.' : 'Opens once your page and a service are done.'}</Text>
            </View>
            <Toggle
              value={!!coach.listed}
              disabled={!canList || busy === 'listed'}
              accessibilityLabel="Listed on the Coaching tab"
              onChange={(next) => void run('listed', () => actions.saveCoachListing({ listed: next }))}
            />
          </View>
        </View>
        {errorFor('listed')}

        {/* ------------------------------------------------------ your page */}
        <View onLayout={mark('page')} style={styles.section}>
          <SectionHead title="Your page" caption="What players read before they book you." />
          <Field soft label="Headline" placeholder="e.g. Serve mechanics and clay court patterns" value={headline} onChangeText={setHeadline} />
          <Field soft label="Credentials" hint="One per line, up to eight." value={credentials} onChangeText={setCredentials} multiline minHeight={88} />
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>What you coach</Text>
            <View style={styles.chips}>
              {SPECIALTIES.map((s) => (
                <Chip key={s} label={SPECIALTY_LABEL[s]} selected={specialties.includes(s)} onPress={() => setSpecialties((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))} />
              ))}
            </View>
          </View>
          {/* Two short facts, each on a row of its own: nothing squeezed in beside anything else. */}
          <View style={styles.card}>
            <View style={styles.detailRow}>
              <View style={styles.rowWords}>
                <Text style={styles.rowTitle}>Years coaching</Text>
                <Text style={styles.meta}>Shown on your page.</Text>
              </View>
              <View style={styles.yearsBox}>
                <Field accessibilityLabel="Years coaching" placeholder="0" value={years} onChangeText={(v) => setYears(v.replace(/[^0-9]/g, '').slice(0, 2))} keyboardType="number-pad" selectTextOnFocus />
              </View>
            </View>
            <View style={[styles.detailBlock, styles.line]}>
              <Text style={styles.rowTitle}>You usually reply within</Text>
              <Options value={reply} options={TURNAROUNDS} onChange={setReply} label="You usually reply within" />
            </View>
          </View>
          <SaveButton state={saveState} onPress={() => { void savePage(); }} />
          {errorFor('page')}
        </View>

        {/* ------------------------------------------------------- services */}
        <View onLayout={mark('services')} style={styles.section}>
          <SectionHead title="Services" caption={coach.services.length ? 'What players can book. Tap one to change it.' : 'What players can book.'} />
          {coach.services.length ? (
            <View style={styles.cards}>
              {coach.services.map((s) => {
                if (draft?.id === s.id) return <React.Fragment key={s.id}>{editor}</React.Fragment>;
                const active = (s as { active?: boolean }).active !== false;
                return (
                  <Pressable
                    key={s.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${s.title}, ${money(s.priceCents)}, ${KIND_LABEL[s.kind]}, within ${turnaround(s.turnaroundHours)}${active ? '' : ', paused'}. Edit`}
                    onPress={() => setDraft({ id: s.id, kind: s.kind, title: s.title, description: s.description, price: String(s.priceCents / 100), turnaroundHours: s.turnaroundHours, active })}
                    style={({ pressed }) => [styles.card, styles.service, pressed && styles.pressed]}
                  >
                    <View style={[styles.kindIcon, !active && styles.kindIconOff]}>
                      <Ionicons name={KIND_ICON[s.kind]} size={19} color={active ? colors.brand : colors.textFaint} />
                    </View>
                    <View style={styles.rowWords}>
                      <Text style={[styles.serviceTitle, !active && { color: colors.textFaint }]}>{s.title}</Text>
                      <Text style={styles.meta}>{KIND_LABEL[s.kind]} · within {turnaround(s.turnaroundHours)}</Text>
                    </View>
                    <View style={styles.priceSide}>
                      <Text style={[styles.price, !active && { color: colors.textFaint }]}>{money(s.priceCents)}</Text>
                      {active ? null : <Text style={styles.paused}>Paused</Text>}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : <Text style={styles.muted}>Nothing yet. Most coaches start with one video review and one written answer.</Text>}
          {draft && !coach.services.some((s) => s.id === draft.id) ? editor : null}
          {draft ? null : (
            <Pressable accessibilityRole="button" onPress={() => setDraft(blank())} style={({ pressed }) => [styles.add, pressed && styles.pressed]}>
              <Ionicons name="add" size={18} color={colors.brand} />
              <Text style={styles.addText}>Add a service</Text>
            </Pressable>
          )}
          {draft ? null : errorFor('service')}
        </View>

        {/* -------------------------------------------------------- payouts */}
        <View onLayout={mark('payouts')} style={styles.section}>
          <SectionHead title="Payouts" caption="How the money from bookings reaches you." />
          <View style={[styles.card, styles.payout]}>
            <View style={styles.payoutHead}>
              <View style={styles.kindIcon}>
                <Ionicons name={payments.on === false ? 'time-outline' : coach.payoutsReady ? 'checkmark-circle-outline' : 'card-outline'} size={19} color={colors.brand} />
              </View>
              <Text style={[styles.cardTitle, styles.rowWords]}>
                {payments.on === false ? 'Payouts open once payments are on'
                  : coach.payoutsReady ? 'Payouts are on'
                  : coach.payoutsStarted ? 'Finish setting up payouts'
                  : 'Set up payouts'}
              </Text>
            </View>
            <Text style={styles.body}>
              {payments.on === false
                ? 'CourtSide hasn’t switched payments on yet. Your page and services can be ready before then.'
                : coach.payoutsReady
                  ? `Each booking’s money lands in your bank a few days after it is paid, less CourtSide’s ${payments.feePercent}% and Stripe’s card fee.`
                  : coach.payoutsStarted
                    ? 'Stripe needs a few more details before it can pay you. It takes a couple of minutes.'
                    : 'CourtSide pays coaches through Stripe, which handles the money, your bank details and tax forms. Setup takes about five minutes: your name, date of birth, the last four of your SSN and a bank account.'}
            </Text>
            {payments.on === false ? null : coach.payoutsReady ? (
              <Button label="Open your Stripe dashboard" variant="secondary" onPress={() => void run('payouts', actions.openPayoutDashboard)} loading={busy === 'payouts'} full />
            ) : (
              <Button
                label={busy === 'payouts' ? 'Opening Stripe…' : coach.payoutsStarted ? 'Continue with Stripe' : 'Set up payouts'}
                onPress={() => void run('payouts', actions.setupPayouts)}
                loading={busy === 'payouts'}
                full
              />
            )}
            {errorFor('payouts')}
          </View>
        </View>
      </View>
      )}
    </Screen>
  );
}

/** A section's name, and a line on what it is for. */
function SectionHead({ title, caption }: { title: string; caption: string }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.meta}>{caption}</Text>
    </View>
  );
}

/** A few hours to pick from, side by side in equal shares of one row, so none wraps onto a line of its own. */
function Options({ value, options, onChange, label }: { value: number; options: number[]; onChange: (hours: number) => void; label: string }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((h) => {
        const on = value === h;
        return (
          <Pressable key={h} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => onChange(h)} style={[styles.option, on && styles.optionOn]}>
            <Text style={[styles.optionText, on && styles.optionTextOn]} numberOfLines={1}>{turnaround(h)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Save, saying where things stand: a quiet "Saved" with nothing to save; the
 * green "Save changes" once something has changed; a spinner and "Saving…"
 * while it goes; then a tick springs in on "Saved", and it settles back to
 * quiet. A light tap on the phone when it lands.
 */
function SaveButton({ state, onPress }: { state: SaveState; onPress: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const reduced = useReducedMotion();
  const loud = state !== 'clean';
  // The green fades in over the quiet button and out again, rather than snapping.
  const fill = useSharedValue(loud ? 1 : 0);
  const pop = useSharedValue(1);
  const tick = useSharedValue(1);
  useEffect(() => {
    fill.value = reduced ? (loud ? 1 : 0) : withTiming(loud ? 1 : 0, { duration: loud ? 160 : 420 });
  }, [loud, reduced, fill]);
  useEffect(() => {
    if (state !== 'done' || reduced) return;
    tick.value = 0.3;
    tick.value = withSpring(1, { damping: 9, stiffness: 260, mass: 0.6 });
    pop.value = withSequence(withTiming(0.96, { duration: 90 }), withSpring(1, { damping: 10, stiffness: 220, mass: 0.7 }));
  }, [state, reduced, tick, pop]);
  const fillStyle = useAnimatedStyle(() => ({ opacity: fill.value }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const tickStyle = useAnimatedStyle(() => ({ transform: [{ scale: tick.value }] }));
  const label = state === 'dirty' ? 'Save changes' : state === 'saving' ? 'Saving…' : 'Saved';
  // The words drawn twice, quiet on the button and light on the green over it,
  // so they fade across with the green rather than changing colour on it.
  const content = (ink: string, loudLayer: boolean) => (
    <View style={styles.saveInner}>
      {state === 'saving' ? <CourtSpinner size={18} ink={ink} />
        : state === 'dirty' ? null
        : <Animated.View style={loudLayer ? tickStyle : undefined}><Ionicons name={state === 'done' ? 'checkmark-circle' : 'checkmark'} size={18} color={ink} /></Animated.View>}
      <Text style={[styles.saveText, { color: ink }]}>{label}</Text>
    </View>
  );
  return (
    <Animated.View style={popStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={state === 'clean' ? 'Saved. Nothing to save' : label}
        accessibilityState={{ disabled: state !== 'dirty', busy: state === 'saving' }}
        disabled={state !== 'dirty'}
        onPress={onPress}
        style={({ pressed }) => [styles.save, pressed && styles.pressed]}
      >
        {content(colors.textMuted, false)}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.saveFill, fillStyle]}>
          <BrandWash />
          {content(colors.brandInk, true)}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styleDefinitions = StyleSheet.create({
  card: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  cardTitle: { ...typography.heading, color: colors.text },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { opacity: 0.7 },
  // The checklist
  checkHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
  previewText: { ...typography.smallStrong, color: colors.text },
  progress: { flexDirection: 'row', gap: 4, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg },
  progressBit: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surfaceAlt },
  progressOn: { backgroundColor: colors.brand },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, minHeight: 60 },
  stepPressed: { backgroundColor: colors.surfaceAlt },
  tick: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  tickDone: { backgroundColor: colors.brand, borderColor: colors.brand },
  tickNum: { fontSize: 12, ...font('600'), color: colors.textMuted },
  rowWords: { flex: 1, gap: 2, minWidth: 0 },
  rowTitle: { ...typography.body, ...font('500'), color: colors.text },
  meta: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  // Sections
  section: { marginTop: spacing.xxl, gap: spacing.lg },
  sectionHead: { gap: 2 },
  sectionTitle: { ...typography.title, color: colors.text },
  label: { ...typography.smallStrong, color: colors.textMuted },
  fieldGroup: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  detailBlock: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg },
  yearsBox: { width: 76 },
  options: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  option: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: radius.pill },
  optionOn: { ...lift, backgroundColor: colors.surface },
  optionText: { ...typography.smallStrong, color: colors.textMuted },
  optionTextOn: { color: colors.text },
  // Save
  save: { height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  saveFill: { backgroundColor: colors.brand, borderRadius: radius.pill, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  saveInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  saveText: { ...typography.bodyStrong },
  // Services
  cards: { gap: spacing.sm },
  service: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  kindIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandDim },
  kindIconOff: { backgroundColor: colors.surfaceAlt },
  serviceTitle: { ...typography.bodyStrong, color: colors.text },
  priceSide: { alignItems: 'flex-end', gap: 2 },
  price: { ...typography.heading, color: colors.text, fontVariant: ['tabular-nums'] },
  paused: { ...typography.caption, color: colors.textFaint },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 52, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong },
  addText: { ...typography.bodyStrong, color: colors.brand },
  editor: { gap: spacing.md, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  editorFoot: { flexDirection: 'row', justifyContent: 'space-between' },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  priceBox: { width: 112 },
  priceNote: { flex: 1, paddingBottom: 6 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  // Payouts
  payout: { padding: spacing.lg, gap: spacing.md },
  payoutHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  body: { ...typography.body, color: colors.text, lineHeight: 22 },
  muted: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  quiet: { ...typography.smallStrong, color: colors.textMuted },
  error: { ...typography.small, color: colors.danger, marginTop: spacing.sm },
});

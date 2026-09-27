import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { Button, EmptyState, Field, Screen, SegmentedControl } from '@/components/ui';
import { remote } from '@/data/remote';
import type { CoachApplication } from '@/data/types';
import { goBack } from '@/lib/goBack';
import { relativeTime } from '@/lib/format';
import { SPECIALTY_LABEL } from '@/features/coaching/bookings';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, typography } from '@/theme';

type Payments = { stripe: boolean; live: boolean; webhook: boolean; feePercent: number } | 'off' | null;

/**
 * Admin: coach applications, with everything the applicant sent and the two
 * answers (approve makes them a coach with a studio; decline tells them).
 * At the top, whether payments are set up, and the one button that finishes it.
 */
export default function AdminCoaches() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, actions } = useApp();
  const [tab, setTab] = useState<'waiting' | 'decided'>('waiting');
  const [apps, setApps] = useState<CoachApplication[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [payments, setPayments] = useState<Payments>(null);

  const load = useCallback(async () => {
    setError('');
    try { setApps(await actions.loadAllApplications()); } catch (e) { setApps([]); setError(e instanceof Error ? e.message : 'Could not load applications.'); }
    try { setPayments(await remote.paymentsAdminStatus()); } catch { setPayments('off'); }
  }, [actions]);
  useEffect(() => { if (currentUser?.isAdmin) void load(); }, [currentUser?.isAdmin, load]);

  if (!currentUser?.isAdmin) {
    return <Screen title="Coaches" compactTitle onBack={() => goBack()}><EmptyState icon="lock-closed-outline" title="Admins only" /></Screen>;
  }

  const decide = async (app: CoachApplication, approve: boolean) => {
    setBusy(app.id);
    setError('');
    try {
      if (approve) await actions.approveCoachApplication(app.id, note.trim() || undefined);
      else await actions.rejectCoachApplication(app.id, note.trim() || undefined);
      setNote('');
      setOpenId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not save.');
    } finally {
      setBusy(null);
    }
  };
  const finishStripe = async () => {
    setBusy('stripe');
    setError('');
    try { await remote.setupPaymentsWebhook(); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'That did not work.'); } finally { setBusy(null); }
  };
  const openResume = async (path: string) => {
    const url = await remote.resumeLink(path);
    if (url) void Linking.openURL(url);
  };

  const waiting = (apps ?? []).filter((a) => a.status === 'submitted' || a.status === 'in-review');
  const decided = (apps ?? []).filter((a) => a.status === 'approved' || a.status === 'rejected');
  const list = tab === 'waiting' ? waiting : decided;

  return (
    <Screen title="Coaches" compactTitle onBack={() => goBack()} onRefresh={load}>
      {/* ------------------------------------------------------- payments */}
      <View style={styles.status}>
        <Ionicons name={payments && payments !== 'off' && payments.webhook ? 'checkmark-circle' : 'card-outline'} size={20} color={payments && payments !== 'off' && payments.webhook ? colors.success : colors.textMuted} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.statusTitle}>
            {payments === null ? 'Checking payments…' : payments === 'off' ? 'Payments are off' : payments.webhook ? `Payments are on${payments.live ? '' : ' · test mode'}` : 'Payments need one more step'}
          </Text>
          <Text style={styles.meta}>
            {payments === 'off' ? 'Add the Stripe secret key in Supabase to switch them on.'
              : payments && !payments.webhook ? 'So Stripe can tell CourtSide when a booking is paid, even if the player closes the page.'
              : payments ? `CourtSide keeps ${payments.feePercent}% of each booking.` : ''}
          </Text>
        </View>
        {payments && payments !== 'off' && !payments.webhook ? <Button label="Finish" onPress={finishStripe} loading={busy === 'stripe'} /> : null}
      </View>

      <SegmentedControl segments={[{ value: 'waiting', label: waiting.length ? `Waiting · ${waiting.length}` : 'Waiting' }, { value: 'decided', label: 'Decided' }]} value={tab} onChange={setTab} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {apps === null ? <View style={styles.wait}><CourtSpinner size={28} /></View> : list.length === 0 ? (
        <EmptyState icon="ribbon-outline" title={tab === 'waiting' ? 'No applications waiting' : 'Nothing decided yet'} body="New applications arrive here." />
      ) : (
        <View style={styles.group}>
          {list.map((a, index) => {
            const expanded = openId === a.id;
            return (
              <View key={a.id} style={[index > 0 && styles.line]}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => { setOpenId(expanded ? null : a.id); setNote(''); }} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.name}>{a.fullName}</Text>
                    <Text style={styles.meta}>{[a.utr && `UTR ${a.utr}`, a.ntrp && `NTRP ${a.ntrp}`, `${a.yearsCoaching} yrs`].filter(Boolean).join(' · ')} · {relativeTime(a.createdAt)}{a.status === 'approved' ? ' · approved' : a.status === 'rejected' ? ' · declined' : ''}</Text>
                  </View>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textFaint} />
                </Pressable>
                {expanded ? (
                  <View style={styles.detail}>
                    <Detail label="Email" value={a.email} />
                    <Detail label="Phone" value={a.phone} />
                    <Detail label="Certifications" value={a.certifications} />
                    <Detail label="Coaches" value={a.specialties.map((s) => SPECIALTY_LABEL[s] ?? s).join(', ')} />
                    <Detail label="Clients now" value={a.currentClients} />
                    <Detail label="References" value={a.references} />
                    <Detail label="About" value={a.about} />
                    <View style={styles.linksRow}>
                      {a.utrLink ? <Pressable onPress={() => void Linking.openURL(a.utrLink!)}><Text style={styles.link}>UTR page</Text></Pressable> : null}
                      {a.ntrpLink ? <Pressable onPress={() => void Linking.openURL(a.ntrpLink!)}><Text style={styles.link}>USTA page</Text></Pressable> : null}
                      {a.resumePath ? <Pressable onPress={() => void openResume(a.resumePath!)}><Text style={styles.link}>Résumé{a.resumeLabel ? ` (${a.resumeLabel})` : ''}</Text></Pressable> : null}
                    </View>
                    {a.status === 'submitted' || a.status === 'in-review' ? (
                      <>
                        <Field label="Note to them (optional)" value={note} onChangeText={setNote} placeholder="Welcome aboard. Set up your studio to start taking bookings." multiline minHeight={60} />
                        <View style={styles.buttons}>
                          <View style={{ flex: 1 }}><Button label="Decline" variant="secondary" onPress={() => void decide(a, false)} disabled={!!busy} full /></View>
                          <View style={{ flex: 1 }}><Button label="Approve" onPress={() => void decide(a, true)} loading={busy === a.id} disabled={!!busy} full /></View>
                        </View>
                      </>
                    ) : a.reviewNote ? <Detail label="Your note" value={a.reviewNote} /> : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  const styles = useThemedStyles(styleDefinitions);
  if (!value?.trim()) return null;
  return (
    <View style={{ gap: 2 }}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} selectable>{value}</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.surface, marginBottom: spacing.lg },
  statusTitle: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  wait: { paddingVertical: 48, alignItems: 'center' },
  error: { ...typography.small, color: colors.danger, marginTop: spacing.md },
  group: { marginTop: spacing.lg, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  name: { ...typography.body, ...font('600'), color: colors.text },
  detail: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  detailLabel: { ...typography.caption, color: colors.textFaint, letterSpacing: 0 },
  detailValue: { ...typography.small, color: colors.text, lineHeight: 19 },
  linksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  link: { ...typography.smallStrong, color: colors.brand },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  radius: { borderRadius: radius.md },
});

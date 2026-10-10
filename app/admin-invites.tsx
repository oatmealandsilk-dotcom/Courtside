import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { Avatar, EmptyState, Screen } from '@/components/ui';
import { remote, type InviteSummaryRow, type InviteeRow } from '@/data/remote';
import { inviteLink } from '@/features/invite/referral';
import { confirm } from '@/lib/confirm';
import { goBack } from '@/lib/goBack';
import { useAndroidBack } from '@/lib/androidBack';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';

const dollars = (cents: number) => `$${cents % 100 ? (cents / 100).toFixed(2) : cents / 100}`;
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
/** On the server's affiliates list (migration 156): the only people paid. */
const isAffiliate = (row: InviteSummaryRow) => row.isAffiliate === true;

/**
 * Admin: paying the affiliates for the players they bring ($1 each). One row
 * per person who has invited anyone: their link and how many qualified.
 * Qualified (worked out by the server, migrations 71 and 80): joined through
 * their link, finished setting up, and was seen again on a later day.
 * Deleted and suspended accounts never count. Tap a row for their people.
 *
 * Only affiliates are paid (Oct 10, owner: "i shouldnt have to pay non
 * affiliates"). Who is one is the server's 'affiliates' list (migration 147),
 * the same check that gives them the money page on their phone, and the
 * server says so on each row (isAffiliate, migration 156). Affiliates come
 * first, marked "Affiliate", with what was paid, what is owed and "Mark
 * paid"; everyone else follows with their counts only (signed up, set up,
 * qualified): nothing owed, no Mark paid (the server refuses it too), and
 * left out of the total. Before migration 156 runs nobody can be told apart,
 * so no money shows at all and the page says why.
 */
export default function AdminInvites() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser } = useApp();
  const [rows, setRows] = useState<InviteSummaryRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<InviteSummaryRow | null>(null);
  const [people, setPeople] = useState<InviteeRow[] | null>(null);
  // Android's Back: from one person's people back to the list, as the page's back does.
  useAndroidBack(() => { if (!open) return false; setOpen(null); setPeople(null); return true; });

  const load = useCallback(async () => {
    setError('');
    try { setRows(await remote.fetchInviteSummary()); } catch (e) { setRows([]); setError(e instanceof Error ? e.message : 'Could not load invites.'); }
  }, []);
  useEffect(() => { if (currentUser?.isAdmin) void load(); }, [currentUser?.isAdmin, load]);

  const openRow = useCallback(async (row: InviteSummaryRow) => {
    setOpen(row);
    setPeople(null);
    try { setPeople(await remote.fetchInvitees(row.id)); } catch (e) { setPeople([]); setError(e instanceof Error ? e.message : 'Could not load their people.'); }
  }, []);

  if (!currentUser?.isAdmin) {
    return <Screen title="Invites" compactTitle onBack={() => goBack()}><EmptyState icon="lock-closed-outline" title="Admins only" /></Screen>;
  }

  const copyLink = async (row: InviteSummaryRow) => {
    await Clipboard.setStringAsync(inviteLink(row.handle));
    haptics.tap();
    showToast({ title: `Copied @${row.handle}'s link`, icon: 'link-outline' });
  };

  const markPaid = (row: InviteSummaryRow) => isAffiliate(row) && confirm({
    title: `Mark ${dollars(row.owedCents)} paid?`,
    message: `Records ${row.owed} ${row.owed === 1 ? 'player' : 'players'} as paid to @${row.handle}. Do this after the money has been sent.`,
    confirmLabel: 'Mark paid',
    onConfirm: async () => {
      setBusy(row.id);
      setError('');
      try {
        await remote.markInvitesPaid(row.id, row.owed);
        haptics.commit();
        showToast({ title: `${dollars(row.owedCents)} to @${row.handle} recorded`, icon: 'checkmark-circle-outline' });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That did not save.');
      } finally {
        setBusy(null);
        await load();
      }
    },
  });

  // One person's people.
  if (open) {
    const fresh = rows?.find((r) => r.id === open.id) ?? open;
    return (
      <Screen title={`@${fresh.handle}`} compactTitle onBack={() => { setOpen(null); setPeople(null); }} onRefresh={() => openRow(fresh)}>
        <Text style={styles.lead}>
          {fresh.invited} signed up · {fresh.setUp} set up · {fresh.qualified} qualified · {isAffiliate(fresh) ? `${fresh.paid} paid` : 'not an affiliate, not paid'}
        </Text>
        {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
        {people === null ? (
          <View style={styles.loading}><CourtSpinner size={28} /></View>
        ) : !people.length ? (
          <EmptyState icon="people-outline" title="Nobody here" body="Deleted and suspended accounts are not listed." />
        ) : (
          <View style={styles.list}>
            {people.map((p, index) => {
              const status = p.qualifiedAt ? `Qualified ${shortDate(p.qualifiedAt)}` : p.setUp ? 'Set up profile' : 'Signed up';
              return (
                <View key={p.id} style={[styles.row, index > 0 && styles.rowLine]}>
                  <Avatar uri={p.avatarUrl} name={p.name} seed={p.id} size={36} />
                  <View style={styles.words}>
                    <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.meta} numberOfLines={1}>@{p.handle} · joined {shortDate(p.joinedAt)}</Text>
                  </View>
                  <View style={[styles.status, p.qualifiedAt ? styles.statusOn : null]}>
                    {p.qualifiedAt ? <Ionicons name="checkmark" size={12} color={colors.brandInk} /> : null}
                    <Text style={[styles.statusText, p.qualifiedAt ? styles.statusTextOn : null]}>{status}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
        <Text style={styles.foot}>
          Qualified: joined through the link, finished setting up, and opened CourtSide again on a later day.
        </Text>
      </Screen>
    );
  }

  // Affiliates first (the server sends them first too; kept in its order within each).
  const listed = rows ? [...rows].sort((a, b) => Number(isAffiliate(b)) - Number(isAffiliate(a))) : null;
  const owedTotal = rows?.reduce((sum, r) => sum + (isAffiliate(r) ? r.owedCents : 0), 0) ?? 0;
  // Before migration 156 the server does not say who is an affiliate.
  const unmarked = !!rows?.length && !rows.some((r) => typeof r.isAffiliate === 'boolean');

  return (
    <Screen title="Invites" compactTitle onBack={() => goBack()} onRefresh={load}>
      <Text style={styles.lead}>
        Affiliates are paid $1 for each real player they bring: joined through their link or code, set up, has a confirmed email (or Apple or Google), came back on a later day within 2 weeks, did something (followed, posted, messaged, joined a hit or logged a session), and never signed in on the inviter's phone. "Suspicious" means their people share phones, more than 10 joined in an hour, or over 20 counted in a day; nothing is held back. Anyone else who has invited people is listed after the affiliates with counts only: they are not paid. {rows?.length ? (owedTotal ? `${dollars(owedTotal)} owed to affiliates in all.` : 'Nothing owed right now.') : ''}
      </Text>
      {unmarked ? <Text style={styles.error}>Affiliates can't be told apart until migration 156 runs in Supabase, so no money is shown.</Text> : null}
      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
      {listed === null ? (
        <View style={styles.loading}><CourtSpinner size={28} /></View>
      ) : !listed.length ? (
        error ? null : <EmptyState icon="people-outline" title="No invites yet" body="When someone joins through a person's link, that person shows up here." />
      ) : (
        <View style={styles.list}>
          {listed.map((row, index) => {
            const affiliate = isAffiliate(row);
            return (
              <Pressable
                key={row.id}
                accessibilityRole="button"
                accessibilityLabel={affiliate
                  ? `${row.name}, affiliate${row.suspicious ? ' (suspicious)' : ''}: ${row.qualified} qualified, ${row.paid} paid, ${dollars(row.owedCents)} owed. Shows their people.`
                  : `${row.name}${row.suspicious ? ' (suspicious)' : ''}: ${row.invited} signed up, ${row.setUp} set up, ${row.qualified} qualified. Not an affiliate, not paid. Shows their people.`}
                onPress={() => void openRow(row)}
                style={({ pressed }) => [styles.block, index > 0 && styles.rowLine, pressed && { backgroundColor: colors.surfaceAlt }]}
              >
                <View style={styles.rowTop}>
                  <Avatar uri={row.avatarUrl} name={row.name} seed={row.id} size={40} />
                  <View style={styles.words}>
                    <View style={styles.nameRow}>
                      <Text style={[styles.name, styles.nameShrink]} numberOfLines={1}>{row.name}</Text>
                      {affiliate ? <View style={styles.tag}><Text style={styles.tagText}>Affiliate</Text></View> : null}
                    </View>
                    <Text style={styles.meta} numberOfLines={1}>@{row.handle}{row.suspended ? ' · suspended' : ''}</Text>
                    {row.suspicious ? (
                      <View style={styles.flag} accessibilityLabel="Suspicious: shared phones, a burst of sign-ups, or over 20 in a day. Nothing is held back.">
                        <Ionicons name="alert-circle-outline" size={12} color={colors.warning} />
                        <Text style={styles.flagText}>Suspicious</Text>
                      </View>
                    ) : null}
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Copy @${row.handle}'s invite link`} hitSlop={8} onPress={() => void copyLink(row)} style={styles.copy}>
                    <Ionicons name="link-outline" size={14} color={colors.text} />
                    <Text style={styles.copyText}>Copy link</Text>
                  </Pressable>
                </View>
                {affiliate ? (
                  <View style={styles.numbers}>
                    <Num label="Qualified" value={String(row.qualified)} />
                    <Num label="Paid" value={String(row.paid)} />
                    <Num label="Owed" value={dollars(row.owedCents)} strong={row.owed > 0} />
                    {row.owed > 0 ? (
                      <Pressable accessibilityRole="button" accessibilityLabel={`Mark ${dollars(row.owedCents)} paid to @${row.handle}`} disabled={busy === row.id} onPress={() => markPaid(row)} style={[styles.pay, busy === row.id && styles.payBusy]}>
                        <Text style={styles.payText}>{busy === row.id ? 'Saving…' : 'Mark paid'}</Text>
                      </Pressable>
                    ) : (
                      <Text style={styles.settled}>{row.lastPaidAt ? `Paid ${shortDate(row.lastPaidAt)}` : row.invited ? `${row.invited} signed up` : ''}</Text>
                    )}
                  </View>
                ) : (
                  // Not an affiliate: their counts, never money ("Not paid": short enough for a small phone).
                  <View style={styles.numbers}>
                    <Num label="Signed up" value={String(row.invited)} />
                    <Num label="Set up" value={String(row.setUp)} />
                    <Num label="Qualified" value={String(row.qualified)} />
                    <Text style={styles.settled}>Not paid</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

function Num({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.num}>
      <Text style={[styles.numValue, strong && styles.numStrong]}>{value}</Text>
      <Text style={styles.numLabel}>{label}</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  lead: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingBottom: spacing.lg },
  error: { ...typography.small, color: colors.danger, paddingBottom: spacing.md },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },
  list: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  block: { gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  words: { flex: 1, gap: 1, minWidth: 0 },
  name: { ...typography.bodyStrong, color: colors.text },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  nameShrink: { flexShrink: 1 },
  // "Affiliate": the court's colour with its own ink on it, which reads on every court.
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.brand },
  tagText: { ...typography.caption, fontSize: 11, letterSpacing: 0.2, color: colors.brandInk, fontWeight: '700' },
  meta: { ...typography.small, color: colors.textMuted },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 2 },
  flagText: { ...typography.small, color: colors.warning, fontWeight: '600' },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  copyText: { ...typography.smallStrong, color: colors.text },
  numbers: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingLeft: 40 + spacing.md },
  num: { gap: 0 },
  numValue: { ...typography.bodyStrong, color: colors.text, fontVariant: ['tabular-nums'] },
  numStrong: { color: colors.brand },
  numLabel: { ...typography.caption, letterSpacing: 0, color: colors.textFaint },
  pay: { marginLeft: 'auto', height: 32, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  payBusy: { opacity: 0.6 },
  payText: { ...typography.smallStrong, color: colors.brandInk },
  settled: { marginLeft: 'auto', ...typography.small, color: colors.textFaint },
  status: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, height: 26, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  statusOn: { backgroundColor: colors.brand },
  statusText: { ...typography.smallStrong, color: colors.textMuted },
  statusTextOn: { color: colors.brandInk },
  foot: { ...typography.small, color: colors.textFaint, lineHeight: 18, paddingTop: spacing.md },
});

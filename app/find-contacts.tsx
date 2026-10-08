import React, { useEffect, useMemo, useState } from 'react';
import { AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { CourtSpinner } from '@/components/CourtSpinner';
import { Avatar, Button, Screen } from '@/components/ui';
import type { ContactMatch } from '@/data/types';
import { canReadContacts, readContacts, type PhoneContact } from '@/features/contacts/phoneContacts';
import { inviteLink } from '@/features/invite/referral';
import { goBack } from '@/lib/goBack';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';
import { PHONE_LINKING } from '@/lib/phoneLinking';

type Found = { match: ContactMatch; contactName?: string };
type Phase = 'start' | 'reading' | 'done' | 'denied' | 'ask-again' | 'unavailable' | 'limit' | 'failed';

/**
 * A plain, up-front word, before the phone's own question, whenever contacts
 * leave the phone: what goes, where, and what happens to it. Google Play asks
 * for it, and Apple's rules want the same clarity, so both phones say it (Oct 5).
 */
const INTRO = 'To find friends, CourtSide sends the phone numbers and emails in your contacts to its server, checks them against CourtSide accounts, then deletes them. Nothing from your contacts is saved or shown to anyone.';

/** Where the switch is, in the words of the phone in hand (Android keeps Contacts one step deeper, under Permissions). */
const SETTINGS_LINE = Platform.OS === 'android'
  ? 'Open Settings, tap Permissions, then Contacts, then Allow. Then come back.'
  : 'Turn on Contacts for CourtSide in your phone’s Settings, then come back.';

const PAGE = 40;

/**
 * Find friends from your contacts (Oct 4, owner): which of the people in
 * your phone are already on CourtSide, with Follow, and a text invite with
 * your own link for the rest. Numbers and emails are checked once and not
 * kept (migration 88). Phone app only; a browser cannot read contacts.
 */
export default function FindContacts() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, followingIds, actions, prefs } = useApp();
  const [phase, setPhase] = useState<Phase>(canReadContacts() ? 'start' : 'unavailable');
  const [found, setFound] = useState<Found[]>([]);
  const [others, setOthers] = useState<PhoneContact[]>([]);
  const [shown, setShown] = useState(PAGE);
  const [hasPhone, setHasPhone] = useState(true);
  useEffect(() => { void actions.myPhone().then((p) => setHasPhone(!!p)).catch(() => undefined); }, [actions]);

  const run = async () => {
    setPhase('reading');
    try {
      const contacts = await readContacts();
      if (contacts === 'denied' || contacts === 'ask-again' || contacts === 'unavailable') { setPhase(contacts); return; }
      const phones = [...new Set(contacts.flatMap((c) => c.phones))];
      const emails = [...new Set(contacts.flatMap((c) => c.emails.map((e) => e.trim().toLowerCase())))];
      const matches = await actions.matchContacts(phones, emails);
      if (matches === 'limit') { setPhase('limit'); return; }
      if (!matches) { setPhase('failed'); return; }
      // Which contact each player came from, so the row can say "Mum" as well as @handle.
      const byDetail = new Map<string, PhoneContact>();
      contacts.forEach((c) => { c.phones.forEach((p) => byDetail.set(p, c)); c.emails.forEach((e) => byDetail.set(e.trim().toLowerCase(), c)); });
      const matchedIds = new Set<string>();
      const list = matches.map((m) => {
        const contact = (m.phone && byDetail.get(m.phone)) || (m.email && byDetail.get(m.email.toLowerCase())) || undefined;
        if (contact) matchedIds.add(contact.id);
        return { match: m, contactName: contact?.name };
      });
      setFound(list);
      setOthers(contacts.filter((c) => !matchedIds.has(c.id) && c.phones.length).sort((a, b) => a.name.localeCompare(b.name)));
      setPhase('done');
      haptics.commit();
    } catch {
      setPhase('failed');
    }
  };

  // Back from the phone's Settings with Contacts now allowed: carry straight on (Android; harmless elsewhere).
  useEffect(() => {
    if (phase !== 'denied' || Platform.OS !== 'android') return undefined;
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') void run(); });
    return () => sub.remove();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const link = currentUser ? inviteLink(currentUser.handle) : '';
  const invite = (contact: PhoneContact) => {
    const body = encodeURIComponent(`Come hit with me on CourtSide 🎾 ${link}`);
    const to = contact.phones[0].replace(/[^\d+]/g, '');
    haptics.tap();
    void Linking.openURL(Platform.OS === 'ios' ? `sms:${to}&body=${body}` : `sms:${to}?body=${body}`);
  };
  const following = useMemo(() => new Set(followingIds), [followingIds]);

  return (
    <Screen title="Find friends" compactTitle onBack={() => goBack()}>
      {phase === 'start' || phase === 'reading' ? (
        <View style={styles.intro}>
          <View style={styles.badge}><Ionicons name="people" size={30} color={colors.brand} /></View>
          <Text style={styles.title}>See who you know on CourtSide</Text>
          <Text style={styles.lead}>{INTRO}</Text>
          <Button label={phase === 'reading' ? 'Checking your contacts…' : 'Find friends from contacts'} onPress={() => void run()} loading={phase === 'reading'} full />
        </View>
      ) : phase === 'denied' ? (
        <Message styles={styles} icon="lock-closed-outline" title="CourtSide can’t see your contacts" body={SETTINGS_LINE} action={{ label: 'Open Settings', onPress: () => void Linking.openSettings() }} />
      ) : phase === 'ask-again' ? (
        <Message styles={styles} icon="lock-closed-outline" title="CourtSide can’t see your contacts" body="Tap Try again and choose Allow to find friends. Nothing from your contacts is kept." action={{ label: 'Try again', onPress: () => void run() }} />
      ) : phase === 'unavailable' ? (
        <Message styles={styles} icon="phone-portrait-outline" title={Platform.OS === 'web' ? 'Open CourtSide on your phone' : 'Update CourtSide to use this'}
          body={Platform.OS === 'web' ? 'Finding friends from your contacts works in the CourtSide app on your phone.' : 'Finding friends from your contacts needs the newest version of the app.'} />
      ) : phase === 'limit' ? (
        <Message styles={styles} icon="time-outline" title="That’s enough for today" body="You can check your contacts again tomorrow." />
      ) : phase === 'failed' ? (
        <Message styles={styles} icon="cloud-offline-outline" title="That didn’t work" body="Check your connection and try again." action={{ label: 'Try again', onPress: () => void run() }} />
      ) : (
        <View style={styles.results}>
          {/* Not when "Let people find me from their contacts" is off (migration 89): a number would find no one to you. */}
          {PHONE_LINKING && !hasPhone && prefs.contactsFindable ? (
            <Pressable accessibilityRole="link" onPress={() => router.push('/link-phone')} style={({ pressed }) => [styles.nudge, pressed && { opacity: 0.8 }]}>
              <Ionicons name="call-outline" size={18} color={colors.brand} />
              <Text style={styles.nudgeText}>Link your phone number so friends can find you too</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </Pressable>
          ) : null}

          <Text style={styles.section}>On CourtSide{found.length ? ` · ${found.length}` : ''}</Text>
          {found.length === 0 ? <Text style={styles.empty}>None of your contacts are on CourtSide yet. Invite a few below.</Text> : null}
          {found.map(({ match, contactName }) => {
            const on = following.has(match.id);
            return (
              <View key={match.id} style={styles.row}>
                <Pressable accessibilityRole="link" accessibilityLabel={`Open ${match.name ?? match.handle}'s profile`} onPress={() => router.push(`/user/${match.id}`)} style={styles.who}>
                  <Avatar name={match.name || match.handle} seed={match.id} uri={match.avatarUrl} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{match.name || `@${match.handle}`}</Text>
                    <Text style={styles.meta} numberOfLines={1}>@{match.handle}{contactName ? ` · ${contactName} in your contacts` : ''}</Text>
                  </View>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={on ? `Following ${match.handle}` : `Follow ${match.handle}`} onPress={() => actions.toggleFollow(match.id)} style={[styles.pill, on ? styles.pillOff : styles.pillOn]}>
                  <Text style={[styles.pillText, on ? styles.pillTextOff : styles.pillTextOn]}>{on ? 'Following' : 'Follow'}</Text>
                </Pressable>
              </View>
            );
          })}

          {others.length ? <Text style={[styles.section, { marginTop: spacing.lg }]}>Invite to CourtSide</Text> : null}
          {others.slice(0, shown).map((c) => (
            <View key={c.id} style={styles.row}>
              <View style={styles.who}>
                <Avatar name={c.name} seed={c.id} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                  <Text style={styles.meta} numberOfLines={1}>{c.phones[0]}</Text>
                </View>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Invite ${c.name} by text`} onPress={() => invite(c)} style={[styles.pill, styles.pillOff]}>
                <Text style={[styles.pillText, styles.pillTextOff]}>Invite</Text>
              </Pressable>
            </View>
          ))}
          {others.length > shown ? <Button label={`Show more (${others.length - shown})`} variant="ghost" onPress={() => setShown((n) => n + PAGE)} full /> : null}
        </View>
      )}
    </Screen>
  );
}

function Message({ styles, icon, title, body, action }: { styles: ReturnType<typeof useThemedStyles<typeof styleDefinitions>>; icon: keyof typeof Ionicons.glyphMap; title: string; body: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.intro}>
      <View style={styles.badge}><Ionicons name={icon} size={28} color={colors.textMuted} /></View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.lead}>{body}</Text>
      {action ? <Button label={action.label} onPress={action.onPress} full /> : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  intro: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xl, paddingHorizontal: spacing.sm },
  badge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandDim },
  title: { ...typography.title, color: colors.text, textAlign: 'center' },
  lead: { ...typography.body, color: colors.textMuted, lineHeight: 22, textAlign: 'center', marginBottom: spacing.sm },
  results: { gap: 4 },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: 16, backgroundColor: colors.surfaceAlt, marginBottom: spacing.md },
  nudgeText: { ...typography.smallStrong, color: colors.text, flex: 1 },
  section: { ...typography.smallStrong, color: colors.textMuted, marginBottom: 4 },
  empty: { ...typography.small, color: colors.textFaint, paddingVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8 },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.small, color: colors.textMuted },
  pill: { height: 34, paddingHorizontal: 16, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: colors.brand },
  pillOff: { borderWidth: 1, borderColor: colors.borderStrong },
  pillText: { ...typography.smallStrong },
  pillTextOn: { color: colors.brandInk },
  pillTextOff: { color: colors.text },
});

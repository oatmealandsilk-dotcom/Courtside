import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { DragSheet } from '@/components/DragSheet';
import { Submit } from '@/components/sheet/SheetForm';
import type { ID } from '@/data/types';
import { FlowHeader } from '@/features/groups/create/FlowHeader';
import { InvitePeople, useSendGroupInvites } from '@/features/groups/create/InvitePeople';
import { confirm } from '@/lib/confirm';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/*
 * "Invite" on a group's page and on its empty feed: the same last step as
 * Start a group, any time after, under the same header. The group's link to
 * copy or share, and people to tick; each one picked gets an invite with
 * Join / Not now (migration 181; before it, the invite in your chat with
 * them). Any member can invite, and whoever they invite joins straight
 * away, Ask to join or not (migration 182); only someone an admin took out
 * still needs an admin. Opened from a link
 * before your groups have loaded, it waits for them rather than saying
 * you're not in it; closing with people ticked asks whether to send.
 */
export default function GroupInvite() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { feedGroups, feedGroupsOn, feedGroupInvitesLive, users, currentUserId, actions } = useApp();
  const sendInvites = useSendGroupInvites();
  const group = feedGroups.find((g) => g.id === id);
  const [picked, setPicked] = useState<ID[]>([]);
  const [retrying, setRetrying] = useState(false);
  const [closeSignal, setCloseSignal] = useState(0);
  const dismiss = () => setCloseSignal((n) => n + 1);
  // Read once signed in (a link opened cold signs in first).
  useEffect(() => { if (currentUserId && feedGroupsOn !== true) void actions.loadFeedGroups(); }, [currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps
  const loading = !group && feedGroupsOn === null;
  const off = !group && feedGroupsOn === false;

  const [sending, setSending] = useState(false);
  /** Sends, then says so: "Invited …" only once the server took them, otherwise only why not. */
  const sendNow = async (): Promise<boolean> => {
    if (!group || !picked.length || sending) return false;
    setSending(true);
    const out = await sendInvites(group, picked).finally(() => setSending(false));
    if (!out.ok) {
      showToast({ title: out.error ?? 'That didn’t go through.', icon: 'alert-circle-outline', long: true });
      return false;
    }
    if (feedGroupInvitesLive) {
      const one = picked.length === 1 ? users.find((u) => u.id === picked[0])?.name.split(' ')[0] : undefined;
      showToast({ title: one ? `Invited ${one}` : `Invited ${picked.length} ${picked.length === 1 ? 'person' : 'people'}`, body: `To ${group.name}. They’ll get a notification.`, icon: 'paper-plane-outline' });
    } else {
      showToast({ title: `${picked.length === 1 ? 'Invite' : `${picked.length} invites`} sent`, body: `To join ${group.name}.`, icon: 'paper-plane-outline' });
    }
    setPicked([]);
    return true;
  };
  // The sheet closes only once they went; a refusal leaves it open with the people still picked.
  const send = () => { void sendNow().then((ok) => { if (ok) dismiss(); }); };

  // People ticked but not sent: closing asks first.
  const mayClose = () => {
    if (sending) return false;
    if (!group || !picked.length) return true;
    const n = picked.length;
    confirm({
      title: `Send ${n} ${n === 1 ? 'invite' : 'invites'}?`,
      message: `You picked ${n === 1 ? 'someone' : `${n} people`} to invite to ${group.name} but haven’t sent ${n === 1 ? 'it' : 'them'} yet.`,
      confirmLabel: 'Send',
      onConfirm: send,
      also: { label: 'Don’t send', onPress: dismiss },
    });
    return false;
  };
  const guard = useRef(mayClose);
  guard.current = mayClose;
  const requestClose = () => { if (guard.current()) dismiss(); };

  let body: React.ReactNode;
  if (group) body = <InvitePeople groupId={group.id} groupName={group.name} picked={picked} onPicked={setPicked} />;
  else if (loading) body = <View style={styles.center}><ActivityIndicator color={colors.textFaint} /><Text style={styles.note}>Opening the group…</Text></View>;
  else if (off) body = <Text style={styles.note}>Groups didn’t load. Check your connection and try again.</Text>;
  else body = <Text style={styles.note}>You’re not in this group any more.</Text>;

  return (
    <DragSheet
      closeSignal={closeSignal}
      onDismissed={() => router.back()}
      beforeClose={() => guard.current()}
      peekFraction={0.9}
      header={<FlowHeader title="Invite people" line={group?.name} onClose={requestClose} />}
    >
      <View style={styles.fill}>
        <ScrollView style={styles.fill} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          {body}
        </ScrollView>
        {group || off ? (
          <View style={styles.footer}>
            {/* Ask to join is for strangers: anyone invited from here is let in by the invite itself (migration 182). */}
            {group?.ask && feedGroupInvitesLive ? <Text style={styles.foot}>Anyone you invite joins straight away. No admin needs to say yes.</Text> : null}
            {group ? (
              <Submit
                label={feedGroupInvitesLive ? `Invite ${picked.length}` : `Send ${picked.length} ${picked.length === 1 ? 'invite' : 'invites'}`}
                waiting="Pick people to invite"
                disabled={!picked.length}
                busy={sending}
                busyLabel="Inviting…"
                onPress={send}
              />
            ) : (
              <Submit
                label={retrying ? 'Trying again…' : 'Try again'}
                disabled={retrying}
                onPress={() => { setRetrying(true); void actions.loadFeedGroups().catch(() => undefined).finally(() => setRetrying(false)); }}
              />
            )}
          </View>
        ) : null}
      </View>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  fill: { flex: 1, minHeight: 0 },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  center: { alignItems: 'center', gap: spacing.md, paddingVertical: 60 },
  note: { ...typography.body, color: colors.textMuted, paddingVertical: spacing.xl, textAlign: 'center' },
  foot: { ...typography.small, color: colors.textMuted, textAlign: 'center', paddingBottom: spacing.sm },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg },
});

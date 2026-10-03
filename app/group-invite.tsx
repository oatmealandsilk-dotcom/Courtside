import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { DragSheet } from '@/components/DragSheet';
import { Submit } from '@/components/sheet/SheetForm';
import type { ID } from '@/data/types';
import { FlowHeader } from '@/features/groups/create/FlowHeader';
import { InvitePeople } from '@/features/groups/create/InvitePeople';
import { confirm } from '@/lib/confirm';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/*
 * "Invite" on a group's page and on its empty feed: the same last step as
 * Start a group, any time after, under the same header. The group's link to
 * copy or share, and the people you follow to tick; each one picked gets
 * the invite in your chat with them. Any member can invite; how people get
 * in (Open or Ask to join) is still the group's own. Opened from a link
 * before your groups have loaded, it waits for them rather than saying
 * you're not in it; closing with people ticked asks whether to send.
 */
export default function GroupInvite() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { feedGroups, feedGroupsOn, currentUserId, actions } = useApp();
  const group = feedGroups.find((g) => g.id === id);
  const [picked, setPicked] = useState<ID[]>([]);
  const [retrying, setRetrying] = useState(false);
  const [closeSignal, setCloseSignal] = useState(0);
  const dismiss = () => setCloseSignal((n) => n + 1);
  // Read once signed in (a link opened cold signs in first).
  useEffect(() => { if (currentUserId && feedGroupsOn !== true) void actions.loadFeedGroups(); }, [currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps
  const loading = !group && feedGroupsOn === null;
  const off = !group && feedGroupsOn === false;

  const sendNow = () => {
    if (!group || !picked.length) return;
    actions.shareToChats({ userIds: picked }, { kind: 'group', id: group.id, name: group.name });
    haptics.reward();
    showToast({ title: `${picked.length === 1 ? 'Invite' : `${picked.length} invites`} sent`, body: `To join ${group.name}.`, icon: 'paper-plane-outline' });
  };
  const send = () => { sendNow(); dismiss(); };

  // People ticked but not sent: closing asks first.
  const mayClose = () => {
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
            {group ? (
              <Submit
                label={`Send ${picked.length} ${picked.length === 1 ? 'invite' : 'invites'}`}
                waiting="Pick people to invite"
                disabled={!picked.length}
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
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg },
});

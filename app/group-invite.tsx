import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { DragSheet } from '@/components/DragSheet';
import { SheetTitle, Submit } from '@/components/sheet/SheetForm';
import type { ID } from '@/data/types';
import { InvitePeople } from '@/features/groups/create/InvitePeople';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/*
 * "Invite" on a group's page and on its empty feed: the same last step as
 * Start a group, any time after. The group's link to copy or share, and the
 * people you follow to tick; each one picked gets the invite as a card in
 * your chat with them. Any member can invite; how people get in (Open or Ask
 * to join) is still the group's own.
 */
export default function GroupInvite() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { feedGroups, actions } = useApp();
  const group = feedGroups.find((g) => g.id === id);
  const [picked, setPicked] = useState<ID[]>([]);
  const [closeSignal, setCloseSignal] = useState(0);
  const dismiss = () => setCloseSignal((n) => n + 1);

  const send = () => {
    if (!group || !picked.length) return;
    actions.shareToChats({ userIds: picked }, { kind: 'group', id: group.id, name: group.name });
    haptics.reward();
    showToast({ title: `${picked.length === 1 ? 'Invite' : `${picked.length} invites`} sent`, body: `To join ${group.name}.`, icon: 'paper-plane-outline' });
    dismiss();
  };

  return (
    <DragSheet
      closeSignal={closeSignal}
      onDismissed={() => router.back()}
      peekFraction={0.9}
      header={<SheetTitle title="Invite people" line={group?.name} onClose={dismiss} />}
    >
      <View style={styles.fill}>
        <ScrollView style={styles.fill} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          {group ? (
            <InvitePeople groupId={group.id} groupName={group.name} picked={picked} onPicked={setPicked} />
          ) : (
            <Text style={styles.note}>You’re not in this group any more.</Text>
          )}
        </ScrollView>
        {group ? (
          <View style={styles.footer}>
            <Submit
              label={`Send ${picked.length} ${picked.length === 1 ? 'invite' : 'invites'}`}
              waiting="Pick people to invite"
              disabled={!picked.length}
              onPress={send}
            />
          </View>
        ) : null}
      </View>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  fill: { flex: 1, minHeight: 0 },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  note: { ...typography.body, color: colors.textMuted, paddingVertical: spacing.xl, textAlign: 'center' },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg },
});

import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, Screen } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * The logins remembered on this device, Instagram-style: tap one to become
 * it, no password. Adding one goes through the normal sign-in screen.
 */
export default function Accounts() {
  const styles = useThemedStyles(styleDefinitions);
  const { savedAccounts, currentUserId, actions } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const pick = async (id: string) => {
    if (id === currentUserId || busy) return;
    setBusy(id);
    setError('');
    try {
      await actions.switchAccount(id);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not switch accounts.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title="Accounts" compactTitle onBack={() => goBack()}>
      <Text style={styles.lead}>Logins saved on this device. Tap one to switch — no password needed.</Text>
      <View style={styles.card}>
        {savedAccounts.map((account, index) => {
          const current = account.id === currentUserId;
          return (
            <View key={account.id} style={[styles.row, index > 0 && styles.rowBorder]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={current ? `${account.name}, signed in` : `Switch to ${account.name}`}
                onPress={() => pick(account.id)}
                disabled={current || !!busy}
                style={styles.who}
              >
                <Avatar name={account.name || account.handle || '?'} seed={account.id} uri={account.avatarUrl} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{account.name || account.handle || account.email || 'Account'}</Text>
                  <Text style={styles.meta}>{account.handle ? `@${account.handle}` : account.email ?? ''}{current ? ' · signed in' : ''}</Text>
                </View>
                {busy === account.id ? <Text style={styles.meta}>Switching…</Text> : current ? <Ionicons name="checkmark-circle" size={22} color={colors.brand} /> : null}
              </Pressable>
              {!current ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${account.name} from this device`} onPress={() => { void actions.forgetSavedAccount(account.id); }} hitSlop={8} style={styles.remove}>
                  <Ionicons name="close" size={18} color={colors.textFaint} />
                </Pressable>
              ) : null}
            </View>
          );
        })}
        {/* Adding means signing in as someone else: this login is kept in the list, but has to step aside first. */}
        <Pressable accessibilityRole="button" accessibilityLabel="Add an account" onPress={() => { actions.signOut(); router.replace('/sign-in?add=1'); }} style={[styles.row, savedAccounts.length > 0 && styles.rowBorder]}>
          <View style={styles.plus}><Ionicons name="add" size={22} color={colors.brand} /></View>
          <Text style={[styles.name, { flex: 1 }]}>Add account</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.note}>Removing a login here only forgets it on this device. Logging out of all devices, in the account centre, forgets it everywhere.</Text>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  lead: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingBottom: spacing.lg },
  card: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 60 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.small, color: colors.textFaint },
  remove: { padding: 6 },
  plus: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  error: { ...typography.small, color: colors.danger, paddingTop: spacing.md },
  note: { ...typography.small, color: colors.textFaint, lineHeight: 18, paddingTop: spacing.lg },
});

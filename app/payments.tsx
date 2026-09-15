import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import type { PaymentKind } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

const ICON: Record<PaymentKind, keyof typeof Ionicons.glyphMap> = {
  'apple-pay': 'logo-apple',
  'google-pay': 'logo-google',
  paypal: 'logo-paypal',
  card: 'card-outline',
};

const ADDABLE: { kind: PaymentKind; label: string }[] = [
  { kind: 'apple-pay', label: 'Apple Pay' },
  { kind: 'google-pay', label: 'Google Pay' },
  { kind: 'paypal', label: 'PayPal' },
];

/** Where coaching gets paid from. The default is used unless you change it at checkout. */
export default function Payments() {
  const styles = useThemedStyles(styleDefinitions);
  const { paymentMethods, defaultPaymentId, actions } = useApp();
  const missing = ADDABLE.filter((option) => !paymentMethods.some((m) => m.kind === option.kind));

  return (
    <Screen title="Payments" compactTitle onBack={() => goBack()}>
      <Text style={styles.lead}>
        Your default is charged when you book a coach. You can still switch at checkout.
      </Text>

      <Text style={styles.sectionTitle}>YOUR METHODS</Text>
      <View style={styles.card}>
        {paymentMethods.map((method, index) => {
          const isDefault = method.id === defaultPaymentId;
          return (
            <Pressable
              key={method.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: isDefault }}
              accessibilityLabel={`${method.label}${method.detail ? `, ${method.detail}` : ''}${isDefault ? ', default' : ''}`}
              onPress={() => actions.setDefaultPayment(method.id)}
              style={({ pressed }) => [styles.row, index > 0 && styles.rowBorder, pressed && { backgroundColor: colors.surfaceAlt }]}
            >
              <View style={styles.icon}>
                <Ionicons name={ICON[method.kind]} size={20} color={colors.text} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>{method.label}</Text>
                  {isDefault ? <Text style={styles.badge}>DEFAULT</Text> : null}
                </View>
                {method.detail ? <Text style={styles.detail}>{method.detail}</Text> : null}
              </View>
              {isDefault ? (
                <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${method.label}`}
                  hitSlop={8}
                  onPress={() => actions.removePaymentMethod(method.id)}
                >
                  <Text style={styles.remove}>Remove</Text>
                </Pressable>
              )}
            </Pressable>
          );
        })}
        {!paymentMethods.length ? <Text style={styles.empty}>No payment methods yet.</Text> : null}
      </View>

      <Text style={styles.sectionTitle}>ADD</Text>
      <View style={styles.card}>
        {missing.map((option, index) => (
          <Pressable
            key={option.kind}
            accessibilityRole="button"
            accessibilityLabel={`Add ${option.label}`}
            onPress={() => actions.addPaymentMethod(option.kind)}
            style={({ pressed }) => [styles.row, index > 0 && styles.rowBorder, pressed && { backgroundColor: colors.surfaceAlt }]}
          >
            <View style={styles.icon}>
              <Ionicons name={ICON[option.kind]} size={20} color={colors.text} />
            </View>
            <Text style={[styles.label, { flex: 1 }]}>{option.label}</Text>
            <Ionicons name="add-circle-outline" size={22} color={colors.brand} />
          </Pressable>
        ))}
        <View style={[styles.row, missing.length > 0 && styles.rowBorder]}>
          <View style={styles.icon}>
            <Ionicons name="card-outline" size={20} color={colors.textFaint} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.label, { color: colors.textMuted }]}>Debit or credit card</Text>
            <Text style={styles.detail}>Card details are entered on the payment provider's own secure form, which arrives with the real build. Nothing is charged in this demo.</Text>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  lead: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingBottom: spacing.lg },
  sectionTitle: { ...typography.caption, color: colors.textMuted, letterSpacing: 1.1, paddingTop: spacing.md, paddingBottom: spacing.sm },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 56 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { ...typography.body, color: colors.text },
  badge: { ...typography.caption, fontSize: 9, color: colors.brand, letterSpacing: 1 },
  detail: { ...typography.small, color: colors.textFaint, lineHeight: 18 },
  remove: { ...typography.smallStrong, color: colors.textFaint },
  empty: { ...typography.small, color: colors.textFaint, padding: spacing.lg },
});

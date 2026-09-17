import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button, Field } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

/**
 * A page in the feed while the app is young: early people say what they
 * would change, and the best of it gets built. One box, one button.
 */
export function TipPage({ onSubmit }: { onSubmit: (body: string) => Promise<void> | void }) {
  const styles = useThemedStyles(styleDefinitions);
  const [body, setBody] = useState('');
  const [sent, setSent] = useState(0);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    try { await onSubmit(text); setSent((n) => n + 1); setBody(''); } finally { setBusy(false); }
  };
  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <View style={styles.badge}><Ionicons name="bulb-outline" size={16} color={colors.brand} /><Text style={styles.badgeText}>EARLY ACCESS · FOUNDING VOICES</Text></View>
        <Text style={styles.title}>Submit a tip</Text>
        <Text style={styles.body}>You are one of the first people on CourtSide, so your tips matter more than they ever will again. Tell us what you would add or change, and it might just come to fruition.</Text>
        <View style={styles.divider} />
        <Field value={body} onChangeText={setBody} placeholder="What would make CourtSide better?" multiline minHeight={96} />
        <Button label={busy ? 'Sending…' : sent ? 'Send another' : 'Send tip'} onPress={send} disabled={!body.trim() || busy} full />
        {sent ? <Text style={styles.thanks}>Got it — thank you. We read every one.</Text> : <Text style={styles.hint}>Only early users see this page.</Text>}
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  page: { flex: 1, alignSelf: 'stretch', backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: { alignSelf: 'center', maxWidth: 520, width: '100%', gap: spacing.md, padding: spacing.xl, borderRadius: 22, borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.surface },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center' },
  badgeText: { color: colors.brand, fontSize: 11, fontWeight: '800', letterSpacing: 3 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.3, textAlign: 'center' },
  divider: { alignSelf: 'stretch', height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong },
  hint: { color: colors.textFaint, fontSize: 12, fontStyle: 'italic', textAlign: 'center' },
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  thanks: { color: colors.success, fontSize: 13, fontWeight: '600', textAlign: 'center' },
});

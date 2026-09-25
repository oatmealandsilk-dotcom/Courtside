import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button, Field } from '@/components/ui';
import { MarkDraw } from '@/components/MarkDraw';
import { Wash } from '@/components/Wash';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * A page in the feed while the app is young: early people say what they
 * would change, and the best of it gets built. One box, one button — set
 * like the card on the waitlist page, wash and all.
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
    try { await onSubmit(text); setSent((n) => n + 1); setBody(''); router.push('/tips'); } finally { setBusy(false); }
  };
  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Wash height={260} strength={0.6} />
        <View style={styles.top}>
          <View style={styles.tile}><MarkDraw size={30} /></View>
          <View style={styles.words}>
            <Text style={styles.title}>Submit a tip</Text>
            <Text style={styles.body}>You’re one of the first people on CourtSide, so what you say now counts more than it ever will again. Tell us what you’d add or change.</Text>
          </View>
        </View>
        <Field value={body} onChangeText={setBody} placeholder="What would make CourtSide better?" multiline minHeight={96} />
        <Button label={busy ? 'Sending…' : sent ? 'Send another' : 'Send tip'} onPress={send} disabled={!body.trim() || busy} full />
        <Pressable accessibilityRole="link" onPress={() => router.push('/tips')} hitSlop={8} style={styles.linkWrap}>
          <Text style={styles.link}>See everyone’s tips and vote →</Text>
        </Pressable>
        {sent ? <Text style={styles.thanks} accessibilityLiveRegion="polite">Sent. It’s on the board now.</Text> : null}
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  page: { flex: 1, alignSelf: 'stretch', backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: {
    alignSelf: 'center', maxWidth: 520, width: '100%', gap: spacing.lg, padding: spacing.xl,
    borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden',
  },
  top: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  tile: { width: 56, height: 56, borderRadius: radius.lg, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  words: { flex: 1, gap: 6, minWidth: 0 },
  title: { ...typography.title, color: colors.text },
  body: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  linkWrap: { alignSelf: 'center' },
  link: { ...typography.smallStrong, color: colors.brand },
  thanks: { ...typography.smallStrong, color: colors.success, textAlign: 'center' },
});

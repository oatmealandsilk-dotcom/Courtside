import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PosterPreview } from '@/components/PosterPreview';
import { Button, Field, Screen } from '@/components/ui';
import { posterHtml } from '@/features/invite/poster';
import { posterActions, printPoster, savePosterPdf } from '@/features/invite/printPoster';
import { inviteLink } from '@/features/invite/referral';
import { goBack } from '@/lib/goBack';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

/**
 * A poster for the club notice board: "Looking for a hit at <your club>?"
 * with a QR code that is your own invite link, so the players who join from
 * it follow you and land on your map. Printed from the phone or saved as a
 * PDF to print elsewhere.
 */
export default function ClubPoster() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser } = useApp();
  const [club, setClub] = useState('');
  const [busy, setBusy] = useState<'print' | 'pdf' | null>(null);
  const [error, setError] = useState('');
  const link = currentUser ? inviteLink(currentUser.handle) : 'https://app.courtsidebase.com/join';
  // The preview redraws once typing pauses, not on every letter.
  const [shown, setShown] = useState('');
  useEffect(() => { const t = setTimeout(() => setShown(club), 350); return () => clearTimeout(t); }, [club]);
  const preview = useMemo(() => posterHtml({ club: shown, link }), [shown, link]);

  const run = async (kind: 'print' | 'pdf') => {
    setBusy(kind);
    setError('');
    try {
      const page = posterHtml({ club, link });
      if (kind === 'pdf') await savePosterPdf(page, club.trim());
      else await printPoster(page);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The poster could not be opened. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title="Club poster" onBack={() => goBack()}>
      <View style={styles.body}>
        <Text style={styles.lead}>For your club’s notice board. The QR code is your invite link: players who join from it follow you and show up on your map.</Text>
        <Field label="Your club or courts" value={club} onChangeText={setClub} autoCapitalize="words" autoCorrect={false} />
        <PosterPreview html={preview} />
        <View style={styles.actions}>
          {posterActions.includes('print') ? <Button label="Print" onPress={() => { void run('print'); }} loading={busy === 'print'} disabled={busy !== null} style={{ flex: 1 }} /> : null}
          {posterActions.includes('pdf') ? <Button label="Save as PDF" variant="secondary" onPress={() => { void run('pdf'); }} loading={busy === 'pdf'} disabled={busy !== null} style={{ flex: 1 }} /> : null}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : <Text style={styles.fine}>Prints on US Letter or A4. The strips at the bottom tear off.</Text>}
      </View>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  body: { gap: spacing.lg, paddingBottom: spacing.xxl },
  lead: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  fine: { ...typography.caption, color: colors.textFaint, textAlign: 'center' },
  error: { ...typography.small, color: colors.danger, textAlign: 'center' },
});

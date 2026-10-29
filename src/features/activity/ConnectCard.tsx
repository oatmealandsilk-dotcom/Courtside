import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { connectLine, useConnectRow, useConnectTap } from '@/features/activity/autoLog';
import { isDemo } from '@/features/activity/flags';
import { useShownAt } from '@/features/navigation/shownAt';
import * as haptics from '@/lib/haptics';
import { PRESS_DIM } from '@/theme/press';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';
import { corner } from '@/theme/look';

/**
 * "Connect your watch" at the top of Profile (owner, Oct 24: "I like the small card on profile"; Oct 28: "Auto log
 * should be very pushed hard"): most players had never linked Apple Health, WHOOP or Fitbit.
 *
 * The same offer as the card at the top of Activities (features/activity/autoLog), with its own Not now: shown while
 * something here can connect and nothing brings sessions in yet; Not now puts it away for two days, then it is back;
 * gone the moment a connection is made. One tap connects where there is one choice; with more it opens the Health
 * page, which has a row for each.
 *
 * In the phone apps only (the website's top card is "Get CourtSide on your iPhone", and one card at a time is enough
 * there), and the demo.
 *
 * Decided as Profile comes on show: an offer that only becomes known while
 * the page is up waits for the next visit, so the card never drops in over a
 * page already being read. What it depends on is asked as the tabs open
 * (warmConnectOffer), so it is known long before; GRACE_MS covers a first
 * answer still on its way as the page slides in.
 */
const GRACE_MS = 250;

export function ConnectCard() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUserId, currentUser, autoLogSharing } = useApp();
  const row = useConnectRow('profile');
  const { choices, offer, close, known } = row;
  const { busy, connect } = useConnectTap(row);
  const here = Platform.OS !== 'web' || isDemo(currentUserId);
  const onShow = useShownAt('/profile');
  // Kept in step while the page is out of sight; held once decided while it is on show
  // (null: not decided yet, nothing heard). Built while the page is already on show (a card above
  // it was just closed): it waits for the next visit, so it never drops in where the closed one was.
  const [decided, setDecided] = useState<boolean | null>(() => (known && !onShow ? offer : null));
  const cameAt = useRef(onShow ? -Infinity : Date.now());
  useEffect(() => { if (onShow) cameAt.current = Date.now(); }, [onShow]);
  useEffect(() => {
    if (!onShow) { setDecided(known ? offer : null); return; }
    if (decided === null && known) setDecided(offer && Date.now() - cameAt.current < GRACE_MS);
  }, [onShow, known, offer, decided]);
  if (!here || !decided || !offer || !choices.length) return null;
  // Who sees the tennis that logs itself, said before connecting (migration 193), read aloud too. One tap here never
  // chooses it (review, Oct 28): not chosen yet, it is asked on "Tennis logged" (Friends or Only me) or in Settings.
  const line = connectLine(choices, autoLogSharing, currentUser);
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Connect your watch. ${line}`} disabled={busy} onPress={connect} style={styles.rowMain}>
        <Ionicons name="watch-outline" size={20} color={colors.brand} />
        <View style={{ flex: 1 }}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowTitle}>Connect your watch</Text>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowMeta}>{busy ? 'Connecting…' : line}</Text>
        </View>
      </Pressable>
      {/* Not now: away for two days, then back, until something is connected (features/activity/autoLog). */}
      <Pressable accessibilityRole="button" accessibilityLabel="Not now: connect your watch on Profile" hitSlop={6} disabled={busy} onPress={() => { haptics.tap(); close(); }} style={({ pressed }) => [styles.notNow, pressed && { opacity: PRESS_DIM }]}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.notNowText}>Not now</Text>
      </Pressable>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  // The same card as Profile's "Make your first move" and the website's "Get CourtSide on your iPhone".
  row: { marginTop: 16, borderRadius: corner(16), backgroundColor: colors.brandDim, flexDirection: 'row', alignItems: 'center' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingLeft: 14 },
  rowTitle: { ...typography.smallStrong, fontSize: 14, color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted, lineHeight: 19 },
  notNow: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' },
  notNowText: { ...typography.smallStrong, fontSize: 13, color: colors.textMuted },
});

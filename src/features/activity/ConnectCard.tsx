import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useConnectRow } from '@/features/activity/autoLog';
import { isDemo } from '@/features/activity/flags';
import { useShownAt } from '@/features/navigation/shownAt';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';
import { corner } from '@/theme/look';

/**
 * "Log your hits automatically" at the top of Profile (owner, Oct 24: "I like
 * the small card on profile"): about four in five players had never linked
 * Apple Health or WHOOP, and after setup's one card the only ways in were a
 * row at the top of Activities and Settings → Health and nutrition.
 *
 * The same offer as that Activities row (features/activity/autoLog), with its
 * own ×: shown while something here can connect and nothing brings sessions
 * in yet, gone for good on this phone once closed, and gone the moment a
 * connection is made. One tap connects where there is one choice; with both
 * Apple Health and WHOOP it opens the Health page, which has a row for each.
 *
 * In the phone apps only (the website's top card is "Get CourtSide on your
 * iPhone", and one card at a time is enough there), and the demo.
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
  const { currentUserId } = useApp();
  const { auto, source, offer, close, known } = useConnectRow('profile');
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
  const [busy, setBusy] = useState(false);
  if (!here || !decided || !offer || !source) return null;
  const both = auto.apple && auto.whoop;
  const names = both ? 'Apple Health or WHOOP' : source === 'whoop' ? 'WHOOP' : 'Apple Health';
  const connect = async () => {
    if (busy) return;
    haptics.tap();
    if (both) { router.push('/health'); return; }
    setBusy(true);
    try {
      // Its line says who sees the tennis that logs itself (migration 193): connecting is the yes to it.
      await auto.connect(source, { told: true });
      showToast({ title: source === 'whoop' ? 'WHOOP connected' : 'Apple Health connected', body: 'Your past week’s workouts show up in Notifications, ready to log.', icon: 'checkmark-circle-outline' });
    } catch (err) {
      showToast({ title: 'Couldn’t connect', body: err instanceof Error ? err.message : 'Try again in a moment.', icon: 'alert-circle-outline' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Log your hits automatically. Connect ${names}`} disabled={busy} onPress={() => { void connect(); }} style={styles.rowMain}>
        <Ionicons name="pulse-outline" size={20} color={colors.brand} />
        <View style={{ flex: 1 }}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowTitle}>Log your hits automatically</Text>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowMeta}>{busy ? 'Connecting…' : `Connect ${names}: your tennis logs itself${auto.seenBy === 'private' ? ', for you only' : auto.seenBy === 'public' ? ' to your profile' : ', and friends who follow you back see it'}.`}</Text>
        </View>
      </Pressable>
      {/* Closed here, it stays closed on this phone; Settings → Health and nutrition still connects. */}
      <Pressable accessibilityRole="button" accessibilityLabel="Close the log automatically card" hitSlop={10} disabled={busy} onPress={() => { haptics.tap(); close(); }} style={styles.rowClose}>
        <Ionicons name="close" size={16} color={colors.textMuted} />
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
  rowClose: { padding: 14 },
});

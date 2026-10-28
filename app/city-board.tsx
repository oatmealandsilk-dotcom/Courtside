import { PRESS_DIM } from '@/theme/press';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Screen, SegmentedControl } from '@/components/ui';
import { BoardRow } from '@/components/CityBoardPreview';
import { BOARD_MONTH, MIN_PLAYERS, RESETS_ON, cityById, ordinal, rankCities, type BoardMode, type RankedCity } from '@/features/cityBoard/mock';
import { useHomeCityId } from '@/features/cityBoard/useHomeCity';
import { goBack } from '@/lib/goBack';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';

const MODES = [
  { value: 'total' as const, label: 'Total' },
  { value: 'per' as const, label: 'Per player' },
];

/**
 * DESIGN MOCK (design/city-board). The whole board: "Cities this month",
 * every ranked city, yours pinned on top with the gap to the one above, and
 * Total / Per player (so a small, keen city can win too). A city opens its
 * own page. Starts again on the 1st.
 */
export default function CityBoard() {
  const styles = useThemedStyles(styleDefinitions);
  const [mode, setMode] = useState<BoardMode>('total');
  const board = useMemo(() => rankCities(mode), [mode]);
  const homeId = useHomeCityId();
  const mine = board.find((c) => c.id === homeId) ?? null;
  const unranked = !mine && homeId ? cityById(homeId) : null;
  const per = mode === 'per';
  const valueOf = (c: RankedCity) => (per ? c.value.toFixed(1) : String(c.hits));
  const subOf = (c: RankedCity) => (per
    ? `${c.hits} hits · ${c.players} players`
    : `${c.players} players${c.moved > 0 ? ` · up ${c.moved}` : c.moved < 0 ? ` · down ${-c.moved}` : ''}`);
  // Where yours stands, in words: the gap to the city above (or the lead), level when tied.
  const standing = (() => {
    if (!mine) return null;
    const where = `${mine.name} is ${ordinal(mine.rank)}${per ? ' per player' : ''}`;
    const other = mine.rank === 1 ? board[1] : board[mine.rank - 2];
    if (!other) return `${where}.`;
    const diff = Math.abs(per ? mine.value - other.value : mine.hits - other.hits);
    if (diff < (per ? 0.05 : 1)) return `${where}, level with ${other.name}.`;
    const amount = per ? `${diff.toFixed(1)} a player` : `${diff} hits`;
    return mine.rank === 1 ? `${mine.name} leads${per ? ' per player' : ''}, ${amount} ahead of ${other.name}.` : `${where}, ${amount} behind ${other.name}.`;
  })();
  // Below the first screenful, your row is pinned on top as well, so you never scroll to find it.
  const pinRow = !!mine && mine.rank > 6;
  const open = (id: string) => router.push({ pathname: '/city/[id]', params: { id } });

  return (
    <Screen title="Cities" subtitle={`${BOARD_MONTH} · starts again ${RESETS_ON}`} compactTitle onBack={() => goBack()}>
      <View style={styles.toggle}>
        <SegmentedControl slide segments={MODES} value={mode} onChange={setMode} accessibilityLabel="Rank cities by" />
      </View>

      {/* Yours: where it stands and the gap to close, then the one way to close it. */}
      {mine ? (
        <View style={styles.pinned}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.standing}>{standing}</Text>
          {pinRow ? (
            <Pressable accessibilityRole="link" onPress={() => open(mine.id)} style={({ pressed }) => [styles.pinRow, pressed && { opacity: PRESS_DIM }]}>
              <BoardRow city={mine} mine first value={valueOf(mine)} unit={per ? '' : 'hits'} sub={subOf(mine)} />
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="link" accessibilityLabel={`Invite a hitting partner to help ${mine.name} climb`} hitSlop={6} onPress={() => router.push('/invite')} style={({ pressed }) => [styles.invite, pressed && { opacity: PRESS_DIM }]}>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.inviteMuted}>Help {mine.name} climb · </Text>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.inviteLink}>Invite a hitting partner</Text>
          </Pressable>
        </View>
      ) : unranked ? (
        <View style={styles.pinned}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.standing}>{unranked.name} needs {MIN_PLAYERS - unranked.players} more {MIN_PLAYERS - unranked.players === 1 ? 'player' : 'players'} who log tennis to make the board.</Text>
          <Pressable accessibilityRole="link" hitSlop={6} onPress={() => router.push('/invite')} style={({ pressed }) => [styles.invite, pressed && { opacity: PRESS_DIM }]}>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.inviteLink}>Invite a hitting partner</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.list}>
        {board.map((c, i) => (
          <Pressable key={c.id} accessibilityRole="link" accessibilityLabel={`${ordinal(c.rank)}, ${c.name}, ${valueOf(c)} ${per ? 'hits per player' : 'hits'}`} onPress={() => open(c.id)} style={({ pressed }) => pressed && { opacity: PRESS_DIM }}>
            <BoardRow city={c} mine={c.id === mine?.id} first={i === 0 || board[i - 1].id === mine?.id} value={valueOf(c)} unit={per ? '' : 'hits'} sub={subOf(c)} />
          </Pressable>
        ))}
      </View>

      <View style={styles.notes}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.fine}>
          {per ? 'Hits per player who logged this month. ' : ''}A hit is a tennis session logged by a player whose home city it is. Cities need {MIN_PLAYERS} players to be ranked.
        </Text>
      </View>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  toggle: { paddingTop: spacing.xs, paddingBottom: spacing.lg },
  pinned: { gap: 2, paddingBottom: spacing.sm },
  standing: { ...typography.body, color: colors.text, lineHeight: 21 },
  pinRow: { marginTop: spacing.sm },
  invite: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', minHeight: 36 },
  inviteMuted: { ...typography.small, color: colors.textMuted },
  inviteLink: { ...typography.smallStrong, color: colors.brand },
  list: { paddingTop: spacing.xs },
  notes: { paddingTop: spacing.xl, paddingHorizontal: spacing.md, paddingBottom: spacing.xxl },
  fine: { ...typography.small, color: colors.textFaint, lineHeight: 19 },
});

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CrownGlyph } from '@/components/place/CrownGlyph';
import { Avatar, DottedRule } from '@/components/ui';
import type { CourtKings, ID, User } from '@/data/types';
import { localDay } from '@/features/practice/stats';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography, withAlpha } from '@/theme';

/** "Alder Park" from "Alder Park Tennis Courts": the name a crown is worn in. */
export function courtShortName(name: string): string {
  const cut = name.replace(/\s+(tennis\s+)?courts?$/i, '').trim();
  return cut || name;
}

/** "today", "yesterday", "Saturday" (this past week), "Sep 20". */
function lastWin(day: string | undefined, now = new Date()): string {
  if (!day) return '';
  if (day === localDay(now)) return 'today';
  if (day === localDay(now.getTime() - 86_400_000)) return 'yesterday';
  const d = new Date(`${day}T12:00:00`);
  return now.getTime() - d.getTime() < 6 * 86_400_000
    ? d.toLocaleDateString(undefined, { weekday: 'long' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * King of the Court (owner, Oct 5: "King of the court. Most wins at one
 * court?"), on a court's page: whoever posted the most match wins there in
 * the last 90 days wears the crown, then numbers 2 and 3, then your own line
 * ("You · #5 · 2 more wins to take #3"). Ties go to the latest win. Nobody
 * has won there yet: the regulars instead (most days posted from there).
 * Nothing posted there at all: a small "No King of Alder Park yet".
 *
 * Who is on a board is the server's call (court_kings, migration 130): only
 * public accounts, never anyone you are blocked with. A player who can't be
 * ranked sees their own wins with "Only public accounts are ranked", and
 * nothing more about why. Signed in only; nothing at all while it loads, on
 * a database without it, or at someone's home court. It brings its own
 * dotted rule below, so the page has no empty gap when there is no card.
 *
 * Built to stand alone (a court id and a name), so the Tennis profile can
 * show a crown with it later.
 */
export function CourtKing({ courtId, name, refresh = 0 }: { courtId: string; name: string; refresh?: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const { actions, users, currentUserId } = useApp();
  const [kings, setKings] = useState<CourtKings | null>(null);
  useEffect(() => {
    if (!currentUserId) { setKings(null); return undefined; }
    let on = true;
    void actions.courtKings(courtId).then((got) => { if (on) setKings(got); }).catch(() => undefined);
    return () => { on = false; };
  }, [courtId, currentUserId, refresh, actions]);

  if (!kings || !currentUserId) return null;
  const place = courtShortName(name);
  const userOf = (id: ID) => users.find((u) => u.id === id);
  const top = kings.top.map((t) => ({ ...t, user: userOf(t.userId) })).filter((t): t is typeof t & { user: User } => !!t.user);
  const me = userOf(currentUserId);
  const explain = () => showToast({
    long: true,
    icon: 'information-circle-outline',
    title: 'How the crown is won',
    body: 'The most match wins posted at this court in the last 90 days. Log a match, mark it won, and post it here; 2 a day count at most. Ties go to the latest win. Only public accounts are ranked.',
  });

  const head = (
    <View style={styles.head}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text accessibilityRole="header" style={styles.title}>King of the Court</Text>
        <Text style={styles.sub}>{kings.mode === 'regulars' ? 'Most days posted here · last 90 days' : 'Most match wins posted here · last 90 days'}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="How King of the Court works" hitSlop={10} onPress={explain} style={({ pressed }) => [styles.info, pressed && styles.pressed]}>
        <Ionicons name="information-circle-outline" size={22} color={colors.textMuted} />
      </Pressable>
    </View>
  );

  // Nothing posted here yet: one small card that asks for the first win.
  if (kings.mode === 'none' || !top.length) {
    return (
      <>
        <View style={styles.wrap}>
          {head}
          <View style={[styles.card, styles.empty]}>
            <View style={[styles.emptyDisc, { backgroundColor: withAlpha(colors.sun, 0.16) }]}><CrownGlyph size={22} color={colors.sun} outline /></View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.emptyTitle}>No King of {place} yet</Text>
              <Text style={styles.emptyBody}>Win a match here and post it to take the crown.</Text>
            </View>
          </View>
        </View>
        <DottedRule />
      </>
    );
  }

  const open = (id: ID) => router.push(`/user/${id}`);
  const unit = kings.mode === 'wins' ? (n: number) => plural(n, 'win', 'wins') : (n: number) => plural(n, 'day', 'days');
  const myRank = kings.me.ranked ? kings.me.rank : undefined;
  // What it takes to climb: ties go to the latest win, so drawing level with a new win is enough.
  const climb = (rank: number): string | null => {
    if (kings.mode !== 'wins' || rank <= 1) return null;
    // Below the board, #3 is the one to catch; on it, the place above.
    const target = top[rank > 3 ? 2 : rank - 2];
    if (!target) return null;
    const need = Math.max(1, target.n - kings.me.wins);
    const goal = rank > 3 ? '#3' : rank === 2 ? 'the crown' : `#${rank - 1}`;
    return `${plural(need, 'more win', 'more wins')} to take ${goal}`;
  };

  const [first, ...rest] = top;
  const firstIsMe = first.userId === currentUserId;
  return (
    <>
      <View style={styles.wrap}>
        {head}
        <View style={styles.card}>
          {kings.mode === 'wins' ? (
            // The crown: the King, big, in a gold ring.
            <Pressable accessibilityRole="link" accessibilityLabel={`King of ${place}: ${firstIsMe ? 'you' : first.user.name}, ${unit(first.n)}. Open profile`} onPress={() => open(first.userId)} style={({ pressed }) => [styles.king, firstIsMe && styles.mine, pressed && styles.pressed]}>
              <View style={styles.kingLabelRow}>
                <CrownGlyph size={13} color={colors.sun} />
                <Text style={[styles.kingLabel, { color: colors.sun }]} numberOfLines={1}>{`King of ${place}`.toUpperCase()}</Text>
              </View>
              <View style={styles.kingRow}>
                <View style={styles.kingFace}>
                  <View style={[styles.ring, { borderColor: withAlpha(colors.sun, 0.7) }]}>
                    <Avatar name={first.user.name} seed={first.user.avatarSeed} uri={first.user.avatarUrl} size={60} />
                  </View>
                  <View style={styles.crownOn}><CrownGlyph size={24} color={colors.sun} /></View>
                </View>
                <View style={styles.kingWords}>
                  <Text style={styles.kingName} numberOfLines={1}>{firstIsMe ? 'You' : first.user.name}</Text>
                  <Text style={styles.kingWhen} numberOfLines={1}>{[`@${first.user.handle}`, first.last ? `last win ${lastWin(first.last)}` : ''].filter(Boolean).join(' · ')}</Text>
                </View>
                <View style={styles.kingCount}>
                  <Text style={styles.kingNumber}>{first.n}</Text>
                  <Text style={styles.kingUnit}>{first.n === 1 ? 'WIN' : 'WINS'}</Text>
                </View>
              </View>
            </Pressable>
          ) : (
            <View style={styles.regularsHead}>
              <View style={styles.kingLabelRow}>
                <Ionicons name="calendar-outline" size={14} color={colors.brand} />
                <Text style={[styles.kingLabel, { color: colors.brand }]}>REGULARS HERE</Text>
              </View>
              <Text style={styles.regularsSub}>Most days posted from this court · last 90 days</Text>
            </View>
          )}
          {(kings.mode === 'wins' ? rest : top).map((t, i) => {
            const rank = (kings.mode === 'wins' ? 2 : 1) + i;
            const mine = t.userId === currentUserId;
            const hint = mine ? climb(rank) : null;
            return (
              <Pressable key={t.userId} accessibilityRole="link" accessibilityLabel={`Number ${rank}: ${mine ? 'you' : t.user.name}, ${unit(t.n)}. Open profile`} onPress={() => open(t.userId)} style={({ pressed }) => [styles.row, styles.line, mine && styles.mine, pressed && styles.pressed]}>
                <Text style={[styles.rank, mine && styles.rankMine]}>{rank}</Text>
                <Avatar name={t.user.name} seed={t.user.avatarSeed} uri={t.user.avatarUrl} size={36} />
                <View style={styles.rowWords}>
                  <Text style={styles.rowName} numberOfLines={1}>{mine ? 'You' : t.user.name}</Text>
                  <Text style={[styles.rowHandle, hint ? styles.hint : null]} numberOfLines={1}>{hint ?? `@${t.user.handle}`}</Text>
                </View>
                <Text style={styles.count}><Text style={styles.countNumber}>{t.n}</Text>{` ${kings.mode === 'wins' ? (t.n === 1 ? 'win' : 'wins') : (t.n === 1 ? 'day' : 'days')}`}</Text>
              </Pressable>
            );
          })}
          {/* Your own line, under the top three: your place and what it takes, or why you aren't on it. */}
          {kings.mode === 'wins' && myRank && myRank > 3 && me ? (
            <View style={[styles.row, styles.line, styles.mine]} accessible accessibilityLabel={`You: number ${myRank}, ${unit(kings.me.wins)}. ${climb(myRank) ?? ''}`}>
              <Text style={[styles.rank, styles.rankMine]}>{myRank}</Text>
              <Avatar name={me.name} seed={me.avatarSeed} uri={me.avatarUrl} size={36} />
              <View style={styles.rowWords}>
                <Text style={styles.rowName}>You</Text>
                <Text style={[styles.rowHandle, styles.hint]} numberOfLines={1}>{climb(myRank)}</Text>
              </View>
              <Text style={styles.count}><Text style={styles.countNumber}>{kings.me.wins}</Text>{` ${kings.me.wins === 1 ? 'win' : 'wins'}`}</Text>
            </View>
          ) : !kings.me.ranked && kings.me.wins > 0 && me ? (
            <View style={[styles.row, styles.line, styles.mine]} accessible accessibilityLabel={`You: ${unit(kings.me.wins)} here. Not ranked. Only public accounts are ranked.`}>
              <View style={styles.rankLock}><Ionicons name="lock-closed-outline" size={15} color={colors.brand} /></View>
              <Avatar name={me.name} seed={me.avatarSeed} uri={me.avatarUrl} size={36} />
              <View style={styles.rowWords}>
                <Text style={styles.rowName}>{`You · ${unit(kings.me.wins)} here`}</Text>
                <Text style={styles.rowHandle}>Not ranked. Only public accounts are ranked.</Text>
              </View>
            </View>
          ) : null}
          <View style={[styles.foot, styles.line]}>
            {kings.mode === 'wins' ? <Ionicons name="trophy-outline" size={15} color={colors.textMuted} /> : <CrownGlyph size={15} color={colors.sun} outline />}
            <Text style={styles.footText}>
              {kings.mode === 'wins'
                ? 'Log a match, mark it won and post it here. Ties go to the latest win.'
                : <><Text style={styles.footStrong}>No King yet.</Text> Win a match here and post it to take the crown.</>}
            </Text>
          </View>
        </View>
      </View>
      <DottedRule />
    </>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  // The same head as the page's other parts (What players say, Open hits).
  title: { ...typography.heading, color: colors.text },
  sub: { ...typography.small, color: colors.textMuted },
  info: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginTop: -4 },
  card: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  pressed: { opacity: 0.7 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  mine: { backgroundColor: colors.brandDim },
  // The King.
  king: { paddingHorizontal: spacing.lg, paddingTop: 14, paddingBottom: spacing.lg, gap: spacing.sm },
  kingLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kingLabel: { ...typography.caption, fontSize: 11.5, letterSpacing: 1.1 },
  kingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  kingFace: { width: 70, height: 74, justifyContent: 'flex-end', alignItems: 'center' },
  ring: { borderWidth: 3, borderRadius: 36, padding: 2 },
  crownOn: { position: 'absolute', top: -2, alignSelf: 'center' },
  kingWords: { flex: 1, minWidth: 0, gap: 2 },
  kingName: { ...font('600'), fontSize: 18, letterSpacing: -0.4, color: colors.text },
  kingWhen: { ...typography.small, color: colors.textMuted },
  kingCount: { alignItems: 'flex-end' },
  kingNumber: { ...font('600'), fontSize: 34, lineHeight: 38, letterSpacing: -1.2, color: colors.text, fontVariant: ['tabular-nums'] },
  kingUnit: { ...typography.caption, color: colors.textMuted, letterSpacing: 0.8 },
  // Regulars.
  regularsHead: { paddingHorizontal: spacing.lg, paddingTop: 14, paddingBottom: 12, gap: 4 },
  regularsSub: { ...typography.small, color: colors.textMuted },
  // 2, 3, and you.
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 11 },
  rank: { width: 18, ...font('600'), fontSize: 15, color: colors.textMuted, textAlign: 'center', fontVariant: ['tabular-nums'] },
  rankMine: { color: colors.brand },
  rankLock: { width: 18, alignItems: 'center' },
  rowWords: { flex: 1, minWidth: 0, gap: 1 },
  rowName: { ...font('500'), fontSize: 15, color: colors.text },
  rowHandle: { ...typography.small, color: colors.textMuted },
  hint: { color: colors.brand, ...font('500') },
  count: { ...typography.small, color: colors.textMuted },
  countNumber: { ...font('600'), fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
  foot: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 12 },
  footText: { flex: 1, ...typography.small, color: colors.textMuted, lineHeight: 18 },
  footStrong: { ...font('600'), color: colors.text },
  // Nothing posted here yet.
  empty: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  emptyDisc: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { ...font('600'), fontSize: 15, color: colors.text },
  emptyBody: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
});

import { PRESS_DIM } from '@/theme/press';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeIn } from 'react-native-reanimated';

import { CrownGlyph } from '@/components/place/CrownGlyph';
import { ListRow, SectionHead } from '@/components/place/courtPage/parts';
import { Collapse } from '@/components/ui/Collapse';
import { Avatar } from '@/components/ui';
import type { CourtKings, ID, User } from '@/data/types';
import { useTennisFlags } from '@/features/activity/useTennisFlags';
import { localDay } from '@/features/practice/stats';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography, withAlpha } from '@/theme';
import { corner } from '@/theme/look';

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
const wins = (n: number) => plural(n, 'win', 'wins');

/**
 * King of the Court (owner, Oct 5: "King of the court. Most wins at one
 * court?"), on a court's page: whoever posted the most match wins there in
 * the last 90 days wears the crown, then numbers 2 and 3, then your own line
 * ("You · #5 · 2 more wins to take #3"). Ties go to the latest win. Nobody
 * has won there yet: "No King yet" first, the same quiet line as an empty
 * court, then the regulars (most days played there) under a head of their
 * own, "Regulars", so its #1 never reads as the King. Nothing posted there
 * at all: that one quiet line, so an empty court's page leads with Play
 * here, not with three prompts.
 *
 * Both heads are the court page's one section head (SectionHead), so King
 * of the Court and Regulars open the way Posts, Open hits and What players
 * say do. The rule is said once, under the title (or under Regulars); the
 * (i) opens the fine print in place (2 a day, ties), never as a toast over
 * the top of the page. Every row is the same height.
 *
 * Who is on a board is the server's call (court_kings, migration 130): only
 * accounts it may rank, never anyone you are blocked with. A player it
 * won't rank still sees their own wins here, "Only you see this", with no
 * reason given (the reason differs, and is theirs), and is never told to
 * win one to take the crown. Signed in only; nothing
 * on a database without it, or at someone's home court. While it loads, its
 * title and one quiet line hold the place, so the page does not jump for an
 * empty court. The page spaces its sections, so it draws no rule of its own.
 *
 * Built to stand alone (a court id and a name), so the Tennis profile can
 * show a crown with it later.
 *
 * Held back until after launch (owner, Oct 6): shown only when the server
 * switch 'flag:court-kings' is on for you (migration 140; 'admins' for
 * now), so nothing at all, not even the title, for everyone else, on a
 * database without the switch, while it is asked, or in the demo. The
 * server keeps working the boards out meanwhile.
 */
export function CourtKing({ courtId, name, refresh = 0, look = 'section', line = true }: {
  courtId: string;
  name: string;
  refresh?: number;
  /**
   * How it sits on the page. 'section': today's, a head and its line. 'line'
   * (the court page's options A and C, Oct 24): with no King, one line,
   * "King of the Court · No King yet" and its (i), the rule moved into the
   * (i); a King's board as today. 'row' (option B): a row of the page's list,
   * "King of the Court … No King yet" (or the King's handle), opening the
   * rule or the board in place.
   */
  look?: 'section' | 'line' | 'row';
  /** 'row' only: a hairline above it. */
  line?: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { actions, users, currentUserId } = useApp();
  // undefined while it is asked; null when it can't be (a database without it).
  const [kings, setKings] = useState<CourtKings | null | undefined>(undefined);
  const [info, setInfo] = useState(false);
  // 'row': whether its rule or board is open under it.
  const [unfolded, setUnfolded] = useState(false);
  const { courtKings: switchedOn } = useTennisFlags();
  useEffect(() => {
    if (!currentUserId || !switchedOn) { setKings(null); return undefined; }
    let on = true;
    // Switched on after being off: its loading line, as on a first open.
    setKings((k) => (k === null ? undefined : k));
    void actions.courtKings(courtId).then((got) => { if (on) setKings(got); }).catch(() => { if (on) setKings(null); });
    return () => { on = false; };
  }, [courtId, currentUserId, refresh, actions, switchedOn]);

  if (!switchedOn || kings === null || !currentUserId) return null;
  const place = courtShortName(name);
  const userOf = (id: ID) => users.find((u) => u.id === id);
  const top = kings ? kings.top.map((t) => ({ ...t, user: userOf(t.userId) })).filter((t): t is typeof t & { user: User } => !!t.user) : [];
  const me = userOf(currentUserId);
  const loading = kings === undefined;
  const empty = !loading && (kings.mode === 'none' || !top.length);
  // Your wins here, when the server won't put you on a board: said plainly, with no reason.
  const unranked = !loading && !kings.me.ranked && kings.me.wins > 0 && !!me;

  // The rule under the title, for the King's board only: the regulars say theirs under their own head.
  const sub = !loading && !empty && kings.mode === 'wins' ? 'Most wins posted here · last 90 days' : null;
  const head = (
    <View>
      <SectionHead
        title="King of the Court"
        sub={sub}
        accessory={(
          <Pressable accessibilityRole="button" accessibilityLabel="How King of the Court works" accessibilityState={{ expanded: info }} hitSlop={6} onPress={() => setInfo((v) => !v)} style={({ pressed }) => [styles.info, pressed && styles.pressed]}>
            <Ionicons name={info ? 'information-circle' : 'information-circle-outline'} size={22} color={info ? colors.text : colors.textMuted} />
          </Pressable>
        )}
      />
      {info ? (
        <Animated.View entering={FadeIn.duration(160)} style={styles.note}>
          <Text style={styles.noteText}>Up to 2 wins a day count. Ties go to the latest win.</Text>
        </Animated.View>
      ) : null}
    </View>
  );

  // Your line when you aren't on the board: your wins here, seen by you alone (no reason: it differs, and is yours).
  const mineUnranked = unranked && me ? (
    <View style={[styles.row, styles.mine]} accessible accessibilityLabel={`You: ${wins(kings!.me.wins)} here. Only you see this`}>
      <View style={styles.rankLock}><Ionicons name="lock-closed-outline" size={15} color={colors.brand} /></View>
      <Avatar name={me.name} seed={me.avatarSeed} uri={me.avatarUrl} size={36} />
      <View style={styles.rowWords}>
        <Text style={styles.rowName}>You</Text>
        <Text style={styles.rowHandle} numberOfLines={1}>Only you see this</Text>
      </View>
      <Text style={styles.count}><Text style={styles.countNumber}>{kings!.me.wins}</Text>{` ${kings!.me.wins === 1 ? 'win' : 'wins'}`}</Text>
    </View>
  ) : null;

  // No King: one quiet line, the same on an empty court and above the regulars. A player who can't be
  // ranked is never told to win one to take the crown.
  const noKing = (
    <View style={styles.quiet}>
      <CrownGlyph size={16} color={colors.sun} outline />
      <Text style={styles.quietText}>
        <Text style={styles.quietStrong}>No King yet.</Text>
        {unranked ? null : ' Win a match here and post it to take the crown.'}
      </Text>
    </View>
  );

  // The options' one line: the title and "No King yet", the rule in the (i) (with how to take the crown, unless you can't be ranked).
  const lineRule = unranked ? 'Up to 2 wins a day count. Ties go to the latest win.' : 'Win a match here and post it to take the crown. Up to 2 wins a day count. Ties go to the latest win.';
  const infoButton = (
    <Pressable accessibilityRole="button" accessibilityLabel="How King of the Court works" accessibilityState={{ expanded: info }} hitSlop={6} onPress={() => setInfo((v) => !v)} style={({ pressed }) => [styles.info, pressed && styles.pressed]}>
      <Ionicons name={info ? 'information-circle' : 'information-circle-outline'} size={22} color={info ? colors.text : colors.textMuted} />
    </Pressable>
  );
  const lineHead = (
    <View>
      <View style={styles.lineRow}>
        <CrownGlyph size={16} color={colors.sun} outline />
        <Text style={styles.lineText} numberOfLines={1}>
          <Text style={styles.lineStrong}>King of the Court</Text>
          {loading ? '' : ' · No King yet'}
        </Text>
        {infoButton}
      </View>
      {info ? (
        <Animated.View entering={FadeIn.duration(160)} style={styles.note}>
          <Text style={styles.noteText}>{lineRule}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
  /** B's row: the value on the right, the rule or the board opening under it. */
  const kingRow = (value: string, details: React.ReactNode, crowned = false) => (
    <View>
      <ListRow
        label="King of the Court"
        value={value}
        lead={crowned ? <CrownGlyph size={14} color={colors.sun} /> : null}
        onPress={loading ? undefined : () => setUnfolded((v) => !v)}
        open={loading ? undefined : unfolded}
        a11y={loading ? 'King of the Court' : `King of the Court: ${value}. ${unfolded ? 'Hide' : 'Show'} how it works`}
        line={line}
        tall
      />
      <Collapse open={unfolded && !loading}>
        <View style={styles.rowDetails}>{details}</View>
      </Collapse>
    </View>
  );

  // Still asking, or nothing posted here yet: the title and one quiet line, no card.
  if (loading || empty) {
    if (look === 'row') {
      return kingRow(loading ? '' : 'No King yet', (
        <>
          <Text style={styles.noteText}>{lineRule}</Text>
          {mineUnranked ? <View style={[styles.card, styles.cardSolo]}>{mineUnranked}</View> : null}
        </>
      ));
    }
    if (look === 'line') {
      return (
        <View style={styles.wrap}>
          {lineHead}
          {mineUnranked ? <View style={[styles.card, styles.cardSolo]}>{mineUnranked}</View> : null}
        </View>
      );
    }
    return (
      <View style={styles.wrap}>
        {head}
        {loading ? (
          // As tall as the empty court's line (two lines on a phone), so the page holds still for most courts.
          <View style={styles.skeletonWrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={styles.skeleton} />
            <View style={[styles.skeleton, styles.skeletonShort]} />
          </View>
        ) : (
          <Animated.View entering={FadeIn.duration(200)} style={styles.wrap}>
            {noKing}
            {mineUnranked ? <View style={[styles.card, styles.cardSolo]}>{mineUnranked}</View> : null}
          </Animated.View>
        )}
      </View>
    );
  }

  const open = (id: ID) => router.push(`/user/${id}`);
  const unit = kings.mode === 'wins' ? wins : (n: number) => plural(n, 'day', 'days');
  const myRank = kings.me.ranked ? kings.me.rank : undefined;
  // Ranked, but more than ten placed above you: "10+", and what it takes to reach #3.
  const myOver = kings.me.ranked && !!kings.me.over;
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
  const regulars = kings.mode === 'regulars';
  const rows = regulars ? top : rest;
  const regularsHead = <View style={styles.regularsHead}><SectionHead title="Regulars" sub="Most days played here · last 90 days" /></View>;
  const board = (
      <View style={styles.card}>
        {kings.mode === 'wins' ? (
          // The crown: the King, big, in a gold ring. The crown and the name say it; no label above.
          <Pressable accessibilityRole="link" accessibilityLabel={`King of ${place}: ${firstIsMe ? 'you' : first.user.name}, ${unit(first.n)}. Open profile`} onPress={() => open(first.userId)} style={({ pressed }) => [styles.king, firstIsMe && styles.mine, pressed && styles.pressed]}>
            <View style={styles.kingFace}>
              <View style={[styles.ring, { borderColor: withAlpha(colors.sun, 0.7) }]}>
                <Avatar name={first.user.name} seed={first.user.avatarSeed} uri={first.user.avatarUrl} size={60} />
              </View>
              <View style={styles.crownOn}><CrownGlyph size={24} color={colors.sun} /></View>
            </View>
            <View style={styles.kingWords}>
              <Text style={styles.kingName} numberOfLines={1}>{firstIsMe ? 'You' : first.user.name}</Text>
              {/* The handle, then the last win on a line of its own: side by side they were cut off on a small phone. */}
              <Text style={styles.kingWhen} numberOfLines={1}>@{first.user.handle}</Text>
              {first.last ? <Text style={styles.kingWhen} numberOfLines={1}>{`Last win ${lastWin(first.last)}`}</Text> : null}
            </View>
            <View style={styles.kingCount}>
              <Text style={styles.kingNumber}>{first.n}</Text>
              <Text style={styles.kingUnit}>{first.n === 1 ? 'win' : 'wins'}</Text>
            </View>
          </Pressable>
        ) : null}
        {rows.map((t, i) => {
          const rank = (kings.mode === 'wins' ? 2 : 1) + i;
          const mine = t.userId === currentUserId;
          const hint = mine ? climb(rank) : null;
          return (
            <Pressable key={t.userId} accessibilityRole="link" accessibilityLabel={`Number ${rank}: ${mine ? 'you' : t.user.name}, ${unit(t.n)}. Open profile`} onPress={() => open(t.userId)} style={({ pressed }) => [styles.row, (i > 0 || !regulars) && styles.line, mine && styles.mine, pressed && styles.pressed]}>
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
        {/* Your own line, under the top three: your place and what it takes, or your wins when you aren't on the board. */}
        {kings.mode === 'wins' && ((myRank && myRank > 3) || myOver) && me ? (
          <View style={[styles.row, styles.line, styles.mine]} accessible accessibilityLabel={`You: ${myOver ? 'outside the top 10' : `number ${myRank}`}, ${wins(kings.me.wins)}. ${climb(myRank ?? 11) ?? ''}`}>
            <Text style={[styles.rank, styles.rankMine, myOver && styles.rankOver]}>{myOver ? '10+' : myRank}</Text>
            <Avatar name={me.name} seed={me.avatarSeed} uri={me.avatarUrl} size={36} />
            <View style={styles.rowWords}>
              <Text style={styles.rowName}>You</Text>
              <Text style={[styles.rowHandle, styles.hint]} numberOfLines={1}>{climb(myRank ?? 11)}</Text>
            </View>
            <Text style={styles.count}><Text style={styles.countNumber}>{kings.me.wins}</Text>{` ${kings.me.wins === 1 ? 'win' : 'wins'}`}</Text>
          </View>
        ) : !regulars && mineUnranked ? <View style={styles.line}>{mineUnranked}</View> : null}
        {/* How to get on the board: the King's board only (the regulars' "No King yet" line above says it). */}
        {regulars ? null : (
          <View style={[styles.foot, styles.line]}>
            <Ionicons name="trophy-outline" size={15} color={colors.textMuted} />
            <Text style={styles.footText}>Log a match, mark it won and post it here.</Text>
          </View>
        )}
      </View>
  );
  if (look === 'row') {
    return regulars
      ? kingRow('No King yet', (
        <>
          <Text style={styles.noteText}>{lineRule}</Text>
          {mineUnranked ? <View style={[styles.card, styles.cardSolo]}>{mineUnranked}</View> : null}
          {regularsHead}
          {board}
        </>
      ))
      : kingRow(firstIsMe ? 'You' : `@${first.user.handle}`, (
        <>
          {sub ? <Text style={styles.noteText}>{sub}</Text> : null}
          {board}
        </>
      ), true);
  }
  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.wrap}>
      {/* The options' one line, with no King; otherwise the section's own head. */}
      {look === 'line' && regulars ? lineHead : head}
      {/* No King yet: said first, as on an empty court (with your own wins, if only you see them), then the regulars. */}
      {regulars && look !== 'line' ? noKing : null}
      {regulars && mineUnranked ? <View style={[styles.card, styles.cardSolo]}>{mineUnranked}</View> : null}
      {/* The regulars under a head of their own, in the page's one head style, so their #1 is never read as the King. */}
      {regulars ? regularsHead : null}
      {board}
    </Animated.View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.md },
  // A 44pt target, drawn as the 22pt glyph, level with the title.
  info: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginVertical: -9, marginRight: -11 },
  // The fine print, opened in place under the title.
  note: { marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.bgElevated },
  noteText: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  card: { ...lift, borderRadius: corner(20), backgroundColor: colors.surface, overflow: 'hidden' },
  // Your line alone, under "No King yet."
  cardSolo: { borderRadius: radius.lg },
  pressed: { opacity: PRESS_DIM },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  mine: { backgroundColor: colors.brandDim },
  // The King.
  king: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 14 },
  kingFace: { width: 70, height: 74, justifyContent: 'flex-end', alignItems: 'center' },
  ring: { borderWidth: 3, borderRadius: 36, padding: 2 },
  crownOn: { position: 'absolute', top: -2, alignSelf: 'center' },
  kingWords: { flex: 1, minWidth: 0, gap: 2 },
  kingName: { ...font('600'), fontSize: 17, letterSpacing: -0.2, color: colors.text },
  kingWhen: { ...typography.small, color: colors.textMuted },
  kingCount: { alignItems: 'flex-end' },
  kingNumber: { ...font('600'), fontSize: 34, lineHeight: 38, letterSpacing: -0.7, color: colors.text, fontVariant: ['tabular-nums'] },
  kingUnit: { ...typography.small, color: colors.textMuted, marginTop: -2 },
  // The regulars' own head, a little apart from "No King yet".
  regularsHead: { marginTop: spacing.sm },
  // 2, 3, and you: every row the same 56pt.
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 10, minHeight: 56 },
  rank: { width: 22, ...font('600'), fontSize: 15, color: colors.textMuted, textAlign: 'center', fontVariant: ['tabular-nums'] },
  rankMine: { color: colors.brand },
  // "10+" in the same column as 2 and 3.
  rankOver: { fontSize: 12, letterSpacing: -0.2 },
  rankLock: { width: 22, alignItems: 'center' },
  rowWords: { flex: 1, minWidth: 0, gap: 1 },
  rowName: { ...font('500'), fontSize: 15, color: colors.text },
  rowHandle: { ...typography.small, color: colors.textMuted },
  hint: { color: colors.brand, ...font('500') },
  count: { ...typography.small, color: colors.textMuted },
  countNumber: { ...font('600'), fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
  foot: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 10, minHeight: 48 },
  footText: { flex: 1, ...typography.small, color: colors.textMuted, lineHeight: 18 },
  // Nothing posted here yet (or still asking): one quiet line, no card.
  quiet: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, minHeight: 19 },
  quietText: { flex: 1, ...typography.small, color: colors.textMuted, lineHeight: 19 },
  quietStrong: { ...font('600'), color: colors.text },
  // The options' one line (no King): the crown, "King of the Court · No King yet", the (i).
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 26 },
  lineText: { flex: 1, minWidth: 0, ...typography.body, color: colors.textMuted },
  lineStrong: { ...font('600'), color: colors.text },
  // B's row, opened: the rule, then the board.
  rowDetails: { gap: spacing.md, paddingTop: 2, paddingBottom: spacing.md },
  skeletonWrap: { gap: 7, paddingTop: 4, paddingBottom: 3 },
  skeleton: { height: 12, width: '100%', maxWidth: 420, borderRadius: 6, backgroundColor: colors.surfaceAlt },
  skeletonShort: { width: '55%' },
});

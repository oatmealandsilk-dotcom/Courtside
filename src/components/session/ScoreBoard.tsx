import React from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';

import { BrandMark } from '@/components/BrandMark';
import { ShirtWash } from '@/components/ui/BrandWash';
import type { ID, MatchEnd, MatchResult, MatchSet, SessionDetail } from '@/data/types';
import { sessionPeople } from '@/features/activity/sessionTags';
import { matchTiebreakAt, readScore, spokenScore } from '@/features/activity/score';
import { useTheme, type ThemeName } from '@/theme/ThemeProvider';
import { colors, font, pageIsDark, typography, withAlpha } from '@/theme';
import { TextScale } from '@/theme/textScale';
import { DrawnTick } from './DrawnTick';

/*
 * The ScoreBoard, "Court card" look (T1, Oct 22, owner: "T1 or t2 is good").
 * A match's score drawn the way a club's board draws it: two rows (the
 * poster's side on top, the other side under it) and a column per set.
 *   - No card of its own in a post or on the session page: only the court's
 *     soft wash (frame 'open'), or nothing at all inside a session box that
 *     already has one (frame 'bare').
 *   - Court-coloured hairlines between the sets and between the two players.
 *   - Won / Lost / Unfinished in words, top right (never colour alone).
 *   - A set's winner in a deep shade of the court's colour (40% toward the
 *     text, Paris 50%, so it is never "error" red); the loser faint.
 *   - Tiebreak points as a small raised number in a slot of their own after
 *     the loser's games; a match tiebreak as a smaller last column.
 *   - A tick only on the top row's own win; "ret." after the side that retired.
 * ScoreBoardCompact is the two small rows for a list; ScoreSticker the calm
 * light court card for a share picture. Theme tokens only, so every court
 * repaints its own board.
 */

/** The inks a board is drawn in: the page's (the default), a session box's, or white on a photo. */
export type BoardInks = {
  /** The top row's winning sets. */
  win: string;
  /** The other side's winning sets. */
  winThem: string;
  name: string;
  nameLose: string;
  lose: string;
  muted: string;
  rule: string;
  dash: string;
  net: string;
  tick: string;
  eyebrow: string;
  shade?: TextStyle;
};

/** a toward b by t (both #rrggbb), for a deeper tone of the court's accent. */
function mixHex(a: string, b: string, t: number): string {
  const ch = (c: string, i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return a;
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The board's own inks on a page: your winning sets take the court's accent
 * pulled toward the text ink (so the winner is the darkest figure on a light
 * court), the plain accent on a dark one (New York: white, not its yellow).
 * The court colour itself goes on the lines, the net and the tick.
 */
export function pageInks(theme: ThemeName): BoardInks {
  const dark = pageIsDark();
  const accent = theme === 'default' ? colors.cardFigure : colors.brand;
  const win = dark ? (theme === 'us-open' ? colors.text : accent) : mixHex(accent, colors.text, theme === 'roland-garros' ? 0.5 : 0.4);
  return {
    win, winThem: colors.text, name: colors.text, nameLose: colors.textMuted, lose: colors.textFaint, muted: colors.textMuted,
    rule: withAlpha(colors.court, 0.35), dash: withAlpha(colors.court, 0.75), net: withAlpha(colors.court, 0.45),
    tick: dark && theme === 'us-open' ? colors.text : accent,
    eyebrow: theme === 'default' ? colors.cardInk : colors.textMuted,
  };
}

/**
 * Inside a session box: the box's own lettering (its figure ink for the
 * winner), so a filled court (Paris, London, Clean) keeps its contrast. The
 * loser takes three quarters of the box's ink (half fell under 3:1 on cream
 * and on the filled courts; three quarters is 3.4:1 or more on every box).
 */
export function boxInks(look: { figure: string; ink: string; muted: string; faint: string; eyebrow: string }, shade?: TextStyle): BoardInks {
  return {
    win: look.figure, winThem: look.ink, name: look.ink, nameLose: look.muted, lose: withAlpha(look.ink, 0.75), muted: look.muted,
    rule: withAlpha(look.figure, 0.3), dash: withAlpha(look.figure, 0.7), net: withAlpha(look.figure, 0.42),
    tick: look.figure, eyebrow: look.eyebrow, shade,
  };
}

/** What a screen reader says: "Won. 7 to 6, tiebreak 5, 3 to 6, match tiebreak 10 to 7. They retired". */
export function spokenBoard(sets: MatchSet[], youWon?: boolean, ended?: MatchEnd): string {
  const lead = ended?.how === 'stopped' ? 'Unfinished. ' : youWon === undefined ? '' : youWon ? 'Won. ' : 'Lost. ';
  const end = ended?.how === 'retired' ? `. ${ended.side === 0 ? 'Retired' : 'They retired'}` : '';
  return `${lead}Score ${spokenScore(sets)}${end}`;
}

/** An older match post's sets ("6-4", "7-6(5)") as a board's sets; none when they don't read as a score. */
export const matchSets = (m: MatchResult): MatchSet[] => readScore(m.sets.join(' ')).sets ?? [];

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * The board's two sides for a session: the poster on top, the other side
 * under. Singles by full name; doubles (a partner, or two opponents) by
 * first names, "Alex / June" over "Mira / Dev". A practice with a score has
 * the people it was with under you.
 */
export function boardSides(s: SessionDetail, author: string, hidden: ID[] = [], people?: { name: string; role: 'opponent' | 'partner' }[]): { you: string; them: string } {
  // The composer's preview names the players picked (people), before anyone has accepted.
  const { opponents, partners } = people
    ? (s.kind === 'match' ? { opponents: people.filter((p) => p.role === 'opponent'), partners: people.filter((p) => p.role !== 'opponent') } : { opponents: [], partners: people })
    : sessionPeople(s, hidden);
  if (s.kind !== 'match') {
    const all = [...opponents, ...partners];
    return { you: author, them: all.length > 1 ? all.map((p) => firstName(p.name)).join(' / ') : all[0]?.name ?? '' };
  }
  if (!partners.length && opponents.length <= 1) return { you: author, them: opponents[0]?.name ?? '' };
  return { you: [author, ...partners.map((p) => p.name)].map(firstName).join(' / '), them: opponents.map((o) => firstName(o.name)).join(' / ') };
}

/** Won / Lost / Unfinished, in words so the board never depends on colour alone. */
export function boardStatus(youWon: boolean | undefined, ended?: MatchEnd): string {
  if (ended?.how === 'stopped') return 'Unfinished';
  if (youWon === undefined) return '';
  return `${youWon ? 'Won' : 'Lost'}${ended?.how === 'retired' ? ' · ret.' : ''}`;
}

type Metrics = { row: number; col: number; mtbCol: number; slot: number; games: number; mtb: number; tb: number; name: number; lead: number; pad: number; trail: number };
const FULL: Metrics = { row: 40, col: 26, mtbCol: 34, slot: 10, games: 30, mtb: 20, tb: 11, name: 15, lead: 0, pad: 7, trail: 7 };
const MINI: Metrics = { row: 19, col: 12, mtbCol: 17, slot: 7, games: 15, mtb: 12, tb: 9, name: 0, lead: 3, pad: 3, trail: 0 };
const scaled = (m: Metrics, k: number): Metrics => (k === 1 ? m : (Object.fromEntries(Object.entries(m).map(([key, v]) => [key, v * k])) as Metrics));

/** Big figures never grow with the phone's text size (their rows are fixed); names and words do, to the card's cap. */
const FIGURE_CAP = TextScale.CHROME;
const TAB: TextStyle = { fontVariant: ['tabular-nums'] };

type GridProps = { sets: MatchSet[]; you: string; them: string; youWon?: boolean; ended?: MatchEnd; headers: boolean; named: boolean; m: Metrics; k: BoardInks; still?: boolean };

/** Names, then one column per set, court lines between them and the net between the rows. */
function Grid({ sets, you, them, youWon, ended, headers, named, m, k, still = false }: GridProps) {
  // The small words (set numbers, 'ret.') follow the board's size, so a board drawn to fit keeps its proportions.
  const hs = m.row / (named ? FULL.row : MINI.row);
  const open = (i: number) => !!ended && i === sets.length - 1;
  const took = (i: number, side: 0 | 1) => !open(i) && sets[i][side] > sets[i][side === 0 ? 1 : 0];
  const mtb = (i: number) => matchTiebreakAt(sets, i);
  const hasTb = (i: number) => sets[i][2] != null;
  // A column is as wide as its widest number ("10" in a long set or a pro set), never narrower than the board's own.
  const digits = (n: number | undefined) => String(n ?? '').length;
  const colNum = (i: number) => {
    const base = mtb(i) ? m.mtbCol : m.col;
    const size = mtb(i) ? m.mtb : m.games;
    return Math.max(base, Math.ceil(Math.max(digits(sets[i][0]), digits(sets[i][1])) * 0.62 * size));
  };
  const slotW = (i: number) => Math.max(m.slot, Math.ceil(digits(sets[i][2]) * 0.62 * m.tb) + 1);
  const endW = ended?.how === 'retired' ? (named ? 30 : 22) * (m.row / (named ? FULL.row : MINI.row)) : 0;
  const rows: { name: string; side: 0 | 1; wonMatch: boolean }[] = [
    { name: you, side: 0, wonMatch: youWon === true },
    { name: them, side: 1, wonMatch: youWon === false },
  ];
  const column = (i: number, body: React.ReactNode, ghost = false) => {
    const ruled = i > 0 || named;
    const dashed = open(i);
    const ink = ghost ? 'transparent' : dashed ? k.dash : k.rule;
    return (
      <React.Fragment key={i}>
        {/* A match tiebreak stands a little apart: a double line, like the alley at the court's side. */}
        {mtb(i) ? <View style={{ marginLeft: m.lead, width: 4, alignSelf: 'stretch', borderLeftWidth: 1, borderColor: ink }} /> : null}
        <View style={{ marginLeft: mtb(i) ? 0 : i === 0 && !named ? 0 : m.lead, borderLeftWidth: ruled ? 1 : 0, borderStyle: dashed ? 'dashed' : 'solid', borderColor: ink, paddingLeft: ruled ? m.pad : 0, paddingRight: m.trail }}>
          {body}
        </View>
      </React.Fragment>
    );
  };
  return (
    <View>
      {headers && named ? (
        <View style={{ flexDirection: 'row', height: 18 * hs, alignItems: 'flex-end', paddingBottom: 2 * hs }}>
          <View style={{ flex: 1 }} />
          {sets.map((_, i) => column(i, (
            <Text maxFontSizeMultiplier={FIGURE_CAP} style={[typography.caption, TAB, k.shade, { fontSize: typography.caption.fontSize * hs, width: colNum(i) + (hasTb(i) ? slotW(i) : 0), paddingRight: hasTb(i) ? slotW(i) : 0, textAlign: 'right', color: k.lose }]}>
              {mtb(i) ? 'TB' : String(i + 1)}
            </Text>
          ), true))}
          {endW ? <View style={{ width: endW, marginLeft: 6 }} /> : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row' }}>
        {named ? (
          <View style={{ flex: 1, minWidth: 0 }}>
            {rows.map((r) => (
              <View key={r.side} style={[styles.nameRow, { height: m.row }]}>
                <Text
                  maxFontSizeMultiplier={still ? TextScale.CHROME : TextScale.CARD}
                  numberOfLines={1}
                  style={[k.shade, { fontSize: Math.max(12, m.name), letterSpacing: -0.15, flexShrink: 1 }, font(r.wonMatch ? '600' : '400'), { color: r.name ? (r.wonMatch ? k.name : k.nameLose) : k.lose }]}
                >
                  {r.name || '—'}
                </Text>
                {r.side === 0 && youWon === true ? <View style={{ marginLeft: 6, marginTop: 1 }}><DrawnTick size={Math.round(m.name * 0.93)} color={k.tick} duration={still ? 0 : 280} /></View> : null}
              </View>
            ))}
          </View>
        ) : null}
        {sets.map((s, i) => column(i, rows.map((r) => {
          const won = took(i, r.side);
          const size = mtb(i) ? m.mtb : m.games;
          const lh = Math.round(size * 1.15);
          return (
            <View key={r.side} style={[styles.cell, { height: m.row }]}>
              <Text
                maxFontSizeMultiplier={FIGURE_CAP}
                numberOfLines={1}
                style={[k.shade, TAB, { width: colNum(i), textAlign: 'right', fontSize: size, lineHeight: lh, letterSpacing: named ? (size >= 28 ? -0.7 : -0.3) : 0 }, font(won ? '600' : '400'), { color: won ? (r.side === 0 ? k.win : k.winThem) : open(i) ? k.muted : k.lose }]}
              >
                {s[r.side]}
              </Text>
              {hasTb(i) ? (
                <Text
                  maxFontSizeMultiplier={FIGURE_CAP}
                  style={[k.shade, TAB, { width: slotW(i), paddingLeft: 1, alignSelf: 'flex-start', marginTop: Math.max(0, Math.round((m.row - lh) / 2)) + 1, fontSize: m.tb, lineHeight: Math.round(m.tb + 2) }, font('500'), { color: k.muted }]}
                >
                  {won ? '' : s[2]}
                </Text>
              ) : null}
            </View>
          );
        })))}
        {endW ? (
          <View style={{ width: endW, marginLeft: 6 }}>
            {rows.map((r) => (
              <View key={r.side} style={[styles.cell, { height: m.row }]}>
                <Text maxFontSizeMultiplier={FIGURE_CAP} style={[k.shade, { fontSize: (named ? 11 : 9) * hs, lineHeight: (named ? 14 : 11) * hs }, font('500'), { color: k.muted }]}>{ended?.side === r.side ? 'ret.' : ''}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {/* The net between the two players. */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: endW ? endW + 6 : 0, top: m.row, height: 1, marginTop: -0.5, backgroundColor: k.net }} />
      </View>
    </View>
  );
}

export type ScoreBoardProps = {
  sets: MatchSet[];
  /** The top row: the poster's side ("Alex Rivera", or "Alex / June" in doubles). */
  you: string;
  /** The other side; empty draws a quiet dash rather than a made-up "Opponent". */
  them?: string;
  /** Whether the top row won the match; undefined when nobody said. */
  youWon?: boolean;
  ended?: MatchEnd;
  /**
   * 'open' (a post or the session page): no card, only the court's soft wash.
   * 'bare': nothing behind it, inside a session box that has its own.
   * 'card': its own calm light court card (the sticker).
   */
  frame?: 'open' | 'bare' | 'card';
  /** The small line over it ("MATCH", Won / Lost / Unfinished at its right). Off where the box around it already says the result. */
  status?: boolean;
  eyebrow?: string;
  /** The set numbers over the columns ("1 2 TB"). */
  headers?: boolean;
  /** Everything that much bigger or smaller (a session box drawn to fit). */
  scale?: number;
  /** The inks, when a session box lends its own (boxInks). */
  inks?: BoardInks;
  /** The CourtSide mark under it (the sticker). */
  wordmark?: boolean;
  /** Drawn as a picture to share: the tick is simply there, never drawing itself in. */
  still?: boolean;
};

/** The full board: names, games, tiebreaks, the result in words. Nothing when there is no score. */
export function ScoreBoard({ sets, you, them = '', youWon, ended, frame = 'open', status = true, eyebrow = 'Match', headers = false, scale = 1, inks, wordmark = false, still = false }: ScoreBoardProps) {
  const { theme } = useTheme();
  if (!sets.length) return null;
  // In a box: New York's figure ink is its yellow, but the board's winner and tick there are white (the T1 sheet),
  // as pageInks has them; Clean's quiet ink (70% white) is too faint for the small tiebreak points and "ret.".
  const k = !inks ? pageInks(theme)
    : theme === 'us-open' ? { ...inks, win: colors.text, tick: colors.text }
    : theme === 'clean' ? { ...inks, muted: withAlpha(inks.name, 0.92) }
    : inks;
  const word = boardStatus(youWon, ended);
  const card = frame === 'card';
  // A picture (the sticker) scales everything with it, and its words never grow with the phone's text size.
  const sc = card ? scale : 1;
  const radius = (card ? 16 : 12) * sc;
  const wordCap = card ? TextScale.CHROME : TextScale.CARD;
  const cap = { fontSize: typography.caption.fontSize * sc };
  const dark = pageIsDark();
  const fill = theme === 'default' ? colors.cardFill : dark ? colors.surface : colors.bgElevated;
  const lift = theme === 'default' ? 0 : dark ? 0.5 : 0.72;
  return (
    <View
      accessible
      accessibilityLabel={spokenBoard(sets, youWon, ended)}
      style={[frame === 'open' ? styles.open : card ? styles.card : null, card && { backgroundColor: fill, borderRadius: radius, paddingHorizontal: 14 * sc, paddingTop: 12 * sc, paddingBottom: 12 * sc }]}
    >
      {/* Clean has no shirt to wash with: its card keeps just a hairline. */}
      {frame === 'bare' ? null : theme !== 'clean' ? <ShirtWash radius={radius} rim={card ? (theme === 'default' ? withAlpha(colors.cardFigure, 0.2) : colors.border) : null} lift={lift} />
        : card ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]} /> : null}
      {status ? (
        <View style={styles.eyebrow}>
          <Text maxFontSizeMultiplier={wordCap} numberOfLines={1} style={[typography.caption, cap, k.shade, { color: k.eyebrow, flex: 1, textTransform: 'uppercase' }]}>{eyebrow}</Text>
          {word ? <Text maxFontSizeMultiplier={wordCap} style={[typography.caption, cap, font('600'), k.shade, { color: k.eyebrow }]}>{word}</Text> : null}
        </View>
      ) : null}
      <Grid sets={sets} you={you} them={them} youWon={youWon} ended={ended} headers={headers} named m={scaled(FULL, scale)} k={k} still={still} />
      {wordmark ? (
        <View style={[styles.wordRow, { gap: 4 * sc, marginTop: 10 * sc }]}>
          <BrandMark size={14 * sc} color={k.tick} />
          <Text maxFontSizeMultiplier={TextScale.CHROME} style={[font('900'), { fontSize: 14 * sc, letterSpacing: -0.3 * sc, color: k.tick }]}>CourtSide</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Two small rows, no names, the court's lines between the sets: a list row's score. */
export function ScoreBoardCompact({ sets, youWon, ended }: { sets: MatchSet[]; youWon?: boolean; ended?: MatchEnd }) {
  useTheme();
  if (!sets.length) return null;
  const k: BoardInks = {
    win: colors.text, winThem: colors.text, name: colors.text, nameLose: colors.textMuted, lose: colors.textFaint, muted: colors.textMuted,
    rule: withAlpha(colors.court, 0.35), dash: withAlpha(colors.court, 0.75), net: 'transparent', tick: colors.brand, eyebrow: colors.textMuted,
  };
  return (
    <View accessible accessibilityLabel={spokenBoard(sets, youWon, ended)}>
      <Grid sets={sets} you="" them="" youWon={youWon} ended={ended} headers={false} named={false} m={MINI} k={k} />
    </View>
  );
}

/** The sticker: the board on its own calm light court card, the mark under it, for a picture to share. */
export function ScoreSticker(props: Omit<ScoreBoardProps, 'frame' | 'wordmark'>) {
  return <ScoreBoard {...props} frame="card" wordmark still />;
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, overflow: 'hidden', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12 },
  // No card: the wash bleeds 12px past the text column, so the names line up with the words above.
  open: { borderRadius: 12, overflow: 'hidden', marginHorizontal: -12, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
  cell: { flexDirection: 'row', alignItems: 'center' },
  wordRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
});

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BrandMark } from '@/components/BrandMark';
import { HitGlyph } from '@/components/HitGlyph';
import type { PracticeSession } from '@/data/types';
import { spokenDuration } from '@/features/activity/format';
import { compareLine, weekRange, type WeekRecap } from '@/features/recap/recap';
import { RECORD_ICON, RECORD_LABEL, recordValue } from '@/features/records/records';
import { CardWash, type CardLook } from '@/components/session/SessionCard';
import { duration } from '@/lib/format';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography, withAlpha } from '@/theme';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** "6h" and "15m" apart, so the hours can be big; "45" and "min" under an hour. */
function bigLength(minutes: number): [string, string] {
  if (minutes < 60) return [String(minutes), 'min'];
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [`${h}h`, m ? `${m}m` : ''];
}

/** "Wed – Sun", for a streak's days in the week. */
function weekdaySpan(from: string, to: string): string {
  const name = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
  return from === to ? name(from) : `${name(from)} – ${name(to)}`;
}

/** Matches won and lost, when there were any: "3" over "wins" with no losses, else "3–1" over "won–lost". */
function matchStat(recap: Pick<WeekRecap, 'won' | 'lost'>): { value: string; label: string } | null {
  if (!recap.won && !recap.lost) return null;
  if (!recap.lost) return { value: String(recap.won), label: recap.won === 1 ? 'win' : 'wins' };
  return { value: `${recap.won}–${recap.lost}`, label: 'won–lost' };
}

/**
 * The weekly recap's card (owner, Oct 5): last week's time on court, big,
 * against the week before; a bar for each day; sessions, matches won and
 * lost, and the streak. The same card is the Instagram picture
 * (RecapStoryArt), drawn a little tighter there (`story`) with the CourtSide
 * lockup and courtsidebase.com along its foot, as the session pictures
 * have. Nothing on it but your own numbers.
 */
export function RecapCard({ recap, label = 'LAST WEEK', story = false }: { recap: WeekRecap; label?: string; /** The Instagram picture's tighter card, with the lockup at its foot. */ story?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const [hours, minutes] = bigLength(recap.minutes);
  const compare = compareLine(recap);
  const up = recap.minutes > recap.prevMinutes;
  const most = Math.max(...recap.days, 1);
  const matches = matchStat(recap);
  return (
    <View style={[styles.card, story && styles.cardStory]}>
      {/* On the picture the week is said over the card, and the lockup sits at its foot: the number leads. */}
      {story ? null : (
        <View style={styles.top}>
          <Text style={styles.label}>{label}</Text>
          <View style={styles.mark}>
            <BrandMark size={16} color={colors.brand} />
            <Text style={styles.markText}>CourtSide</Text>
          </View>
        </View>
      )}
      <View style={[styles.bigRow, story && styles.bigRowStory]} accessible accessibilityLabel={`${spokenDuration(recap.minutes)} on court`}>
        <Text style={[styles.big, story && styles.bigStory]}>{hours}</Text>
        {minutes ? <Text style={[styles.bigSmall, story && styles.bigSmallStory]}>{minutes}</Text> : null}
      </View>
      <Text style={styles.onCourt}>on court</Text>
      {compare ? (
        // Up wears the brand green; down (or the same) stays quiet: never a "win" colour for a lighter week.
        <View style={[styles.compare, !up && styles.compareQuiet]}>
          <Ionicons name={up ? 'arrow-up' : recap.minutes === recap.prevMinutes ? 'remove' : 'arrow-down'} size={14} color={up ? colors.brand : colors.textMuted} />
          <Text style={[styles.compareText, !up && styles.compareTextQuiet]}>{compare}</Text>
        </View>
      ) : null}
      <View style={[styles.bars, story && styles.barsStory]} accessible accessibilityLabel={`Each day: ${recap.days.map((m, i) => `${DAY_LETTERS[i]} ${m} minutes`).join(', ')}`}>
        {recap.days.map((m, i) => (
          <View key={i} style={styles.barCol}>
            <View style={styles.barSpace}>
              <View style={[styles.bar, story && styles.barStory, m ? { height: `${Math.max(14, Math.round((m / most) * 100))}%`, backgroundColor: colors.brand } : styles.barNone]} />
            </View>
            <Text style={styles.barDay}>{DAY_LETTERS[i]}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.stats, story && styles.statsStory]}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{recap.sessions}</Text>
          <Text style={styles.statLabel}>{recap.sessions === 1 ? 'session' : 'sessions'}</Text>
        </View>
        {/* A week with no match says nothing about matches, rather than "0–0". */}
        {matches ? (
          <View style={[styles.stat, styles.statLine]}>
            <Text style={styles.statValue}>{matches.value}</Text>
            <Text style={styles.statLabel}>{matches.label}</Text>
          </View>
        ) : null}
        {/* A streak beside no sessions would read oddly (it counts posts and Instants too): only with a played week. */}
        {recap.sessions ? (
          <View style={[styles.stat, styles.statLine]}>
            <Text style={styles.statValue}>{recap.streak}</Text>
            <Text style={styles.statLabel}>day streak</Text>
          </View>
        ) : null}
      </View>
      {story ? (
        <View style={styles.foot}>
          <BrandMark size={15} color={colors.brand} />
          <Text style={styles.markText}>CourtSide</Text>
          <View style={{ flex: 1 }} />
          <Text style={styles.site}>courtsidebase.com</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * What stood out: "Your biggest week yet · Beat your old best, 3h (Sep 21 –
 * 27)", "Best streak yet · 5 days in a row, Wed – Sun", "New record: longest
 * match · 2h 40m vs Dev, Saturday".
 *
 * On the Instagram picture (`story`) strangers read it, so it is said in your
 * own voice under "My week on court" and holds only your own numbers: "My
 * biggest week yet · Beat my old best, 3h", "My best streak yet · 5 days in
 * a row", "New record: longest match · 2h 40m · beat 2h 5m". Never who it was
 * against (a typed name may be someone who never agreed to be on it) and no
 * days or dates: the week's dates are over the card already.
 */
export function RecapHighlights({ recap, sessions = [], limit, compact = false, story = false }: { recap: WeekRecap; /** Your log, for the day and who a record was against (not needed for the picture). */ sessions?: PracticeSession[]; /** Only the first few (the Instagram picture has room for one). */ limit?: number; /** A little tighter, for the picture. */ compact?: boolean; /** The Instagram picture's words: first person, no names, no days. */ story?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const rows: { key: string; icon: 'flame' | typeof RECORD_ICON | 'stats-chart'; tint: string; title: string; line: string }[] = [];
  // The number is big on the card already: here, the best it beat.
  if (recap.bestWeek) {
    rows.push(story
      ? { key: 'week', icon: 'stats-chart', tint: colors.brand, title: 'My biggest week yet', line: `Beat my old best, ${duration(recap.bestBefore)}` }
      : { key: 'week', icon: 'stats-chart', tint: colors.brand, title: 'Your biggest week yet', line: `Beat your old best, ${duration(recap.bestBefore)}${recap.bestBeforeWeek ? ` (${weekRange(recap.bestBeforeWeek)})` : ''}` });
  }
  if (recap.bestStreak && recap.streakFrom && recap.streakTo) {
    const inWeek = recap.streakFrom < recap.week ? recap.week : recap.streakFrom;
    rows.push({ key: 'streak', icon: 'flame', tint: colors.clay, title: story ? 'My best streak yet' : 'Best streak yet', line: story ? `${recap.streak} days in a row` : `${recap.streak} days in a row, ${weekdaySpan(inWeek, recap.streakTo)}` });
  }
  for (const b of recap.records) {
    if (b.key === 'streak' || b.key === 'week') continue;
    const title = `New record: ${RECORD_LABEL[b.key].charAt(0).toLowerCase()}${RECORD_LABEL[b.key].slice(1)}`;
    if (story) {
      rows.push({ key: `rec-${b.key}`, icon: RECORD_ICON, tint: colors.sun, title, line: `${recordValue(b.now)} · beat ${recordValue(b.was)}` });
      continue;
    }
    const s = b.now.sessionId ? sessions.find((x) => x.id === b.now.sessionId) : undefined;
    rows.push({
      key: `rec-${b.key}`, icon: RECORD_ICON, tint: colors.sun, title,
      line: `${recordValue(b.now)}${s?.opponent ? ` vs ${s.opponent.split(/\s+/)[0]}` : ''}${s ? `, ${new Date(`${s.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' })}` : ''}`,
    });
  }
  const shown = limit ? rows.slice(0, limit) : rows;
  if (!shown.length) return null;
  return (
    <View style={styles.highlights}>
      {shown.map((r, i) => (
        <View key={r.key} style={[styles.highlight, compact && styles.highlightCompact, i > 0 && styles.highlightLine]} accessible accessibilityLabel={`${r.title}. ${r.line}`}>
          <View style={[styles.highlightDisc, { backgroundColor: `${r.tint}26` }]}><Ionicons name={r.icon} size={17} color={r.tint} /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.highlightTitle}>{r.title}</Text>
            <Text style={styles.highlightLine2}>{r.line}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * "up 2h", "down 45 min", "same as the week before": the comparison, short
 * enough for the card's line. `spoken` says it in words for VoiceOver ("up 5
 * hours 23 minutes on the week before"), never "5h 23m".
 */
function shortCompare(r: Pick<WeekRecap, 'minutes' | 'prevMinutes' | 'prevSessions'>, spoken = false): string | null {
  if (!r.prevSessions) return null;
  if (r.minutes === r.prevMinutes) return 'same as the week before';
  const up = r.minutes > r.prevMinutes;
  const diff = Math.abs(r.minutes - r.prevMinutes);
  if (spoken) return `${up ? 'up' : 'down'} ${spokenDuration(diff)} on the week before`;
  return `${up ? 'up' : 'down'} ${duration(diff)}`;
}

/**
 * The one summary at the top of Your sessions (Oct 6 redesign, owner: "too
 * jumbled"; then "they need the wash"): one of the session boxes, its look
 * and wash from cardLook (cream with the shirt's fade on the CourtSide court,
 * the court's colour on a city court), the figure in the box's figure ink. Its
 * small line says which week ("LAST WEEK · SEP 28 – OCT 4", or "THIS WEEK"),
 * then the week's time on court big, then its sessions and how it compares,
 * with the week's bars small on the right. Last week's (the in-app recap,
 * Monday to Wednesday) opens the whole recap and × puts it away for that
 * week, the card then showing this week. A quiet week says so in words
 * instead of a big zero. `children` sits under a hairline at the card's foot
 * (Your sessions puts its Personal records row there).
 */
export function WeekSummary({ recap, label, look, onOpen, onClose, extra, children }: {
  recap: WeekRecap;
  /** The small line over the figure: "LAST WEEK · SEP 28 – OCT 4", "THIS WEEK". */
  label: string;
  /** The session boxes' look (cardLook): their ground, wash and inks, so the summary is one of them. */
  look: CardLook;
  onOpen?: () => void;
  onClose?: () => void;
  /** Said after the sessions on the small line ("10-day streak"), when there is no comparison to say. */
  extra?: string | null;
  children?: React.ReactNode;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const most = Math.max(...recap.days, 1);
  const quiet = !recap.minutes;
  const sessionsText = `${recap.sessions} ${recap.sessions === 1 ? 'session' : 'sessions'}`;
  const otherwise = recap.bestStreak ? 'best streak yet' : recap.firstWeek ? 'your first week here' : recap.won ? `${recap.won} won` : null;
  const after = onOpen ? shortCompare(recap) ?? otherwise : extra ?? null;
  const line = quiet ? (onOpen ? 'Up for a hit this week?' : extra ?? 'Log one after you play.') : [sessionsText, after].filter(Boolean).join(' · ');
  const spokenAfter = onOpen ? shortCompare(recap, true) ?? otherwise : extra ?? null;
  const spoken = quiet ? `nothing on court. ${line}` : [`${spokenDuration(recap.minutes)} on court`, sessionsText, spokenAfter].filter(Boolean).join(', ');
  const body = (
    <>
      <View style={styles.sumTop}>
        <Text style={[styles.sumLabel, { color: look.eyebrow }]} numberOfLines={1}>{label}</Text>
        {onOpen ? <Ionicons name="chevron-forward" size={13} color={look.eyebrow} /> : null}
      </View>
      <View style={styles.sumRow}>
        <View style={styles.sumWords}>
          {quiet ? (
            <Text style={[styles.sumQuiet, { color: look.wash === 'brand' ? look.ink : colors.text }]} numberOfLines={1}>{onOpen ? 'A quiet week' : 'No tennis yet'}</Text>
          ) : (
            <Text style={[styles.sumBig, { color: look.figure }]} numberOfLines={1}>
              {duration(recap.minutes)}
              <Text style={[styles.sumUnit, { color: look.muted }]}> on court</Text>
            </Text>
          )}
          <Text style={[styles.sumLine, { color: look.muted }]} numberOfLines={2}>{line}</Text>
        </View>
        {quiet ? (
          <View style={[styles.quietDisc, { backgroundColor: withAlpha(look.figure, 0.12) }]}><HitGlyph size={20} color={look.figure} /></View>
        ) : (
          <View style={styles.mini}>
            {recap.days.map((m, i) => (
              <View key={i} style={[styles.miniBar, m ? { height: Math.max(6, Math.round((m / most) * 40)), backgroundColor: look.figure } : { backgroundColor: look.lines }]} />
            ))}
          </View>
        )}
      </View>
    </>
  );
  return (
    <View style={[styles.summary, { backgroundColor: look.fill, borderColor: look.border, borderWidth: look.dark ? 1 : 0 }]}>
      <CardWash look={look} radius={22} />
      {onOpen ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Your week, ${weekRange(recap.week).replace(' – ', ' to ')}: ${spoken}. Open`} onPress={onOpen} style={({ pressed }) => [styles.sumMain, pressed && styles.pressed]}>
          {body}
        </Pressable>
      ) : (
        <View style={styles.sumMain} accessible accessibilityLabel={`This week: ${spoken}`}>{body}</View>
      )}
      {onClose ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Hide this week's recap" hitSlop={6} onPress={onClose} style={({ pressed }) => [styles.sumClose, pressed && styles.pressed]}>
          <Ionicons name="close" size={16} color={look.muted} />
        </Pressable>
      ) : null}
      {children ? <View style={[styles.sumFoot, { borderTopColor: look.lines }]}>{children}</View> : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  pressed: { opacity: 0.7 },
  card: { ...lift, borderRadius: 24, backgroundColor: colors.surface, padding: spacing.xl, paddingBottom: spacing.lg },
  // The Instagram picture's card: a little tighter, so what stood out and the lockup fit above Instagram's own buttons.
  cardStory: { paddingTop: 18, paddingBottom: 12 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { ...typography.caption, fontSize: 12, letterSpacing: 1.4, color: colors.brand },
  mark: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  markText: { ...font('600'), fontSize: 13, color: colors.brand },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: spacing.sm },
  big: { ...font('600'), fontSize: 64, lineHeight: 70, letterSpacing: -2.5, color: colors.text, fontVariant: ['tabular-nums'] },
  bigSmall: { ...font('600'), fontSize: 30, letterSpacing: -1, color: colors.text, fontVariant: ['tabular-nums'] },
  onCourt: { ...typography.body, color: colors.textMuted, marginTop: -2 },
  compare: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginTop: spacing.md, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  // The words in ink: the brand on its own dim tint fell under 4.5:1 on some courts (clay). The arrow keeps the brand.
  compareText: { ...font('600'), fontSize: 13.5, color: colors.text },
  compareQuiet: { backgroundColor: colors.surfaceAlt },
  compareTextQuiet: { color: colors.textMuted },
  bars: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, height: 130, marginTop: spacing.xl },
  barsStory: { height: 76, gap: 12, marginTop: spacing.lg },
  barStory: { borderRadius: 6 },
  bigRowStory: { marginTop: 0 },
  bigStory: { fontSize: 56, lineHeight: 62, letterSpacing: -2.2 },
  bigSmallStory: { fontSize: 27 },
  statsStory: { marginTop: spacing.md, paddingTop: spacing.md },
  barCol: { flex: 1, alignItems: 'center', gap: 6 },
  barSpace: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 8 },
  barNone: { height: 6, backgroundColor: colors.surfaceAlt },
  barDay: { ...font('500'), fontSize: 12, color: colors.textMuted },
  stats: { flexDirection: 'row', marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  stat: { flex: 1, gap: 2 },
  statLine: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border, paddingLeft: spacing.md },
  statValue: { ...font('600'), fontSize: 24, letterSpacing: -0.7, color: colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { ...typography.small, color: colors.textMuted },
  highlights: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  highlight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 14 },
  highlightCompact: { paddingVertical: 9 },
  highlightLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  highlightDisc: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  highlightTitle: { ...font('600'), fontSize: 15, color: colors.text },
  highlightLine2: { ...typography.small, color: colors.textMuted },
  // The lockup along the story card's foot, as on a session's picture.
  foot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  site: { ...font('500'), fontSize: 11.5, color: colors.textMuted },
  // The summary: the Share card's cream (its fill given by the page), no shadow, the figure in green.
  summary: { borderRadius: 22, marginTop: spacing.sm, overflow: 'hidden' },
  sumMain: { paddingHorizontal: spacing.lg + 2, paddingTop: spacing.lg, paddingBottom: spacing.lg, gap: 6 },
  sumTop: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingRight: 36 },
  sumLabel: { ...typography.caption, fontSize: 11.5, letterSpacing: 1.1, flexShrink: 1 },
  sumRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.lg },
  sumWords: { flex: 1, minWidth: 0, gap: 4 },
  sumBig: { ...font('600'), fontSize: 38, lineHeight: 44, letterSpacing: -1.4, color: colors.brand, fontVariant: ['tabular-nums'] },
  sumUnit: { ...font('500'), fontSize: 15, letterSpacing: 0, color: colors.textMuted },
  sumQuiet: { ...font('600'), fontSize: 22, lineHeight: 30, letterSpacing: -0.6, color: colors.text },
  sumLine: { ...typography.small, fontSize: 14, color: colors.textMuted },
  sumClose: { position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sumFoot: { borderTopWidth: StyleSheet.hairlineWidth, marginHorizontal: spacing.lg + 2 },
  mini: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 44, width: 74, marginBottom: 4 },
  miniBar: { flex: 1, height: 3, borderRadius: 2 },
  // A quiet week: the hit mark on the brand's dim disc, the size of the bars it stands in for.
  quietDisc: { width: 56, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandDim },
});

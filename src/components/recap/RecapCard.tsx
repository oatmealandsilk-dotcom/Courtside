import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BrandMark } from '@/components/BrandMark';
import { HitGlyph } from '@/components/HitGlyph';
import type { PracticeSession } from '@/data/types';
import { spokenDuration } from '@/features/activity/format';
import { compareLine, weekRange, type WeekRecap } from '@/features/recap/recap';
import { RECORD_ICON, RECORD_LABEL, recordValue } from '@/features/records/records';
import { duration } from '@/lib/format';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

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

/** What stood out: "Best streak yet · 5 days in a row, Wed – Sun", "New record: longest match · 2h 40m vs Dev, Saturday". */
export function RecapHighlights({ recap, sessions, limit, compact = false }: { recap: WeekRecap; sessions: PracticeSession[]; /** Only the first few (the Instagram picture has room for one). */ limit?: number; /** A little tighter, for the picture. */ compact?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const rows: { key: string; icon: 'flame' | typeof RECORD_ICON | 'stats-chart'; tint: string; title: string; line: string }[] = [];
  // The number is big on the card already: here, the best it beat.
  if (recap.bestWeek) rows.push({ key: 'week', icon: 'stats-chart', tint: colors.brand, title: 'Your biggest week yet', line: `Beat your old best, ${duration(recap.bestBefore)}${recap.bestBeforeWeek ? ` (${weekRange(recap.bestBeforeWeek)})` : ''}` });
  if (recap.bestStreak && recap.streakFrom && recap.streakTo) {
    const inWeek = recap.streakFrom < recap.week ? recap.week : recap.streakFrom;
    rows.push({ key: 'streak', icon: 'flame', tint: colors.clay, title: 'Best streak yet', line: `${recap.streak} days in a row, ${weekdaySpan(inWeek, recap.streakTo)}` });
  }
  for (const b of recap.records) {
    if (b.key === 'streak' || b.key === 'week') continue;
    const s = b.now.sessionId ? sessions.find((x) => x.id === b.now.sessionId) : undefined;
    rows.push({
      key: `rec-${b.key}`, icon: RECORD_ICON, tint: colors.sun,
      title: `New record: ${RECORD_LABEL[b.key].charAt(0).toLowerCase()}${RECORD_LABEL[b.key].slice(1)}`,
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

/** "up 2h", "down 45 min", "same as the week before": the comparison, short enough for the card's line. */
function shortCompare(r: Pick<WeekRecap, 'minutes' | 'prevMinutes' | 'prevSessions'>): string | null {
  if (!r.prevSessions) return null;
  if (r.minutes === r.prevMinutes) return 'same as the week before';
  return r.minutes > r.prevMinutes ? `up ${duration(r.minutes - r.prevMinutes)}` : `down ${duration(r.prevMinutes - r.minutes)}`;
}

/**
 * "Last week" at the top of Your sessions, Monday to Wednesday (the in-app
 * recap, for anyone without the alert): the week's bars small, its time on
 * court, its sessions and how it compares ("Last week · 8h 23m" over "7
 * sessions · up 5h 23m"). A tap opens the whole card; × (its own column,
 * a full-size target) puts it away for that week. A quiet week shows the
 * hit mark instead of seven empty bars.
 */
export function YourWeekBanner({ recap, onOpen, onClose }: { recap: WeekRecap; onOpen: () => void; onClose?: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const most = Math.max(...recap.days, 1);
  const quiet = !recap.sessions;
  const sessionsText = `${recap.sessions} ${recap.sessions === 1 ? 'session' : 'sessions'}`;
  const after = shortCompare(recap) ?? (recap.bestStreak ? 'best streak yet' : recap.firstWeek ? 'your first week here' : recap.won ? `${recap.won} won` : null);
  const title = quiet ? 'A quiet week' : `Last week · ${duration(recap.minutes)}`;
  const line = quiet ? 'Up for a hit this week?' : after ? `${sessionsText} · ${after}` : sessionsText;
  return (
    <View style={styles.banner}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Your week, ${weekRange(recap.week)}: ${quiet ? 'a quiet week' : `${spokenDuration(recap.minutes)} on court, ${line}`}. Open`} onPress={onOpen} style={({ pressed }) => [styles.bannerMain, !onClose && styles.bannerMainEnd, pressed && styles.pressed]}>
        {quiet ? (
          <View style={styles.quietDisc}><HitGlyph size={20} color={colors.brand} /></View>
        ) : (
          <View style={styles.mini}>
            {recap.days.map((m, i) => (
              <View key={i} style={[styles.miniBar, m ? { height: Math.max(6, Math.round((m / most) * 34)), backgroundColor: colors.brand } : styles.miniNone]} />
            ))}
          </View>
        )}
        <View style={styles.bannerWords}>
          <Text style={styles.bannerTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.bannerLine} numberOfLines={2}>{line}</Text>
        </View>
      </Pressable>
      {onClose ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Hide this week's recap" onPress={onClose} style={({ pressed }) => [styles.bannerClose, pressed && styles.pressed]}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}
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
  // "Last week": the card's words and bars are one button; × is a column of its own on the right, a full 44 wide.
  banner: { ...lift, flexDirection: 'row', borderRadius: 20, backgroundColor: colors.surface, marginTop: spacing.sm, overflow: 'hidden' },
  bannerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingLeft: spacing.lg, paddingVertical: 14 },
  bannerMainEnd: { paddingRight: spacing.lg },
  bannerClose: { width: 44, alignItems: 'center', justifyContent: 'center', marginRight: spacing.xs },
  mini: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 34, width: 52 },
  miniBar: { flex: 1, borderRadius: 2 },
  miniNone: { height: 3, backgroundColor: colors.surfaceAlt },
  // A quiet week: the hit mark on the brand's dim disc, the size of the bars it stands in for.
  quietDisc: { width: 52, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandDim },
  bannerWords: { flex: 1, minWidth: 0, gap: 2 },
  bannerTitle: { ...font('600'), fontSize: 15.5, letterSpacing: -0.2, color: colors.text },
  bannerLine: { ...typography.small, color: colors.textMuted },
});

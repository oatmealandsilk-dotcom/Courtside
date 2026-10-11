import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { FormRow } from '@/components/FormRow';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { Avatar } from '@/components/ui';
import type { DetectedActivity, ID, MatchSet, Post, PracticeSession, SessionTag, User } from '@/data/types';
import { resultWord, scoreLine, sessionEyebrow, sourceLabel } from '@/features/activity/format';
import { loggedNumbers } from '@/features/activity/healthShare';
import { flipSets, scoreScale, spokenScore } from '@/features/activity/score';
import { isActive, sessionPeople, tagsOnSession } from '@/features/activity/sessionTags';
import { overUsual } from '@/features/activity/usual';
import { cleanZones, hardMinutes, postZones } from '@/features/activity/zones';
import { distanceFigure } from '@/features/activity/workouts';
import { openCourt } from '@/features/players/courtLink';
import { TipBubble } from '@/components/TipBubble';
import { learned, useTip } from '@/features/tips/tips';
import { colors, font, withAlpha } from '@/theme';
import { Duration, Figure } from './Duration';
import { Pop } from './Pop';
import { StatsGrid, type StatNumber } from './StatsGrid';
import { ZoneRows } from './ZoneRows';


/** "6:12" and "pm". */
function clockParts(iso: string): { time: string; mark: string } {
  const s = new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const m = /^(.*?)[\s ]*([AaPp][.]?[Mm][.]?)$/.exec(s);
  return m ? { time: m[1], mark: m[2].replace(/[.]/g, '').toLowerCase() } : { time: s, mark: '' };
}

/** "2–1": the sets each side took, on a match's score of two sets or more. */
function setsTaken(s: Pick<NonNullable<Post['session']>, 'kind' | 'sets'>): string | null {
  if (s.kind !== 'match' || !s.sets || s.sets.length < 2) return null;
  const won = s.sets.filter(([a, b]) => a > b).length;
  return `${won}–${s.sets.length - won}`;
}

/** A person on the session, as the sheet lists them. */
type Person = { id: ID; handle: string; name: string; opponent: boolean; pending?: boolean };

/**
 * The top of the stats sheet: what it was and when, and the close button.
 * The sheet's own header, so it stays put while the rest scrolls.
 */
export function SessionSheetHeader({ post, onClose }: { post: Post; onClose: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.eyebrow} numberOfLines={1} maxFontSizeMultiplier={1.2}>{post.session ? sessionEyebrow(post.session) : 'TENNIS'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={({ pressed }) => [styles.close, { backgroundColor: withAlpha(colors.text, 0.08) }, pressed && styles.pressed]}>
        <Ionicons name="close" size={17} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

/**
 * A session's stats, raised from a clip's pill (the clip still playing above)
 * or from a post's card or strip. Everyone sees what the post shares: the
 * time and the result, who it was against (only players who accepted), the
 * court the author tagged, and the health numbers the author chose to share
 * (heart rate, its zones, Strain, calories: "Share health data", migration
 * 72). The author also sees, in a box marked "Only you", what is not on the
 * post: the start time, and any of those numbers they did not share, read
 * from their own tracker's record while it is still kept.
 *
 * A match with a score (migration 91) shows it under the time. "Rematch?"
 * (Oct 4) is offered to the two across the net: the author, to their first
 * opponent, and an opponent on the post, to the author; it opens the hit
 * form as an invite for that one player, with the last score in its note.
 */
export function SessionSheet({ post, me, users, sessions, sessionTags, activities, hidden, play = true, onEdit, onShare, onRematch, canAsk }: {
  post: Post;
  me: ID | null;
  users: User[];
  sessions: PracticeSession[];
  sessionTags: SessionTag[];
  activities: DetectedActivity[];
  hidden: ID[];
  play?: boolean;
  onEdit?: (sessionId: ID) => void;
  /** The author's own: the session as a picture for Instagram (share-session). */
  onShare?: () => void;
  /** "Rematch?": a hit invite to this player, with the score from the viewer's side. */
  onRematch?: (userId: ID, sets?: MatchSet[]) => void;
  /** Whether this player may be asked to hit (someone you may message), as "Ask to hit" on the map. */
  canAsk?: (userId: ID) => boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const s = post.session;
  if (!s) return null;
  const mine = !!me && post.authorId === me;
  // Tip (features/tips): the first time your own stats are open, share them like Strava.
  const shareTip = useTip('share-session', mine && !!onShare);
  const activity = mine && s.activityId ? activities.find((a) => a.id === s.activityId && a.userId === me) : undefined;
  const logId = s.sessionId ?? activity?.sessionId;
  const log = mine && logId ? sessions.find((x) => x.id === logId && x.userId === me) : undefined;
  const result = resultWord(s);
  const hr = s.maxHr != null;
  // An average on its own (typed into a session logged by hand, Oct 8) shows as a tracker's does.
  const avg = s.avgHr ? s.avgHr : null;
  const zones = postZones(s);
  // Shared on the post (migration 72); Strain is WHOOP's alone.
  const strain = s.strain != null ? s.strain : null;
  const kcal = s.kcal ? s.kcal : null;
  // A workout's distance (migration 107): only ever on a workout's post, never on tennis.
  const far = s.workout ? distanceFigure(s.distanceM) : null;
  // Like with like: tennis against tennis (as before workouts were logged), a run against your runs.
  const over = mine ? overUsual(sessions, me, s.minutes, { exclude: log?.id, workout: s.workout }) : null;

  // Who played: those who accepted, for everyone; to the author, those still waiting too, faded.
  const { opponents, partners } = sessionPeople(s, hidden);
  const people: Person[] = [
    ...opponents.map((w) => ({ id: w.id, handle: w.handle, name: w.name, opponent: true })),
    ...partners.map((w) => ({ id: w.id, handle: w.handle, name: w.name, opponent: false })),
  ];
  if (mine && log) {
    for (const t of tagsOnSession(sessionTags, log.id, me).filter(isActive)) {
      if (t.status !== 'pending' || people.some((p) => p.id === t.taggedId)) continue;
      const u = users.find((x) => x.id === t.taggedId);
      if (u) people.push({ id: u.id, handle: u.handle, name: u.name, opponent: t.role === 'opponent' && log.kind === 'match', pending: true });
    }
  }
  const shown = people.slice(0, 3);
  const score = scoreLine(s);
  // Who a rematch is with: the author's first opponent (waiting ones too: the hit invite has its own rules),
  // or, for an opponent on someone else's post, the author, the score turned round to their side.
  const rival = s.kind !== 'match' || !me ? null
    : mine ? (people.find((p) => p.opponent) ? { id: people.find((p) => p.opponent)!.id, sets: s.sets } : null)
    : opponents.some((w) => w.id === me) && !hidden.includes(post.authorId) ? { id: post.authorId, sets: s.sets ? flipSets(s.sets) : undefined }
    : null;
  const rivalName = rival ? users.find((u) => u.id === rival.id)?.name.trim().split(/\s+/)[0] : undefined;
  const court = post.court;
  const tracker = !!s.activityId;
  const sparse = !hr && !avg && !zones && strain == null && !kcal && !far;

  // The author's own numbers that are not on the post.
  const privateHr = activity && !hr && activity.maxHr ? activity : undefined;
  const ownZones = activity && !zones ? cleanZones(activity.zones) : null;
  // Typed into your log by hand (Oct 8) and not shared on the post: yours alone too, as a tracker's are.
  const typed = mine && !s.activityId && log ? loggedNumbers(log) : undefined;
  const owner = [
    ...(activity ? [
      strain == null && activity.source === 'whoop' && activity.strain != null ? { key: 'strain', value: activity.strain, unit: '', label: 'STRAIN', dec: true } : null,
      !kcal && activity.kcal ? { key: 'kcal', value: activity.kcal, unit: '', label: 'CALORIES', dec: false } : null,
    ] : []),
    ...(typed ? [
      !avg && typed.avgHr ? { key: 'avg', value: typed.avgHr, unit: 'bpm', label: 'AVG HEART RATE', dec: false } : null,
      !kcal && typed.kcal ? { key: 'kcal', value: typed.kcal, unit: '', label: 'CALORIES', dec: false } : null,
    ] : []),
  ].filter((x): x is { key: string; value: number; unit: string; label: string; dec: boolean } => !!x);
  const started = activity ? clockParts(activity.startedAt) : null;

  const peopleRow = shown.length || (court && !sparse) ? (
    <View style={styles.peopleRow}>
      <View style={styles.people}>
        {shown.map((p, i) => (
          <View key={p.id} style={[styles.person, p.pending && styles.pending]}>
            <Avatar name={p.name} seed={p.id} size={28} />
            <Text style={styles.vs} maxFontSizeMultiplier={1.2}>{i === 0 || p.opponent !== shown[i - 1].opponent ? (p.opponent ? 'vs' : 'with') : 'and'}</Text>
            <Text accessibilityRole="link" accessibilityLabel={`@${p.handle}, open profile`} onPress={() => router.push(`/user/${p.id}`)} style={styles.handle} numberOfLines={1} maxFontSizeMultiplier={1.2}>@{p.handle}</Text>
            {/* The clock alone didn't say what it meant: a quiet word after it (Oct 4, owner). */}
            {p.pending ? (
              <View style={styles.waiting} accessible accessibilityLabel="waiting to accept">
                <Ionicons name="time-outline" size={13} color={colors.textFaint} />
                <Text style={styles.waitingText} maxFontSizeMultiplier={1.2}>waiting</Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>
      {court && !sparse ? (
        <Pressable accessibilityRole="link" accessibilityLabel={`${court.name}, see posts from here`} hitSlop={8} onPress={() => openCourt(court)} style={styles.court}>
          <Ionicons name="location-outline" size={13} color={colors.textMuted} />
          <Text style={styles.courtText} numberOfLines={1} maxFontSizeMultiplier={1.2}>{court.name.split(/\s+/).slice(0, 2).join(' ')}</Text>
        </Pressable>
      ) : null}
    </View>
  ) : null;

  return (
    <View style={styles.body}>
      <View style={styles.hero}>
        <Duration minutes={s.minutes} size={68} color={colors.text} unitColor={colors.textMuted} play={play} delay={120} duration={900} />
        {result ? (
          <Pop delay={play ? 750 : 0} duration={300} from={0.7} rise={0} style={[styles.result, s.won ? styles.won : styles.lost]}>
            {s.won ? <Ionicons name="checkmark" size={15} color={colors.brandInk} /> : null}
            <Text style={[styles.resultText, { color: s.won ? colors.brandInk : colors.textMuted }]} maxFontSizeMultiplier={1.2}>{result}</Text>
          </Pop>
        ) : null}
      </View>
      {score ? (
        // A long score (tiebreak points, Oct 10) a little smaller, so it all fits on its line.
        <Text style={[styles.score, { fontSize: 26 * scoreScale(score, 22) }]} accessibilityLabel={`Score ${spokenScore(s.sets)}`} numberOfLines={1} maxFontSizeMultiplier={1.2}>{score}</Text>
      ) : null}
      {over ? (
        <View style={styles.usual} accessible accessibilityLabel={`${over} minutes over your usual. Only you see this.`}>
          <Ionicons name="arrow-up" size={12} color={colors.brand} />
          <Text style={styles.usualText} maxFontSizeMultiplier={1.2}>{over}m over your usual</Text>
        </View>
      ) : null}
      {peopleRow}
      {sparse && court ? (
        <FormRow lead={<CourtGlyph size={16} color={colors.brand} />} label={court.name} chevron onPress={() => openCourt(court)} accessibilityLabel={`${court.name}, see posts from here`} />
      ) : null}

      {/* Every shared number in one labelled grid, the zones' rows under it (Oct 8, owner: "Ok pop up one then. Ship 1"). */}
      {!sparse ? (
        <>
          <View style={styles.rule} />
          <StatsGrid
            numbers={[
              far ? { key: 'far', label: 'DISTANCE', spoken: 'Distance', value: far.value, unit: far.unit, dec: far.value < 10 } : null,
              avg ? { key: 'avg', label: 'AVG HR', spoken: 'Average heart rate', value: avg, unit: 'bpm' } : null,
              hr ? { key: 'max', label: 'MAX HR', spoken: 'Max heart rate', value: s.maxHr!, unit: 'bpm' } : null,
              kcal ? { key: 'kcal', label: 'CALORIES', spoken: 'Calories', value: kcal } : null,
              strain != null ? { key: 'strain', label: 'STRAIN', spoken: 'Strain', value: strain, dec: true } : null,
              zones ? { key: 'hard', label: 'ZONES 4–5', spoken: 'Time in zones 4 to 5', value: hardMinutes(zones), unit: 'min' } : null,
            ].filter((n): n is StatNumber => !!n)}
            sets={setsTaken(s)}
            zones={zones}
            play={play}
          />
        </>
      ) : null}

      {(activity || typed) && (owner.length || started || privateHr) ? (
        <Pop delay={play ? 400 : 0} duration={260} from={1} rise={8} style={styles.only}>
          <View style={styles.onlyHead}>
            <Ionicons name="eye-off-outline" size={12} color={colors.textMuted} />
            <Text style={styles.label} maxFontSizeMultiplier={1.2}>ONLY YOU</Text>
          </View>
          <View style={styles.onlyRow}>
            {owner.map((o) => (
              <Column key={o.key} label={o.label}><Figure value={o.value} unit={o.unit || undefined} part={o.dec ? 'dec1' : 'int'} size={26} color={colors.text} unitColor={colors.textMuted} play={play} delay={400} /></Column>
            ))}
            {started ? (
              <Column label="STARTED">
                <View style={styles.clock}>
                  <Text style={styles.clockTime} maxFontSizeMultiplier={1.2}>{started.time}</Text>
                  {started.mark ? <Text style={styles.clockMark} maxFontSizeMultiplier={1.2}>{started.mark}</Text> : null}
                </View>
              </Column>
            ) : null}
          </View>
          {privateHr ? (
            <View style={styles.onlyRow}>
              {privateHr.avgHr ? <Column label="AVG HEART RATE"><Figure value={privateHr.avgHr} unit="bpm" size={26} color={colors.text} unitColor={colors.textMuted} play={play} delay={400} /></Column> : null}
              <Column label="MAX"><Figure value={privateHr.maxHr!} unit="bpm" size={26} color={colors.text} unitColor={colors.textMuted} play={play} delay={400} /></Column>
            </View>
          ) : null}
          {ownZones ? <ZoneRows zones={ownZones} play={play} delay={460} /> : null}
        </Pop>
      ) : null}
      {mine && onShare ? (
        <View>
          {shareTip.shown ? <TipBubble tip="share-session" shown onClose={shareTip.close} pointer="down" style={{ position: 'relative', alignSelf: 'center', marginBottom: 6 }} /> : null}
          <FormRow icon="logo-instagram" label="Share to Instagram" chevron onPress={() => { learned('share-session'); onShare(); }} />
        </View>
      ) : null}
      {/* A workout's log (a run, the gym: migration 107) has nobody to tag and no score, so nothing to edit there. */}
      {mine && log && onEdit && !(log.kind === 'fitness' && log.workout) ? (
        <FormRow icon="create-outline" label="Edit session" chevron onPress={() => onEdit(log.id)} />
      ) : null}
      {rival && onRematch && (!canAsk || canAsk(rival.id)) ? (
        <FormRow icon="repeat-outline" label="Rematch?" value={rivalName} chevron onPress={() => onRematch(rival.id, rival.sets)} accessibilityLabel={`Rematch${rivalName ? ` with ${rivalName}` : ''}: invite them to hit`} />
      ) : null}

      {tracker ? <Text style={styles.source} maxFontSizeMultiplier={1.2}>{sourceLabel(s.source ?? 'apple-health')}</Text> : null}
    </View>
  );
}

function Column({ label, children }: { label: string; children: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.column}>
      {children}
      <Text style={styles.label} numberOfLines={1} maxFontSizeMultiplier={1.2}>{label}</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 4 },
  eyebrow: { ...font('600'), fontSize: 11, letterSpacing: 0.88, color: colors.textMuted, flex: 1 },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  body: { paddingHorizontal: 20, paddingBottom: 28, gap: 14 },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 12, borderRadius: 15 },
  won: { backgroundColor: colors.brand },
  lost: { borderWidth: 1, borderColor: colors.borderStrong },
  resultText: { ...font('700'), fontSize: 14 },
  score: { ...font('700'), fontSize: 26, letterSpacing: -0.6, color: colors.text, fontVariant: ['tabular-nums'], marginTop: -6 },
  usual: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.brandDim, marginTop: -4 },
  usualText: { ...font('600'), fontSize: 12, color: colors.brand },
  peopleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  people: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 8 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  pending: { opacity: 0.6 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  waitingText: { ...font('500'), fontSize: 13, color: colors.textMuted },
  vs: { ...font('400'), fontSize: 15, color: colors.textMuted },
  handle: { ...font('600'), fontSize: 15, color: colors.text, flexShrink: 1 },
  court: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 130 },
  courtText: { ...font('500'), fontSize: 13, color: colors.textMuted, flexShrink: 1 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginTop: 4, marginBottom: 2 },
  column: { gap: 3 },
  label: { ...font('600'), fontSize: 11, letterSpacing: 0.66, color: colors.textMuted },
  // A calm filled tile, no outline: the dashed edge read as unfinished (Oct 6, owner). 17 = the old 16 plus its 1pt border, so nothing moves.
  only: { borderRadius: 18, backgroundColor: colors.bgElevated, padding: 17, gap: 12, marginTop: 4 },
  onlyHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  onlyRow: { flexDirection: 'row', gap: 26 },
  clock: { flexDirection: 'row', alignItems: 'flex-end' },
  clockTime: { ...font('600'), fontSize: 26, lineHeight: 29, letterSpacing: -1, color: colors.text, fontVariant: ['tabular-nums'] },
  clockMark: { ...font('500'), fontSize: 11, color: colors.textMuted, marginLeft: 3, marginBottom: 3 },
  source: { ...font('600'), fontSize: 11, color: colors.textFaint, marginTop: 2 },
});

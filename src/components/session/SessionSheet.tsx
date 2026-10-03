import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { FormRow } from '@/components/FormRow';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { Avatar } from '@/components/ui';
import type { DetectedActivity, ID, Post, PracticeSession, SessionTag, User } from '@/data/types';
import { resultWord, sessionEyebrow, sourceLabel } from '@/features/activity/format';
import { isActive, sessionPeople, tagsOnSession } from '@/features/activity/sessionTags';
import { overUsual } from '@/features/activity/usual';
import { cleanZones, hardMinutes, postZones } from '@/features/activity/zones';
import { openCourt } from '@/features/players/courtLink';
import { colors, font, withAlpha } from '@/theme';
import { Duration, Figure } from './Duration';
import { Pop } from './Pop';
import { ZoneRows } from './ZoneRows';


/** "6:12" and "pm". */
function clockParts(iso: string): { time: string; mark: string } {
  const s = new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const m = /^(.*?)[\s ]*([AaPp][.]?[Mm][.]?)$/.exec(s);
  return m ? { time: m[1], mark: m[2].replace(/[.]/g, '').toLowerCase() } : { time: s, mark: '' };
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
 * court the author tagged, and heart rate and its zones only when the author
 * switched them on (and is a known adult: the server sees to that). The
 * author also sees, in a box marked "Only you", what never goes on a post:
 * Strain, calories, the start time, and their heart rate when it is not
 * shared, read from their own tracker's record while it is still kept.
 */
export function SessionSheet({ post, me, users, sessions, sessionTags, activities, hidden, play = true, onEdit }: {
  post: Post;
  me: ID | null;
  users: User[];
  sessions: PracticeSession[];
  sessionTags: SessionTag[];
  activities: DetectedActivity[];
  hidden: ID[];
  play?: boolean;
  onEdit?: (sessionId: ID) => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const s = post.session;
  if (!s) return null;
  const mine = !!me && post.authorId === me;
  const activity = mine && s.activityId ? activities.find((a) => a.id === s.activityId && a.userId === me) : undefined;
  const logId = s.sessionId ?? activity?.sessionId;
  const log = mine && logId ? sessions.find((x) => x.id === logId && x.userId === me) : undefined;
  const result = resultWord(s);
  const hr = s.maxHr != null;
  const zones = postZones(s);
  const over = mine ? overUsual(sessions, me, s.minutes, { exclude: log?.id }) : null;

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
  const court = post.court;
  const tracker = !!s.activityId;
  const sparse = !hr;

  // The author's own numbers: never on a post.
  const privateHr = activity && !hr && activity.maxHr ? activity : undefined;
  const ownZones = activity && !zones ? cleanZones(activity.zones) : null;
  const owner = activity ? [
    activity.source === 'whoop' && activity.strain != null ? { key: 'strain', value: activity.strain, unit: '', label: 'STRAIN', dec: true } : null,
    activity.kcal ? { key: 'kcal', value: activity.kcal, unit: '', label: 'CALORIES', dec: false } : null,
  ].filter((x): x is { key: string; value: number; unit: string; label: string; dec: boolean } => !!x) : [];
  const started = activity ? clockParts(activity.startedAt) : null;

  const peopleRow = shown.length || (court && !sparse) ? (
    <View style={styles.peopleRow}>
      <View style={styles.people}>
        {shown.map((p, i) => (
          <View key={p.id} style={[styles.person, p.pending && styles.pending]}>
            <Avatar name={p.name} seed={p.id} size={28} />
            <Text style={styles.vs} maxFontSizeMultiplier={1.2}>{i === 0 || p.opponent !== shown[i - 1].opponent ? (p.opponent ? 'vs' : 'with') : 'and'}</Text>
            <Text accessibilityRole="link" accessibilityLabel={`@${p.handle}${p.pending ? ', waiting to accept' : ''}, open profile`} onPress={() => router.push(`/user/${p.id}`)} style={styles.handle} numberOfLines={1} maxFontSizeMultiplier={1.2}>@{p.handle}</Text>
            {p.pending ? <Ionicons name="time-outline" size={13} color={colors.textFaint} /> : null}
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

      {hr ? (
        <>
          <View style={styles.rule} />
          <View style={styles.columns}>
            {s.avgHr ? <Column label="AVG HEART RATE"><Figure value={s.avgHr} unit="bpm" size={34} color={colors.text} unitColor={colors.textMuted} play={play} delay={200} /></Column> : null}
            <Column label="MAX"><Figure value={s.maxHr!} unit="bpm" size={34} color={colors.text} unitColor={colors.textMuted} play={play} delay={200} /></Column>
            {zones ? <Column label="ZONES 4–5"><Figure value={hardMinutes(zones)} unit="min" size={34} color={colors.text} unitColor={colors.textMuted} play={play} delay={200} /></Column> : null}
          </View>
        </>
      ) : null}
      {zones ? (
        <View style={styles.zones}>
          <Text style={styles.label} maxFontSizeMultiplier={1.2}>HEART RATE ZONES</Text>
          <ZoneRows zones={zones} play={play} />
        </View>
      ) : null}

      {activity && (owner.length || started || privateHr) ? (
        <Pop delay={play ? 400 : 0} duration={260} from={1} rise={8} style={[styles.only, { backgroundColor: withAlpha(colors.text, 0.045), borderColor: withAlpha(colors.text, 0.18) }]}>
          <View style={styles.onlyHead}>
            <Ionicons name="lock-closed-outline" size={12} color={colors.textMuted} />
            <Text style={styles.label} maxFontSizeMultiplier={1.2}>ONLY YOU</Text>
          </View>
          <View style={styles.onlyRow}>
            {owner.map((o) => (
              <Column key={o.key} label={o.label}><Figure value={o.value} part={o.dec ? 'dec1' : 'int'} size={26} color={colors.text} unitColor={colors.textMuted} play={play} delay={400} /></Column>
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
      {mine && log && onEdit ? (
        <FormRow icon="create-outline" label="Edit session" chevron onPress={() => onEdit(log.id)} />
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
  usual: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.brandDim, marginTop: -4 },
  usualText: { ...font('600'), fontSize: 12, color: colors.brand },
  peopleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  people: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 8 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  pending: { opacity: 0.6 },
  vs: { ...font('400'), fontSize: 15, color: colors.textMuted },
  handle: { ...font('600'), fontSize: 15, color: colors.text, flexShrink: 1 },
  court: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 130 },
  courtText: { ...font('500'), fontSize: 13, color: colors.textMuted, flexShrink: 1 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginTop: 4, marginBottom: 2 },
  columns: { flexDirection: 'row', gap: 22 },
  column: { gap: 3 },
  label: { ...font('600'), fontSize: 11, letterSpacing: 0.66, color: colors.textMuted },
  zones: { gap: 6, marginTop: 4 },
  only: { borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', padding: 16, gap: 12, marginTop: 4 },
  onlyHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  onlyRow: { flexDirection: 'row', gap: 26 },
  clock: { flexDirection: 'row', alignItems: 'flex-end' },
  clockTime: { ...font('600'), fontSize: 26, lineHeight: 29, letterSpacing: -1, color: colors.text, fontVariant: ['tabular-nums'] },
  clockMark: { ...font('500'), fontSize: 11, color: colors.textMuted, marginLeft: 3, marginBottom: 3 },
  source: { ...font('600'), fontSize: 11, color: colors.textFaint, marginTop: 2 },
});

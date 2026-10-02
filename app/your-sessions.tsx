import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtGlyph } from '@/components/map/CourtGlyph';
import { EmptyState, Screen } from '@/components/ui';
import type { DetectedActivity, PracticeSession } from '@/data/types';
import { activityTitle, activityWhen, dayWords, loggedLabel } from '@/features/activity/format';
import { ATTACH_DAYS, pickSource, postOf, postedIndex, sourceOn, type SessionPick } from '@/features/activity/recent';
import { useTennisFlags } from '@/features/activity/useTennisFlags';
import { localDay } from '@/features/practice/stats';
import { goBack } from '@/lib/goBack';
import { duration } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

/** Weeks shown at first; "Show earlier weeks" adds as many again. */
const WEEKS = 8;

/** The Monday a day's week starts on, as a day ("2026-09-28"). */
function weekOf(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDay(d);
}

/** "This week", "Last week", or "Sep 15 – 21" ("Sep 29 – Oct 5" across a month). */
function weekLabel(start: string, now = new Date()): string {
  const thisWeek = weekOf(localDay(now));
  if (start === thisWeek) return 'This week';
  const last = new Date(`${thisWeek}T12:00:00`);
  last.setDate(last.getDate() - 7);
  if (start === localDay(last)) return 'Last week';
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(a);
  b.setDate(b.getDate() + 6);
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' });
  return a.getMonth() === b.getMonth() ? `${month(a)} ${a.getDate()} – ${b.getDate()}` : `${month(a)} ${a.getDate()} – ${month(b)} ${b.getDate()}`;
}

/**
 * Your sessions, for your eyes only: what your tracker picked up and nobody
 * has logged yet at the top, with Log it; then everything you logged, newest
 * first, a week at a time with that week's hours on court. Each says what it
 * was, how long, where it came from and where it was, if you said; and
 * "Post it" to put it on a post (photo optional), or "Posted" once it is on
 * one. A session is posted once at most, and only when you choose: logging
 * never posts anything (owner, Oct 2). A tracker whose source the server has
 * switched off shows nothing of its own here: its sessions waiting to be
 * logged are left out, and logged ones say "Tracker", not WHOOP or the Watch.
 */
export default function YourSessions() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUserId, sessions, detectedActivities, posts, actions } = useApp();
  const flags = useTennisFlags();
  const [weeks, setWeeks] = useState(WEEKS);
  // "Post it" waits until your posts with a session have been asked for
  // fresh (the app may hold only the newest few), so a session already on a
  // post never offers a second one. If they could not be read, the posts the
  // app holds are all there is to go on.
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let on = true;
    void actions.loadMySessionPosts().finally(() => { if (on) setChecked(true); });
    return () => { on = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const waiting = useMemo(
    () => detectedActivities.filter((a) => a.userId === currentUserId && a.status === 'new' && sourceOn(a, flags)).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [detectedActivities, currentUserId, flags],
  );
  const posted = useMemo(() => postedIndex(posts, currentUserId), [posts, currentUserId]);
  const groups = useMemo(() => {
    const mine = sessions.filter((s) => s.userId === currentUserId)
      .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : b.createdAt.localeCompare(a.createdAt)));
    const byWeek: { start: string; list: PracticeSession[] }[] = [];
    for (const s of mine) {
      const start = weekOf(s.day);
      const last = byWeek[byWeek.length - 1];
      if (last?.start === start) last.list.push(s);
      else byWeek.push({ start, list: [s] });
    }
    return byWeek;
  }, [sessions, currentUserId]);
  // Old enough that its tracker numbers are gone (30 days, migration 58) is too old to post: the same two weeks "Add session stats" offers.
  const firstPostable = localDay(Date.now() - ATTACH_DAYS * 86_400_000);

  const logButton = (
    <Pressable accessibilityRole="button" accessibilityLabel="Log a session" hitSlop={10} onPress={() => router.push('/log-session')} style={({ pressed }) => [styles.log, pressed && styles.pressed]}>
      <Ionicons name="add" size={16} color={colors.text} />
      <Text style={styles.logText}>Log</Text>
    </Pressable>
  );

  return (
    <Screen title="Your sessions" subtitle="Only you see this." compactTitle onBack={() => goBack('/profile')} right={logButton}>
      {!waiting.length && !groups.length ? (
        <EmptyState
          icon="tennisball-outline"
          title="No sessions yet"
          body="Log one after you play. It keeps your streak going, and only you see it."
          action={{ label: 'Log a session', onPress: () => router.push('/log-session') }}
        />
      ) : null}

      {waiting.length ? (
        <>
          <Text style={styles.sectionTitle}>Not logged yet</Text>
          <View style={styles.group}>
            {waiting.map((a, i) => <Waiting key={a.id} activity={a} line={i > 0} />)}
          </View>
        </>
      ) : null}

      {groups.slice(0, weeks).map(({ start, list }) => {
        const onCourt = list.filter((s) => s.kind !== 'fitness').reduce((sum, s) => sum + s.minutes, 0);
        return (
          <React.Fragment key={start}>
            <View style={styles.weekHead}>
              <Text style={[styles.sectionTitle, styles.weekName]}>{weekLabel(start)}</Text>
              {onCourt ? <Text style={styles.weekHours}>{duration(onCourt)} on court</Text> : null}
            </View>
            <View style={styles.group}>
              {list.map((s, i) => {
                const found = s.activityId ? detectedActivities.find((a) => a.id === s.activityId) : undefined;
                // A tracker's session posts with its tracker numbers, and is named for its tracker, only while its source is switched on; otherwise as you logged it.
                const activity = found && sourceOn(found, flags) ? found : undefined;
                const pick: SessionPick = activity ? { type: 'tracker', activity, session: s } : { type: 'logged', session: s };
                const postId = postOf(pick, posted);
                return (
                  <Logged
                    key={s.id}
                    session={s}
                    source={pickSource(pick)}
                    postId={postId}
                    postable={checked && !postId && s.day >= firstPostable}
                    onPost={() => router.push({ pathname: '/compose', params: pick.type === 'tracker' ? { activity: pick.activity.id } : { session: s.id } })}
                    line={i > 0}
                  />
                );
              })}
            </View>
          </React.Fragment>
        );
      })}

      {groups.length > weeks ? (
        <Pressable accessibilityRole="button" onPress={() => setWeeks((n) => n + WEEKS)} style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
          <Text style={styles.moreText}>Show earlier weeks</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

/** A tracker's session nobody has logged: when, how long, from where, and Log it. */
function Waiting({ activity, line }: { activity: DetectedActivity; line: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const source = pickSource({ type: 'tracker', activity });
  return (
    <View style={[styles.row, line && styles.line]}>
      <View style={styles.icon}><Ionicons name="tennisball-outline" size={17} color={colors.court} /></View>
      <View style={styles.words}>
        <Text style={styles.title} numberOfLines={1}>{activityTitle(activity)}</Text>
        <Text style={styles.sub}>{activityWhen(activity)} · {duration(activity.minutes)} · {source}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Log it: ${activityTitle(activity)}`} hitSlop={8} onPress={() => router.push({ pathname: '/log-session', params: { activity: activity.id } })} style={({ pressed }) => [styles.action, styles.actionOn, pressed && styles.pressed]}>
        <Text style={[styles.actionText, styles.actionTextOn]}>Log it</Text>
      </Pressable>
    </View>
  );
}

/** One session you logged, with Post it, or Posted (which opens the post). */
function Logged({ session: s, source, postId, postable, onPost, line }: { session: PracticeSession; source: string; postId?: string; postable: boolean; onPost: () => void; line: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const title = `${loggedLabel(s)}${s.opponent ? ` vs ${s.opponent}` : ''}`;
  return (
    <View style={[styles.row, line && styles.line]}>
      <View style={styles.icon}>
        {s.kind === 'match' ? <Ionicons name="trophy-outline" size={17} color={colors.textMuted} />
          : s.kind === 'fitness' ? <Ionicons name="barbell-outline" size={17} color={colors.textMuted} />
          : <CourtGlyph size={14} color={colors.textMuted} />}
      </View>
      <View style={styles.words}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Text style={styles.sub}>{dayWords(s.day)} · {duration(s.minutes)} · {source}</Text>
        {/* Where it was, for a session logged from a hit ("At Alder Park · with Mira"); any other note as it was written. */}
        {s.note ? (
          <View style={styles.noteRow}>
            {s.note.startsWith('At ') ? <Ionicons name="location-outline" size={12} color={colors.textFaint} /> : null}
            <Text style={styles.note} numberOfLines={1}>{s.note.startsWith('At ') ? s.note.slice(3) : s.note}</Text>
          </View>
        ) : null}
      </View>
      {postId ? (
        <Pressable accessibilityRole="link" accessibilityLabel={`Posted. Open the post: ${title}`} hitSlop={8} onPress={() => router.push(`/post/${postId}`)} style={({ pressed }) => [styles.posted, pressed && styles.pressed]}>
          <Ionicons name="checkmark" size={13} color={colors.textMuted} />
          <Text style={styles.postedText}>Posted</Text>
        </Pressable>
      ) : postable ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Post it: ${title}`} hitSlop={8} onPress={onPost} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          <Text style={styles.actionText}>Post it</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  // The grouped lists of "Your game" (profile-details): white cards on a soft shadow, rows parted by a hairline.
  group: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden', paddingHorizontal: spacing.lg },
  sectionTitle: { ...typography.smallStrong, color: colors.textMuted, paddingHorizontal: spacing.sm, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  weekHead: { flexDirection: 'row', alignItems: 'flex-end' },
  weekName: { flex: 1 },
  weekHours: { ...typography.small, color: colors.textMuted, fontVariant: ['tabular-nums'], paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 60, paddingVertical: 11 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  icon: { width: 22, alignItems: 'center' },
  words: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...typography.body, ...font('600'), color: colors.text },
  sub: { ...typography.small, color: colors.textMuted },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  note: { ...typography.small, color: colors.textFaint, flexShrink: 1 },
  // Post it: a small outlined pill, quieter than Log it (the one thing waiting on you).
  action: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
  actionOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  actionText: { ...typography.smallStrong, color: colors.text },
  actionTextOn: { color: colors.brandInk },
  posted: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 4, paddingVertical: 6 },
  postedText: { ...typography.smallStrong, color: colors.textMuted },
  log: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 10, paddingRight: 14, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.surface, ...lift },
  logText: { ...typography.smallStrong, color: colors.text },
  more: { alignSelf: 'center', marginTop: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  moreText: { ...typography.smallStrong, color: colors.brand },
  pressed: { opacity: 0.6 },
});

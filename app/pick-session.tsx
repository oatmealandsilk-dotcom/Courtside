import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { DragSheet } from '@/components/DragSheet';
import { EmptyState } from '@/components/ui';
import { SheetTitle } from '@/components/sheet/SheetForm';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { activityDay } from '@/features/activity/format';
import { isTennisActivity, workoutIcon } from '@/features/activity/workouts';
import { needsLogging, pickLine, pickTitle, postOf, postedIndex, recentSessions, type SessionPick } from '@/features/activity/recent';
import { takeSessionPicker } from '@/features/activity/sessionPicker';
import { peopleText, peopleWords } from '@/features/activity/sessionTags';
import { LoggedTitle } from '@/components/LoggedTitle';
import { useTennisFlags } from '@/features/activity/useTennisFlags';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, typography } from '@/theme';

/**
 * "Add session stats", from a new Post or Clip: your sessions from the last
 * two weeks, newest first, each with when, how long and where it came from.
 * A tracker's session nobody has logged yet is logged as it is picked, so it
 * counts toward your streak. A session already on one of your posts says
 * "Already posted" and can't be picked: one session, one post. Your posts
 * with a session are asked for fresh as the sheet opens (the app may hold
 * only the newest few), and nothing can be picked until that answer is in.
 * Only you see this list.
 */
export default function PickSession() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUserId, sessions, detectedActivities, posts, sessionTags, users, actions } = useApp();
  const flags = useTennisFlags();
  // Who asked: the post underneath, handed over as this sheet opened.
  const [onPick] = useState(() => takeSessionPicker());
  const [closeSignal, setCloseSignal] = useState(0);
  const close = () => setCloseSignal((n) => n + 1);
  // The pick to hand back once the sheet has slid away, and whether it was logged on the way.
  const chosen = useRef<{ pick: SessionPick; logged: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  // Logging one goes to the log sheet in this sheet's place; it comes back to the post when done.
  const toLog = useRef(false);
  // Whether your posts have been checked for these sessions. If they could
  // not be read (offline, say), the posts the app holds are all there is to
  // go on, and posting would not go through just then anyway.
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let on = true;
    void actions.loadMySessionPosts().finally(() => { if (on) setChecked(true); });
    return () => { on = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => recentSessions({ me: currentUserId, sessions, activities: detectedActivities, flags }), [currentUserId, sessions, detectedActivities, flags]);
  const posted = useMemo(() => postedIndex(posts, currentUserId), [posts, currentUserId]);
  const keyOf = (p: SessionPick) => (p.type === 'tracker' ? `a:${p.activity.id}` : `s:${p.session.id}`);

  const choose = async (pick: SessionPick) => {
    if (busy || !checked) return;
    setError('');
    if (needsLogging(pick) && pick.type === 'tracker') {
      const a = pick.activity;
      setBusy(keyOf(pick));
      try {
        // Tennis logs as a practice, as it always has; any other workout as fitness, keeping what it was (Oct 5).
        await actions.logSession(isTennisActivity(a)
          ? { minutes: a.minutes, kind: 'practice', day: activityDay(a), activityId: a.id }
          : { minutes: a.minutes, kind: 'fitness', day: activityDay(a), activityId: a.id, workout: a.sport });
      } catch (e) {
        const said = e instanceof Error ? e.message : '';
        // Logged already (on another phone, say): attach it all the same.
        if (said !== 'Already logged.') { setBusy(null); setError('That session didn’t log. Try again.'); return; }
        void actions.refreshActivities();
      }
      chosen.current = { pick: { ...pick, activity: { ...a, status: 'logged' } }, logged: true };
    } else {
      chosen.current = { pick, logged: false };
    }
    close();
  };

  const done = () => {
    if (toLog.current) { router.replace('/log-session'); return; }
    router.back();
    if (chosen.current) onPick?.(chosen.current.pick, chosen.current.logged);
  };

  // Said once, under the title, where it is read before a row is tapped.
  const unlogged = list.some((p) => needsLogging(p) && !postOf(p, posted));
  const header = unlogged
    ? <SheetTitle title="Add session stats" line="Your last two weeks. Adding one you haven’t logged logs it too, for your streak." lines={2} onClose={close} />
    : <SheetTitle title="Add session stats" line="Your sessions from the last two weeks" onClose={close} />;

  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={done} peekFraction={0.62} header={header}>
      <ScrollView contentContainerStyle={styles.body}>
        {!checked ? (
          <View style={styles.wait}><ActivityIndicator color={colors.textMuted} /></View>
        ) : !list.length ? (
          <EmptyState
            icon="stopwatch-outline"
            title="No sessions to add"
            body="Log a session after you play, then add its time on court to a post."
            action={{ label: 'Log a session', onPress: () => { toLog.current = true; close(); } }}
          />
        ) : (
          <>
            {list.map((pick) => {
              const key = keyOf(pick);
              const used = !!postOf(pick, posted);
              const icon = pick.type === 'tracker' ? <Ionicons name={isTennisActivity(pick.activity) ? 'stopwatch-outline' : workoutIcon(pick.activity.sport)} size={18} color={colors.court} />
                : pick.session.kind === 'match' ? <Ionicons name="trophy-outline" size={18} color={colors.textMuted} />
                : pick.session.kind === 'fitness' ? <Ionicons name="barbell-outline" size={18} color={colors.textMuted} />
                : <CourtGlyph size={15} color={colors.textMuted} />;
              // Who you played, as your log says it: "vs Mira" (a tick once she accepted), "vs June · Waiting" until then.
              const people = pick.session ? peopleWords(pick.session, sessionTags, users) : null;
              const title = `${pickTitle(pick)}${people ? ` ${peopleText(people)}` : ''}`;
              // Not logged yet is part of what the row says, not a label in the +'s place: it can be picked like the rest.
              const line = needsLogging(pick) ? `${pickLine(pick)} · Not logged yet` : pickLine(pick);
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={used ? `${title}, ${line}. Already posted` : `${title}, ${line}`}
                  accessibilityState={{ disabled: used, busy: busy === key }}
                  disabled={used || !!busy}
                  onPress={() => { void choose(pick); }}
                  style={(state) => [styles.row, ((state as { hovered?: boolean }).hovered || state.pressed) && !used && styles.rowOn, used && styles.rowOff]}
                >
                  <View style={styles.icon}>{icon}</View>
                  <View style={styles.words}>
                    <LoggedTitle label={pickTitle(pick)} people={people} style={styles.title} faint={styles.waiting} numberOfLines={1} />
                    <Text style={styles.sub} numberOfLines={2}>{line}</Text>
                  </View>
                  {busy === key ? <ActivityIndicator size="small" color={colors.textMuted} />
                    : used ? <Text style={styles.tag}>Already posted</Text>
                    : <Ionicons name="add-circle-outline" size={22} color={colors.brand} />}
                </Pressable>
              );
            })}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </>
        )}
      </ScrollView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.xs },
  // The rows of "Add to a group": an icon, two lines, a soft highlight under a finger or the mouse.
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  rowOn: { backgroundColor: colors.surfaceAlt },
  rowOff: { opacity: 0.5 },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  words: { flex: 1, minWidth: 0, gap: 1 },
  title: { ...typography.body, ...font('600'), color: colors.text },
  sub: { ...typography.small, color: colors.textMuted },
  waiting: { ...typography.small, ...font('500'), color: colors.textFaint },
  tag: { ...typography.caption, ...font('600'), letterSpacing: 0, color: colors.textMuted },
  error: { ...typography.small, color: colors.danger, paddingHorizontal: spacing.sm },
  // A row's height while your posts are checked, so the sheet doesn't jump much when the list arrives.
  wait: { alignItems: 'center', justifyContent: 'center', minHeight: 120 },
});

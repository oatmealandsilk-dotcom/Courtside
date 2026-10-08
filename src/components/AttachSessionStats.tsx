import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { FormRow } from '@/components/FormRow';
import { HealthShareRow } from '@/components/session/HealthShareRow';
import { SessionStrip } from '@/components/session/SessionStrip';
import { fromWho } from '@/features/activity/format';
import { availableShare, chosenShare, loggedNumbers, type HealthChoice } from '@/features/activity/healthShare';
import { statsOf, type SessionPick } from '@/features/activity/recent';
import { pendingNote, tagsOnSession, withOnNewPost } from '@/features/activity/sessionTags';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';
import { isTennisActivity } from '@/features/activity/workouts';

/**
 * A session's stats on a new post, in the session box's own look (the
 * strip a photo post shows under its picture, in the court's colour: the
 * same look as the card a post with nothing else shows, Oct 5, owner: one
 * look, not a light one here and a blue one on the post), an × to post
 * without them, and, when the tracker read any health
 * numbers, "Share health data" with its Choose sheet (HealthShareRow), the
 * same for every age (migration 72). A session you logged by hand shows how
 * long and what it was, and (Oct 8) the calories and average heart rate typed
 * into it, under the same "Share health data" row and rules.
 *
 * Opened from a session ("Save and post", "Post it") it sits at the top of
 * the post, and × leaves a row to put the stats back (none once it is
 * already on one of your posts). In a Post or a Clip
 * ("Add session stats") it sits among the rows, with Change to pick another.
 *
 * Players who accepted their tag on the session show in the stats as the
 * post will ("Won vs @miraplays"). Anyone still waiting gets a quiet note
 * ("Mira’s name shows once they accept."): their name joins the post by
 * itself the moment they do (migration 62).
 */
export function AttachSessionStats({ pick, attached, onAttach, health, onHealth, posted, loggedMinutes, onChange, justLogged }: {
  pick: SessionPick;
  attached: boolean;
  onAttach: (on: boolean) => void;
  /** "Share health data": the switch and the ticks. */
  health: HealthChoice;
  onHealth: (next: HealthChoice) => void;
  /** This session is already on one of your posts. */
  posted: boolean;
  /** The length you logged it as, when you logged it. */
  loggedMinutes?: number;
  /** Pick a different session (from a Post or a Clip). */
  onChange?: () => void;
  /** Attaching it just logged it, so it now counts toward your streak. */
  justLogged?: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUserId, sessions, sessionTags, users, blockedIds } = useApp();
  const activity = pick.type === 'tracker' ? pick.activity : undefined;
  // The session from your log this is (a tracker's, once logged), and who on it is still to answer.
  const logged = pick.session;
  // The numbers it can share: its tracker's, or those typed into your log (Oct 8).
  const numbers = activity ?? loggedNumbers(logged);
  const share = chosenShare(health, availableShare(numbers));
  const stats = currentUserId ? withOnNewPost(statsOf(pick, share), currentUserId, sessions, sessionTags, users) ?? statsOf(pick, share) : statsOf(pick, share);
  const waitingOn = logged ? tagsOnSession(sessionTags, logged.id, currentUserId)
    .filter((t) => t.status === 'pending')
    .map((t) => users.find((u) => u.id === t.taggedId)?.name.trim().split(/\s+/)[0])
    .filter((n): n is string => !!n) : [];
  const waitingNote = pendingNote(waitingOn);
  // A workout (migration 107) puts its time, and its distance when it has one, on the post.
  const hint = !activity ? 'Shows on the post. The rest of your log stays private.'
    : isTennisActivity(activity) ? 'Time on court shows on the post.'
    : activity.distanceM ? 'Its time and distance show on the post.' : 'Its time shows on the post.';

  return (
    <View style={styles.wrap}>
      {attached ? (
        <>
          <View style={styles.head}>
            <Ionicons name="stopwatch-outline" size={16} color={colors.court} />
            <Text style={styles.headText}>Session stats</Text>
            {onChange ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Pick a different session" hitSlop={10} onPress={onChange} style={({ pressed }) => [styles.change, pressed && styles.pressed]}>
                <Text style={styles.changeText}>Change</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Post without your session stats" hitSlop={12} onPress={() => onAttach(false)} style={({ pressed }) => [styles.remove, pressed && styles.pressed]}>
              <Ionicons name="close-circle" size={20} color={colors.textFaint} />
            </Pressable>
          </View>
          <SessionStrip session={stats} hidden={blockedIds} />
          <Text style={styles.note}>{hint}</Text>
          {numbers ? <HealthShareRow activity={numbers} choice={health} onChoice={onHealth} /> : null}
          {waitingNote ? (
            <View style={styles.waiting}>
              <Ionicons name="time-outline" size={13} color={colors.textFaint} />
              <Text style={[styles.note, styles.waitingText]}>{waitingNote}</Text>
            </View>
          ) : null}
          {justLogged ? <Text style={styles.note}>Logged too. It counts toward your streak.</Text> : null}
          {/* The post always carries the tracker's own time (the server rebuilds it, migration 58), so a length changed on the log sheet is called out rather than quietly replaced. */}
          {activity && loggedMinutes != null && loggedMinutes !== activity.minutes ? (
            <Text style={styles.note}>{`The post shows ${fromWho(activity)}’s time, not the length you logged.`}</Text>
          ) : null}
        </>
      ) : posted ? null : (
        <FormRow icon="add-circle-outline" label="Add your session stats" onPress={() => onAttach(true)} />
      )}
      {/* One session, one post: once it is on a post, its stats can't go on another. */}
      {posted ? <Text style={styles.note}>You already posted this session. Its stats stay on that post.</Text> : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.sm, marginTop: spacing.xs, marginBottom: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headText: { ...typography.smallStrong, color: colors.textMuted, flex: 1 },
  change: { paddingHorizontal: spacing.xs, paddingVertical: 2 },
  changeText: { ...typography.smallStrong, color: colors.brand },
  remove: { padding: 2 },
  pressed: { opacity: 0.6 },
  note: { ...typography.small, color: colors.textFaint, lineHeight: 18 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  waitingText: { flexShrink: 1 },
});

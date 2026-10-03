import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtGlyph } from '@/components/map/CourtGlyph';
import { LoggedTitle, type PeopleLine } from '@/components/LoggedTitle';
import { Avatar, EmptyState, Screen } from '@/components/ui';
import type { DetectedActivity, PracticeSession, SessionTag, User } from '@/data/types';
import { activityTitle, activityWhen, dayWords, loggedLabel } from '@/features/activity/format';
import { canTagKind, firstName, peopleText, peopleWords, yourResult } from '@/features/activity/sessionTags';
import { show as showToast } from '@/lib/toast';
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
 *
 * Who you played (migration 62), by first name: a tag still waiting reads
 * "vs June · Waiting", an accepted one "vs Mira" with a small tick. A tap on
 * a match or a practice opens "Who you played" for it, to tag people after
 * the fact. Tags of you that you haven't answered sit at the very top, under
 * "Tagged you", with Accept and Decline and your side of the result ("You
 * won"); a session you accepted into your log reads as yours ("Practice with
 * Mira", "Mira's tag"), and a tap on it opens that tag. The phone alert for
 * a tag opens this page with ?tag= (the tagger's session), and the tag's
 * sheet opens on top.
 */
export default function YourSessions() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUserId, sessions, detectedActivities, posts, sessionTags, users, actions } = useApp();
  const flags = useTennisFlags();
  // Opened from a tag's phone alert: its sheet opens over this page, once.
  const { tag: tagParam } = useLocalSearchParams<{ tag?: string }>();
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!tagParam || opened.current === tagParam) return;
    opened.current = tagParam;
    const t = setTimeout(() => router.push({ pathname: '/session-tag', params: { session: tagParam } }), 250);
    return () => clearTimeout(t);
  }, [tagParam]);
  // Your tags asked for fresh, so a "Waiting" that has since been answered says so.
  useEffect(() => { void actions.refreshSessionTags(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const taggedYou = useMemo(
    () => sessionTags.filter((t) => t.taggedId === currentUserId && t.status === 'pending' && !t.dropped && users.some((u) => u.id === t.taggerId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [sessionTags, currentUserId, users],
  );
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
      {!waiting.length && !groups.length && !taggedYou.length ? (
        <EmptyState
          icon="stopwatch-outline"
          title="No sessions yet"
          body="Log one after you play. It keeps your streak going, and only you see it."
          action={{ label: 'Log a session', onPress: () => router.push('/log-session') }}
        />
      ) : null}

      {taggedYou.length ? (
        <>
          <Text style={styles.sectionTitle}>Tagged you</Text>
          <View style={styles.group}>
            {taggedYou.map((t, i) => <TaggedYou key={t.id} tag={t} tagger={users.find((u) => u.id === t.taggerId)!} line={i > 0} />)}
          </View>
        </>
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
                // A copy from someone's tag reads as yours, built from the tag ("Practice with Mira", "Mira's tag"), and opens that tag.
                const from = s.fromSessionId ? sessionTags.find((t) => t.taggedId === currentUserId && (t.mirroredSessionId === s.id || t.sessionId === s.fromSessionId)) : undefined;
                const fromWho = from ? users.find((u) => u.id === from.taggerId) : undefined;
                const fromFirst = fromWho ? firstName(fromWho.name) : '';
                const people: PeopleLine | null = from && fromFirst
                  ? (s.kind === 'match' && from.role === 'opponent'
                    ? { vs: [{ name: fromFirst, state: 'typed' }], with: [], allWaiting: false }
                    : { vs: [], with: [{ name: fromFirst, state: 'typed' }], allWaiting: false })
                  : peopleWords(s, sessionTags, users);
                return (
                  <Logged
                    key={s.id}
                    session={s}
                    people={people}
                    onOpen={from ? () => router.push({ pathname: '/session-tag', params: { tag: from.id } })
                      : canTagKind(s.kind) && !s.fromSessionId ? () => router.push({ pathname: '/log-session', params: { edit: s.id } })
                      : undefined}
                    // Built from the tag, the title already says who it was with: no note line repeating it.
                    hideNote={!!(from && fromFirst)}
                    source={s.fromSessionId ? (fromFirst ? `${fromFirst}’s tag` : 'From a tag') : pickSource(pick)}
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
      <View style={styles.icon}><Ionicons name="stopwatch-outline" size={17} color={colors.court} /></View>
      <View style={styles.words}>
        <Text style={styles.title} numberOfLines={1}>{activityTitle(activity)}</Text>
        <Text style={styles.sub}>{activityWhen(activity)} · {duration(activity.minutes)} · {source}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Log it: ${activityTitle(activity)}`} hitSlop={8} onPress={() => router.push({ pathname: '/compose', params: { activity: activity.id } })} style={({ pressed }) => [styles.action, styles.actionOn, pressed && styles.pressed]}>
        <Text style={[styles.actionText, styles.actionTextOn]}>Log it</Text>
      </Pressable>
    </View>
  );
}

/**
 * Someone tagged you and is waiting on your answer: who, what it was (your
 * side of a match's result), when and how long, with Accept (it goes in your
 * log too) and Decline. A tap on the rest opens the tag's sheet, which says
 * more and lets you accept without adding it to your log.
 */
function TaggedYou({ tag, tagger, line }: { tag: SessionTag; tagger: User; line: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const { actions } = useApp();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const first = tagger.name.trim().split(/\s+/)[0] || tagger.handle;
  // Your side of it: "You won", "You lost", "Practice".
  const what = yourResult(tag);
  const answer = async (accept: boolean) => {
    if (busy) return;
    setBusy(accept ? 'accept' : 'decline');
    try {
      await actions.respondSessionTag(tag.id, accept);
      showToast(accept ? { title: 'Tag accepted', body: 'It’s in your sessions too.', icon: 'checkmark-circle-outline' } : { title: 'Tag declined', body: 'Your name stays off their posts.', icon: 'close-circle-outline' });
    } catch (e) {
      showToast({ title: 'That didn’t go through', body: e instanceof Error ? e.message : undefined, icon: 'alert-circle-outline' });
      setBusy(null);
    }
  };
  return (
    <View style={[styles.tagRow, line && styles.line]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${tagger.name} tagged you in a ${tag.kind === 'match' ? 'match' : 'practice'}. ${what}, ${dayWords(tag.day)}, ${duration(tag.minutes)}. Open`}
        onPress={() => router.push({ pathname: '/session-tag', params: { tag: tag.id } })}
        style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
      >
        <Avatar name={tagger.name} seed={tagger.avatarSeed} uri={tagger.avatarUrl} size={40} />
        <View style={styles.words}>
          <Text style={styles.title} numberOfLines={1}>{first} tagged you</Text>
          <Text style={styles.sub} numberOfLines={1}>{what} · {dayWords(tag.day)} · {duration(tag.minutes)}</Text>
        </View>
      </Pressable>
      {/* Accept and Decline under the words, the way a follow request asks in Notifications. */}
      <View style={styles.answers}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Accept ${first}’s tag`} accessibilityState={{ busy: busy === 'accept' }} disabled={!!busy} hitSlop={4} onPress={() => { void answer(true); }} style={({ pressed }) => [styles.answer, styles.actionOn, pressed && styles.pressed]}>
          {busy === 'accept' ? <ActivityIndicator size="small" color={colors.brandInk} /> : <Text style={[styles.actionText, styles.actionTextOn]}>Accept</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Decline ${first}’s tag`} accessibilityState={{ busy: busy === 'decline' }} disabled={!!busy} hitSlop={4} onPress={() => { void answer(false); }} style={({ pressed }) => [styles.answer, pressed && styles.pressed]}>
          {busy === 'decline' ? <ActivityIndicator size="small" color={colors.textMuted} /> : <Text style={styles.actionText}>Decline</Text>}
        </Pressable>
      </View>
    </View>
  );
}

/** One session you logged, with Post it, or Posted (which opens the post). A tap on the rest opens who you played (or, for a copy from a tag, that tag). */
function Logged({ session: s, people, onOpen, hideNote = false, source, postId, postable, onPost, line }: {
  session: PracticeSession;
  /** "vs Mira" (accepted), "vs June · Waiting", "with Dev", a name you typed. */
  people: PeopleLine | null;
  onOpen?: () => void;
  /** The note says nothing the title doesn't (a copy from a tag). */
  hideNote?: boolean;
  source: string; postId?: string; postable: boolean; onPost: () => void; line: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const title = `${loggedLabel(s)}${people ? ` ${peopleText(people)}` : ''}`;
  return (
    <View style={[styles.row, line && styles.line]}>
      {/* The row itself, beside its button rather than around it: a button inside a button is not allowed in a browser. */}
      <Pressable
        accessibilityRole={onOpen ? 'button' : undefined}
        accessibilityLabel={onOpen ? `${title}. ${s.fromSessionId ? 'Open the tag' : 'Who you played'}` : undefined}
        disabled={!onOpen}
        onPress={onOpen}
        style={({ pressed }) => [styles.rowMain, pressed && onOpen && styles.pressed]}
      >
        <View style={styles.icon}>
          {s.kind === 'match' ? <Ionicons name="trophy-outline" size={17} color={colors.textMuted} />
            : s.kind === 'fitness' ? <Ionicons name="barbell-outline" size={17} color={colors.textMuted} />
            : <CourtGlyph size={14} color={colors.textMuted} />}
        </View>
        <View style={styles.words}>
          <LoggedTitle label={loggedLabel(s)} people={people} style={styles.title} faint={styles.waiting} numberOfLines={2} />
          <Text style={styles.sub}>{dayWords(s.day)} · {duration(s.minutes)} · {source}</Text>
          {/* Where it was, for a session logged from a hit ("At Alder Park"); any other note as it was written. */}
          {s.note && !hideNote ? (
            <View style={styles.noteRow}>
              {s.note.startsWith('At ') ? <Ionicons name="location-outline" size={12} color={colors.textFaint} /> : null}
              <Text style={styles.note} numberOfLines={1}>{s.note.startsWith('At ') ? s.note.slice(3) : s.note}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
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
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tagRow: { gap: spacing.sm, paddingVertical: 12 },
  // Under the words, lined up with them (past the 40 of the face and the row's gap).
  answers: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: 40 + spacing.md },
  answer: { minWidth: 92, height: 34, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
  waiting: { ...typography.small, ...font('500'), color: colors.textFaint },
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

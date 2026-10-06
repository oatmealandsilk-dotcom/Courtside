import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtGlyph } from '@/components/map/CourtGlyph';
import { FlybyPill } from '@/components/flyby/FlybyPill';
import { YourWeekBanner } from '@/components/recap/RecapCard';
import { PersonalRecords, RecordPill } from '@/components/records/PersonalRecords';
import { LoggedTitle, type PeopleLine } from '@/components/LoggedTitle';
import { Avatar, EmptyState, Screen } from '@/components/ui';
import type { DetectedActivity, PracticeSession, SessionTag, User } from '@/data/types';
import { activityTitle, activityWhen, dayWords, loggedLabel } from '@/features/activity/format';
import { canTagKind, firstName, peopleText, peopleWords, yourResult } from '@/features/activity/sessionTags';
import { show as showToast } from '@/lib/toast';
import { ATTACH_DAYS, pickSource, postOf, postedIndex, sourceOn, type SessionPick } from '@/features/activity/recent';
import { useTennisFlags } from '@/features/activity/useTennisFlags';
import { formatDistance, isTennisActivity, workoutIcon, WORKOUTS_ASK } from '@/features/activity/workouts';
import { appleHealthAvailable } from '@/features/health/appleHealth';
import { computeStats, localDay } from '@/features/practice/stats';
import { lastWeekStart, showWeekCard, weekRecap } from '@/features/recap/recap';
import { computeRecords, recordSessionIds } from '@/features/records/records';
import { confirm } from '@/lib/confirm';
import { goBack } from '@/lib/goBack';
import { duration } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

/** Weeks shown at first; "Show earlier weeks" adds as many again. */
const WEEKS = 8;
/** A session row's top and bottom padding, and the height of its first line (the big number, and the button beside it). */
const ROW_PAD = 14;
const HERO_LINE = 32;

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
 * won"); a session you accepted into your log reads as yours, shared with
 * you ("Practice", labelled "with Mira"), with Post it to post it as your
 * own (its people named by the server, migration 77), and a tap on it opens
 * that tag. The phone alert for
 * a tag opens this page with ?tag= (the tagger's session), and the tag's
 * sheet opens on top.
 */
export default function YourSessions() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUserId, sessions, detectedActivities, posts, stories, sessionTags, users, actions, integrations } = useApp();
  const flags = useTennisFlags();
  const apple = integrations.find((i) => i.provider === 'apple-health');
  // Past workouts (Oct 5): once every workout is switched on and Apple Health reads them (their own yes
  // to it, kept on the connection itself, so only ever there while Apple Health is connected).
  const pastOn = flags.workoutsApple && !!apple?.readsWorkouts && !!apple.readsAllWorkouts;
  // The list also holds tennis from WHOOP and the other trackers that have sessions on: it says so.
  const otherTrackers = integrations.some((i) => i.provider !== 'apple-health' && i.connected && i.readsWorkouts
    && (i.provider === 'whoop' ? flags.whoop : i.provider === 'fitbit' || i.provider === 'oura' || i.provider === 'polar' ? flags[i.provider] : false));
  const pastFrom = otherTrackers ? 'your trackers' : 'Apple Health';
  // Tennis sessions on from Apple Health, every workout not yet: offered here too (on this iPhone), never switched on for them.
  const offerOn = flags.workoutsApple && !!apple?.connected && !!apple.readsWorkouts && !apple.readsAllWorkouts && appleHealthAvailable();
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

  // Personal records (Oct 5): from 3 sessions on. The sessions holding one wear a gold "Record", the best week "Best week".
  const tennisCount = useMemo(() => sessions.filter((s) => s.userId === currentUserId && s.kind !== 'fitness').length, [sessions, currentUserId]);
  const records = useMemo(() => (currentUserId ? computeRecords(currentUserId, sessions, posts, stories) : {}), [currentUserId, sessions, posts, stories]);
  const recordIds = useMemo(() => recordSessionIds(records), [records]);
  const streakNow = useMemo(() => (currentUserId ? computeStats(currentUserId, sessions, posts, stories).currentStreakDays : 0), [currentUserId, sessions, posts, stories]);

  // "Your week" (the weekly recap, in the app): Monday to Wednesday, until put away for that week.
  const recap = useMemo(() => (currentUserId ? weekRecap(currentUserId, sessions, posts, stories, lastWeekStart()) : null), [currentUserId, sessions, posts, stories]);
  const [recapAway, setRecapAway] = useState<boolean | null>(null);
  useEffect(() => {
    if (!currentUserId || !recap) return undefined;
    let on = true;
    AsyncStorage.getItem(recapKey(currentUserId, recap.week)).then((v) => { if (on) setRecapAway(!!v); }).catch(() => { if (on) setRecapAway(false); });
    return () => { on = false; };
  }, [currentUserId, recap?.week]); // eslint-disable-line react-hooks/exhaustive-deps
  const putRecapAway = () => {
    setRecapAway(true);
    if (currentUserId && recap) void AsyncStorage.setItem(recapKey(currentUserId, recap.week), '1').catch(() => undefined);
  };

  // Flyby (Oct 5): today's and yesterday's sessions played at a court carry "3 others here today".
  const flybyDays = [localDay(new Date()), localDay(Date.now() - 86_400_000)];

  const logButton = (
    <Pressable accessibilityRole="button" accessibilityLabel="Log a session" hitSlop={10} onPress={() => router.push('/log-session')} style={({ pressed }) => [styles.log, pressed && styles.pressed]}>
      <Ionicons name="add" size={16} color={colors.text} />
      <Text style={styles.logText}>Log</Text>
    </Pressable>
  );

  return (
    <Screen title="Your sessions" subtitle="Only you see this." compactTitle onBack={() => goBack('/profile')} right={logButton}>
      {offerOn && currentUserId ? <WorkoutsOffer me={currentUserId} /> : null}
      {recap && recapAway === false && showWeekCard(recap) ? (
        <YourWeekBanner recap={recap} onOpen={() => router.push({ pathname: '/weekly-recap', params: { week: recap.week } })} onClose={putRecapAway} />
      ) : null}
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

      {/* Older workouts, after what is waiting on you: browsing never outranks the things to do. */}
      {pastOn ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Past workouts: the last 30 days from ${pastFrom}`} onPress={() => router.push('/workouts')} style={({ pressed }) => [styles.group, styles.pastRow, pressed && styles.pressed]}>
          <View style={styles.pastIcon}><Ionicons name="fitness-outline" size={18} color={colors.court} /></View>
          <View style={styles.words}>
            <Text style={styles.title}>Past workouts</Text>
            <Text style={styles.when} numberOfLines={1}>Last 30 days · {pastFrom}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Pressable>
      ) : null}

      {tennisCount >= 3 ? (
        // The page already says only you see it: no lock note of its own here.
        <PersonalRecords records={records} sessions={sessions} sessionTags={sessionTags} users={users} currentStreak={streakNow} privateNote={false} />
      ) : null}

      {groups.slice(0, weeks).map(({ start, list }) => {
        const onCourt = list.filter((s) => s.kind !== 'fitness').reduce((sum, s) => sum + s.minutes, 0);
        return (
          <React.Fragment key={start}>
            <View style={styles.weekHead}>
              <Text style={[styles.sectionTitle, styles.weekName]}>{weekLabel(start)}</Text>
              {records.week?.from === start ? <View style={styles.bestWeek}><RecordPill label="Best week" /></View> : null}
              {onCourt ? <Text style={styles.weekHours}>{duration(onCourt)} on court</Text> : null}
            </View>
            <View style={styles.group}>
              {list.map((s, i) => {
                const found = s.activityId ? detectedActivities.find((a) => a.id === s.activityId) : undefined;
                // A tracker's session posts with its tracker numbers, and is named for its tracker, only while its source is switched on; otherwise as you logged it.
                const activity = found && sourceOn(found, flags) ? found : undefined;
                const pick: SessionPick = activity ? { type: 'tracker', activity, session: s } : { type: 'logged', session: s };
                const postId = postOf(pick, posted);
                // A copy from someone's tag reads as yours, a session shared with you: "with Mira" beside its length
                // ("Match · Lost vs Mira" when she was across the net), Post it to post it as your own, and a tap opens the tag.
                const from = s.fromSessionId ? sessionTags.find((t) => t.taggedId === currentUserId && (t.mirroredSessionId === s.id || t.sessionId === s.fromSessionId)) : undefined;
                const fromWho = from ? users.find((u) => u.id === from.taggerId) : undefined;
                const fromFirst = fromWho ? firstName(fromWho.name) : '';
                const people: PeopleLine | null = from && fromFirst
                  ? (s.kind === 'match' && from.role === 'opponent' ? { vs: [{ name: fromFirst, state: 'typed' }], with: [], allWaiting: false } : null)
                  : peopleWords(s, sessionTags, users);
                // Where it was played: the log's own court, else the court on its post (migration 130).
                const itsPost = postId ? posts.find((p) => p.id === postId) : undefined;
                const courtId = s.courtId ?? itsPost?.court?.id;
                const courtName = s.note?.startsWith('At ') ? s.note.slice(3).split(' · ')[0] : itsPost?.court?.name ?? 'this court';
                const flyby = courtId && flybyDays.includes(s.day) && s.kind !== 'fitness'
                  ? <FlybyPill courtId={courtId} courtName={courtName} day={s.day} />
                  : null;
                const share = () => router.push({ pathname: '/share-session', params: postId ? { post: postId, session: s.id } : { session: s.id } });
                // Where it came from, on the day's line: the tracker's name ("WHOOP"), or who shared it with you. Logged
                // by hand is the usual, so it says nothing. A tag copy whose title already names them says it once.
                const source = s.fromSessionId ? (people ? '' : fromFirst ? `with ${fromFirst}` : 'Shared with you')
                  : pick.type === 'tracker' ? pickSource(pick) : s.activityId ? 'Tracker' : '';
                return (
                  <Logged
                    key={s.id}
                    session={s}
                    people={people}
                    // A match or a practice opens who you played (a tag's copy, its tag); drills and fitness open their picture to share.
                    onOpen={from ? () => router.push({ pathname: '/session-tag', params: { tag: from.id } })
                      : canTagKind(s.kind) && !s.fromSessionId ? () => router.push({ pathname: '/log-session', params: { edit: s.id } })
                      : share}
                    openWord={from ? 'Open the tag' : canTagKind(s.kind) && !s.fromSessionId ? 'Who you played' : 'Share'}
                    // Built from the tag, the title already says who it was with: no note line repeating it.
                    hideNote={!!(from && fromFirst)}
                    source={source}
                    // A run from the Watch keeps its distance once logged: "Run · 3.1 mi", as it said while waiting.
                    far={activity && !isTennisActivity(activity) ? formatDistance(activity.distanceM) : null}
                    postId={postId}
                    postable={checked && !postId && s.day >= firstPostable}
                    onPost={() => router.push({ pathname: '/compose', params: pick.type === 'tracker' ? { activity: pick.activity.id } : { session: s.id } })}
                    onShare={share}
                    onRemove={() => confirm({ title: 'Remove this session?', message: 'It comes off your streak and totals.', confirmLabel: 'Remove', destructive: true, onConfirm: () => actions.deleteSession(s.id) })}
                    line={i > 0}
                    record={recordIds.has(s.id)}
                    flyby={flyby}
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
      {/* The one place that says how a session comes off the log (a hold, here or on the Tennis profile). */}
      {groups.length ? <Text style={styles.holdHint}>Hold a session to remove it.</Text> : null}
    </Screen>
  );
}

/** "Not now" on the offer below, kept on this phone per account. */
const offerKey = (me: string) => `courtside-workouts-offer:${me}`;
/** "Your week" put away, kept on this phone per account and week. */
const recapKey = (me: string, week: string) => `courtside-recap-away:${me}:${week}`;

/**
 * The offer of every workout (migration 107) to someone who turned on tennis
 * sessions from Apple Health only: they agreed to their tennis workouts, so
 * runs, rides and the gym are never picked up until they say yes here (or on
 * the Health page), after the same explanation anyone new gets. "Not now"
 * puts it away on this phone; the Health page keeps offering it.
 */
function WorkoutsOffer({ me }: { me: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const { actions } = useApp();
  // Hidden until this phone has said whether it was put away, so it never flashes up and away.
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let on = true;
    AsyncStorage.getItem(offerKey(me)).then((v) => { if (on && !v) setShown(true); }).catch(() => { if (on) setShown(true); });
    return () => { on = false; };
  }, [me]);
  if (!shown) return null;
  const later = () => {
    setShown(false);
    void AsyncStorage.setItem(offerKey(me), '1').catch(() => undefined);
  };
  const turnOn = () => confirm({
    ...WORKOUTS_ASK,
    confirmLabel: 'Continue',
    onConfirm: async () => {
      setBusy(true);
      try {
        await actions.turnOnTennis('apple-health', { workouts: true });
      } catch (err) {
        showToast({ title: 'Could not turn that on', body: err instanceof Error ? err.message : 'Try again in a moment.', icon: 'alert-circle-outline' });
      } finally {
        setBusy(false);
      }
    },
  });
  return (
    <View style={[styles.group, styles.offer]}>
      <View style={styles.offerTop}>
        <View style={styles.pastIcon}><Ionicons name="fitness-outline" size={18} color={colors.court} /></View>
        <View style={styles.words}>
          <Text style={styles.title}>Also pick up runs, rides and the gym?</Text>
          <Text style={styles.when}>Your other workouts from Apple Health, ready to log like your tennis. Only you see them.</Text>
        </View>
      </View>
      <View style={styles.offerButtons}>
        <Pressable accessibilityRole="button" accessibilityLabel="Not now" disabled={busy} hitSlop={8} onPress={later} style={({ pressed }) => [styles.offerLater, pressed && styles.pressed]}>
          <Text style={styles.offerLaterText}>Not now</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Turn on every workout from Apple Health" accessibilityState={{ busy, disabled: busy }} disabled={busy} onPress={turnOn} style={({ pressed }) => [styles.action, styles.actionOn, styles.offerOn, pressed && styles.pressed]}>
          {busy ? <ActivityIndicator size="small" color={colors.brandInk} /> : <Text style={[styles.actionText, styles.actionTextOn]}>Turn on</Text>}
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The tracker a session waiting to be logged came from ("WHOOP", "Apple
 * Watch"), as a small quiet tag beside how long it was: worth knowing, never
 * worth reading first. (A logged session says it on its day's line.)
 */
function SourceTag({ label }: { label: string }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/**
 * A tracker's session nobody has logged: how long first and big, then what
 * it was, then the day and the times on a short line of their own, with its
 * source as a small tag. Log it sits beside the big number, clear of the words.
 */
function Waiting({ activity, line }: { activity: DetectedActivity; line: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const source = pickSource({ type: 'tracker', activity });
  // A workout's distance beside its name: "Run · 3.1 mi".
  const far = isTennisActivity(activity) ? null : formatDistance(activity.distanceM);
  return (
    <View style={[styles.row, line && styles.line]}>
      <View style={styles.rowMain}>
        <View style={styles.icon}><Ionicons name={isTennisActivity(activity) ? 'stopwatch-outline' : workoutIcon(activity.sport)} size={18} color={colors.court} /></View>
        <View style={styles.words}>
          <View style={styles.heroLine}>
            <Text style={styles.hero}>{duration(activity.minutes)}</Text>
            <SourceTag label={source} />
          </View>
          <Text style={styles.title} numberOfLines={2}>{far ? `${activityTitle(activity)} · ${far}` : activityTitle(activity)}</Text>
          <Text style={styles.when}>{activityWhen(activity, new Date(), ' · ')}</Text>
        </View>
      </View>
      <View style={styles.actionSpot}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Log it: ${activityTitle(activity)}, ${duration(activity.minutes)}`} hitSlop={8} onPress={() => router.push({ pathname: '/compose', params: { activity: activity.id } })} style={({ pressed }) => [styles.action, styles.actionOn, pressed && styles.pressed]}>
          <Text style={[styles.actionText, styles.actionTextOn]}>Log it</Text>
        </Pressable>
      </View>
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
          <Text style={styles.tagTitle} numberOfLines={1}>{first} tagged you</Text>
          <Text style={styles.sub} numberOfLines={1}>{what} · {dayWords(tag.day)} · {duration(tag.minutes)}</Text>
        </View>
      </Pressable>
      {/* Accept and Decline under the words, the way a follow request asks in Notifications. */}
      <View style={styles.answers}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Accept ${first}’s tag`} accessibilityState={{ busy: busy === 'accept' }} disabled={!!busy} hitSlop={5} onPress={() => { void answer(true); }} style={({ pressed }) => [styles.answer, styles.actionOn, pressed && styles.pressed]}>
          {busy === 'accept' ? <ActivityIndicator size="small" color={colors.brandInk} /> : <Text style={[styles.actionText, styles.actionTextOn]}>Accept</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Decline ${first}’s tag`} accessibilityState={{ busy: busy === 'decline' }} disabled={!!busy} hitSlop={5} onPress={() => { void answer(false); }} style={({ pressed }) => [styles.answer, pressed && styles.pressed]}>
          {busy === 'decline' ? <ActivityIndicator size="small" color={colors.textMuted} /> : <Text style={styles.actionText}>Decline</Text>}
        </Pressable>
      </View>
    </View>
  );
}

/**
 * One session you logged, with Post it, or Posted (which opens the post), and
 * a share button beside it (the session as a picture for Instagram). A tap on
 * the rest opens who you played (or, for a copy from a tag, that tag; for
 * drills and fitness, its picture to share).
 *
 * The big line holds only how long and, when it holds one, the gold Record:
 * where it came from ("WHOOP", "with Mira") reads on the day's line, so
 * nothing on the big line is ever squeezed to fit beside the buttons.
 */
function Logged({ session: s, people, onOpen, openWord, hideNote = false, source, far = null, postId, postable, onPost, onShare, onRemove, line, record = false, flyby = null }: {
  session: PracticeSession;
  /** "vs Mira" (accepted), "vs June · Waiting", "with Dev", a name you typed. */
  people: PeopleLine | null;
  onOpen: () => void;
  /** What a tap on the row does, for a screen reader: "Who you played", "Open the tag", "Share". */
  openWord: string;
  /** The note says nothing the title doesn't (a copy from a tag). */
  hideNote?: boolean;
  /** "WHOOP", "Apple Watch", "with Mira"; empty for a session logged by hand. */
  source: string;
  /** A workout's distance from its tracker ("3.1 mi"). */
  far?: string | null;
  postId?: string; postable: boolean; onPost: () => void; onShare: () => void;
  /** A hold on the row: remove it from your log (after a yes). Offered to a screen reader as an action of its own. */
  onRemove: () => void;
  line: boolean;
  /** It holds a personal record now: a small gold "Record" beside its length. */
  record?: boolean;
  /** "3 others here today" (Flyby), under the day. */
  flyby?: React.ReactNode;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const label = far ? `${loggedLabel(s)} · ${far}` : loggedLabel(s);
  const title = `${label}${people ? ` ${peopleText(people)}` : ''}`;
  const shownNote = s.note && !hideNote ? s.note : '';
  const place = shownNote.startsWith('At ') ? shownNote.slice(3) : '';
  const note = place ? '' : shownNote;
  // The day, and where it came from: "Sat Oct 3 · WHOOP".
  const day = source ? `${dayWords(s.day)} · ${source}` : dayWords(s.day);
  // Where, on the same line when it all fits on a phone ("Yesterday · Alder Park"), else on a line of its own.
  const placeOnDay = !!place && `${day} · ${place}`.length <= 30;
  return (
    <View style={[styles.row, line && styles.line]}>
      {/* The row itself, beside its button rather than around it: a button inside a button is not allowed in a browser. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${duration(s.minutes)}, ${dayWords(s.day)}${source ? `, ${source}` : ''}${record ? ', personal record' : ''}. ${openWord}`}
        accessibilityActions={[{ name: 'longpress', label: 'Remove' }]}
        onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'longpress') onRemove(); }}
        onPress={onOpen}
        onLongPress={onRemove}
        delayLongPress={450}
        style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
      >
        <View style={styles.icon}>
          {s.kind === 'match' ? <Ionicons name="trophy-outline" size={18} color={colors.textMuted} />
            : s.kind === 'fitness' ? <Ionicons name={s.workout ? workoutIcon(s.workout) : 'barbell-outline'} size={18} color={colors.textMuted} />
            : <CourtGlyph size={15} color={colors.textMuted} />}
        </View>
        <View style={styles.words}>
          {/* How long, big: the number you scan a week of sessions for. A record wears its gold pill beside it. */}
          <View style={[styles.heroLine, styles.heroLineShare]}>
            <Text style={styles.hero}>{duration(s.minutes)}</Text>
            {record ? <RecordPill /> : null}
          </View>
          <LoggedTitle label={label} people={people} style={styles.title} faint={styles.waiting} numberOfLines={2} />
          <Text style={styles.when}>
            {day}
            {placeOnDay ? <>{' · '}<Ionicons name="location-outline" size={13} color={colors.textFaint} />{` ${place}`}</> : null}
          </Text>
          {place && !placeOnDay ? (
            <View style={styles.placeRow}>
              <Ionicons name="location-outline" size={13} color={colors.textFaint} />
              <Text style={styles.note} numberOfLines={2}>{place}</Text>
            </View>
          ) : null}
          {/* Any other note, as it was written. */}
          {note ? <Text style={styles.note} numberOfLines={2}>{note}</Text> : null}
        </View>
      </Pressable>
      {/* Its own button under the words, outside the row's: a button inside a button is not allowed in a browser. */}
      {flyby ? <View style={styles.flybyRow}>{flyby}</View> : null}
      {/* Beside the big number, outside the row's own button. Post it / Posted keep a slot of the same width on every
          row, so the share buttons stand in one line down the list, even on a row too old to post. */}
      <View style={[styles.actionSpot, styles.actionRow]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Share to Instagram: ${title}`} hitSlop={6} onPress={onShare} style={({ pressed }) => [styles.share, pressed && styles.pressed]}>
          <Ionicons name="share-outline" size={18} color={colors.textMuted} />
        </Pressable>
        <View style={styles.postSlot}>
          {postId ? (
            <Pressable accessibilityRole="link" accessibilityLabel={`Posted. Open the post: ${title}`} hitSlop={{ top: 8, bottom: 8, left: 2, right: 8 }} onPress={() => router.push(`/post/${postId}`)} style={({ pressed }) => [styles.posted, pressed && styles.pressed]}>
              <Ionicons name="checkmark" size={14} color={colors.textMuted} />
              <Text style={styles.postedText}>Posted</Text>
            </Pressable>
          ) : postable ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Post it: ${title}`} hitSlop={{ top: 8, bottom: 8, left: 2, right: 8 }} onPress={onPost} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
              <Text style={styles.actionText}>Post it</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  // The grouped lists the Tennis profile used to have (profile-details): white cards on a soft shadow, rows parted by a hairline.
  group: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden', paddingHorizontal: spacing.lg },
  sectionTitle: { ...typography.smallStrong, color: colors.textMuted, paddingHorizontal: spacing.sm, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  weekHead: { flexDirection: 'row', alignItems: 'flex-end' },
  weekName: { flex: 1 },
  weekHours: { ...typography.small, color: colors.textMuted, fontVariant: ['tabular-nums'], paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  bestWeek: { paddingBottom: spacing.sm },
  // A session: how long (big) with its source beside it, what it was, then when. The button rides the big number's line, top right.
  row: { paddingVertical: ROW_PAD },
  rowMain: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  tagRow: { gap: spacing.sm, paddingVertical: 12 },
  // Under the words, lined up with them (past the 40 of the face and the row's gap).
  answers: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: 40 + spacing.md },
  answer: { minWidth: 92, height: 34, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
  waiting: { ...typography.small, ...font('500'), color: colors.textFaint },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  // Centred on the big number's line.
  icon: { width: 22, height: HERO_LINE, alignItems: 'center', justifyContent: 'center' },
  words: { flex: 1, minWidth: 0, gap: 3 },
  // As tall as the button beside it, so the words under it run the full width without meeting it; kept clear of the button on the right.
  heroLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: HERO_LINE, paddingRight: 96 },
  hero: { fontSize: 21, lineHeight: 26, ...font('600'), letterSpacing: -0.5, color: colors.text, fontVariant: ['tabular-nums'], flexShrink: 0 },
  // Flyby's pill, lined up with the words (past the icon and the gap).
  flybyRow: { paddingLeft: 22 + spacing.md },
  tag: { flexShrink: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  tagText: { fontSize: 11, lineHeight: 15, ...font('600'), letterSpacing: 0.2, color: colors.textMuted },
  title: { fontSize: 15, lineHeight: 20, ...font('500'), color: colors.text },
  when: { fontSize: 14, lineHeight: 19, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  tagTitle: { ...typography.body, ...font('600'), color: colors.text },
  sub: { ...typography.small, color: colors.textMuted },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  note: { fontSize: 14, lineHeight: 19, color: colors.textFaint, flexShrink: 1 },
  actionSpot: { position: 'absolute', right: 0, top: ROW_PAD, height: HERO_LINE, justifyContent: 'center' },
  // A logged session's share button sits before Post it / Posted; its big line keeps clear of both.
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  heroLineShare: { paddingRight: 112 },
  share: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  // As wide as Post it, its button at the right edge: the share buttons line up whatever is beside them.
  postSlot: { width: 76, alignItems: 'flex-end' },
  // Post it: a small outlined pill, quieter than Log it (the one thing waiting on you).
  action: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
  actionOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  actionText: { ...typography.smallStrong, color: colors.text },
  actionTextOn: { color: colors.brandInk },
  posted: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 4, paddingVertical: 6 },
  postedText: { ...typography.smallStrong, color: colors.textMuted },
  log: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 10, paddingRight: 14, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.surface, ...lift },
  logText: { ...typography.smallStrong, color: colors.text },
  more: { alignSelf: 'center', marginTop: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  // Past workouts: one row of its own, the list's card look, under what is waiting to be logged.
  pastRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14, marginTop: spacing.md },
  pastIcon: { width: 22, alignItems: 'center', justifyContent: 'center' },
  // The offer of every workout: the same card, its words, then Not now and Turn on at the right.
  offer: { paddingVertical: 14, marginTop: spacing.sm, gap: spacing.md },
  offerTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  offerButtons: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm },
  offerLater: { paddingHorizontal: 12, paddingVertical: 7 },
  offerLaterText: { ...typography.smallStrong, color: colors.textMuted },
  offerOn: { minWidth: 84, alignItems: 'center' },
  moreText: { ...typography.smallStrong, color: colors.brand },
  holdHint: { ...typography.small, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
  pressed: { opacity: 0.6 },
});

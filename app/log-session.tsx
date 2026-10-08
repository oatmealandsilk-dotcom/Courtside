import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { DragSheet } from '@/components/DragSheet';
import { Chips, Section, SheetTitle, Submit, formBody } from '@/components/sheet/SheetForm';
import { WhoYouPlayed } from '@/components/WhoYouPlayed';
import { KIND_LABEL, activityDay, activityTitle, activityWhen, dayWords, fromWho, loggedLabel, privateLine, sessionEyebrow } from '@/features/activity/format';
import { showLogged } from '@/features/activity/useTrackerSession';
import { Duration } from '@/components/session/Duration';
import { trackerName } from '@/features/activity/lengths';
import { TrackedLength } from '@/components/session/TrackedLength';
import { LengthPicker } from '@/components/session/LengthPicker';
import { DayPicker } from '@/components/session/DayPicker';
import { ScoreField } from '@/components/session/ScoreField';
import { ManualStats } from '@/components/session/ManualStats';
import { readManualStats, type ManualRead } from '@/features/activity/manualStats';
import { canScore, readScore, scoreText, setsWinner, tookScoreNotKept } from '@/features/activity/score';
import { computeStats } from '@/features/practice/stats';
import { andList, canTagKind, firstName as firstOfName, isActive, tagsOnSession } from '@/features/activity/sessionTags';
import { pickSource, postOf, postedIndex, sourceOn } from '@/features/activity/recent';
import { formatDistance, isTennisActivity, workoutIcon, workoutName } from '@/features/activity/workouts';
import { useTennisFlags } from '@/features/activity/useTennisFlags';
import { hitPrefill, prefillFor } from '@/features/hits/followUp';
import { beatenBy, recordToast } from '@/features/records/records';
import { flybyAfter } from '@/features/flyby/flyby';
import { localDay } from '@/features/practice/stats';
import type { DetectedActivity, ID, PracticeSession, SessionPlayer, SessionTagStatus } from '@/data/types';
import { confirm } from '@/lib/confirm';
import { duration } from '@/lib/format';
import { KeyboardScrollContext, useKeyboardReveal } from '@/lib/keyboardScroll';
import { isSupabaseConfigured } from '@/lib/supabase';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

const KINDS: { value: PracticeSession['kind']; label: string }[] = [
  { value: 'practice', label: 'Practice' },
  { value: 'match', label: 'Match' },
  { value: 'fitness', label: 'Fitness' },
];
/**
 * Drills is folded into Practice (Oct 7, owner: "drills and practice are the
 * same thing"). A session that is already Drills (started live before, or
 * one being finished now) keeps its chip, so its choice is never blank.
 */
const WITH_DRILLS: typeof KINDS = [...KINDS.slice(0, 2), { value: 'drills', label: 'Drills' }, KINDS[2]];

/**
 * What a fitness session logged by hand was, kept as the same slugs a
 * tracker's workouts use (migration 107), so it reads "Run", "Gym" in your
 * sessions like one from the Watch. Each chip says the name it saves as
 * (workoutName, the same list as the server's): what you tap is what the
 * row, the note and the picture say ("Bike ride", never "Ride" then "Bike
 * ride"). Nothing picked stays "Fitness".
 */
const WORKOUT_KINDS: { value: string; label: string }[] = ['run', 'ride', 'swim', 'gym'].map((value) => ({ value, label: workoutName(value) }));

/**
 * Log a session in two taps: what it was (practice is picked already) and
 * how long, then Save. A match can say whether you won. How long is hours
 * and minutes, an hour to start (Oct 7, owner: "just custom"); When is Today,
 * Yesterday or any day of the last four weeks, for the session you forgot to
 * log (Oct 6, owner). A session counts for the day picked.
 *
 * Opened from a "Tennis detected" alert (?activity=), it comes filled in
 * from the tracker's session: its day, its exact length, and a private line
 * of its numbers. Save counts it toward the streak, once; "Not tennis?"
 * hides it instead (migration 58). "Save and post" (or "Post it", once
 * logged) saves the same way, then opens a new post with the session's stats
 * on it: nothing from the tracker is public until that post is shared.
 *
 * Opened from "How was the hit?" (?hit=), it comes filled in from the hit:
 * practice or a match, its usual length, its day, and who played; where it
 * was is kept as the session's note. When your tracker picked up the same
 * game, the prompt sends both (?activity=&hit=): the tracker's session is
 * the one logged, with its own day and length, and the hit fills in the
 * rest, so one game is never logged twice.
 *
 * A match can carry its score (Oct 4, migration 91), typed as "6-4 3-6
 * 10-7", your games first; the result then follows the sets. A practice or
 * drills can too (Oct 6, owner: "well practices can have scores too"), as
 * just the sets: only a match has a result. Editing a logged session
 * (?edit=) can add or change it; ?focus=score (Share's "Add score") opens
 * with the caret in the box, and Save goes back to where it came from.
 *
 * "Who was there" (a match or a practice) tags CourtSide players, up to
 * 3 on a match or 8 on a practice, each asked to accept before their name shows on a post; a name
 * typed that isn't on CourtSide stays private, as before (migration 62).
 * From a hit, its people are offered first. Opened on a session already
 * logged (?edit=, a row in Your sessions), the sheet is its score and that
 * part, so people can be tagged after the fact; one logged by hand can also
 * change its length and day there (Oct 6). A copy of someone else's session
 * (from their tag) is theirs to tag, so it says so instead.
 *
 * Logged by hand, "+ Add calories & heart rate" (Oct 8, owner) opens two
 * optional number boxes at the foot, closed to start with so logging stays
 * two taps. They go in your private log only; a post of the session shows
 * them as "Share health data" says, like a tracker's (migration 154). Not
 * offered until the server keeps them, and never for a tracker's session,
 * whose own numbers win.
 *
 * A live session's Finish (Oct 7) opens the "Log it" composer instead
 * (compose?live=1, see features/activity/finishLive); an address still
 * saying log-session?live=1 is handed on there.
 */
export default function LogSessionRoute() {
  const { activity, hit, edit, live } = useLocalSearchParams<{ activity?: string; hit?: string; edit?: string; live?: string }>();
  // A tracker's session is logged from the composer now (Oct 2): "Log it"
  // opens a new post with the session on it, with "Save privately" beside Post session.
  // This page still opens from the lock screen's alert and older alert rows
  // (the server's link says /log-session?activity=), so it hands those on.
  if (activity && !edit) return <ToComposer activity={activity} hit={hit} />;
  // A live session's Finish: the same composer, filled in from the clock (Oct 7).
  if (live === '1' && !edit) return <ToLiveLog />;
  return <LogSession />;
}

function ToLiveLog() {
  useEffect(() => { router.replace({ pathname: '/compose', params: { live: '1' } }); }, []);
  return null;
}

/** What a tracker's session was, with a workout's distance: "Tennis", "Run · 3.1 mi". */
function pickTitle(x: DetectedActivity): string {
  const far = isTennisActivity(x) ? null : formatDistance(x.distanceM);
  return far ? `${activityTitle(x)} · ${far}` : activityTitle(x);
}

function ToComposer({ activity, hit }: { activity: string; hit?: string }) {
  useEffect(() => { router.replace({ pathname: '/compose', params: { activity, ...(hit ? { hit } : {}) } }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/*
 * Logging by hand (Your sessions, the + menu, a hit with no tracker copy) and
 * editing a log (?edit=). Since Oct 2 a tracker's session (?activity=) never
 * reaches here: LogSessionRoute hands it to the composer. The tracker parts
 * below (`fresh`, "Save and post", "Post it") are only kept for an address
 * carrying both ?edit= and ?activity=, which nothing in the app sends; they
 * can go once the old lock-screen links have aged out (30 days).
 */
function LogSession() {
  const styles = useThemedStyles(styleDefinitions);
  const { activity, hit, edit, focus } = useLocalSearchParams<{ activity?: string; hit?: string; edit?: string; focus?: string }>();
  const { actions, detectedActivities, remoteLoaded, ready, hitRequests, currentUserId, users, posts, stories, sessions, sessionTags, sessionTagsReady, manualStatsReady } = useApp();
  // The box you type in stays above a phone's keyboard, and so do the names listed under it.
  const { scroller, onScroll, reveal } = useKeyboardReveal();
  // The hit it was opened for: the prompt's words, or the hit itself if the app was reloaded on the way.
  const [fromHit] = useState(() => {
    if (!hit) return null;
    const known = hitPrefill(hit);
    if (known) return known;
    const h = hitRequests.find((x) => x.id === hit);
    return h && currentUserId ? prefillFor(h, currentUserId, users) : null;
  });
  const [closeSignal, setCloseSignal] = useState(0);
  const close = () => setCloseSignal((n) => n + 1);
  // The session to post once the sheet has slid away, when the player chose to post it.
  const next = useRef<string | null>(null);
  // Posting is offered only while the server has tennis sessions switched on for its source.
  const flags = useTennisFlags();
  const postable = (x: DetectedActivity) => sourceOn(x, flags);

  // The tracker session it was opened for. A copy of one already waiting
  // (the same game from the watch and from WHOOP) opens that one instead.
  const found = activity ? detectedActivities.find((x) => x.id === activity) : undefined;
  const twin = found?.status === 'duplicate' && found.duplicateOf ? detectedActivities.find((x) => x.id === found.duplicateOf && x.status === 'new') : undefined;

  // An alert opened from cold lands here before the sessions have loaded:
  // the sheet waits for them, asks once more if it is still not there, and
  // gives up after a while rather than spinning for ever.
  const [looked, setLooked] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (!activity || found || !remoteLoaded || looked) return;
    void actions.refreshActivities().finally(() => setLooked(true));
  }, [activity, found, remoteLoaded, looked, actions]);
  useEffect(() => {
    if (!activity) return;
    const t = setTimeout(() => setGaveUp(true), 10_000);
    return () => clearTimeout(t);
  }, [activity]);
  const waiting = !!activity && !found && isSupabaseConfigured && !gaveUp && (!remoteLoaded || !looked);

  // Once saved or hidden, the sheet keeps showing what it was while it slides away.
  const [frozen, setFrozen] = useState<DetectedActivity | null>(null);
  const a = frozen ?? twin ?? found;
  const fresh = a?.status === 'new' ? a : undefined;
  const done = !fresh && (a?.status === 'logged' || a?.status === 'duplicate') ? a : undefined;
  const gone = !!activity && !waiting && !fresh && !done;
  // One session, one post: a logged session already on one of your posts
  // offers no "Post it". Your posts with a session are asked for fresh, as
  // the app may hold only the newest few (the post page checks again).
  useEffect(() => { if (activity) void actions.loadMySessionPosts(); }, [activity]); // eslint-disable-line react-hooks/exhaustive-deps
  const alreadyPosted = !!done && !!postOf({ type: 'tracker', activity: done }, postedIndex(posts, currentUserId));

  const [kind, setKind] = useState<PracticeSession['kind']>(fromHit?.kind ?? 'practice');
  const [kinds] = useState(() => (kind === 'drills' ? WITH_DRILLS : KINDS));
  // A fitness session's kind ("run", "gym"), when picked.
  const [workout, setWorkout] = useState<string | undefined>();
  const [minutes, setMinutes] = useState<number | null>(fresh ? fresh.minutes : fromHit ? fromHit.minutes : null);
  const [editLength, setEditLength] = useState(false);
  // A session that arrives after the sheet opened starts on its own length too.
  const [preset, setPreset] = useState(fresh?.id);
  if (fresh && preset !== fresh.id) { setPreset(fresh.id); setMinutes(fresh.minutes); }
  const [won, setWon] = useState<'won' | 'lost' | null>(null);
  // The score, as typed, on any tennis session (Oct 6). On a match, when one side took more sets it decides the result, and the Won/Lost chips step aside.
  const [score, setScore] = useState('');
  const scored = readScore(score);
  const decided = kind === 'match' ? setsWinner(scored.sets) : undefined;
  const shownWon: 'won' | 'lost' | null = decided === undefined ? won : decided ? 'won' : 'lost';
  // Who you played: CourtSide players to tag, and any name typed that isn't on CourtSide.
  // From a hit, its people are offered to tag; with no tagging yet, their names start in the box.
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [opponent, setOpponent] = useState(fromHit && !sessionTagsReady ? fromHit.who : '');
  // The day it was played (Oct 6: any of the last four weeks, not just today or yesterday). From a hit, the hit's day; never one still to come.
  const [playedOn, setPlayedOn] = useState(() => {
    const today = localDay(new Date());
    return fromHit?.day && fromHit.day < today ? fromHit.day : today;
  });
  // Calories and average heart rate typed in (Oct 8): folded away until asked for, never on a tracker's session.
  const [statsOpen, setStatsOpen] = useState(false);
  const [kcalText, setKcalText] = useState('');
  const [hrText, setHrText] = useState('');
  const [statsAsked, setStatsAsked] = useState(false);
  const canType = manualStatsReady && !fresh;
  const typedStats: ManualRead = canType && statsOpen ? readManualStats(kcalText, hrText) : {};
  const [saving, setSaving] = useState(false);
  // Which button the save came from, so only that one spins.
  const [andPost, setAndPost] = useState(false);
  const [error, setError] = useState('');

  const firstOf = (id: ID) => users.find((u) => u.id === id)?.name.trim().split(/\s+/)[0] ?? 'They';

  /*
   * "Log a session" with nothing else asked (Your sessions' + Log, Profile,
   * the + menu): first the sessions your tracker picked up that nobody has
   * logged yet, newest first, each opening the composer for it ("Log it"),
   * and "Log one yourself" under them for the by-hand log (owner, Oct 3).
   * With none waiting, the by-hand log opens straight away, as before.
   * Decided once, so it never swaps under your thumb, but only once your
   * tracker's sessions are here: opened before they load (from cold, a link,
   * a refresh in a browser), the sheet waits a moment rather than offering
   * the by-hand log over a session already waiting (the same game, twice).
   */
  const plain = !activity && !hit && !edit;
  const unlogged = useMemo(
    () => (plain ? detectedActivities.filter((x) => x.userId === currentUserId && x.status === 'new' && sourceOn(x, flags)).sort((x, y) => y.startedAt.localeCompare(x.startedAt)) : []),
    [plain, detectedActivities, currentUserId, flags],
  );
  const listLoaded = isSupabaseConfigured ? remoteLoaded : ready;
  // A slow or failed load never keeps the sheet waiting for ever: after a few seconds it goes on with what it has.
  const [waitedOut, setWaitedOut] = useState(false);
  useEffect(() => {
    if (!plain || listLoaded) return undefined;
    const t = setTimeout(() => setWaitedOut(true), 4000);
    return () => clearTimeout(t);
  }, [plain, listLoaded]);
  const [offered, setOffered] = useState<boolean | null>(() => (unlogged.length > 0 ? true : listLoaded ? false : null));
  useEffect(() => {
    if (offered !== null) return;
    if (unlogged.length > 0) setOffered(true);
    else if (listLoaded || waitedOut) setOffered(false);
  }, [offered, unlogged.length, listLoaded, waitedOut]);
  const deciding = plain && offered === null;
  const [byHand, setByHand] = useState(false);
  const choosing = !!offered && !byHand && unlogged.length > 0;
  const logThis = (x: DetectedActivity) => { next.current = x.id; close(); };

  // Opened on a session already logged (?edit=): its score and who you played (and, logged by hand, its length and day).
  const editing = edit ? sessions.find((x) => x.id === edit && x.userId === currentUserId) : undefined;
  // Your log (and its tags) may still be on its way when the sheet opens from a link.
  const loaded = listLoaded;
  const editTags = editing ? tagsOnSession(sessionTags, editing.id, currentUserId) : [];
  const activeOn = editTags.filter(isActive).map((t) => ({ id: t.taggedId, role: t.role }));
  // What the sheet opened with: the people tagged and the name typed. It is
  // taken again if they arrive after the sheet opened, until anything is touched.
  const [editStart, setEditStart] = useState<{ players: SessionPlayer[]; text: string }>({ players: activeOn, text: editing?.opponent ?? '' });
  const [editPlayers, setEditPlayers] = useState<SessionPlayer[]>(editStart.players);
  const [editText, setEditText] = useState(editStart.text);
  // A logged session's score, as it is in your log (migration 91; any tennis session since Oct 6), to add or change here.
  const [editScore, setEditScore] = useState(scoreText(editing?.sets, true));
  const editScored = readScore(editScore);
  const scoreTouched = useRef(false);
  useEffect(() => {
    if (!editing || scoreTouched.current) return;
    setEditScore(scoreText(editing.sets, true));
  }, [editing?.id, scoreText(editing?.sets)]); // eslint-disable-line react-hooks/exhaustive-deps
  const touched = useRef(false);
  const seedKey = `${editing?.id ?? ''}|${editing?.opponent ?? ''}|${activeOn.map((p) => `${p.id}:${p.role}`).join(',')}`;
  useEffect(() => {
    if (!editing || touched.current) return;
    setEditStart({ players: activeOn, text: editing.opponent ?? '' });
    setEditPlayers(activeOn);
    setEditText(editing.opponent ?? '');
  }, [seedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const editStatus: Record<ID, SessionTagStatus> = Object.fromEntries(editTags.map((t) => [t.taggedId, t.status]));
  // A no (or a name taken back off) shows until you take it off your log here; the server keeps it, so they are never asked again.
  const [drops, setDrops] = useState<ID[]>([]);
  const editDeclined = editTags.filter((t) => !isActive(t) && !drops.includes(t.taggedId)).map((t) => ({ id: t.taggedId, status: t.status }));
  const editClosed = editing ? tagsOnSession(sessionTags, editing.id, currentUserId, true).filter((t) => !isActive(t)).map((t) => t.taggedId) : [];
  const fromTag = editing?.fromSessionId ? sessionTags.find((t) => t.taggedId === currentUserId && (t.mirroredSessionId === editing.id || t.sessionId === editing.fromSessionId)) : undefined;
  const fromName = fromTag ? firstOfName(users.find((u) => u.id === fromTag.taggerId)?.name ?? '') : '';
  const editScoring = !!editing && canScore(editing.kind) && !editing.fromSessionId;
  // A session logged by hand can change its day and length here too (Oct 6), shown as saved until
  // something is picked. A tracker's keeps the tracker's day and time; a copy of someone else's is theirs.
  const timeEditable = editScoring && !editing?.activityId;
  const [pickedMinutes, setPickedMinutes] = useState<number | null>(null);
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const editMinutes = pickedMinutes ?? editing?.minutes ?? null;
  const editDay = pickedDay ?? editing?.day ?? localDay(new Date());
  const timeChanged = !!editing && timeEditable && (editDay !== editing.day || editMinutes !== editing.minutes);
  // Anyone who accepted is asked again once the day or length changes (the server does it, migration 62): said before Save.
  const reasked = timeChanged ? editTags.filter((t) => t.status === 'accepted').map((t) => firstOf(t.taggedId)) : [];
  const saveEdit = async () => {
    if (!editing || saving) return;
    // A score that isn't one yet says why, and nothing is saved.
    if (editScoring && editScored.problem) { setError(editScored.problem); return; }
    setSaving(true);
    setError('');
    try {
      // The day and length, only when changed: streak, hours and the week follow.
      if (timeChanged && editMinutes) await actions.setSessionTime(editing.id, { day: editDay, minutes: editMinutes });
      if (canTagKind(editing.kind)) await actions.setSessionOpponent(editing.id, editText);
      // The score, only when it changed: on a match, anyone who accepted is asked again (migration 91).
      if (editScoring && scoreText(editScored.sets) !== scoreText(editing.sets)) {
        await actions.setSessionScore(editing.id, editScored.sets ?? null);
      }
      // Drills has nobody to tag: its score is all there is to save.
      if (!canTagKind(editing.kind)) {
        showToast({ title: 'Saved', icon: 'checkmark-circle-outline' });
        close();
        return;
      }
      // A no taken off your log: off it (the server keeps it, so they are not asked again).
      for (const id of drops) {
        const t = editTags.find((x) => x.taggedId === id && !isActive(x));
        if (t) await actions.removeSessionTag(t.id);
      }
      // Only what was changed here is changed: anyone taken out comes off, anyone
      // added is tagged, a side switched is switched. A tag that arrived from
      // elsewhere in the meantime is left as it is.
      const now = new Set(editPlayers.map((p) => p.id));
      const removed = new Set(editStart.players.filter((p) => !now.has(p.id)).map((p) => p.id));
      const standing = tagsOnSession(sessionTags, editing.id, currentUserId).filter(isActive);
      const wanted: SessionPlayer[] = [
        ...standing.filter((t) => !removed.has(t.taggedId)).map((t) => ({ id: t.taggedId, role: editPlayers.find((p) => p.id === t.taggedId)?.role ?? t.role })),
        ...editPlayers.filter((p) => !standing.some((t) => t.taggedId === p.id)),
      ];
      const before = new Set(standing.map((t) => t.taggedId));
      const added = wanted.filter((p) => !before.has(p.id));
      const refused = sessionTagsReady ? await actions.setSessionPlayers(editing.id, wanted) : [];
      for (const r of refused) showToast({ title: `${firstOf(r.id)} wasn’t tagged`, body: r.why, icon: 'pricetag-outline' });
      const asked = andList(added.filter((p) => !refused.some((r) => r.id === p.id)).map((p) => firstOf(p.id)));
      showToast({ title: 'Saved', body: asked ? `${asked} will be asked to accept.` : undefined, icon: 'checkmark-circle-outline' });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save. Try again.');
      setSaving(false);
    }
  };

  const save = async (post = false) => {
    if (!minutes || saving) return;
    if (canScore(kind) && scored.problem) { setError(scored.problem); return; }
    // A number out of range says why, by its box, and nothing is saved.
    if (typedStats.problem) { setStatsAsked(true); return; }
    setSaving(true);
    setAndPost(post);
    setError('');
    // The day it counts for (streak, hours, the week): the tracker's own, or the day picked under When.
    const day = fresh ? activityDay(fresh) : playedOn;
    if (fresh) setFrozen(fresh);
    // Who you played goes with a match or a practice only.
    const tagging = canTagKind(kind) ? players : [];
    // From a hit with nobody tagged and nothing typed, its people's names are kept as private words, as before.
    const typed = canTagKind(kind) ? (opponent.trim() || (fromHit && !tagging.length ? fromHit.who : '')) : '';
    try {
      // A score on any tennis session (Oct 6); never on a workout.
      const sets = canScore(kind) ? scored.sets : undefined;
      const id = await actions.logSession({
        minutes, kind, won: shownWon === 'won' ? true : shownWon === 'lost' ? false : undefined, ...(sets ? { sets } : {}), opponent: typed, day,
        ...(kind === 'fitness' && workout ? { workout } : {}),
        // A tracker's session: logged as that session, which then counts as logged (migration 58).
        ...(fresh ? { activityId: fresh.id } : {}),
        // From a hit: where it was, as the note, and the court itself in your log (migration 130).
        ...(fromHit ? { note: `At ${fromHit.place}` } : {}),
        ...(fromHit?.placeId ? { courtId: fromHit.placeId } : {}),
        // Typed in by hand (Oct 8): private to your log.
        ...(typedStats.kcal ? { kcal: typedStats.kcal } : {}),
        ...(typedStats.avgHr ? { avgHr: typedStats.avgHr } : {}),
      });
      // Each person tagged is asked to accept; anyone the server turns away is said after.
      if (tagging.length) {
        void actions.setSessionPlayers(id, tagging).then((refused) => {
          for (const r of refused) showToast({ title: `${firstOf(r.id)} wasn’t tagged`, body: r.why, icon: 'pricetag-outline' });
        });
      }
      const asked = andList(tagging.map((p) => firstOf(p.id)));
      // Posting goes straight on to the new post, which only opens once the
      // save went through, and says "Posted" when shared. A toast there would
      // sit over its Share button for a few seconds.
      if (post && fresh) next.current = fresh.id;
      // The server didn't keep the score (a practice's, before migration 136): said here too, never shown as saved.
      else if (asked) showToast(tookScoreNotKept(id)
        ? { title: 'Logged without the score', body: `Scores aren’t ready yet. ${asked} will be asked to accept.`, icon: 'alert-circle-outline', long: true }
        : { title: 'Logged', body: `${asked} will be asked to accept.`, glyph: 'logged' });
      else {
        // "Logged · 1h 30m · Match · Won", and the streak once it is two days or more (rolling up only if this made it grow).
        const streak = currentUserId
          ? {
            now: computeStats(currentUserId, [{ id: id, userId: currentUserId, day, minutes, kind, createdAt: new Date().toISOString() }, ...sessions], posts, stories).currentStreakDays,
            before: computeStats(currentUserId, sessions, posts, stories).currentStreakDays,
          }
          : { now: 0, before: 0 };
        const won = kind === 'match' && shownWon ? shownWon === 'won' : undefined;
        // A personal record it beat is the moment instead (records.ts).
        const added: PracticeSession = { id, userId: currentUserId ?? '', day, minutes, kind, won, ...(sets ? { sets } : {}), createdAt: new Date().toISOString() };
        const record = currentUserId ? recordToast(beatenBy(currentUserId, sessions, added, posts, stories), [added, ...sessions]) : null;
        showLogged(minutes, { kind, won, sets, workout: kind === 'fitness' ? workout : undefined }, streak, id, record);
        // Logged from a hit at a court: who else was there that day, a few seconds on.
        if (fromHit?.placeId) {
          const people = users;
          flybyAfter({ courtId: fromHit.placeId, courtName: fromHit.place, day, ask: actions.flyby, users: () => people, skip: fromHit.playerIds, delayMs: record ? 5500 : undefined });
        }
      }
      close();
    } catch (e) {
      setFrozen(null);
      const said = e instanceof Error ? e.message : 'That session didn’t save. Try again.';
      // Logged already (on another phone, say): the sheet catches up and says so.
      if (said === 'Already logged.') void actions.refreshActivities();
      setError(said);
      setSaving(false);
    }
  };

  const heroDay = playedOn;
  const hide = (x: DetectedActivity) => confirm({
    title: 'Hide this session?',
    message: 'It won’t count toward your streak.',
    confirmLabel: 'Hide',
    destructive: true,
    onConfirm: () => { setFrozen(x); actions.dismissActivity(x.id); close(); },
  });

  const header = editing ? (
    <SheetTitle title={editing.fromSessionId || !canScore(editing.kind) ? 'Who was there' : `Edit ${KIND_LABEL[editing.kind].toLowerCase()}`} line={`${loggedLabel(editing)} · ${dayWords(editing.day)} · ${duration(editing.minutes)}`} onClose={close} />
  ) : edit ? (
    <SheetTitle title="Who was there" onClose={close} />
  ) : waiting ? (
    <SheetTitle title="Log your tennis" onClose={close} />
  ) : fresh ? (
    <SheetTitle title={fromHit ? 'How was the hit?' : isTennisActivity(fresh) ? 'Log your tennis' : 'Log your workout'} line={`${fromHit ? `${fromHit.place}. ` : ''}From ${fromWho(fresh)} · ${activityWhen(fresh)}. Only you see this.`} lines={2} onClose={close} />
  ) : done ? (
    <SheetTitle title={isTennisActivity(done) ? 'Log your tennis' : 'Log your workout'} line={done.status === 'logged' ? 'Logged. It counts toward your streak and hours.' : 'You already logged this session.'} lines={2} onClose={close} />
  ) : deciding ? (
    <SheetTitle title="Log a session" onClose={close} />
  ) : choosing ? (
    <SheetTitle title="Log a session" line="Your tracker picked these up. Pick one, or log one yourself." lines={2} onClose={close} />
  ) : fromHit ? (
    <SheetTitle title="How was the hit?" line={`${fromHit.place}${fromHit.who ? ` · with ${fromHit.who}` : ''}. Only you see this.`} lines={2} onClose={close} />
  ) : (
    <SheetTitle title="Log a session" line="Counts toward your streak. Only you see it." onClose={close} />
  );
  // A tracker's numbers, yours alone.
  const numbers = fresh ? privateLine(fresh) : '';
  // Once the sheet is gone: the new post with this session's stats, in this page's place, or back where it was opened from.
  const dismissed = () => (next.current ? router.replace({ pathname: '/compose', params: { activity: next.current } }) : router.back());

  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={dismissed} peekFraction={edit && !timeEditable ? 0.46 : 0.7} header={header}>
      <KeyboardScrollContext.Provider value={reveal}>
      {edit ? (
        <ScrollView ref={scroller} onScroll={onScroll} scrollEventThrottle={32} contentContainerStyle={formBody} keyboardShouldPersistTaps="handled">
          {!editing && !loaded ? (
            <View style={styles.wait}><CourtSpinner size={34} /></View>
          ) : !editing ? (
            <>
              <Text style={styles.notice}>That session is no longer here.</Text>
              <Submit label="Close" onPress={close} />
            </>
          ) : editing.fromSessionId ? (
            <>
              <Text style={styles.hint}>{fromName ? `This session came from ${fromName}’s tag. It’s theirs to tag.` : 'This session came from someone else’s tag. It’s theirs to tag.'}</Text>
              <Submit label="Close" onPress={close} />
            </>
          ) : !canScore(editing.kind) ? (
            <>
              <Text style={styles.hint}>Players can be tagged on a match or a practice.</Text>
              <Submit label="Close" onPress={close} />
            </>
          ) : (
            <>
              {/* How long, as the log has it: hours and minutes (Oct 7). */}
              {timeEditable ? (
                <Section title="How long">
                  <LengthPicker minutes={editMinutes} onChange={setPickedMinutes} />
                </Section>
              ) : null}
              {/* Any tennis session's score (Oct 6): a match's as before; a practice's or drills' is optional and only the sets. */}
              <Section title={editing.kind === 'match' ? 'Score' : 'Score (optional)'} hint={editing.kind === 'match' && editTags.some((t) => t.status === 'accepted') ? 'Changing it asks the players who accepted to confirm again.' : undefined}>
                <ScoreField kind={editing.kind} focus={focus === 'score'} value={editScore} onChange={(next) => { scoreTouched.current = true; setEditScore(next); }} />
              </Section>
              {canTagKind(editing.kind) ? (
                // Its own heading now the sheet is titled for the session ("Edit practice").
                <Section title="Who was there">
                  <WhoYouPlayed
                    kind={editing.kind}
                    players={editPlayers}
                    onPlayers={(next) => { touched.current = true; setEditPlayers(next); }}
                    text={editText}
                    onText={(next) => { touched.current = true; setEditText(next); }}
                    search={sessionTagsReady}
                    status={editStatus}
                    declined={editDeclined}
                    closed={editClosed}
                    onDrop={(id) => { touched.current = true; setDrops((was) => [...was, id]); }}
                  />
                </Section>
              ) : null}
              {timeEditable ? (
                <Section title="When">
                  <DayPicker value={editDay} onChange={setPickedDay} />
                </Section>
              ) : null}
              {reasked.length ? <Text style={styles.hint}>Changing the day or length asks {andList(reasked)} to confirm again.</Text> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Submit label="Save" onPress={() => { void saveEdit(); }} busy={saving} />
            </>
          )}
        </ScrollView>
      ) : waiting || deciding ? (
        <View style={styles.wait}><CourtSpinner size={34} /></View>
      ) : choosing ? (
        <ScrollView contentContainerStyle={formBody}>
          <View style={styles.group}>
            {unlogged.map((x, i) => (
              <Pressable
                key={x.id}
                accessibilityRole="button"
                accessibilityLabel={`Log it: ${activityTitle(x)}, ${duration(x.minutes)}, ${pickSource({ type: 'tracker', activity: x })}, ${activityWhen(x)}`}
                onPress={() => logThis(x)}
                style={({ pressed }) => [styles.pickRow, i > 0 && styles.pickLine, pressed && styles.pressed]}
              >
                <View style={styles.pickIcon}><Ionicons name={isTennisActivity(x) ? 'stopwatch-outline' : workoutIcon(x.sport)} size={18} color={colors.court} /></View>
                <View style={styles.pickWords}>
                  <View style={styles.pickHeroLine}>
                    <Text style={styles.pickHero}>{duration(x.minutes)}</Text>
                    <View style={styles.pickTag}><Text style={styles.pickTagText} numberOfLines={1}>{pickSource({ type: 'tracker', activity: x })}</Text></View>
                  </View>
                  {/* "Run · 3.1 mi", as Your sessions and the note say it. */}
                  <Text style={styles.pickTitle} numberOfLines={1}>{pickTitle(x)}</Text>
                  <Text style={styles.pickWhen}>{activityWhen(x, new Date(), ' · ')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} style={styles.pickChevron} />
              </Pressable>
            ))}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Log one yourself" onPress={() => setByHand(true)} style={({ pressed }) => [styles.second, styles.byHand, pressed && styles.pressed]}>
            <Ionicons name="add" size={18} color={colors.text} />
            <Text style={styles.secondText}>Log one yourself</Text>
          </Pressable>
        </ScrollView>
      ) : done ? (
        <ScrollView contentContainerStyle={formBody}>
          {done.status === 'logged' && postable(done) && !alreadyPosted ? (
            <>
              <Submit label="Post it" onPress={() => { next.current = done.id; close(); }} />
              <Pressable accessibilityRole="button" onPress={close} style={({ pressed }) => [styles.second, pressed && styles.pressed]}>
                <Text style={styles.secondText}>Close</Text>
              </Pressable>
            </>
          ) : (
            <Submit label="Close" onPress={close} />
          )}
        </ScrollView>
      ) : (
        <ScrollView ref={scroller} onScroll={onScroll} scrollEventThrottle={32} contentContainerStyle={formBody} keyboardShouldPersistTaps="handled">
          {gone ? <Text style={styles.notice}>That session is no longer here.</Text> : null}
          {numbers ? <Text style={styles.numbers}>{numbers}</Text> : null}
          {/* The session as it will go in your log, in the sessions' own look: what and when, then the time, big. */}
          {minutes && !fresh ? (
            <View style={styles.hero} accessible accessibilityLabel={`${sessionEyebrow({ kind, day: heroDay, workout: kind === 'fitness' ? workout : undefined }).toLowerCase()}, ${duration(minutes)}`}>
              <Text style={styles.heroEyebrow}>{sessionEyebrow({ kind, day: heroDay, workout: kind === 'fitness' ? workout : undefined })}</Text>
              <View style={styles.heroRow}>
                <Duration minutes={minutes} size={56} color={colors.text} unitColor={colors.textMuted} />
                {kind === 'match' && shownWon ? (
                  <View style={[styles.result, shownWon === 'won' ? styles.resultWon : styles.resultLost]}>
                    <Text style={[styles.resultText, { color: shownWon === 'won' ? colors.brandInk : colors.textMuted }]}>{shownWon === 'won' ? 'Won' : 'Lost'}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}
          <Section title="What was it">
            <Chips value={kind} onChange={(k) => { if (k) setKind(k); }} options={kinds} />
          </Section>
          {/* Fitness can say what it was, the way a workout from the Watch does: "Run", "Gym". */}
          {kind === 'fitness' && !fresh ? (
            <Section title="What kind">
              <Chips clearable value={workout} onChange={setWorkout} options={WORKOUT_KINDS} />
            </Section>
          ) : null}
          <Section title="How long">
            {/* From a tracker the length is simply the tracker's (Oct 3): one line, with Edit for a break (hours and minutes, then Done). */}
            {fresh ? (
              <TrackedLength
                minutes={minutes ?? fresh.minutes}
                trackerMinutes={fresh.minutes}
                tracker={trackerName(fresh)}
                open={editLength}
                onOpen={setEditLength}
                onChange={(m) => setMinutes(m)}
              />
            ) : (
              // Hours and minutes, an hour or five minutes a tap (Oct 7, owner: "just custom").
              <LengthPicker minutes={minutes} onChange={setMinutes} />
            )}
          </Section>
          {kind === 'match' ? (
            <Section title="Result">
              {/* A score that says who won decides it; the chips are for a match with no score, or one level on sets. */}
              {decided === undefined ? (
                <Chips clearable value={won ?? undefined} onChange={(v) => setWon(v ?? null)} options={[{ value: 'won', label: 'Won' }, { value: 'lost', label: 'Lost' }]} />
              ) : null}
              <ScoreField value={score} onChange={setScore} />
            </Section>
          ) : canScore(kind) ? (
            // A practice or drills can be scored too (Oct 6, owner): optional, just the sets.
            <Section title="Score (optional)">
              <ScoreField kind={kind} value={score} onChange={setScore} />
            </Section>
          ) : null}
          {canTagKind(kind) ? (
            <Section title="Who was there">
              <WhoYouPlayed
                kind={kind}
                players={players}
                onPlayers={setPlayers}
                text={opponent}
                onText={setOpponent}
                search={sessionTagsReady}
                suggested={fromHit?.playerIds ?? []}
              />
            </Section>
          ) : null}
          {/* A tracker's session already knows its day. */}
          {fresh ? null : (
            <Section title="When">
              <DayPicker value={playedOn} onChange={setPlayedOn} />
            </Section>
          )}
          {/* Optional, at the foot, folded away (Oct 8, owner): the two taps to log stay two taps. */}
          {canType ? (
            <ManualStats
              open={statsOpen}
              onOpen={(next) => { setStatsOpen(next); setStatsAsked(false); }}
              kcal={kcalText}
              avgHr={hrText}
              onKcal={(t) => { setKcalText(t); setStatsAsked(false); }}
              onAvgHr={(t) => { setHrText(t); setStatsAsked(false); }}
              showProblem={statsAsked}
              note="A post shows them only if you share health data."
            />
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Submit label="Save" onPress={() => { void save(); }} disabled={!minutes} busy={saving && !andPost} waiting="Pick how long" />
          {fresh && postable(fresh) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save and post"
              accessibilityState={{ disabled: !minutes || saving, busy: saving && andPost }}
              disabled={!minutes || saving}
              onPress={() => { void save(true); }}
              style={({ pressed }) => [styles.second, (!minutes || (saving && !andPost)) && styles.secondOff, pressed && styles.pressed]}
            >
              {saving && andPost ? <ActivityIndicator size="small" color={colors.text} /> : null}
              <Text style={styles.secondText}>Save and post</Text>
            </Pressable>
          ) : null}
          {fresh ? (
            <Pressable accessibilityRole="button" accessibilityLabel={isTennisActivity(fresh) ? 'Not tennis? Hide this session' : 'Hide this workout'} hitSlop={8} onPress={() => hide(fresh)} style={({ pressed }) => [styles.hide, pressed && { opacity: 0.6 }]}>
              <Text style={styles.hideText}>{isTennisActivity(fresh) ? 'Not tennis? Hide it' : 'Hide this workout'}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
      </KeyboardScrollContext.Provider>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  error: { ...typography.small, color: colors.danger },
  hero: { gap: 4 },
  heroEyebrow: { ...font('600'), fontSize: 11, letterSpacing: 0.88, color: colors.textMuted },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  result: { height: 30, paddingHorizontal: 12, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  resultWon: { backgroundColor: colors.brand },
  resultLost: { borderWidth: 1, borderColor: colors.borderStrong },
  resultText: { ...font('700'), fontSize: 14 },
  wait: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },
  notice: { ...typography.smallStrong, color: colors.text },
  numbers: { ...typography.caption, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  hint: { ...typography.small, color: colors.textFaint },
  hide: { alignSelf: 'center', paddingVertical: spacing.xs },
  hideText: { ...typography.smallStrong, color: colors.textMuted },
  // The quieter of the two buttons: Save's size and shape, outlined rather than filled.
  second: { flexDirection: 'row', gap: 10, height: 54, marginTop: -spacing.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  secondOff: { opacity: 0.5 },
  secondText: { ...typography.bodyStrong, fontSize: 16, color: colors.text },
  pressed: { opacity: 0.7 },
  // The tracker's sessions waiting to be logged, as Your sessions lists them: how long, big, with the tracker's tag; what; the day and times.
  group: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden', paddingHorizontal: spacing.lg },
  pickRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: 14 },
  pickLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pickIcon: { width: 22, height: 32, alignItems: 'center', justifyContent: 'center' },
  pickWords: { flex: 1, minWidth: 0, gap: 3 },
  pickHeroLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  pickHero: { fontSize: 21, lineHeight: 26, ...font('600'), letterSpacing: -0.5, color: colors.text, fontVariant: ['tabular-nums'] },
  pickTag: { flexShrink: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  pickTagText: { fontSize: 11, lineHeight: 15, ...font('600'), letterSpacing: 0.2, color: colors.textMuted },
  pickTitle: { fontSize: 15, lineHeight: 20, ...font('500'), color: colors.text },
  pickWhen: { fontSize: 14, lineHeight: 19, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  pickChevron: { alignSelf: 'center' },
  byHand: { marginTop: 0 },
});

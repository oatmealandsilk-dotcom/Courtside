import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { CourtSpinner } from '@/components/CourtSpinner';
import { DragSheet } from '@/components/DragSheet';
import { Field } from '@/components/ui';
import { Chips, Section, SheetTitle, Submit, Tiles, formBody } from '@/components/sheet/SheetForm';
import { activityDay, activityWhen, fromWho, privateLine, statsSourceOf } from '@/features/activity/format';
import { postOf, postedIndex } from '@/features/activity/recent';
import { useTennisFlags } from '@/features/activity/useTennisFlags';
import { hitNote, hitPrefill, prefillFor } from '@/features/hits/followUp';
import { localDay } from '@/features/practice/stats';
import type { DetectedActivity, PracticeSession } from '@/data/types';
import { confirm } from '@/lib/confirm';
import { duration } from '@/lib/format';
import { isSupabaseConfigured } from '@/lib/supabase';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';

const KINDS: { value: PracticeSession['kind']; label: string }[] = [
  { value: 'practice', label: 'Practice' },
  { value: 'match', label: 'Match' },
  { value: 'drills', label: 'Drills' },
  { value: 'fitness', label: 'Fitness' },
];
const LENGTHS = [30, 60, 90, 120];
const lengthLabel = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)}½ hr` : `${m / 60} hr`);
const lengthTile = (m: number) => ({ value: m, top: m < 60 ? 'min' : m === 60 ? 'hour' : 'hours', main: m < 60 ? String(m) : m % 60 ? `${Math.floor(m / 60)}½` : String(m / 60), label: lengthLabel(m) });

/** The usual lengths, with the nearest one swapped for the tracker's own minutes, so it sits where it belongs and is picked already. */
function lengthsFor(a: DetectedActivity) {
  const nearest = LENGTHS.reduce((best, m, i) => (Math.abs(m - a.minutes) < Math.abs(LENGTHS[best] - a.minutes) ? i : best), 0);
  const top = a.source === 'whoop' ? 'WHOOP' : statsSourceOf(a) === 'apple-watch' ? 'Watch' : 'Health';
  return LENGTHS.map((m, i) => (i === nearest ? { value: a.minutes, top, main: duration(a.minutes), label: duration(a.minutes) } : lengthTile(m)));
}

/**
 * Log a session in two taps: what it was (practice is picked already) and
 * how long, then Save. A match can say whether you won. Yesterday is one
 * more tap, for the session you forgot to log.
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
 */
export default function LogSession() {
  const styles = useThemedStyles(styleDefinitions);
  const { activity, hit } = useLocalSearchParams<{ activity?: string; hit?: string }>();
  const { actions, detectedActivities, remoteLoaded, hitRequests, currentUserId, users, posts } = useApp();
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
  const postable = (x: DetectedActivity) => (x.source === 'whoop' ? flags.whoop : x.source === 'apple-health' ? flags.apple : false);

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
  const [minutes, setMinutes] = useState<number | null>(fresh ? fresh.minutes : fromHit ? fromHit.minutes : null);
  // A session that arrives after the sheet opened starts on its own length too.
  const [preset, setPreset] = useState(fresh?.id);
  if (fresh && preset !== fresh.id) { setPreset(fresh.id); setMinutes(fresh.minutes); }
  const [won, setWon] = useState<'won' | 'lost' | null>(null);
  // From a hit, a match starts with who played in the opponent box.
  const [opponent, setOpponent] = useState(fromHit?.kind === 'match' ? fromHit.who : '');
  const [when, setWhen] = useState<'today' | 'yesterday'>(fromHit && fromHit.day !== localDay(new Date()) ? 'yesterday' : 'today');
  const [saving, setSaving] = useState(false);
  // Which button the save came from, so only that one spins.
  const [andPost, setAndPost] = useState(false);
  const [error, setError] = useState('');

  const save = async (post = false) => {
    if (!minutes || saving) return;
    setSaving(true);
    setAndPost(post);
    setError('');
    const day = fresh ? activityDay(fresh) : when === 'today' ? localDay(new Date()) : localDay(Date.now() - 86_400_000);
    if (fresh) setFrozen(fresh);
    try {
      await actions.logSession({
        minutes, kind, won: won === 'won' ? true : won === 'lost' ? false : undefined, opponent, day,
        ...(fresh ? { activityId: fresh.id } : {}),
        // From a hit: where it was (and who, unless they are in the opponent box) as the note; the opponent box only for a match.
        ...(fromHit ? { note: hitNote(fromHit, kind), opponent: kind === 'match' ? opponent : undefined } : {}),
      });
      // Posting goes straight on to the new post, which only opens once the
      // save went through, and says "Posted" when shared. A toast there would
      // sit over its Share button for a few seconds.
      if (post && fresh) next.current = fresh.id;
      else showToast({ title: 'Session logged', body: 'Your streak and numbers are up to date.', icon: 'checkmark-circle-outline' });
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

  const hide = (x: DetectedActivity) => confirm({
    title: 'Hide this session?',
    message: 'It won’t count toward your streak.',
    confirmLabel: 'Hide',
    destructive: true,
    onConfirm: () => { setFrozen(x); actions.dismissActivity(x.id); close(); },
  });

  const header = waiting ? (
    <SheetTitle title="Log your tennis" onClose={close} />
  ) : fresh ? (
    <SheetTitle title={fromHit ? 'How was the hit?' : 'Log your tennis'} line={`${fromHit ? `${fromHit.place}. ` : ''}From ${fromWho(fresh)} · ${activityWhen(fresh)}. Only you see this.`} lines={2} onClose={close} />
  ) : done ? (
    <SheetTitle title="Log your tennis" line={done.status === 'logged' ? 'Logged. It counts toward your streak and hours.' : 'You already logged this session.'} lines={2} onClose={close} />
  ) : fromHit ? (
    <SheetTitle title="How was the hit?" line={`${fromHit.place}${fromHit.who ? ` · with ${fromHit.who}` : ''}. Only you see this.`} lines={2} onClose={close} />
  ) : (
    <SheetTitle title="Log a session" line="Keeps your streak, hours and win rate. Only you see it." onClose={close} />
  );
  const numbers = fresh ? privateLine(fresh) : '';
  // Once the sheet is gone: the new post with this session's stats, in this page's place, or back where it was opened from.
  const dismissed = () => (next.current ? router.replace({ pathname: '/compose', params: { activity: next.current } }) : router.back());

  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={dismissed} peekFraction={0.7} header={header}>
      {waiting ? (
        <View style={styles.wait}><CourtSpinner size={34} /></View>
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
        <ScrollView contentContainerStyle={formBody} keyboardShouldPersistTaps="handled">
          {gone ? <Text style={styles.notice}>That session is no longer here.</Text> : null}
          {numbers ? <Text style={styles.numbers}>{numbers}</Text> : null}
          <Section title="What was it">
            <Chips value={kind} onChange={(k) => { if (k) setKind(k); }} options={KINDS} />
          </Section>
          <Section title="How long">
            <Tiles value={minutes ?? 0} onChange={(m) => setMinutes(m)} options={fresh ? lengthsFor(fresh) : LENGTHS.map(lengthTile)} />
            {fresh ? <Text style={styles.hint}>Change the length if you took a break.</Text> : null}
          </Section>
          {kind === 'match' ? (
            <Section title="Result">
              <Chips clearable value={won ?? undefined} onChange={(v) => setWon(v ?? null)} options={[{ value: 'won', label: 'Won' }, { value: 'lost', label: 'Lost' }]} />
              <Field soft value={opponent} onChangeText={setOpponent} placeholder="Opponent (optional)" />
            </Section>
          ) : null}
          {/* A tracker's session already knows its day. */}
          {fresh ? null : (
            <Section title="When">
              <Chips value={when} onChange={(v) => { if (v) setWhen(v); }} options={[{ value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }]} />
            </Section>
          )}
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
            <Pressable accessibilityRole="button" accessibilityLabel="Not tennis? Hide this session" hitSlop={8} onPress={() => hide(fresh)} style={({ pressed }) => [styles.hide, pressed && { opacity: 0.6 }]}>
              <Text style={styles.hideText}>Not tennis? Hide it</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  error: { ...typography.small, color: colors.danger },
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
});

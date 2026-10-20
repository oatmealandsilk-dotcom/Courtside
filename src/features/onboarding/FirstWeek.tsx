import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { DrawnTick } from '@/components/session/DrawnTick';
import { notKnownAdult } from '@/features/players/age';
import * as haptics from '@/lib/haptics';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

/**
 * "Your first week" (Oct 20 sweep, R7: "'Finish setting up' covers only
 * camera, goals and calendar. A short list (follow 3, Open to hit, first
 * session, first post) gives day 2 a reason, with no streak pressure").
 *
 * A short list at the top of Profile for a player's first seven days, each
 * row one tap from doing it:
 *   - Follow 3 players: opens People you may know (setup's own page), which
 *     keeps every suggestion rule (a teen is only ever offered the people
 *     who follow them, an adult never a teen stranger). A teen, or anyone
 *     not known to be an adult, reads "Follow 3 friends".
 *   - Turn on Open to hit: its own sheet. Adults only: a teen's ring is a
 *     place on the map, and teens are kept off strangers' maps, so the list
 *     never nudges them towards it.
 *   - Log your first session: the log sheet.
 *   - Post a clip or ask a question: the composer.
 * A row ticks itself once it is done, wherever it was done; the first time
 * this card sees it done, the tick draws itself in with a little pop and a
 * light buzz (the small reward), and the count goes up. No streaks, no
 * countdown, nothing lost for leaving it: the close button puts it away for
 * good, and it goes by itself after the first week. Once every row is done
 * it says so, until closed. Kept per account on this device.
 */

type Step = 'follow' | 'open' | 'session' | 'post';

/** The list's first week. */
const WEEK_MS = 7 * 86_400_000;
/** Follow this many. */
const FOLLOWS = 3;

const key = (id: string) => `courtside-first-week:${id}`;
interface Kept { closed?: boolean; ticked?: Step[]; opened?: boolean }
async function read(id: string): Promise<Kept> {
  try { const raw = await AsyncStorage.getItem(key(id)); return raw ? (JSON.parse(raw) as Kept) : {}; } catch { return {}; }
}
async function write(id: string, next: Kept): Promise<void> {
  try { await AsyncStorage.setItem(key(id), JSON.stringify(next)); } catch { /* the device keeps nothing: it simply shows again */ }
}

/** Whether the list is up for this account (Profile hides its "Make your first move" card meanwhile: the list's first row is that page). */
export function useFirstWeek(): { showing: boolean; card: React.ReactNode } {
  const { currentUser, currentUserId, followingIds, followRequests, sessions, posts, questions, onboardingComplete } = useApp();
  const [kept, setKept] = useState<Kept | null>(null);
  useEffect(() => {
    setKept(null);
    if (!currentUserId) return undefined;
    let on = true;
    void read(currentUserId).then((k) => { if (on) setKept(k); });
    return () => { on = false; };
  }, [currentUserId]);

  const adult = !!currentUser && !notKnownAdult(currentUser);
  const joined = currentUser?.joinedAt ? Date.parse(currentUser.joinedAt) : NaN;
  const firstWeek = Number.isFinite(joined) && Date.now() - joined < WEEK_MS;
  const follows = !currentUserId ? 0 : followingIds.length + followRequests.filter((r) => r.fromId === currentUserId).length;
  const done = useMemo(() => {
    const d: Record<Step, boolean> = {
      follow: follows >= FOLLOWS,
      // Ever turned on, not only on right now (it runs out at the end of the day); remembered once seen.
      open: !!currentUser?.openToHitUntil || !!kept?.opened,
      session: !!currentUserId && sessions.some((s) => s.userId === currentUserId),
      post: !!currentUserId && (posts.some((p) => p.authorId === currentUserId) || questions.some((q) => q.authorId === currentUserId)),
    };
    // Once ticked, a row stays ticked (an unfollow does not take it back).
    (kept?.ticked ?? []).forEach((s) => { d[s] = true; });
    return d;
  }, [follows, currentUser?.openToHitUntil, kept, currentUserId, sessions, posts, questions]);
  const steps: Step[] = adult ? ['follow', 'open', 'session', 'post'] : ['follow', 'session', 'post'];

  // What this card had not seen done before: drawn in now, then kept as ticked.
  const fresh = useRef<Set<Step>>(new Set());
  useEffect(() => {
    if (!kept || !currentUserId) return;
    const ticked = new Set(kept.ticked ?? []);
    const newly = steps.filter((s) => done[s] && !ticked.has(s));
    const opened = kept.opened || !!currentUser?.openToHitUntil;
    if (!newly.length && opened === !!kept.opened) return;
    newly.forEach((s) => fresh.current.add(s));
    const next = { ...kept, ticked: [...ticked, ...newly], opened };
    setKept(next);
    void write(currentUserId, next);
  }, [kept, done, currentUserId, currentUser?.openToHitUntil]); // eslint-disable-line react-hooks/exhaustive-deps

  const showing = !!currentUser && onboardingComplete && firstWeek && !!kept && !kept.closed;
  if (!showing || !currentUserId) return { showing: false, card: null };
  const close = () => { haptics.untap(); const next = { ...kept, closed: true }; setKept(next); void write(currentUserId, next); };
  return {
    showing,
    card: <FirstWeekCard steps={steps} done={done} fresh={fresh.current} follows={follows} adult={adult} onClose={close} />,
  };
}

const ROWS: Record<Step, { title: (adult: boolean) => string; icon: React.ComponentProps<typeof Ionicons>['name']; go: () => void }> = {
  follow: { title: (adult) => (adult ? 'Follow 3 players' : 'Follow 3 friends'), icon: 'person-add-outline', go: () => router.push({ pathname: '/first-move', params: { from: 'profile' } }) },
  open: { title: () => 'Turn on Open to hit', icon: 'radio-button-on-outline', go: () => router.push('/open-to-hit') },
  session: { title: () => 'Log your first session', icon: 'tennisball-outline', go: () => router.push('/log-session') },
  post: { title: () => 'Post a clip or ask a question', icon: 'videocam-outline', go: () => router.push('/compose') },
};

function FirstWeekCard({ steps, done, fresh, follows, adult, onClose }: { steps: Step[]; done: Record<Step, boolean>; fresh: Set<Step>; follows: number; adult: boolean; onClose: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const count = steps.filter((s) => done[s]).length;
  const all = count === steps.length;
  // The bar fills to the count, gliding when a row has just been done (a transform, never a fade).
  const [barW, setBarW] = useState(0);
  const fill = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    const to = steps.length ? count / steps.length : 0;
    fill.value = reduced ? to : withTiming(to, { duration: 520, easing: Easing.out(Easing.cubic) });
  }, [count, steps.length, reduced, fill]);
  // Until the bar is measured the fill waits out of sight, so it never flashes full.
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: barW ? -barW * (1 - fill.value) : -2000 }] }), [barW]);
  // One light buzz for whatever was just done, the first time the card shows it.
  const buzzed = useRef(false);
  useEffect(() => {
    if (buzzed.current || !steps.some((s) => fresh.has(s))) return;
    buzzed.current = true;
    haptics.reward();
  }, [steps, fresh]);
  return (
    <View style={styles.card} accessibilityLabel={`Your first week, ${count} of ${steps.length} done`}>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title}>{all ? 'You’re all set' : 'Your first week'}</Text>
          <Text style={styles.sub}>{all ? 'Your feed and map are filling up.' : 'A few ways to meet players here.'}</Text>
        </View>
        <Text style={styles.count}>{count}/{steps.length}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close your first week list" hitSlop={10} onPress={onClose} style={styles.close}>
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </Pressable>
      </View>
      <View style={styles.bar} onLayout={(e) => setBarW(e.nativeEvent.layout.width)}>
        <Reanimated.View style={[styles.barFill, fillStyle]} />
      </View>
      {steps.map((s) => (
        <StepRow key={s} title={ROWS[s].title(adult)} icon={ROWS[s].icon} done={done[s]} fresh={fresh.has(s)} onPress={ROWS[s].go}
          note={s === 'follow' && !done.follow && follows > 0 ? `${Math.min(follows, FOLLOWS)} of ${FOLLOWS}` : undefined} />
      ))}
    </View>
  );
}

function StepRow({ title, icon, done, fresh, note, onPress }: { title: string; icon: React.ComponentProps<typeof Ionicons>['name']; done: boolean; fresh: boolean; note?: string; onPress: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const reduced = useReducedMotion();
  // A row just done: its disc pops a little as the tick draws in.
  const pop = useSharedValue(1);
  useEffect(() => {
    if (!fresh || !done || reduced) return;
    pop.value = withSequence(withTiming(1.18, { duration: 160, easing: Easing.out(Easing.cubic) }), withSpring(1, { damping: 14, stiffness: 260 }));
  }, [fresh, done, reduced, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <Pressable accessibilityRole={done ? undefined : 'link'} accessibilityState={{ checked: done }} accessibilityLabel={done ? `${title}, done` : title} disabled={done} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Reanimated.View style={[styles.disc, done ? styles.discDone : null, popStyle]}>
        {done ? (fresh ? <DrawnTick size={14} color={colors.brandInk} delay={120} /> : <Ionicons name="checkmark" size={14} color={colors.brandInk} />) : <Ionicons name={icon} size={14} color={colors.brand} />}
      </Reanimated.View>
      <Text style={[styles.rowText, done && styles.rowDone]} numberOfLines={1}>{title}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      {done ? null : <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />}
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  // The same card as "Make your first move" and "Finish setting up", holding a short list.
  card: { marginTop: 16, paddingTop: 14, paddingBottom: 6, borderRadius: 16, backgroundColor: colors.brandDim, gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 14 },
  title: { ...typography.smallStrong, fontSize: 14, color: colors.text },
  sub: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  count: { ...typography.smallStrong, color: colors.brand },
  close: { padding: 2 },
  bar: { height: 4, borderRadius: 2, marginHorizontal: 14, marginTop: 8, marginBottom: 4, backgroundColor: colors.surface, overflow: 'hidden' },
  barFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius: 2, backgroundColor: colors.brand },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40, paddingHorizontal: 14, paddingVertical: 6 },
  pressed: { opacity: 0.7 },
  disc: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  discDone: { backgroundColor: colors.brand },
  rowText: { ...typography.small, flex: 1, color: colors.text },
  rowDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  note: { ...typography.caption, letterSpacing: 0, textTransform: 'none', color: colors.textMuted },
});

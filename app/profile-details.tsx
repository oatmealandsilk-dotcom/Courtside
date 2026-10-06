import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, type ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { type SharedValue, useSharedValue } from 'react-native-reanimated';

import { CourtSpinner } from '@/components/CourtSpinner';
import { FollowPill } from '@/components/FollowPill';
import { LiveDot } from '@/components/LiveDot';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { Duration } from '@/components/session/Duration';
import { PlayerCard, Swatch, upcoming } from '@/components/tennis/PlayerCard';
import { AddRow, Box, CountdownTile, MedalRow, NextMedal, Row, SectionHead, Tag, Tile } from '@/components/tennis/ProfileParts';
import { PIN_GAP, ProfileTabs } from '@/components/tennis/ProfileTabs';
import { WeekBars } from '@/components/tennis/WeekBars';
import { Tappable } from '@/components/Tappable';
import { BrandWash, EmptyState, Screen } from '@/components/ui';
import type { PracticeSession, User } from '@/data/types';
import { KIND_LABEL, activityDay, loggedLabel, spokenDuration } from '@/features/activity/format';
import { pickSource, sourceOn, sourceWord } from '@/features/activity/recent';
import { firstName, peopleText, peopleWords } from '@/features/activity/sessionTags';
import { canScore } from '@/features/activity/score';
import { useTennisFlags } from '@/features/activity/useTennisFlags';
import { isTennisActivity, workoutIcon } from '@/features/activity/workouts';
import { type ProfileTab, useProfileTab } from '@/features/players/profileTab';
import { dayLabel, eventDate, newestFirst, shortDate, shortLength, surfaceSlot, weekDays, weekNumbers } from '@/features/players/tennisProfile';
import { localDay } from '@/features/practice/stats';
import { wrappedYear } from '@/features/wrapped/yearInTennis';
import { evaluateAchievements, surfaceLabel } from '@/lib/badges';
import { confirm } from '@/lib/confirm';
import { relativeTime } from '@/lib/format';
import { goBack } from '@/lib/goBack';
import { useStillLoading } from '@/lib/useStillLoading';
import { useApp } from '@/store/AppContext';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, pageIsDark, spacing, typography } from '@/theme';

/**
 * The Tennis profile (Oct 5): a player's tennis in one place, yours or
 * anyone's. It opens on their player card (the rating, how they play, the
 * numbers worth knowing).
 *
 * Yours (Oct 5, owner: "A is best sectioning for tennis profile") keeps Log a
 * session and Edit under the card, then sorts everything else into three
 * tabs, one showing at a time, each section in a white box of its own:
 *   Activity: this week (time on court, a small chart, sessions, matches and
 *     the longest), what is waiting on you (tags to answer, workouts to
 *     log), your last three sessions; and your year in tennis while it is out.
 *   Health: today's recovery, sleep and HRV with the way to your trackers,
 *     then the injuries and limits coaches plan around.
 *   Game: tournaments, goals, your gear bag and achievements, each with its
 *     own Add or Edit.
 * Activity and Health are yours alone, each saying so once ("Only you").
 * The tabs stay pinned at the top as you scroll, and the page opens on the
 * one you used last.
 *
 * Someone else's has no buttons and no tabs: their card, then only the Game
 * sections they have filled in, in the same boxes. A private account you
 * don't follow is a locked page with Follow, a blocked or suspended one says
 * the player isn't available, and sessions, health and injuries are never
 * drawn for anyone but their owner. Their tournaments are whatever the data
 * layer shares (plans only reach friends who follow each other).
 */
export default function TennisProfile() {
  const styles = useThemedStyles(styleDefinitions);
  useTheme();
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const { currentUser, currentUserId, users, followingIds, followRequests, blockedIds, actions } = useApp();
  const loading = useStillLoading();
  // The page's scroll, for the tabs to pin themselves at the top and to jump back up to when switched there.
  const offsetY = useSharedValue(0);
  const scrollRef = useRef<ScrollView | null>(null);
  const user = userId ? users.find((u) => u.id === userId) ?? null : currentUser;
  const isMe = !!user && user.id === currentUser?.id;
  // Someone else's tournament plans show only while you follow each other
  // (migration 123): asked again on opening, so a follow-back since the app
  // opened counts, and an unfollow hides them.
  const otherId = user && !isMe ? user.id : null;
  const { loadTournamentPlans } = actions;
  useEffect(() => { if (otherId) void loadTournamentPlans(); }, [otherId, loadTournamentPlans]);

  const shell = (children: React.ReactNode) => <Screen title="Tennis profile" compactTitle onBack={() => goBack()} offsetY={offsetY} scrollRef={scrollRef}>{children}</Screen>;

  if (!user) {
    return shell(loading ? <View style={styles.wait}><CourtSpinner size={28} /></View> : <EmptyState icon="person-outline" title="No such player" />);
  }
  const first = firstName(user.name);
  // The same doors as their profile page (user/[id]): blocked or suspended shows nothing.
  if (!isMe && (blockedIds.includes(user.id) || (!!user.suspended && !currentUser?.isAdmin))) {
    return shell(<Text style={styles.gone}>This player isn’t available</Text>);
  }
  // A private account keeps its tennis (goals, gear, tournaments with their dates and places)
  // for followers they approved: until then, a lock and the way to ask.
  if (!isMe && user.isPrivate && !followingIds.includes(user.id)) {
    const requested = !!currentUserId && followRequests.some((r) => r.fromId === currentUserId && r.toId === user.id);
    return shell(
      <View style={styles.locked}>
        <View style={styles.lockTile}><Ionicons name="lock-closed-outline" size={24} color={colors.textMuted} /></View>
        <Text style={styles.lockedTitle}>{first}’s tennis profile is private</Text>
        <Text style={styles.lockedBody}>{requested ? `Requested. Once ${first} accepts, you’ll see how they play.` : `Follow @${user.handle}. Once ${first} accepts, you’ll see how they play.`}</Text>
        <View style={styles.lockedFollow}><FollowPill following={false} userId={user.id} name={user.name} onPress={() => actions.toggleFollow(user.id)} /></View>
        <Pressable accessibilityRole="link" hitSlop={10} onPress={() => router.push({ pathname: '/user/[id]', params: { id: user.id } })} style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}>
          <Text style={styles.ghostText}>Go to {first}’s profile</Text>
        </Pressable>
      </View>,
    );
  }

  return shell(isMe ? <Mine user={user} offsetY={offsetY} scrollRef={scrollRef} /> : <Theirs user={user} />);
}

/** Your own page: the card, the two buttons, the tabs, and the open tab's sections. */
function Mine({ user, offsetY, scrollRef }: { user: User; offsetY: SharedValue<number>; scrollRef: React.MutableRefObject<ScrollView | null> }) {
  const styles = useThemedStyles(styleDefinitions);
  const { tab, choose, ready } = useProfileTab(user.id);
  // Where the tabs sit on the page, once laid out.
  const tabsAt = useRef<number | null>(null);
  const pick = (next: ProfileTab) => {
    if (next === tab) return;
    // Switched while the tabs ride pinned at the top: the new tab starts just under them, not part way down it.
    const at = tabsAt.current;
    if (at !== null && offsetY.value > at - PIN_GAP) scrollRef.current?.scrollTo({ y: Math.max(0, at - PIN_GAP), animated: false });
    choose(next);
  };
  return (
    <>
      <View style={styles.cardSpot}><PlayerCard user={user} variant="full" /></View>
      <View style={styles.buttons}>
        <View style={styles.primarySpot}>
          <Tappable accessibilityRole="button" accessibilityLabel="Log a session" onPress={() => router.push('/log-session')} scaleTo={0.97} hoverTo={1.02} style={[styles.primary, pageIsDark() ? styles.liftDark : styles.lift]}>
            <BrandWash />
            <View style={styles.pillInner}>
              <Ionicons name="add" size={20} color={colors.brandInk} />
              <Text style={styles.primaryText}>Log a session</Text>
            </View>
          </Tappable>
        </View>
        <Tappable accessibilityRole="button" accessibilityLabel="Edit your tennis profile" onPress={() => router.push({ pathname: '/onboarding', params: { from: 'edit', step: '0' } })} scaleTo={0.97} hoverTo={1.02} style={styles.secondary}>
          <View style={styles.pillInner}>
            <Ionicons name="pencil-outline" size={16} color={colors.text} />
            <Text style={styles.secondaryText}>Edit</Text>
          </View>
        </Tappable>
      </View>
      <ProfileTabs value={ready ? tab : null} onChange={pick} offsetY={offsetY} onPlaced={(y) => { tabsAt.current = y; }} />
      {!ready ? null : tab === 'activity' ? <ActivityTab user={user} /> : tab === 'health' ? <HealthTab user={user} /> : <GameTab user={user} />}
    </>
  );
}

/** This week, what is waiting on you, your last sessions; in December and early January your year in tennis first. */
function ActivityTab({ user }: { user: User }) {
  const styles = useThemedStyles(styleDefinitions);
  const year = wrappedYear();
  return (
    <View style={styles.tabBody}>
      {year ? (
        <Box>
          <Row first lead={<Tile><Ionicons name="sparkles-outline" size={18} color={colors.brand} /></Tile>} title={`Your ${year} in tennis`} chevron accessibilityRole="link" onPress={() => router.push('/wrapped')} />
        </Box>
      ) : null}
      <ThisWeek user={user} />
      <Waiting user={user} />
      <Recent user={user} />
    </View>
  );
}

/** Today's numbers from your tracker, then the injuries and limits coaches plan around. */
function HealthTab({ user }: { user: User }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.tabBody}>
      <Health />
      <Limits user={user} />
    </View>
  );
}

/** What other players see of yours, with your Add and Edit on each. */
function GameTab({ user }: { user: User }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.tabBody}>
      <Tournaments user={user} mine />
      <Goals user={user} mine />
      <Gear user={user} mine />
      <Achievements user={user} mine />
    </View>
  );
}

/** Someone else's: their card, then only the Game sections they have filled in. Never their sessions, health or injuries. */
function Theirs({ user }: { user: User }) {
  const styles = useThemedStyles(styleDefinitions);
  const p = user.profile;
  const gear = p.gear;
  const parts = [
    upcoming(user).length ? <Tournaments key="t" user={user} /> : null,
    p.goals.length ? <Goals key="g" user={user} /> : null,
    gear && (gear.racket || gear.strings || gear.shoes) ? <Gear key="b" user={user} /> : null,
    evaluateAchievements(user).some((a) => a.unlocked) ? <Achievements key="a" user={user} /> : null,
  ].filter(Boolean) as React.ReactElement[];
  const first = firstName(user.name);
  return (
    <>
      <View style={styles.cardSpot}><PlayerCard user={user} variant="full" /></View>
      {parts.length ? <View style={styles.theirBody}>{parts}</View> : null}
      <Text style={styles.allShared}>{parts.length ? `That’s everything ${first} shares.` : `That’s everything ${first} has shared so far.`}</Text>
    </>
  );
}

/**
 * The last seven days (only you see them): time on court in big figures, a
 * small bar a day, then sessions, matches and the longest. Fitness is left
 * out, as on the card.
 */
function ThisWeek({ user }: { user: User }) {
  const styles = useThemedStyles(styleDefinitions);
  const { sessions } = useApp();
  const days = useMemo(() => weekDays(sessions, user.id), [sessions, user.id]);
  const n = useMemo(() => weekNumbers(sessions, user.id), [sessions, user.id]);
  const total = days.reduce((sum, d) => sum + d.minutes, 0);
  const matches = n.matches && n.told ? `${n.won}–${n.lost}` : String(n.matches);
  const matchesSpoken = n.matches && n.told ? `${n.matches} ${n.matches === 1 ? 'match' : 'matches'}, ${n.won} won, ${n.lost} lost` : `${n.matches} ${n.matches === 1 ? 'match' : 'matches'}`;
  return (
    <View>
      <SectionHead title="This week" onlyYou />
      <Box padded>
        {total > 0 ? (
          <View accessible accessibilityLabel={`${spokenDuration(total)} on court in the last 7 days`}>
            <Duration minutes={total} size={34} color={colors.text} unitColor={colors.textMuted} />
            <Text style={styles.weekCaption}>on court in the last 7 days</Text>
          </View>
        ) : <Text style={styles.weekNone}>Nothing on court in the last 7 days</Text>}
        <WeekBars days={days} />
        {n.sessions ? (
          <View style={styles.weekStats}>
            <View style={styles.weekStat} accessible accessibilityLabel={`${n.sessions} ${n.sessions === 1 ? 'session' : 'sessions'}`}>
              <Text maxFontSizeMultiplier={1.25} style={styles.weekFigure}>{n.sessions}</Text>
              <Text style={styles.weekLabel}>{n.sessions === 1 ? 'Session' : 'Sessions'}</Text>
            </View>
            <View style={[styles.weekStat, styles.weekDivide]} accessible accessibilityLabel={matchesSpoken}>
              <Text maxFontSizeMultiplier={1.25} style={styles.weekFigure}>{matches}</Text>
              <Text style={styles.weekLabel}>{n.matches === 1 && !n.told ? 'Match' : 'Matches'}</Text>
            </View>
            <View style={[styles.weekStat, styles.weekDivide]} accessible accessibilityLabel={`Longest, ${spokenDuration(n.longest)}`}>
              <Duration minutes={n.longest} size={20} color={colors.text} unitColor={colors.textMuted} unitScale={0.65} />
              <Text style={styles.weekLabel}>Longest</Text>
            </View>
          </View>
        ) : null}
      </Box>
    </View>
  );
}

/** "Yesterday’s match", "Saturday’s practice", "Match on Sep 28": a tagged session, said the short way. */
function taggedWhat(kind: PracticeSession['kind'], day: string): string {
  const what = kind === 'fitness' ? 'workout' : KIND_LABEL[kind].toLowerCase();
  const when = dayLabel(day);
  return /\d/.test(when) ? `${what.charAt(0).toUpperCase()}${what.slice(1)} on ${when}` : `${when}’s ${what}`;
}

/** "WHOOP", "WHOOP and Apple Watch", "WHOOP, Oura and Apple Watch". */
const andList = (words: string[]) => (words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

/**
 * What is waiting on you (only you see it): someone's tag waiting for your
 * yes, then a tracker's workout waiting to be logged. Nothing at all while
 * nothing waits.
 */
function Waiting({ user }: { user: User }) {
  const { sessionTags, users, detectedActivities, currentUserId } = useApp();
  const flags = useTennisFlags();
  const waiting = useMemo(
    () => detectedActivities.filter((a) => a.userId === user.id && a.status === 'new' && sourceOn(a, flags)).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [detectedActivities, user.id, flags],
  );
  // Tags of you still to answer, as Your sessions lists them (only from players still here).
  const asking = useMemo(
    () => sessionTags.filter((t) => t.taggedId === currentUserId && t.status === 'pending' && !t.dropped && users.some((u) => u.id === t.taggerId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [sessionTags, currentUserId, users],
  );
  const tagger = asking[0] ? users.find((u) => u.id === asking[0].taggerId) : undefined;
  const ask = asking.length && tagger ? asking[0] : undefined;
  const w = waiting[0];
  if (!ask && !w) return null;
  const what = w && isTennisActivity(w) ? 'session' : 'workout';
  const sources = andList([...new Set(waiting.map((a) => sourceWord(a)))]);
  return (
    <View>
      {/* One for each row, as the mock counts them; each row says its own number ("4 workouts to log"). */}
      <SectionHead title="Waiting on you" count={(ask ? 1 : 0) + (w ? 1 : 0)} />
      <Box>
        {ask && tagger ? (
          <Row first
            lead={<Tile icon="pricetag-outline" />}
            title={asking.length === 1 ? `${firstName(tagger.name)} tagged you` : `${asking.length} players tagged you`}
            sub={asking.length === 1 ? `${taggedWhat(ask.kind, ask.day)} · Accept or decline` : 'Accept or decline'}
            chevron
            accessibilityRole="link"
            onPress={() => router.push('/your-sessions')}
          />
        ) : null}
        {w ? (
          <Row first={!ask}
            lead={<Tile><LiveDot size={8} /></Tile>}
            title={waiting.length === 1 ? `1 ${what} from ${pickSource({ type: 'tracker', activity: w })} to log` : `${waiting.length} workouts to log`}
            sub={waiting.length === 1 ? `${dayLabel(activityDay(w))} · ${shortLength(w.minutes)}` : `From ${sources || 'your trackers'}`}
            chevron
            onPress={() => (waiting.length === 1 ? router.push({ pathname: '/compose', params: { activity: w.id } }) : router.push('/your-sessions'))}
          />
        ) : null}
      </Box>
    </View>
  );
}

/**
 * Your last three sessions (only you see them). "See all" is always there,
 * since Your sessions also keeps the tags, past workouts and the
 * every-workout offer. Hold a session to remove it.
 */
function Recent({ user }: { user: User }) {
  const { sessions, sessionTags, users, currentUserId, actions } = useApp();
  const recent = useMemo(() => sessions.filter((s) => s.userId === user.id).sort(newestFirst).slice(0, 3), [sessions, user.id]);
  const remove = (s: PracticeSession) => confirm({ title: 'Remove this session?', message: 'It comes off your streak and totals.', confirmLabel: 'Remove', destructive: true, onConfirm: () => actions.deleteSession(s.id) });
  return (
    <View>
      <SectionHead title="Recent sessions" link={{ label: 'See all', accessibilityLabel: 'See all your sessions', onPress: () => router.push('/your-sessions') }} />
      <Box>
        {recent.length
          ? recent.map((s, i) => <SessionRow key={s.id} session={s} first={i === 0} me={currentUserId} sessionTags={sessionTags} users={users} onRemove={() => remove(s)} />)
          : <AddRow icon="stopwatch-outline" title="Log your first session" sub="It builds your record, hours and streak." onPress={() => router.push('/log-session')} />}
      </Box>
    </View>
  );
}

/** One logged session: what it was, who and when, and how long. A tap opens the same sheet Your sessions does; a hold offers to remove it. */
function SessionRow({ session: s, first, me, sessionTags, users, onRemove }: { session: PracticeSession; first: boolean; me: string | null; sessionTags: ReturnType<typeof useApp>['sessionTags']; users: User[]; onRemove: () => void }) {
  // As Your sessions reads it: a copy from someone's tag reads as yours, shared with you, and opens that tag.
  const from = s.fromSessionId ? sessionTags.find((t) => t.taggedId === me && (t.mirroredSessionId === s.id || t.sessionId === s.fromSessionId)) : undefined;
  const fromWho = from ? users.find((u) => u.id === from.taggerId) : undefined;
  const fromFirst = fromWho ? firstName(fromWho.name) : '';
  const people = from && fromFirst ? null : peopleWords(s, sessionTags, users);
  const who = from && fromFirst ? (s.kind === 'match' && from.role === 'opponent' ? `vs ${fromFirst}` : `with ${fromFirst}`) : people ? peopleText(people, false) : '';
  const note = s.note && !from ? s.note : '';
  const place = note.startsWith('At ') ? note.slice(3).split(' · ')[0] : '';
  const sub = [who, dayLabel(s.day), place].filter(Boolean).join(' · ');
  const onOpen = from ? () => router.push({ pathname: '/session-tag', params: { tag: from.id } })
    : canScore(s.kind) && !s.fromSessionId ? () => router.push({ pathname: '/log-session', params: { edit: s.id } })
    : undefined;
  const icon = s.kind === 'match' ? <Ionicons name="trophy-outline" size={18} color={colors.textMuted} />
    : s.kind === 'practice' ? <CourtGlyph size={15} color={colors.textMuted} />
    : <Ionicons name={s.kind === 'fitness' && s.workout ? workoutIcon(s.workout) : 'barbell-outline'} size={18} color={colors.textMuted} />;
  return (
    <Row first={first} minHeight={60} lead={<Tile>{icon}</Tile>} title={loggedLabel(s)} sub={sub}
      right={<Duration minutes={s.minutes} size={15} color={colors.text} unitColor={colors.textMuted} unitScale={0.8} />}
      onPress={onOpen}
      onLongPress={{ label: 'Remove', run: onRemove }}
      accessibilityLabel={`${loggedLabel(s)}${sub ? `, ${sub}` : ''}, ${shortLength(s.minutes)}${onOpen ? '. Open' : ''}`}
    />
  );
}

/**
 * Today's recovery, sleep and HRV from your tracker (only you see them), and
 * the way to the Health page. Numbers only; never advice. A reading from an
 * earlier day says which day, under "Latest".
 */
function Health() {
  const styles = useThemedStyles(styleDefinitions);
  const { healthHistory, integrations } = useApp();
  const latest = healthHistory[0];
  if (!latest) {
    return (
      <View>
        <SectionHead title="Recovery and sleep" onlyYou />
        <Box>
          <AddRow icon="pulse-outline" title="Connect a tracker" sub="Recovery, sleep and food from WHOOP, Apple Watch, Fitbit, Oura or Polar." onPress={() => router.push('/health')} />
        </Box>
      </View>
    );
  }
  const source = integrations.filter((i) => i.connected && i.category === 'wearable').sort((a, b) => (b.lastSyncedAt ?? '').localeCompare(a.lastSyncedAt ?? ''))[0];
  const ago = source?.lastSyncedAt ? relativeTime(source.lastSyncedAt) : '';
  const synced = !ago ? '' : ago === 'just now' ? 'synced just now' : /\d[mh]$/.test(ago) ? `synced ${ago} ago` : `synced ${ago}`;
  // A plain YYYY-MM-DD (as the server keeps it) is read as it is, never through a Date (which takes it
  // as UTC midnight, a day early in America). A full timestamp (the demo's) is read on this phone's
  // clock: its UTC date is tomorrow every American evening.
  const dayWord = dayLabel(latest.date.length > 10 ? localDay(latest.date) : latest.date);
  const recent = dayWord === 'Today' || dayWord === 'Yesterday';
  const from = source ? (recent ? `From ${source.label}` : `${dayWord}, from ${source.label}`) : recent ? '' : dayWord;
  const line = [from, synced].filter(Boolean).join(' · ');
  const sleepMin = Math.round((latest.sleepHours || 0) * 60);
  const cells: { label: string; icon: 'pulse-outline' | 'moon-outline' | 'heart-outline'; parts: [string, string][]; spoken: string }[] = [
    { label: 'Recovery', icon: 'pulse-outline', parts: latest.recovery ? [[String(latest.recovery), '%']] : [], spoken: latest.recovery ? `Recovery ${latest.recovery} percent` : 'Recovery not read' },
    { label: 'Sleep', icon: 'moon-outline', parts: sleepMin ? (sleepMin >= 60 ? [[String(Math.floor(sleepMin / 60)), 'h'], ...(sleepMin % 60 ? [[String(sleepMin % 60).padStart(2, '0'), 'm'] as [string, string]] : [])] : [[String(sleepMin), 'm']]) : [], spoken: sleepMin ? `Sleep ${shortLength(sleepMin)}` : 'Sleep not read' },
    { label: 'HRV', icon: 'heart-outline', parts: latest.hrvMs ? [[String(latest.hrvMs), ' ms']] : [], spoken: latest.hrvMs ? `HRV ${latest.hrvMs} milliseconds` : 'HRV not read' },
  ];
  return (
    <View>
      <SectionHead title={recent ? dayWord : 'Latest'} onlyYou line={line || undefined} />
      <Box>
        <View style={styles.healthRow}>
          {cells.map((c, i) => (
            <View key={c.label} accessible accessibilityLabel={c.spoken} style={[styles.healthCell, i > 0 && styles.healthDivide]}>
              <View style={styles.healthLabelRow}>
                <Ionicons name={c.icon} size={12} color={colors.textMuted} />
                <Text style={styles.healthLabel}>{c.label}</Text>
              </View>
              <Text maxFontSizeMultiplier={1.25} style={styles.healthFigure}>
                {c.parts.length ? c.parts.map(([n, u], j) => <React.Fragment key={j}>{j > 0 ? ' ' : ''}{n}<Text style={styles.healthUnit}>{u}</Text></React.Fragment>) : '—'}
              </Text>
            </View>
          ))}
        </View>
        <Row minHeight={52} title="Trackers, sleep and food" chevron accessibilityRole="link" onPress={() => router.push('/health')} />
      </Box>
    </View>
  );
}

/** What coaches plan around: injuries and time limits, only ever yours to see. */
function Limits({ user }: { user: User }) {
  const shown = user.profile.constraints.filter((c) => c.active);
  const add = () => router.push({ pathname: '/tennis-sheet', params: { kind: 'limit' } });
  return (
    <View>
      <SectionHead title="Injuries and limits" line={shown.length ? 'Coaches plan around these.' : undefined} link={shown.length ? { label: 'Add', accessibilityLabel: 'Add an injury or a time limit', onPress: add } : undefined} />
      <Box>
        {shown.length ? shown.map((c, i) => (
          <Row key={c.id} first={i === 0} lead={<Tile icon={c.kind === 'injury' ? 'bandage-outline' : 'calendar-outline'} />} title={c.label} sub={c.note} subLines={3}
            onPress={() => router.push({ pathname: '/tennis-sheet', params: { kind: 'limit', id: c.id } })}
            accessibilityLabel={`${c.kind === 'injury' ? 'Injury' : 'Limit'}: ${c.label}${c.note ? `. ${c.note}` : ''}. Edit or remove`}
          />
        )) : <AddRow icon="bandage-outline" title="Add an injury or a time limit" sub="A sore shoulder, or courts only before 8am: coaches plan around it." onPress={add} />}
      </Box>
    </View>
  );
}

/** Tournaments still to come, each counting down in its court's colour. */
function Tournaments({ user, mine = false }: { user: User; mine?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const list = upcoming(user);
  const entered = list.filter((t) => t.registered).length;
  const watching = list.length - entered;
  const edit = () => router.push({ pathname: '/onboarding', params: { from: 'edit', step: '4' } });
  const line = list.length ? [entered ? `${entered} entered` : '', watching ? `${watching} watching` : ''].filter(Boolean).join(' · ') : undefined;
  return (
    <View>
      <SectionHead title="Tournaments" line={line} link={mine && list.length ? { label: 'Edit', accessibilityLabel: 'Edit your tournaments', onPress: edit } : undefined} />
      <Box>
        {list.length ? list.map((t, i) => (
          <Row key={t.id} first={i === 0} minHeight={80} leadWidth={56}
            lead={<CountdownTile iso={t.startsAt} slot={surfaceSlot(t.surface)} />}
            // The tag beside the name, so the date and place under it have the box's whole width.
            title={(
              <View style={styles.eventTop}>
                <Text style={[styles.eventName, styles.shrink]} numberOfLines={2}>{t.name}</Text>
                <Tag label={t.registered ? 'Entered' : 'Watching'} on={t.registered} />
              </View>
            )}
            sub={(
              <View style={styles.eventLine}>
                <Text style={[styles.eventMeta, styles.keep]}>{eventDate(t.startsAt)} · </Text>
                <Swatch surface={t.surface} look={{ wash: null, ink: colors.text }} size={8} />
                <Text style={[styles.eventMeta, styles.shrink]} numberOfLines={1}>{surfaceLabel[t.surface]}{t.location ? ` · ${t.location.split(',')[0]}` : ''}</Text>
              </View>
            )}
            accessibilityLabel={`${t.name}, ${eventDate(t.startsAt)}, ${surfaceLabel[t.surface]} court${t.location ? `, ${t.location}` : ''}. ${t.registered ? 'Entered' : 'Watching'}`}
          />
        )) : mine ? <AddRow icon="trophy-outline" title="Add a tournament" sub="A date on the calendar gives your training a target." onPress={edit} /> : null}
      </Box>
    </View>
  );
}

/** Goals, open ones first; yours to tick off, change or add to. */
function Goals({ user, mine = false }: { user: User; mine?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const goals = [...user.profile.goals].sort((a, b) => Number(a.done) - Number(b.done));
  const open = goals.filter((g) => !g.done).length;
  const done = goals.length - open;
  const line = goals.length ? [open ? `${open} in progress` : 'All done', done && open ? `${done} done` : ''].filter(Boolean).join(' · ') : undefined;
  const add = () => router.push({ pathname: '/tennis-sheet', params: { kind: 'goal' } });
  return (
    <View>
      <SectionHead title="Goals" line={line} link={mine && goals.length ? { label: 'Add', accessibilityLabel: 'Add a goal', onPress: add } : undefined} />
      <Box>
        {goals.map((g, i) => (
          <Row key={g.id} first={i === 0}
            lead={<Ionicons name={g.done ? 'checkmark-circle' : 'flag-outline'} size={g.done ? 20 : 18} color={g.done ? colors.brand : colors.textFaint} />}
            title={<Text style={[styles.goal, g.done && styles.goalDone]} numberOfLines={3}>{g.label}</Text>}
            right={g.targetDate ? <Text style={styles.goalBy}>by {shortDate(g.targetDate)}</Text> : undefined}
            onPress={mine ? () => router.push({ pathname: '/tennis-sheet', params: { kind: 'goal', id: g.id } }) : undefined}
            accessibilityLabel={`${g.label}${g.targetDate ? `, by ${shortDate(g.targetDate)}` : ''}${g.done ? ', done' : ''}${mine ? '. Mark done, edit or remove' : ''}`}
          />
        ))}
        {mine && !goals.length ? <AddRow icon="flag-outline" title="Add a goal" sub="Something to aim at. Coaches plan toward it." onPress={add} /> : null}
      </Box>
    </View>
  );
}

/** What they play with: the racket and its strings on one row, the shoes on another. */
function Gear({ user, mine = false }: { user: User; mine?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const g = user.profile.gear ?? {};
  const tension = g.tension ? (/^\d+(\.\d+)?$/.test(g.tension.trim()) ? `${g.tension.trim()} lbs` : g.tension.trim()) : '';
  const strung = g.strings ? `${g.strings}${tension ? ` at ${tension}` : ''}` : tension ? `Strung at ${tension}` : '';
  const rows: { key: string; icon: 'tennisball-outline' | 'footsteps-outline'; title: string; sub: string }[] = [];
  if (g.racket) rows.push({ key: 'racket', icon: 'tennisball-outline', title: g.racket, sub: ['Racket', strung].filter(Boolean).join(' · ') });
  else if (strung) rows.push({ key: 'strings', icon: 'tennisball-outline', title: g.strings || strung, sub: g.strings && tension ? `Strings at ${tension}` : 'Strings' });
  if (g.shoes) rows.push({ key: 'shoes', icon: 'footsteps-outline', title: g.shoes, sub: 'Shoes' });
  return (
    <View>
      <SectionHead title="Gear bag" link={mine && rows.length ? { label: 'Edit', accessibilityLabel: 'Edit your gear bag', onPress: () => router.push('/edit-gear') } : undefined} />
      <Box>
        {rows.length ? rows.map((r, i) => (
          <Row key={r.key} first={i === 0} lead={<Tile icon={r.icon} />} title={<Text style={styles.gearName} numberOfLines={2}>{r.title}</Text>} sub={r.sub} subLines={2} accessibilityLabel={`${r.sub.split(' · ')[0]}: ${r.title}${r.sub.includes(' · ') ? `, ${r.sub.split(' · ').slice(1).join(', ')}` : ''}`} />
        )) : mine ? <AddRow icon="tennisball-outline" title="Add your racket, strings and shoes" sub="Players always ask." onPress={() => router.push('/edit-gear')} /> : null}
      </Box>
    </View>
  );
}

/**
 * Medals won, in a row that scrolls sideways; yours also show the one
 * nearest to winning, with a bar, and open the full set. Before the first,
 * the first medal waits, faint.
 */
function Achievements({ user, mine = false }: { user: User; mine?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const all = evaluateAchievements(user);
  const won = all.filter((a) => a.unlocked);
  const next = mine ? all.filter((a) => !a.unlocked).sort((a, b) => b.progress - a.progress)[0] : undefined;
  const firstMedal = (all.find((a) => a.achievement.id === 'ach-first-serve') ?? all[0])?.achievement;
  const line = mine ? `${won.length} of ${all.length} unlocked` : `${won.length} unlocked`;
  return (
    <View>
      <SectionHead title="Achievements" line={won.length || !mine ? line : undefined} link={mine ? { label: 'See all', accessibilityLabel: 'See all achievements', onPress: () => router.push({ pathname: '/tennis-sheet', params: { kind: 'achievements' } }) } : undefined} />
      <Box>
        {/* Before the first medal: not a third way to log a session (the button and Your sessions have that), the medal it unlocks, still faint. */}
        {won.length ? <View style={styles.medals}><MedalRow items={all} /></View> : mine && firstMedal ? (
          <Row first
            lead={<View style={styles.medalWaiting}><Ionicons name={firstMedal.icon as keyof typeof Ionicons.glyphMap} size={18} color={colors.textFaint} /></View>}
            title={<Text style={styles.medalWaitingName}>{firstMedal.name}</Text>}
            sub="Your first session unlocks it"
            accessibilityLabel={`${firstMedal.name}, locked. Your first session unlocks it`}
          />
        ) : null}
        {won.length && next ? <NextMedal next={next} /> : null}
      </Box>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wait: { paddingVertical: 60, alignItems: 'center' },
  pressed: { opacity: 0.6 },
  shrink: { flexShrink: 1 },
  cardSpot: { marginTop: 6 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: spacing.lg },
  pillInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  primarySpot: { flex: 1 },
  primary: { height: 50, borderRadius: 999, backgroundColor: colors.brand, justifyContent: 'center', overflow: 'visible' },
  // The one shadow on the page: the primary action's, in its own colour (plain dark on a dark page).
  lift: { shadowColor: colors.brand, shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  liftDark: { shadowColor: '#000000', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  primaryText: { ...typography.bodyStrong, color: colors.brandInk },
  secondary: { height: 50, paddingHorizontal: 20, borderRadius: 999, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderStrong, justifyContent: 'center' },
  secondaryText: { ...typography.bodyStrong, color: colors.text },
  // A tab's sections, each in its box, with room between them.
  tabBody: { gap: spacing.xxl, paddingTop: spacing.xl },
  theirBody: { gap: spacing.xxl, paddingTop: spacing.xxl },
  gone: { ...typography.body, color: colors.textMuted, textAlign: 'center', paddingVertical: 64 },
  locked: { alignItems: 'center', paddingTop: 56, paddingHorizontal: spacing.xl, gap: spacing.sm },
  lockTile: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  lockedTitle: { ...typography.heading, color: colors.text, textAlign: 'center' },
  lockedBody: { ...typography.small, lineHeight: 19, color: colors.textMuted, textAlign: 'center', maxWidth: 300 },
  lockedFollow: { marginTop: spacing.md },
  ghost: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  ghostText: { ...typography.smallStrong, color: colors.textMuted },
  allShared: { ...typography.small, color: colors.textFaint, textAlign: 'center', paddingTop: spacing.xxl },
  weekCaption: { ...typography.small, color: colors.textMuted, marginTop: 4 },
  weekNone: { ...typography.body, ...font('500'), color: colors.textMuted },
  weekStats: { flexDirection: 'row', marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  weekStat: { flex: 1, gap: 2 },
  weekDivide: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border, paddingLeft: spacing.md },
  weekFigure: { ...font('600'), fontSize: 20, lineHeight: 22, letterSpacing: -0.8, color: colors.text, fontVariant: ['tabular-nums'] },
  weekLabel: { fontSize: 12, lineHeight: 16, color: colors.textMuted },
  healthRow: { flexDirection: 'row', paddingTop: 14, paddingBottom: 14 },
  healthCell: { flex: 1, gap: 4 },
  healthDivide: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border, paddingLeft: spacing.md },
  healthLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  // Health in the page's own ink, not the brand's: it is not a tennis score.
  healthFigure: { ...font('600'), fontSize: 26, lineHeight: 31, letterSpacing: -1.2, color: colors.text, fontVariant: ['tabular-nums'] },
  healthUnit: { ...font('500'), fontSize: 14, letterSpacing: 0, color: colors.textMuted },
  healthLabel: { fontSize: 12, lineHeight: 16, color: colors.textMuted },
  eventTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  keep: { flexShrink: 0 },
  eventName: { ...font('500'), fontSize: 16, lineHeight: 21, color: colors.text },
  eventLine: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  eventMeta: { ...typography.small, lineHeight: 18, color: colors.textMuted },
  goal: { ...typography.body, lineHeight: 20, color: colors.text },
  goalDone: { color: colors.textMuted },
  goalBy: { ...typography.small, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  medals: { paddingTop: spacing.sm, paddingBottom: spacing.xs },
  medalWaiting: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  medalWaitingName: { ...typography.body, ...font('500'), lineHeight: 20, color: colors.textMuted },
  gearName: { ...font('500'), fontSize: 16, lineHeight: 21, color: colors.text },
});

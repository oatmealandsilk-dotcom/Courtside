import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { FollowPill } from '@/components/FollowPill';
import { LiveDot } from '@/components/LiveDot';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { Duration } from '@/components/session/Duration';
import { PlayerCard, Swatch, upcoming } from '@/components/tennis/PlayerCard';
import { AddRow, CountdownTile, MedalRow, Row, SectionHead, Tag, Tile } from '@/components/tennis/ProfileParts';
import { Tappable } from '@/components/Tappable';
import { BrandWash, DottedRule, EmptyState, Screen } from '@/components/ui';
import type { PracticeSession, User } from '@/data/types';
import { activityDay, loggedLabel } from '@/features/activity/format';
import { pickSource, sourceOn } from '@/features/activity/recent';
import { canTagKind, firstName, peopleText, peopleWords } from '@/features/activity/sessionTags';
import { useTennisFlags } from '@/features/activity/useTennisFlags';
import { isTennisActivity, workoutIcon } from '@/features/activity/workouts';
import { dayLabel, eventDate, newestFirst, shortDate, shortLength, surfaceSlot, weekOnCourt } from '@/features/players/tennisProfile';
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
 * anyone's. It opens on their player card (the rating on its own ruler, how
 * they play, the numbers worth knowing) and then reads as a page of quiet
 * sections on dotted rules.
 *
 * Yours is your tennis hub: Log a session and Edit under the card, your year
 * in tennis while it is out, then what only you see (your sessions, your
 * health numbers, the injuries and limits coaches plan around, each marked
 * with a lock), then tournaments, goals, your gear bag and achievements, each
 * with its own Add or Edit.
 *
 * Someone else's shows only what they could see before: a private account
 * you don't follow is a locked page with Follow, a blocked or suspended one
 * says the player isn't available, and sessions, health and injuries are
 * never drawn for anyone but their owner. Their tournaments are whatever the
 * data layer shares (plans only reach friends who follow each other).
 */
export default function TennisProfile() {
  const styles = useThemedStyles(styleDefinitions);
  useTheme();
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const { currentUser, currentUserId, users, followingIds, followRequests, blockedIds, actions } = useApp();
  const loading = useStillLoading();
  const user = userId ? users.find((u) => u.id === userId) ?? null : currentUser;
  const isMe = !!user && user.id === currentUser?.id;
  // Someone else's tournament plans show only while you follow each other
  // (migration 123): asked again on opening, so a follow-back since the app
  // opened counts, and an unfollow hides them.
  const otherId = user && !isMe ? user.id : null;
  const { loadTournamentPlans } = actions;
  useEffect(() => { if (otherId) void loadTournamentPlans(); }, [otherId, loadTournamentPlans]);

  const shell = (children: React.ReactNode) => <Screen title="Tennis profile" compactTitle onBack={() => goBack()}>{children}</Screen>;

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

  return shell(isMe ? <Mine user={user} /> : <Theirs user={user} />);
}

/** Your own page, top to bottom. */
function Mine({ user }: { user: User }) {
  const styles = useThemedStyles(styleDefinitions);
  const year = wrappedYear();
  return (
    <>
      <View style={styles.cardSpot}><PlayerCard user={user} variant="full" isMe /></View>
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
      {/* December to mid-January: the year's recap, a row of its own. */}
      {year ? (
        <View style={styles.yearRow}>
          <Row first lead={<Tile><Ionicons name="sparkles-outline" size={18} color={colors.brand} /></Tile>} title={`Your ${year} in tennis`} chevron accessibilityRole="link" onPress={() => router.push('/wrapped')} />
        </View>
      ) : null}
      <DottedRule />
      <Sessions user={user} />
      <DottedRule />
      <Health />
      <DottedRule />
      <Limits user={user} />
      <DottedRule />
      <Tournaments user={user} mine />
      <DottedRule />
      <Goals user={user} mine />
      <DottedRule />
      <Gear user={user} mine />
      <DottedRule />
      <Achievements user={user} mine />
    </>
  );
}

/** Someone else's: their card, then only the sections they have filled in. Never their sessions, health or injuries. */
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
  return (
    <>
      <View style={styles.cardSpot}><PlayerCard user={user} variant="full" /></View>
      {parts.length ? parts.map((part) => <React.Fragment key={part.key}><DottedRule />{part}</React.Fragment>) : (
        <Text style={styles.allShared}>That’s everything {firstName(user.name)} has shared so far.</Text>
      )}
    </>
  );
}

/**
 * Your last three sessions (only you see them): someone's tag waiting for
 * your yes first, then a tracker's workout waiting to be logged. "See all"
 * is always there, since Your sessions also keeps the tags, past workouts
 * and the every-workout offer. Hold a session to remove it.
 */
function Sessions({ user }: { user: User }) {
  const { sessions, sessionTags, users, detectedActivities, currentUserId, actions } = useApp();
  const flags = useTennisFlags();
  const recent = useMemo(() => sessions.filter((s) => s.userId === user.id).sort(newestFirst).slice(0, 3), [sessions, user.id]);
  const waiting = useMemo(
    () => detectedActivities.filter((a) => a.userId === user.id && a.status === 'new' && sourceOn(a, flags)).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [detectedActivities, user.id, flags],
  );
  // Tags of you still to answer, as Your sessions lists them (only from players still here).
  const asking = useMemo(
    () => sessionTags.filter((t) => t.taggedId === currentUserId && t.status === 'pending' && !t.dropped && users.some((u) => u.id === t.taggerId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [sessionTags, currentUserId, users],
  );
  const week = weekOnCourt(sessions, user.id);
  const nothing = !recent.length && !waiting.length && !asking.length;
  // An empty section says one thing, on its row; the line is for what is there.
  const line = week > 0 ? `${shortLength(week)} on court in the last 7 days` : nothing ? undefined : 'Nothing on court in the last 7 days';
  const w = waiting[0];
  const what = w && isTennisActivity(w) ? 'session' : 'workout';
  const tagger = asking[0] ? users.find((u) => u.id === asking[0].taggerId) : undefined;
  const remove = (s: PracticeSession) => confirm({ title: 'Remove this session?', message: 'It comes off your streak and totals.', confirmLabel: 'Remove', destructive: true, onConfirm: () => actions.deleteSession(s.id) });
  return (
    <View>
      <SectionHead title="Your sessions" lock line={line} link={{ label: 'See all', accessibilityLabel: 'See all your sessions', onPress: () => router.push('/your-sessions') }} />
      {asking.length && tagger ? (
        <Row first
          lead={<Tile icon="pricetag-outline" />}
          title={asking.length === 1 ? `${firstName(tagger.name)} tagged you` : `${asking.length} players tagged you`}
          sub="Accept or decline"
          chevron
          accessibilityRole="link"
          onPress={() => router.push('/your-sessions')}
        />
      ) : null}
      {w ? (
        <Row first={!asking.length}
          lead={<Tile><LiveDot size={8} /></Tile>}
          title={waiting.length === 1 ? `1 ${what} from ${pickSource({ type: 'tracker', activity: w })} to log` : `${waiting.length} workouts to log`}
          sub={waiting.length === 1 ? `${dayLabel(activityDay(w))} · ${shortLength(w.minutes)}` : 'From your trackers'}
          chevron
          onPress={() => (waiting.length === 1 ? router.push({ pathname: '/compose', params: { activity: w.id } }) : router.push('/your-sessions'))}
        />
      ) : null}
      {recent.map((s, i) => <SessionRow key={s.id} session={s} first={!w && !asking.length && i === 0} me={currentUserId} sessionTags={sessionTags} users={users} onRemove={() => remove(s)} />)}
      {nothing ? <AddRow icon="stopwatch-outline" title="Log your first session" sub="It builds your record, hours and streak." onPress={() => router.push('/log-session')} /> : null}
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
    : canTagKind(s.kind) && !s.fromSessionId ? () => router.push({ pathname: '/log-session', params: { edit: s.id } })
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

/** Today's recovery, sleep and HRV from your tracker, and the way to the Health page. Numbers only; never advice. */
function Health() {
  const styles = useThemedStyles(styleDefinitions);
  const { healthHistory, integrations } = useApp();
  const latest = healthHistory[0];
  if (!latest) {
    return (
      <View>
        <SectionHead title="Health" lock />
        <AddRow icon="pulse-outline" title="Connect a tracker" sub="Recovery, sleep and food from WHOOP, Apple Watch, Fitbit, Oura or Polar." onPress={() => router.push('/health')} />
      </View>
    );
  }
  const source = integrations.filter((i) => i.connected && i.category === 'wearable').sort((a, b) => (b.lastSyncedAt ?? '').localeCompare(a.lastSyncedAt ?? ''))[0];
  const ago = source?.lastSyncedAt ? relativeTime(source.lastSyncedAt) : '';
  const synced = !ago ? '' : ago === 'just now' ? ' · synced just now' : /\d[mh]$/.test(ago) ? ` · synced ${ago} ago` : ` · synced ${ago}`;
  // The day is a plain YYYY-MM-DD: read as it is, never through a Date (which takes it as UTC midnight, a day early in America).
  const dayWord = dayLabel(latest.date.slice(0, 10));
  const sleepMin = Math.round((latest.sleepHours || 0) * 60);
  const cells: { label: string; parts: [string, string][]; spoken: string }[] = [
    { label: 'Recovery', parts: latest.recovery ? [[String(latest.recovery), '%']] : [], spoken: latest.recovery ? `Recovery ${latest.recovery} percent` : 'Recovery not read' },
    { label: 'Sleep', parts: sleepMin ? (sleepMin >= 60 ? [[String(Math.floor(sleepMin / 60)), 'h'], ...(sleepMin % 60 ? [[String(sleepMin % 60).padStart(2, '0'), 'm'] as [string, string]] : [])] : [[String(sleepMin), 'm']]) : [], spoken: sleepMin ? `Sleep ${shortLength(sleepMin)}` : 'Sleep not read' },
    { label: 'HRV', parts: latest.hrvMs ? [[String(latest.hrvMs), ' ms']] : [], spoken: latest.hrvMs ? `HRV ${latest.hrvMs} milliseconds` : 'HRV not read' },
  ];
  return (
    <View>
      <SectionHead title="Health" lock line={`${dayWord}${source ? `, from ${source.label}` : ''}${synced}`} />
      <View style={styles.healthRow}>
        {cells.map((c, i) => (
          <View key={c.label} accessible accessibilityLabel={c.spoken} style={[styles.healthCell, i > 0 && styles.healthDivide]}>
            <Text maxFontSizeMultiplier={1.25} style={styles.healthFigure}>
              {c.parts.length ? c.parts.map(([n, u], j) => <React.Fragment key={j}>{j > 0 ? ' ' : ''}{n}<Text style={styles.healthUnit}>{u}</Text></React.Fragment>) : '—'}
            </Text>
            <Text style={styles.healthLabel}>{c.label}</Text>
          </View>
        ))}
      </View>
      <Row minHeight={52} title="Trackers, sleep and food" chevron accessibilityRole="link" onPress={() => router.push('/health')} />
    </View>
  );
}

/** What coaches plan around: injuries and time limits, only ever yours to see. */
function Limits({ user }: { user: User }) {
  const shown = user.profile.constraints.filter((c) => c.active);
  const add = () => router.push({ pathname: '/tennis-sheet', params: { kind: 'limit' } });
  return (
    <View>
      <SectionHead title="Injuries and limits" lock line={shown.length ? 'Coaches plan around these.' : undefined} link={shown.length ? { label: 'Add', accessibilityLabel: 'Add an injury or a time limit', onPress: add } : undefined} />
      {shown.length ? shown.map((c, i) => (
        <Row key={c.id} first={i === 0} lead={<Tile icon={c.kind === 'injury' ? 'bandage-outline' : 'calendar-outline'} />} title={c.label} sub={c.note} subLines={2}
          onPress={() => router.push({ pathname: '/tennis-sheet', params: { kind: 'limit', id: c.id } })}
          accessibilityLabel={`${c.kind === 'injury' ? 'Injury' : 'Limit'}: ${c.label}${c.note ? `. ${c.note}` : ''}. Edit or remove`}
        />
      )) : <AddRow icon="bandage-outline" title="Add an injury or a time limit" sub="A sore shoulder, or courts only before 8am: coaches plan around it." onPress={add} />}
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
      {list.length ? list.map((t, i) => (
        <Row key={t.id} first={i === 0} minHeight={80} leadWidth={56}
          lead={<CountdownTile iso={t.startsAt} slot={surfaceSlot(t.surface)} />}
          title={<Text style={styles.eventName} numberOfLines={2}>{t.name}</Text>}
          sub={(
            <View style={styles.eventLine}>
              <Text style={styles.eventMeta}>{eventDate(t.startsAt)} · </Text>
              <Swatch surface={t.surface} look={{ wash: null, ink: colors.text }} size={8} />
              <Text style={[styles.eventMeta, styles.shrink]} numberOfLines={1}>{surfaceLabel[t.surface]}{t.location ? ` · ${t.location.split(',')[0]}` : ''}</Text>
            </View>
          )}
          right={<Tag label={t.registered ? 'Entered' : 'Watching'} on={t.registered} />}
          accessibilityLabel={`${t.name}, ${eventDate(t.startsAt)}, ${surfaceLabel[t.surface]} court${t.location ? `, ${t.location}` : ''}. ${t.registered ? 'Entered' : 'Watching'}`}
        />
      )) : mine ? <AddRow icon="trophy-outline" title="Add a tournament" sub="A date on the calendar gives your training a target." onPress={edit} /> : null}
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
      {rows.length ? rows.map((r, i) => (
        <Row key={r.key} first={i === 0} lead={<Tile icon={r.icon} />} title={<Text style={styles.gearName} numberOfLines={2}>{r.title}</Text>} sub={r.sub} subLines={2} accessibilityLabel={`${r.sub.split(' · ')[0]}: ${r.title}${r.sub.includes(' · ') ? `, ${r.sub.split(' · ').slice(1).join(', ')}` : ''}`} />
      )) : mine ? <AddRow icon="tennisball-outline" title="Add your racket, strings and shoes" sub="Players always ask." onPress={() => router.push('/edit-gear')} /> : null}
    </View>
  );
}

/** Medals won, in a row; yours also say what is next and open the full set. Before the first, the first medal waits, faint. */
function Achievements({ user, mine = false }: { user: User; mine?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const all = evaluateAchievements(user);
  const won = all.filter((a) => a.unlocked);
  const next = mine ? all.filter((a) => !a.unlocked).sort((a, b) => b.progress - a.progress)[0] : undefined;
  const firstMedal = (all.find((a) => a.achievement.id === 'ach-first-serve') ?? all[0])?.achievement;
  const line = mine
    ? `${won.length} of ${all.length}${next ? ` · next: ${next.achievement.name}, ${next.current} of ${next.target}${next.unit ? ` ${next.unit}` : ''}` : ''}`
    : `${won.length} unlocked`;
  return (
    <View>
      <SectionHead title="Achievements" line={won.length || !mine ? line : undefined} link={mine ? { label: 'See all', accessibilityLabel: 'See all achievements', onPress: () => router.push({ pathname: '/tennis-sheet', params: { kind: 'achievements' } }) } : undefined} />
      {/* Before the first medal: not a third way to log a session (the button and Your sessions have that), the medal it unlocks, still faint. */}
      {won.length ? <MedalRow items={all} /> : mine && firstMedal ? (
        <Row first
          lead={<View style={styles.medalWaiting}><Ionicons name={firstMedal.icon as keyof typeof Ionicons.glyphMap} size={18} color={colors.textFaint} /></View>}
          title={<Text style={styles.medalWaitingName}>{firstMedal.name}</Text>}
          sub="Your first session unlocks it"
          accessibilityLabel={`${firstMedal.name}, locked. Your first session unlocks it`}
        />
      ) : null}
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
  yearRow: { marginTop: spacing.md },
  gone: { ...typography.body, color: colors.textMuted, textAlign: 'center', paddingVertical: 64 },
  locked: { alignItems: 'center', paddingTop: 56, paddingHorizontal: spacing.xl, gap: spacing.sm },
  lockTile: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  lockedTitle: { ...typography.heading, color: colors.text, textAlign: 'center' },
  lockedBody: { ...typography.small, lineHeight: 19, color: colors.textMuted, textAlign: 'center', maxWidth: 300 },
  lockedFollow: { marginTop: spacing.md },
  ghost: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  ghostText: { ...typography.smallStrong, color: colors.textMuted },
  allShared: { ...typography.small, color: colors.textFaint, textAlign: 'center', paddingTop: spacing.xxl },
  healthRow: { flexDirection: 'row', paddingTop: 4, paddingBottom: 14 },
  healthCell: { flex: 1, gap: 2 },
  healthDivide: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border, paddingLeft: spacing.md },
  // Health in the page's own ink, not the brand's: it is not a tennis score.
  healthFigure: { ...font('600'), fontSize: 26, lineHeight: 31, letterSpacing: -1.2, color: colors.text, fontVariant: ['tabular-nums'] },
  healthUnit: { ...font('500'), fontSize: 14, letterSpacing: 0, color: colors.textMuted },
  healthLabel: { fontSize: 12, lineHeight: 16, color: colors.textMuted },
  eventName: { ...font('500'), fontSize: 16, lineHeight: 21, color: colors.text },
  eventLine: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  eventMeta: { ...typography.small, lineHeight: 18, color: colors.textMuted },
  goal: { ...typography.body, lineHeight: 20, color: colors.text },
  goalDone: { color: colors.textMuted },
  goalBy: { ...typography.small, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  medalWaiting: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  medalWaitingName: { ...typography.body, ...font('500'), lineHeight: 20, color: colors.textMuted },
  gearName: { ...font('500'), fontSize: 16, lineHeight: 21, color: colors.text },
});

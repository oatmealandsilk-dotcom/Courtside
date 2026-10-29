import { PRESS_DIM } from '@/theme/press';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SwipePressable } from '@/components/SwipePressable';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { FollowPill } from '@/components/FollowPill';
import { LevelPill } from '@/components/LevelPill';
import { Avatar } from '@/components/ui';
import { Wash } from '@/components/Wash';
import type { User } from '@/data/types';
import { connectLine, useConnectRow, useConnectTap } from '@/features/activity/autoLog';
import { setConnectCardOnShow } from '@/features/activity/afterLogConnect';
import { WATCH_TIP, useWatchTip } from '@/features/activity/watchTip';
import { hasSessionStats } from '@/features/activity/format';
import { finishLive } from '@/features/activity/finishLive';
import { liveState } from '@/features/activity/liveSession';
import { START_UNDER, useInviterToFollow } from '@/features/activity/nearYou';
import { canReadContacts } from '@/features/contacts/phoneContacts';
import { CONTACTS_LABEL } from '@/features/invite/friendsWords';
import { useSuggestedPlayers } from '@/features/people/suggestions';
import { confirmUnfollow } from '@/lib/confirm';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, lift, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';
import { LESS_AI, LESS_AI_ROUND2, corner } from '@/theme/look';

/** People offered to follow on the page. */
const PICKS = 3;
/** A first answer still on its way as Activities comes on show is waited for this long (as Profile's card does). */
const GRACE_MS = 250;

/**
 * Activities' first page for a new player (following fewer than ten people,
 * owner Oct 6), or for anyone with Apple Health still to connect: the two
 * ways in, then people to follow.
 *  - "Connect your watch" (Apple Health, WHOOP or Fitbit, whatever this
 *    phone can connect), while nothing brings sessions in, however many you
 *    follow: the setup card's second home after "Not now". Its own "Not now"
 *    puts it away for two days, then it is back (features/activity/autoLog).
 *    Once connected, until a tennis session has come in from it: the watch
 *    tip in its place (features/activity/watchTip).
 *  - "Start a session" (Oct 6): a timer from Start to Finish, and a check-in
 *    at the court; while one is going, the row opens it.
 *  - "Log a session", for anything played without a watch.
 *  - While you follow fewer than ten: a few people to follow, whoever
 *    invited you first (by migration 84's rule, see useInviterToFollow),
 *    then the suggestions' own (teen-safe), and "Find friends from your
 *    contacts" under them (in a browser, or a build without contacts, your
 *    invite link instead).
 * Below it, the sessions of the people you follow and, marked "Near you",
 * players in your town (features/activity/nearYou).
 *
 * "Start logging" heads it only for someone with nothing logged yet. Anyone
 * who logs already reads "Follow more players" (while the people to follow
 * show) or "Your activities": the page opened on "Start logging" with their
 * own sessions right under it (Oct 6 audit, item 8). `sessions`: how many
 * session pages follow it, for the line at its foot.
 *
 * The connect card or the watch tip is decided as Activities comes on show (`shown`): one only known after the page
 * is up waits for the next visit, so nothing drops in over Start a session and Log a session (review, Oct 28). One
 * already there follows what happens to it (Not now, Got it, the tip in the card's place once connected). `onTop`:
 * this page is the one on screen, so the note after logging by hand knows the card is saying it already.
 */
export function ActivitiesStart({ topInset, bottomInset, nearCount, sessions = 0, shown = true, onTop = true }: { topInset: number; bottomInset: number; nearCount: number; sessions?: number; shown?: boolean; onTop?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const { followingIds, actions, sessions: log, posts, currentUserId, liveSession, currentUser, autoLogSharing } = useApp();
  // Anything in your own log, or a session of yours posted with its numbers.
  const logs = log.some((s) => s.userId === currentUserId)
    || posts.some((p) => p.authorId === currentUserId && !p.archived && !p.removed && !!p.session && hasSessionStats(p.session));
  const row = useConnectRow();
  const { choices, offer, close } = row;
  const { busy, connect } = useConnectTap(row);
  const line = connectLine(choices, autoLogSharing, currentUser);
  // Connected, with no tennis session in from it yet: the watch tip in the card's place (features/activity/watchTip).
  const watch = useWatchTip();
  const live: 'connect' | 'tip' | null = offer ? 'connect' : watch.due && watch.source ? 'tip' : null;
  const known = row.known && watch.known;
  // Whether the card's place is open this visit (undefined: not decided yet). Kept in step while out of sight.
  const [open, setOpen] = useState<boolean | undefined>(() => (known ? !!live : undefined));
  const cameAt = useRef(Date.now());
  useEffect(() => { if (shown) cameAt.current = Date.now(); }, [shown]);
  useEffect(() => {
    if (!shown) { setOpen(known ? !!live : undefined); return; }
    if (open === undefined) { if (known) setOpen(!!live && Date.now() - cameAt.current < GRACE_MS); return; }
    // Put away (Not now, Got it) or connected with nothing more to say: closed for the rest of the visit.
    if (open && !live) setOpen(false);
  }, [shown, known, live, open]);
  const card = open ? live : null;
  const tip = card === 'tip';
  const connectShown = card === 'connect';
  // The note after logging by hand stays away while this card is on screen saying the same (afterLogConnect).
  const cardOnScreen = connectShown && shown && onTop;
  useEffect(() => {
    setConnectCardOnShow(cardOnScreen);
    return () => { if (cardOnScreen) setConnectCardOnShow(false); };
  }, [cardOnScreen]);
  const liveNow = liveSession ? liveState(liveSession) : null;
  const inviter = useInviterToFollow();
  // Someone followed from here stays, saying Following (as the feed's strip does).
  const [kept, setKept] = useState<string[]>([]);
  const suggested = useSuggestedPlayers({ keep: kept, exclude: inviter ? [inviter.id] : [] });
  // Settled as the page opens, so following your tenth player from here never takes the list away.
  const [few] = useState(() => followingIds.length < START_UNDER);
  const people: { user: User; reason: string }[] = few ? [
    ...(inviter ? [{ user: inviter, reason: 'Invited you' }] : []),
    ...suggested,
  ].slice(0, PICKS) : [];
  const contacts = canReadContacts();
  const follow = (who: User) => {
    setKept((k) => (k.includes(who.id) ? k : [...k, who.id]));
    if (followingIds.includes(who.id)) confirmUnfollow(who, () => actions.toggleFollow(who.id));
    else actions.toggleFollow(who.id);
  };

  return (
    <View style={[styles.page, { paddingTop: topInset, paddingBottom: bottomInset }]}>
      <Wash height={300} strength={0.6} />
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.title}>{!logs ? 'Start logging' : few ? 'Follow more players' : 'Your activities'}</Text>
        {LESS_AI ? null : <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.lead}>{logs && few ? 'Their sessions show up here, with yours.' : 'Your sessions and the people you follow show up here.'}</Text>}
      </View>

      <View style={styles.card}>
        {connectShown ? (
          // "Connect your watch" (Oct 28, owner: push auto log hard): one tap connects; Not now puts it away for two
          // days, then it is back, until something is connected (features/activity/autoLog).
          <View style={styles.connect}>
            <SwipePressable accessibilityRole="button" accessibilityLabel={`Connect your watch. ${line}`} disabled={busy} onPress={connect} style={({ pressed }) => [styles.row, styles.connectTap, pressed && styles.pressed]}>
              {LESS_AI ? null : <View style={styles.tile}><Ionicons name="watch-outline" size={18} color={colors.brand} /></View>}
              <View style={styles.connectWords}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowText} numberOfLines={1}>Connect your watch</Text>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.connectLine}>{busy ? 'Connecting…' : line}</Text>
              </View>
            </SwipePressable>
            <SwipePressable accessibilityRole="button" accessibilityLabel="Not now: connect your watch" disabled={busy} hitSlop={6} onPress={() => { haptics.tap(); close(); }} style={({ pressed }) => [styles.notNow, pressed && { opacity: PRESS_DIM }]}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.notNowText}>Not now</Text>
            </SwipePressable>
          </View>
        ) : tip && watch.source ? (
          // Connected, nothing in from it yet: how to make a session log itself. Got it puts it away for a few days.
          <View style={styles.connect}>
            <View style={[styles.row, styles.connectTap]} accessible accessibilityLabel={`Tip. ${WATCH_TIP[watch.source]}`}>
              {LESS_AI ? null : <View style={styles.tile}><Ionicons name="watch-outline" size={18} color={colors.brand} /></View>}
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.tipText}>{WATCH_TIP[watch.source]}</Text>
            </View>
            <SwipePressable accessibilityRole="button" accessibilityLabel="Got it: watch tip" hitSlop={6} onPress={() => { haptics.tap(); watch.gotIt(); }} style={({ pressed }) => [styles.notNow, pressed && { opacity: PRESS_DIM }]}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.notNowText}>Got it</Text>
            </SwipePressable>
          </View>
        ) : null}
        <SwipePressable
          accessibilityRole="button"
          accessibilityLabel={!liveNow ? 'Start a session' : liveNow === 'finished' ? 'Log your finished session' : 'Session in progress. Open it'}
          onPress={() => (!liveNow ? router.push('/start-session') : liveNow === 'finished' && liveSession ? finishLive(liveSession, actions) : router.push('/live-session'))}
          style={({ pressed }) => [styles.row, !!card && styles.rowLine, pressed && styles.pressed]}
        >
          {LESS_AI && !liveNow ? null : <View style={styles.tile}><Ionicons name={liveNow ? 'radio-button-on' : 'play'} size={16} color={liveNow ? colors.open : colors.brand} /></View>}
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowText}>{!liveNow ? 'Start a session' : liveNow === 'finished' ? 'Log your session' : 'Session in progress'}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </SwipePressable>
        <SwipePressable accessibilityRole="button" accessibilityLabel="Log a session" onPress={() => router.push('/log-session')} style={({ pressed }) => [styles.row, styles.rowLine, pressed && styles.pressed]}>
          {LESS_AI ? null : <View style={styles.tile}><Ionicons name="add" size={20} color={colors.brand} /></View>}
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowText}>Log a session</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </SwipePressable>
      </View>

      {few ? (
        <View style={styles.people}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.label}>{people.length ? 'People to follow' : 'Find people to follow'}</Text>
          <View style={styles.card}>
            {people.map(({ user, reason }, i) => (
              <View key={user.id} style={[styles.person, i > 0 && styles.rowLine]}>
                <Pressable accessibilityRole="link" accessibilityLabel={`${user.name}'s profile`} onPress={() => router.push(`/user/${user.id}`)} style={styles.personTap}>
                  <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={40} ring={user.isCoach} />
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    {/* The name has the whole first line; the rating sits with the reason on the second, so names are not cut short. */}
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.personName} numberOfLines={1}>{user.name}</Text>
                    <View style={styles.personMeta}><LevelPill profile={user.profile} userId={user.id} small /><Text style={styles.reason} numberOfLines={1}>{reason}</Text></View>
                  </View>
                </Pressable>
                <FollowPill small soft={LESS_AI_ROUND2} following={followingIds.includes(user.id)} userId={user.id} onPress={() => follow(user)} name={user.name.split(' ')[0]} />
              </View>
            ))}
            {/* Where to find the people you already know (owner, Oct 6). The teen rules are the Find friends page's own. */}
            <SwipePressable accessibilityRole="link" accessibilityLabel={contacts ? CONTACTS_LABEL : 'Share your invite link'} onPress={() => router.push(contacts ? '/find-contacts' : '/invite')} style={({ pressed }) => [styles.row, people.length > 0 && styles.rowLine, pressed && styles.pressed]}>
              {LESS_AI ? null : <View style={styles.tile}><Ionicons name={contacts ? 'people' : 'paper-plane'} size={18} color={colors.brand} /></View>}
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowText} numberOfLines={1}>{contacts ? 'Find friends from contacts' : 'Share your invite link'}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </SwipePressable>
          </View>
        </View>
      ) : null}

      {LESS_AI && !nearCount && !sessions ? null : <View style={styles.more} accessible={LESS_AI} accessibilityLabel={LESS_AI ? (nearCount ? 'Swipe up for sessions near you' : sessions ? 'Swipe up for the latest sessions' : undefined) : undefined}>
        <Ionicons name="chevron-down" size={LESS_AI ? 20 : 16} color={colors.textFaint} />
        {LESS_AI ? null : <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.moreText}>{nearCount ? 'Swipe up for sessions near you' : sessions ? 'Swipe up for the latest sessions' : 'Sessions you and they post show up here'}</Text>}
      </View>}
    </View>
  );
}

/**
 * "Near you" on a session from a player you don't follow yet, with Follow:
 * in the page's own flow over a written post, or as a small tile over a
 * picture (`over`). `follow` false: the label alone, where the page already
 * has its own Follow beside the name (a clip's caption), so there is one.
 */
export function NearYouTag({ user, over = false, follow = true }: { user: User; over?: boolean; follow?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const { followingIds, actions } = useApp();
  const following = followingIds.includes(user.id);
  return (
    <View style={[styles.near, over && styles.nearOver, over && !follow && styles.nearOverLabel]}>
      <Ionicons name="location" size={14} color={colors.brand} />
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.nearText}>Near you</Text>
      {follow ? <FollowPill small soft={LESS_AI_ROUND2} following={following} userId={user.id} name={user.name.split(' ')[0]} onPress={() => (following ? confirmUnfollow(user, () => actions.toggleFollow(user.id)) : actions.toggleFollow(user.id))} /> : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: spacing.lg, gap: spacing.lg, backgroundColor: colors.bg, maxWidth: 520, width: '100%', alignSelf: 'center' },
  head: { gap: 4, paddingHorizontal: spacing.xs },
  title: { ...typography.title, color: colors.text },
  lead: { ...typography.small, color: colors.textMuted },
  card: { ...(LESS_AI ? { borderWidth: 1, borderColor: colors.border } : lift), borderRadius: corner(18), backgroundColor: colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 12, minHeight: 56 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { backgroundColor: colors.surfaceAlt },
  tile: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  rowText: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  connect: { flexDirection: 'row', alignItems: 'center' },
  connectTap: { flex: 1, paddingRight: 0, alignItems: 'flex-start' },
  connectWords: { flex: 1, gap: 2 },
  connectLine: { ...typography.small, color: colors.textMuted },
  tipText: { ...typography.small, color: colors.text, flex: 1, alignSelf: 'center' },
  // "Not now" / "Got it": a quiet word at the right, 44 tall to a finger.
  notNow: { minHeight: 44, paddingHorizontal: spacing.md, marginRight: spacing.xs, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', marginTop: 6 },
  notNowText: { ...typography.smallStrong, color: colors.textMuted },
  people: { gap: spacing.sm },
  label: { ...typography.smallStrong, color: colors.textMuted, paddingHorizontal: spacing.xs },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  personTap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  personName: { ...typography.bodyStrong, color: colors.text, flexShrink: 1 },
  personMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reason: { ...typography.small, color: colors.textMuted, flexShrink: 1 },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: spacing.sm },
  moreText: { ...typography.small, color: colors.textFaint },
  near: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: spacing.sm },
  nearOver: { position: 'absolute', left: spacing.lg, zIndex: 5, backgroundColor: colors.surface, borderRadius: 999, paddingLeft: 10, paddingRight: 4, paddingVertical: 4, marginBottom: 0, ...lift },
  nearOverLabel: { paddingRight: 10, paddingVertical: 7 },
  nearText: { ...typography.smallStrong, color: colors.text, marginRight: 4 },
});

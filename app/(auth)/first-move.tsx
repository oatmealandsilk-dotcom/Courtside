import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { Easing, FadeIn, FadeInDown } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useLeave } from '@/components/LeaveCurtain';
import { goToStart, replaceWithStart } from '@/features/navigation/startTab';
import { goBack } from '@/lib/goBack';
import { FollowPill } from '@/components/FollowPill';
import { LevelPill } from '@/components/LevelPill';
import { useNearCourts } from '@/components/place/CourtsNear';
import { Avatar, Button } from '@/components/ui';
import { Wash } from '@/components/Wash';
import type { FirstMove } from '@/data/remote';
import type { User } from '@/data/types';
import { canReadContacts } from '@/features/contacts/phoneContacts';
import { inviteLink } from '@/features/invite/referral';
import { CONTACTS_LABEL, CONTACTS_NOTE, FRIENDS_LINE, FRIENDS_TITLE } from '@/features/invite/friendsWords';
import { useInviteCourt } from '@/features/invite/useInviteCourt';
import { useInviterToFollow } from '@/features/activity/nearYou';
import { useFindable } from '@/features/people/findable';
import { useSuggestedPlayers } from '@/features/people/suggestions';
import { notKnownAdult } from '@/features/players/age';
import { formatSpotMiles, milesBetween } from '@/features/players/geo';
import { IN_TOWN_MILES } from '@/features/players/mapModel';
import { isRoughSpot } from '@/features/players/positions';
import { useMyCity } from '@/features/players/useMyCity';
import { confirmUnfollow } from '@/lib/confirm';
import * as haptics from '@/lib/haptics';
import { shareOutside } from '@/lib/shareOutside';
import { isSupabaseConfigured } from '@/lib/supabase';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useGateSpace } from '@/lib/useGateSpace';
import { StatusShade } from '@/components/StatusShade';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, lift, spacing, typography } from '@/theme';

const enter = (i: number) => FadeInDown.delay(80 + i * 80).duration(420).easing(Easing.out(Easing.cubic));

/** How long the page waits to hear who plays near you before settling on its list. */
const LOOK_MS = 2500;
/** People offered to follow, at most (Instagram's "People you may know" shows about this many). */
const MOST = 8;

/** One person offered, with the line under their name ("Invited you", "Followed by Om", "2 mi away"). */
interface Pick { user: User; meta: string }

/**
 * Right after setup: "People you may know" (Oct 6, owner: "There's a page
 * that says follow people you may know", the way Instagram, TikTok and
 * Strava start you off). From the top:
 *   - Find friends from your contacts (the phone app, build 14 on; in a
 *     browser, "Share your invite link" instead).
 *   - A list with Follow: whoever invited you first (useInviterToFollow,
 *     migration 84's rule), then people they or you follow, then players
 *     near you. At most MOST, settled once so it never changes under a
 *     finger. Nobody yet: the old invite card (your link, your court on it).
 *   - A clip or an Instant, as the quieter second option.
 *   - Continue, always there: following anyone is optional.
 *
 * Who is offered keeps the app's own rules, never loosened: friends of
 * friends and townmates through the suggestions (useSuggestedPlayers: a teen
 * is never shown a stranger, an adult only those the server says they may
 * reach), and players near you through the map's (map_players: only people
 * a new adult may see there, nearest first). A teen (or anyone not known to
 * be an adult) gets no map players and no court on their link.
 */
export default function FirstMove() {
  const styles = useThemedStyles(styleDefinitions);
  // Clear of the status bar and the home bar, the same as every page before the app.
  const space = useGateSpace();
  const { currentUser, currentUserId, users, lastSeen, followingIds, followRequests, blockedIds, actions } = useApp();
  const { findable } = useFindable();
  const { leave, curtain } = useLeave();
  const adult = !!currentUser && !notKnownAdult(currentUser);
  const { city, pending: cityPending } = useMyCity(currentUser);
  const cityName = (currentUser?.location ?? '').split(',')[0].trim() || null;
  const firstName = currentUser?.name?.split(' ')[0];
  const contacts = canReadContacts();

  // Who plays round your city: that part of the map, asked for once, the
  // same ask the full map makes when it looks there (an adult only).
  const [heard, setHeard] = useState(!isSupabaseConfigured);
  const cityLat = city?.lat;
  const cityLng = city?.lng;
  useEffect(() => {
    if (!adult || cityLat === undefined || cityLng === undefined) return undefined;
    let on = true;
    const box = { minLat: cityLat - 0.5, maxLat: cityLat + 0.5, minLng: cityLng - 0.6, maxLng: cityLng + 0.6 };
    void actions.loadLastSeen(box).catch(() => false).finally(() => { if (on) setHeard(true); });
    return () => { on = false; };
  }, [adult, cityLat, cityLng, actions]);
  const [waited, setWaited] = useState(false);
  // Whoever invited you, first (Oct 6, owner), by migration 84's rule: only when the two of you may be put in front of each other.
  const inviter = useInviterToFollow();
  useEffect(() => { const t = setTimeout(() => setWaited(true), LOOK_MS); return () => clearTimeout(t); }, []);
  // People they (and you) follow first, then your town; each only where the suggestions' own rules allow.
  const suggested = useSuggestedPlayers({ exclude: inviter ? [inviter.id] : [], friendsOf: [...(inviter ? [inviter.id] : []), ...followingIds] });

  // Everyone sharing a spot within 30 miles of your city, nearest first.
  const near = useMemo(() => {
    if (!adult || cityLat === undefined || cityLng === undefined) return [];
    const from = { lat: cityLat, lng: cityLng };
    return users
      .filter((u) => u.id !== currentUserId && !blockedIds.includes(u.id) && findable(u))
      .flatMap((user) => {
        const seen = lastSeen[user.id];
        if (!seen) return [];
        const miles = milesBetween(from, seen);
        return miles <= IN_TOWN_MILES ? [{ user, miles, rough: isRoughSpot(seen) }] : [];
      })
      .sort((a, b) => a.miles - b.miles);
  }, [adult, cityLat, cityLng, users, currentUserId, blockedIds, findable, lastSeen]);

  // Settled once, so the list never changes under the player's finger;
  // the people offered stay put as they are followed (they read "Following").
  const [picks, setPicks] = useState<Pick[] | null>(null);
  useEffect(() => {
    if (picks || !currentUser) return;
    // Whoever invited you is waited for too (never past LOOK_MS), so they are not left off a list that settled first.
    const settled = (inviter !== undefined || waited) && (!adult || heard || waited || (!city && !cityPending));
    if (!settled) return;
    const list: Pick[] = inviter ? [{ user: inviter, meta: 'Invited you' }] : [];
    const add = (user: User, meta: string) => {
      if (list.length < MOST && !list.some((p) => p.user.id === user.id) && !followingIds.includes(user.id)) list.push({ user, meta });
    };
    suggested.filter((s) => s.reason.startsWith('Followed by')).forEach((s) => add(s.user, s.reason));
    near.forEach((p) => add(p.user, formatSpotMiles(p.miles, p.rough)));
    // An adult: townmates and people who have talked to you. A teen: only ever those who follow them (the suggestions' rule).
    suggested.forEach((s) => {
      if (adult && !/^(Plays in|Interacted)/.test(s.reason)) return;
      add(s.user, adult || s.reason !== 'Suggested for you' ? s.reason : 'Follows you');
    });
    setPicks(list);
  }, [picks, currentUser, adult, heard, waited, city, cityPending, near, suggested, followingIds, inviter]);
  const empty = !!picks && !picks.length;

  const nearCourts = useNearCourts(empty && adult ? city : null);
  const court = useInviteCourt(city, nearCourts);

  // Whatever was picked, the app opens on its start page (Community, on the
  // map: see startTab); a post, an Instant or a search then opens over it.
  // Opened from the profile's "Make your first move", the app is already
  // underneath: this page closes down to it (never a second copy of the tabs
  // on top), and Continue with nothing done simply goes back to the profile.
  const { from: openedFrom } = useLocalSearchParams<{ from?: string }>();
  const overApp = openedFrom === 'profile';
  const done = (move: FirstMove, then?: () => void) => {
    actions.noteFirstMove(move);
    if (overApp && move === 'later') { goBack('/(tabs)/profile'); return; }
    leave(() => { if (overApp) goToStart(); else replaceWithStart(); if (then) setTimeout(then, 380); });
  };
  // Shared the link: the page stays (a share sheet closed without sending looks the same as
  // one that sent on Android, which never says).
  const [shared, setShared] = useState(false);
  const share = async () => {
    if (!currentUser) return;
    const carried = empty && adult ? court : null;
    try {
      const said = await shareOutside(carried ? `Hit with me at ${carried.name} on CourtSide` : adult ? 'Hit with me on CourtSide' : 'Join me on CourtSide', inviteLink(currentUser.handle, carried));
      // Closed without sending (an iPhone or a browser can tell): nothing happened.
      if (said === null) return;
      haptics.commit();
      if (said) showToast({ title: said, icon: 'link-outline' });
      setShared(true);
    } catch { /* the share sheet failed: stay */ }
  };
  // Contacts open over this page, and come back to it for Continue.
  const [looked, setLooked] = useState(false);
  const findContacts = () => { haptics.tap(); setLooked(true); router.push('/find-contacts'); };
  // Followed someone (here, or from your contacts), or asked to follow a private account here.
  const [startFollows] = useState(followingIds.length);
  const followed = followingIds.length > startFollows
    || (picks ?? []).some((p) => followingIds.includes(p.user.id) || followRequests.some((r) => r.fromId === currentUserId && r.toId === p.user.id));
  const follow = (who: User) => {
    if (followingIds.includes(who.id)) confirmUnfollow(who, () => actions.toggleFollow(who.id));
    else actions.toggleFollow(who.id);
  };
  const move: FirstMove = followed ? 'follow' : shared ? 'invite' : looked ? 'find' : 'later';

  // Context only: the list under it says what to do.
  const line = !adult ? 'Your map shows only your friends.'
    : empty && cityName ? `CourtSide is new in ${cityName}.`
      : 'Follow anyone you know. Their clips and hits fill your feed and map.';

  return (
    <View style={styles.root}>
      <Wash height={420} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.scroll, { paddingTop: space.top }]}>
        <Animated.View entering={enter(0)} style={styles.head}>
          <Text style={styles.title}>People you may know</Text>
          <Text style={styles.lead}>You’re in{firstName ? `, ${firstName}` : ''}. {line}</Text>
        </Animated.View>

        {/* The people you already know who are here (owner, Oct 6). The phone app only; the Find friends page asks and keeps its own rules. */}
        {contacts ? (
          <Animated.View entering={enter(1)} style={styles.card}>
            <Pressable accessibilityRole="button" accessibilityLabel={CONTACTS_LABEL} onPress={findContacts} style={({ pressed }) => [styles.post, pressed && styles.pressed]}>
              <View style={styles.tile}><Ionicons name="people" size={20} color={colors.brand} /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.postTitle}>{CONTACTS_LABEL}</Text>
                <Text style={styles.postBody}>{CONTACTS_NOTE}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
          </Animated.View>
        ) : Platform.OS === 'web' && picks?.length ? (
          // A browser cannot read contacts: your link instead (with nobody here yet, the card below already offers it).
          <Animated.View entering={enter(1)} style={styles.card}>
            <Pressable accessibilityRole="button" accessibilityLabel="Share your invite link" onPress={() => { void share(); }} style={({ pressed }) => [styles.post, pressed && styles.pressed]}>
              <View style={styles.tile}><Ionicons name="paper-plane" size={20} color={colors.brand} /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.postTitle}>{shared ? 'Link shared' : 'Share your invite link'}</Text>
                <Text style={styles.postBody}>{adult ? 'Whoever joins follows you.' : FRIENDS_LINE}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
          </Animated.View>
        ) : null}

        <Animated.View entering={enter(2)} style={styles.listWrap}>
          <View style={[styles.card, (picks === null || empty) && styles.main]}>
            {picks === null ? (
              <View style={styles.waiting}><ActivityIndicator color={colors.textFaint} /></View>
            ) : picks.length ? (
              <Animated.View entering={FadeIn.duration(220)}>
                {picks.map(({ user, meta }, i) => (
                  <View key={user.id} style={[styles.person, i > 0 && styles.personLine]}>
                    <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={44} ring={user.isCoach} />
                    {/* The name gets the room; the level and why they are here sit under it. */}
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <Text style={styles.personName} numberOfLines={1}>{user.name}</Text>
                      <View style={styles.personTop}><LevelPill profile={user.profile} small /><Text style={styles.personMeta} numberOfLines={1}>{meta}</Text></View>
                    </View>
                    <FollowPill small following={followingIds.includes(user.id)} userId={user.id} onPress={() => follow(user)} name={user.name.split(' ')[0]} />
                  </View>
                ))}
              </Animated.View>
            ) : (
              // Nobody to offer yet: bring the people you play with.
              <Animated.View entering={FadeIn.duration(220)} style={{ gap: spacing.lg }}>
                <View style={styles.mainHead}>
                  <View style={styles.tile}><Ionicons name={adult ? 'paper-plane' : 'people'} size={20} color={colors.brand} /></View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.mainTitle}>{adult ? 'Bring your hitting partners' : FRIENDS_TITLE}</Text>
                    <Text style={styles.mainBody}>{!adult ? FRIENDS_LINE : court ? `Send your link. It opens on ${court.name}.` : 'Send your link. Whoever joins follows you.'}</Text>
                  </View>
                </View>
                <Button label="Share my link" onPress={() => { void share(); }} full />
              </Animated.View>
            )}
          </View>
          {picks ? (
            // Teen search (migration 118): by name or @handle, never by town.
            <Pressable accessibilityRole="link" accessibilityLabel="Find a friend by their @handle" hitSlop={8} onPress={() => done('find', () => router.push({ pathname: '/search', params: { scope: 'players', find: 'friend' } }))} style={({ pressed }) => [styles.quiet, pressed && { opacity: 0.6 }]}>
              <Ionicons name="search" size={15} color={colors.textMuted} />
              <Text style={styles.quietText}>Find a friend by @handle</Text>
            </Pressable>
          ) : null}
        </Animated.View>

        {/* The second option: a clip, with the Instant inside it for anyone without one. */}
        <Animated.View entering={enter(3)} style={styles.second}>
          <Text style={styles.label}>Or post something</Text>
          <View style={styles.card}>
            <Pressable accessibilityRole="button" accessibilityLabel="Post a clip or photo" onPress={() => done('post', () => router.push('/compose'))} style={({ pressed }) => [styles.post, pressed && styles.pressed]}>
              <View style={styles.tile}><Ionicons name="videocam" size={20} color={colors.brand} /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.postTitle}>Post a clip or photo</Text>
                <Text style={styles.postBody}>A highlight, a good rally, a funny moment.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Take an Instant" onPress={() => done('instant', () => router.push('/hit'))} style={({ pressed }) => [styles.instant, pressed && styles.pressed]}>
              <Ionicons name="camera-outline" size={16} color={colors.textMuted} />
              <Text style={styles.instantText}>Nothing saved? <Text style={styles.instantLink}>Take an Instant</Text></Text>
            </Pressable>
          </View>
        </Animated.View>
      </ScrollView>
      {/* Continue, always in reach: following anyone is optional. */}
      <Animated.View entering={enter(4)} style={[styles.footer, { paddingBottom: space.bottom }]}>
        <Button label="Continue" onPress={() => done(move)} full />
      </Animated.View>
      {/* What scrolls up stops at the status bar instead of running under the clock. */}
      <StatusShade wash={{ height: 420 }} />
      {curtain}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.xl, maxWidth: 460, width: '100%', alignSelf: 'center' },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, maxWidth: 460, width: '100%', alignSelf: 'center' },
  listWrap: { gap: spacing.xs },
  head: { gap: spacing.sm },
  title: { ...typography.display, color: colors.text },
  lead: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  // The prompt card, the same as "You're early" and "Looking for someone to play?" on Find Players.
  card: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  main: { padding: spacing.lg },
  waiting: { height: 120, alignItems: 'center', justifyContent: 'center' },
  mainHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  // The icon on Dim Green, one tile for both cards here and for the cards on Find Players.
  tile: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  mainTitle: { ...typography.heading, color: colors.text },
  mainBody: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, paddingHorizontal: spacing.lg },
  personLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  personTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  personName: { ...typography.bodyStrong, color: colors.text, flexShrink: 1 },
  personMeta: { ...typography.small, color: colors.textMuted },
  quiet: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', minHeight: 44 },
  quietText: { ...typography.smallStrong, color: colors.textMuted },
  second: { gap: spacing.sm },
  label: { ...typography.smallStrong, color: colors.textMuted, paddingHorizontal: spacing.xs },
  pressed: { backgroundColor: colors.surfaceAlt },
  post: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  postTitle: { ...typography.bodyStrong, color: colors.text },
  postBody: { ...typography.small, color: colors.textMuted },
  instant: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  instantText: { ...typography.small, color: colors.textMuted },
  instantLink: { ...typography.smallStrong, color: colors.text },
});

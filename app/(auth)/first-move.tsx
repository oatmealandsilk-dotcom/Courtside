import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { Easing, FadeIn, FadeInDown } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useLeave } from '@/components/LeaveCurtain';
import { replaceWithStart } from '@/features/navigation/startTab';
import { FollowPill } from '@/components/FollowPill';
import { LevelPill } from '@/components/LevelPill';
import { useNearCourts } from '@/components/place/CourtsNear';
import { Avatar, Button } from '@/components/ui';
import { Wash } from '@/components/Wash';
import type { FirstMove } from '@/data/remote';
import type { User } from '@/data/types';
import { inviteLink } from '@/features/invite/referral';
import { FRIENDS_LINE, FRIENDS_TITLE } from '@/features/invite/friendsWords';
import { useInviteCourt } from '@/features/invite/useInviteCourt';
import { useFindable } from '@/features/people/findable';
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
import { colors, radius, spacing, typography, lift } from '@/theme';

const enter = (i: number) => FadeInDown.delay(80 + i * 80).duration(420).easing(Easing.out(Easing.cubic));

/** How long the page waits to hear who plays near you before settling on the invite. */
const LOOK_MS = 2500;
/** Players offered to follow. */
const PICKS = 3;

/**
 * The one thing this page leads with (Oct 5, owner: "Do all"):
 *   invite   a known adult where nobody shares a spot yet: share your link, your court on it
 *   follow   a known adult with players around: follow the nearest few
 *   friends  a teen, or anyone not known to be an adult: add your friends (no court, no strangers)
 */
type Lead = 'invite' | 'follow' | 'friends';
interface Pick { user: User; miles: number; rough: boolean }

/**
 * Right after setup: one thing to do before the app opens, picked for where
 * you are (see Lead), with a clip as the second option and "Later" always
 * there. Not a gate and not a form. It used to lead with a clip, before the
 * player had seen the app, and most chose Later (13 of 18 by Oct 5); in a
 * city with nobody on CourtSide yet, the move that helps is bringing the
 * people you already play with.
 *
 * Who is offered to follow comes from the map's own rules (map_players):
 * only people a new adult may see there, nearest first. A teen is never
 * offered a stranger; their way in is their own link and a friend's @handle.
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
  useEffect(() => { const t = setTimeout(() => setWaited(true), LOOK_MS); return () => clearTimeout(t); }, []);

  // Everyone sharing a spot within 30 miles of your city, nearest first.
  const near = useMemo<Pick[]>(() => {
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

  // Settled once, so the page never changes its mind under the player's finger;
  // the people offered stay put as they are followed (they read "Following").
  const [lead, setLead] = useState<Lead | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  useEffect(() => {
    if (lead || !currentUser) return;
    if (!adult) { setLead('friends'); return; }
    const settled = heard || waited || (!city && !cityPending);
    if (!settled) return;
    const fresh = near.filter((p) => !followingIds.includes(p.user.id)).slice(0, PICKS);
    if (fresh.length) { setPicks(fresh); setLead('follow'); } else setLead('invite');
  }, [lead, currentUser, adult, heard, waited, city, cityPending, near, followingIds]);

  const nearCourts = useNearCourts(lead === 'invite' ? city : null);
  const court = useInviteCourt(city, nearCourts);

  // Whatever was picked, the app opens on its start page (Community, on the
  // map: see startTab); a post, an Instant or a search then opens over it.
  const done = (move: FirstMove, then?: () => void) => {
    actions.noteFirstMove(move);
    leave(() => { replaceWithStart(); if (then) setTimeout(then, 380); });
  };
  // Shared the link: the page stays (a share sheet closed without sending looks the same as
  // one that sent on Android, which never says), and "Later" becomes "Continue".
  const [shared, setShared] = useState(false);
  const share = async () => {
    if (!currentUser) return;
    const carried = lead === 'invite' ? court : null;
    try {
      const said = await shareOutside(carried ? `Hit with me at ${carried.name} on CourtSide` : lead === 'friends' ? 'Join me on CourtSide' : 'Hit with me on CourtSide', inviteLink(currentUser.handle, carried));
      // Closed without sending (an iPhone or a browser can tell): nothing happened.
      if (said === null) return;
      haptics.commit();
      if (said) showToast({ title: said, icon: 'link-outline' });
      setShared(true);
    } catch { /* the share sheet failed: stay */ }
  };
  // Followed (or, for a private account, asked to follow) one of the players offered.
  const followed = picks.filter((p) => followingIds.includes(p.user.id) || followRequests.some((r) => r.fromId === currentUserId && r.toId === p.user.id)).length;
  const follow = (who: User) => {
    if (followingIds.includes(who.id)) confirmUnfollow(who, () => actions.toggleFollow(who.id));
    else actions.toggleFollow(who.id);
  };

  // Context only: the card under it says what to do.
  const line = lead === 'invite' ? (cityName ? `CourtSide is new in ${cityName}.` : null)
    : lead === 'follow' ? `${near.length === 1 ? '1 player' : `${near.length} players`} near ${cityName ?? 'you'} ${near.length === 1 ? 'is' : 'are'} already here.`
      : lead === 'friends' ? 'Your map shows only your friends.'
        : ' ';

  return (
    <View style={styles.root}>
      <Wash height={420} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.scroll, { paddingTop: space.top, paddingBottom: space.bottom }]}>
        <Animated.View entering={enter(0)} style={styles.head}>
          <Text style={styles.title}>You’re in{firstName ? `, ${firstName}` : ''}.</Text>
          {line ? <Text style={styles.lead}>{line}</Text> : null}
        </Animated.View>

        {/* The one move for where you are. */}
        <Animated.View entering={enter(1)} style={[styles.card, styles.main]}>
          {lead === null ? (
            <View style={styles.waiting}><ActivityIndicator color={colors.textFaint} /></View>
          ) : (
            <Animated.View entering={FadeIn.duration(220)} style={{ gap: spacing.lg }}>
              <View style={styles.mainHead}>
                <View style={styles.mainIcon}>
                  <Ionicons name={lead === 'follow' ? 'person-add' : lead === 'friends' ? 'people' : 'paper-plane'} size={20} color={colors.brandInk} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.mainTitle}>{lead === 'follow' ? 'Follow players near you' : lead === 'friends' ? FRIENDS_TITLE : 'Bring your hitting partners'}</Text>
                  <Text style={styles.mainBody}>
                    {lead === 'follow' ? 'See their clips, and when they’re up for a hit.'
                      : lead === 'friends' ? FRIENDS_LINE
                        : court ? `Send your link. It opens on ${court.name}.` : 'Send your link. Whoever joins follows you.'}
                  </Text>
                </View>
              </View>
              {lead === 'follow' ? (
                <View>
                  {picks.map(({ user, miles, rough }, i) => (
                    <View key={user.id} style={[styles.person, i > 0 && styles.personLine]}>
                      <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={40} ring={user.isCoach} />
                      {/* The name gets the room; the level and how far sit under it. */}
                      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                        <Text style={styles.personName} numberOfLines={1}>{user.name}</Text>
                        <View style={styles.personTop}><LevelPill profile={user.profile} small /><Text style={styles.personMeta} numberOfLines={1}>{formatSpotMiles(miles, rough)}</Text></View>
                      </View>
                      <FollowPill small following={followingIds.includes(user.id)} userId={user.id} onPress={() => follow(user)} name={user.name.split(' ')[0]} />
                    </View>
                  ))}
                </View>
              ) : (
                <View style={{ gap: spacing.sm }}>
                  <Button label="Share my link" onPress={() => { void share(); }} full />
                  {lead === 'friends' ? (
                    // Teen search (migration 118): by name or @handle, never by town.
                    <Pressable accessibilityRole="link" accessibilityLabel="Find a friend by their @handle" hitSlop={8} onPress={() => done('find', () => router.push({ pathname: '/search', params: { scope: 'players' } }))} style={({ pressed }) => [styles.quiet, pressed && { opacity: 0.6 }]}>
                      <Ionicons name="search" size={15} color={colors.textMuted} />
                      <Text style={styles.quietText}>Find a friend by @handle</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
            </Animated.View>
          )}
        </Animated.View>

        {/* The second option: a clip, with the Instant inside it for anyone without one. */}
        <Animated.View entering={enter(2)} style={styles.second}>
          <Text style={styles.label}>Or post something</Text>
          <View style={styles.card}>
            <Pressable accessibilityRole="button" accessibilityLabel="Post a clip or photo" onPress={() => done('post', () => router.push('/compose'))} style={({ pressed }) => [styles.post, pressed && styles.pressed]}>
              <View style={styles.postIcon}><Ionicons name="videocam" size={18} color={colors.brand} /></View>
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

        <Animated.View entering={enter(3)}>
          {followed || shared ? (
            // Followed someone, or shared the link: that was the move, and the way on says so.
            <Button label="Continue" onPress={() => done(followed ? 'follow' : 'invite')} full />
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Later" onPress={() => done('later')} hitSlop={8} style={styles.later}>
              <Text style={styles.laterText}>Later</Text>
            </Pressable>
          )}
        </Animated.View>
      </ScrollView>
      {/* What scrolls up stops at the status bar instead of running under the clock. */}
      <StatusShade wash={{ height: 420 }} />
      {curtain}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.xl, maxWidth: 460, width: '100%', alignSelf: 'center' },
  head: { gap: spacing.sm },
  title: { ...typography.display, color: colors.text },
  lead: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  card: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  main: { padding: spacing.lg },
  waiting: { height: 120, alignItems: 'center', justifyContent: 'center' },
  mainHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mainIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  mainTitle: { ...typography.heading, color: colors.text },
  mainBody: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 },
  personLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  personTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  personName: { ...typography.bodyStrong, color: colors.text, flexShrink: 1 },
  personMeta: { ...typography.small, color: colors.textMuted },
  quiet: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingVertical: spacing.xs },
  quietText: { ...typography.smallStrong, color: colors.textMuted },
  second: { gap: spacing.sm },
  label: { ...typography.smallStrong, color: colors.textMuted, paddingHorizontal: spacing.xs },
  pressed: { backgroundColor: colors.surfaceAlt },
  post: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  postIcon: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  postTitle: { ...typography.bodyStrong, color: colors.text },
  postBody: { ...typography.small, color: colors.textMuted },
  instant: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  instantText: { ...typography.small, color: colors.textMuted },
  instantLink: { ...typography.smallStrong, color: colors.text },
  later: { alignSelf: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  laterText: { ...typography.smallStrong, color: colors.textFaint },
});

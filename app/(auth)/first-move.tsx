import { PRESS_DIM } from '@/theme/press';
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
import { QuietButton, SetupFooter, SetupProgress, setupLook } from '@/components/setup/SetupBits';
import { useSetupCount } from '@/features/onboarding/setupCount';
import { ONBOARDING_V2 } from '@/features/onboarding/onboardingV2';
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
import { isOfficial } from '@/features/players/official';
import { townLabel } from '@/features/players/nearMe';
import { useCityBoard, useCityPage } from '@/features/cityBoard/useCityBoard';
import { useCityFill } from '@/features/cityBoard/fill';
import { OfficialCheck } from '@/components/OfficialCheck';
import { useInstantsOn } from '@/features/stories/instantsSwitch';
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
import { TextScale } from '@/theme/textScale';
import { corner } from '@/theme/look';

const enter = (i: number) => FadeInDown.delay(80 + i * 80).duration(420).easing(Easing.out(Easing.cubic));

/** How long the page waits to hear who plays near you before settling on its list. */
const LOOK_MS = 2500;
/** People offered to follow, at most (Instagram's "People you may know" shows about this many). */
const MOST = 8;

/**
 * A teen's verified coaches on "People you may know" (round 2). OFF until the owner says Yes: today's
 * suggestions never show a teen someone they don't know, and coaches are adult strangers (public, professional
 * accounts, the ones the Coaching tab already shows them, never with a town or distance). Off, a teen with
 * nobody to suggest gets the contacts row, @courtside and Search.
 */
const TEEN_COACHES: boolean = false;

/** One person offered, with the line under their name ("Invited you", "Followed by Om", "2 mi away"); a filled row names its group. */
interface Pick { user: User; meta: string; section?: 'city' | 'coaches' }

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
  const { currentUser, currentUserId, users, lastSeen, followingIds, followRequests, blockedIds, blockedMeIds, coaches, actions } = useApp();
  const { findable } = useFindable();
  const { leave, curtain } = useLeave();
  const adult = !!currentUser && !notKnownAdult(currentUser);
  const { city, pending: cityPending } = useMyCity(currentUser);
  const cityName = (currentUser?.location ?? '').split(',')[0].trim() || null;
  const firstName = currentUser?.name?.split(' ')[0];
  const contacts = canReadContacts();
  const instantsOn = useInstantsOn() === true;
  // Whatever was picked, the app opens on its start page (Community, on the
  // map: see startTab); a post, an Instant or a search then opens over it.
  // Opened from the profile's "Make your first move", the app is already
  // underneath: this page closes down to it (never a second copy of the tabs
  // on top), and Continue with nothing done simply goes back to the profile.
  const { from: openedFrom } = useLocalSearchParams<{ from?: string }>();
  const overApp = openedFrom === 'profile';
  // Round 2 (Oct 29, owner, of an empty list: "There's no reason this should be empty"): the sign-up run fills the
  // list up to MOST from what the app already shows, each under its own rules (below).
  const fills = ONBOARDING_V2 && !overApp;
  // Most active in your city: the city page's own fill (city_page().fill: by the town on their profile, never where
  // they are, only people the server says you may see), for a known adult only. Asked only on this run.
  const cityBoard = useCityBoard(fills && adult);
  const homeCityId = fills && adult ? cityBoard.board?.me.cityId ?? null : null;
  const homeCityName = cityBoard.board?.me.cityName ?? null;
  const cityPage = useCityPage(homeCityId, cityBoard.month);
  const cityFill = useCityFill(homeCityId ? cityPage.page : null, []);
  // Still hearing about the city (never past LOOK_MS): the list waits, so it is decided once.
  const fillPending = fills && adult && (cityBoard.status === 'loading' || (!!homeCityId && cityPage.status === 'loading'));

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
    const settled = (inviter !== undefined || waited) && (!adult || heard || waited || (!city && !cityPending)) && (!fillPending || waited);
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
    // The sign-up redraw (ONBOARDING_V2): an adult's list is filled up to MOST with the rest of the
    // suggestions, in their own order ("Coach on CourtSide", "Suggested for you"): the same people,
    // under the same rules, the app's own Suggested players row already shows them. A teen's list is as before.
    if (ONBOARDING_V2 && !overApp && adult) suggested.forEach((s) => add(s.user, s.reason));
    if (fills) {
      // Never anyone blocked either way, anyone who may not be found, anyone followed already or already listed.
      const fits = (u: User | undefined): u is User => !!u && u.id !== currentUserId && !blockedIds.includes(u.id) && !blockedMeIds.includes(u.id)
        && findable(u) && !followingIds.includes(u.id) && !list.some((p) => p.user.id === u.id);
      const byId = new Map(users.map((u) => [u.id, u]));
      // The coaches the Coaching tab shows (listed unless switched off), verified only.
      const verified = coaches.filter((c) => c.listed !== false && c.verified);
      // CourtSide's own account first, when the app has it (the demo has none).
      const official = users.find((u) => isOfficial(u.id));
      if (fits(official) && list.length < MOST) list.push({ user: official, meta: 'Official · tips and events' });
      if (adult) {
        cityFill.filter((f) => fits(f.user)).slice(0, 4).forEach((f) => { if (list.length < MOST) list.push({ user: f.user, meta: f.lines.join(' '), section: 'city' }); });
        const myTown = townLabel(currentUser.location);
        if (myTown) {
          verified.map((c) => byId.get(c.userId)).filter((u): u is User => fits(u) && townLabel(u.location) === myTown).slice(0, 2)
            .forEach((u) => { if (list.length < MOST) list.push({ user: u, meta: `Coach · ${myTown}`, section: 'coaches' }); });
        }
        // A quiet city (round 2 review: Austin left @courtside and one person over an empty page): the rest of the
        // verified coaches, from any town, by what they teach, never with a town or distance (the teen rows' look).
        verified.flatMap((c) => { const u = byId.get(c.userId); return fits(u) ? [{ u, c }] : []; })
          .forEach(({ u, c }) => { if (list.length < MOST) list.push({ user: u, meta: c.headline, section: 'coaches' }); });
      } else if (TEEN_COACHES) {
        // A teen: the coaches the Coaching tab already shows them, by what they teach, never by where they are.
        verified.flatMap((c) => { const u = byId.get(c.userId); return fits(u) ? [{ u, c }] : []; }).slice(0, 3)
          .forEach(({ u, c }) => { if (list.length < MOST) list.push({ user: u, meta: c.headline, section: 'coaches' }); });
      }
    }
    setPicks(list);
  }, [picks, currentUser, adult, heard, waited, city, cityPending, near, suggested, followingIds, inviter, overApp, fills, fillPending, cityFill, coaches, users, blockedIds, blockedMeIds, currentUserId, findable]);
  const empty = !!picks && !picks.length;

  const nearCourts = useNearCourts(empty && adult ? city : null);
  const court = useInviteCourt(city, nearCourts);

  // Setup's last page: setup's one step count (Oct 20 sweep); none when opened again from the profile.
  const setupCount = useSetupCount('first-move', !overApp);
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
  // "Follow all" (R9, Oct 20 sweep: "The more people a new player follows, the fuller their Feed and
  // map. Today it's one tap per person. Adults only."). Only for someone known to be an adult, and only
  // over the list already shown, which keeps the suggestions' own rules (a teen is never offered to an
  // adult stranger: see the note at the top). Each person gets the same one follow a tap on their own
  // pill sends: a private account gets one request, never a second, and anyone already followed or
  // asked is left alone.
  const notYet = (picks ?? []).filter((p) => !followingIds.includes(p.user.id) && !followRequests.some((r) => r.fromId === currentUserId && r.toId === p.user.id));
  const canFollowAll = adult && (picks?.length ?? 0) >= 2 && notYet.length >= 2;
  // One buzz for the whole tap, not one per person (R9 review).
  const followAll = () => actions.followAll(notYet.map((p) => p.user.id));

  // Context only: the list under it says what to do.
  const line = !adult ? 'Your map shows only your friends.'
    : empty && cityName ? `CourtSide is new in ${cityName}.`
      : 'Follow anyone you know. Their clips and hits fill your feed and map.';

  // Only the sign-up run is redrawn: "Make your first move" from the profile stays as it is.
  if (ONBOARDING_V2 && !overApp) {
    // The redraw (Oct 29, owner: "People you may know screen I don't even feel a need to read I'm just
    // tapping next because it seems confusing"): the people, each with Follow, and one quiet way to bring
    // your own. Nothing else to read, and Finish the only green button.
    const finishLabel = setupCount && setupCount.index === setupCount.total - 1 ? 'Finish' : 'Continue';
    const inviteLabel = shared ? 'Link shared' : adult ? 'Invite your hitting partners' : 'Invite your friends';
    const emptyLine = !adult ? FRIENDS_LINE
      : court ? `Your link opens on ${court.name}.`
        : cityName ? `CourtSide is new in ${cityName}.`
          : 'Whoever joins with your link follows you.';
    // A teen's contacts come first, above the list (round 2): the friends they already have are the ones to find.
    const contactsRow = (
      <Pressable accessibilityRole="button" accessibilityLabel={CONTACTS_LABEL} onPress={findContacts} style={({ pressed }) => [styles.v2Inset, styles.v2Contacts, !adult && styles.v2ContactsFirst, pressed && styles.pressed]}>
        <Ionicons name="people-outline" size={20} color={colors.textMuted} />
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.v2ContactsText} numberOfLines={1}>{CONTACTS_LABEL}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Pressable>
    );
    const sectionLabel = (section: Pick['section']) => (section === 'city' ? `Most active in ${homeCityName ?? cityName ?? 'your city'}` : section === 'coaches' ? 'Coaches' : null);
    const ways = (
      <>
        <View style={empty ? null : styles.v2InviteGap}>
          <QuietButton label={inviteLabel} icon="paper-plane-outline" onPress={() => { void share(); }} />
        </View>
        {contacts && adult ? contactsRow : null}
        {/* Teen search (migration 118): by name or @handle, never by town. */}
        <Pressable accessibilityRole="link" accessibilityLabel="Search by @handle" hitSlop={8} onPress={() => done('find', () => router.push({ pathname: '/search', params: { scope: 'players', find: 'friend' } }))} style={({ pressed }) => [styles.v2Search, pressed && { opacity: PRESS_DIM }]}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.quietText}>Search by @handle</Text>
        </Pressable>
      </>
    );
    return (
      <View style={styles.root}>
        <Wash height={setupLook.wash.height} strength={setupLook.wash.strength} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.scroll, styles.v2Scroll, { paddingTop: setupCount ? space.header : space.top }]}>
          {setupCount ? <Animated.View entering={enter(0)} style={styles.v2Bar}><SetupProgress count={setupCount} /></Animated.View> : null}
          <Animated.View entering={enter(0)} style={styles.head}>
            <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.title}>{empty ? (adult ? 'Bring your hitting partners' : FRIENDS_TITLE) : 'People you may know'}</Text>
            {empty ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.v2Lead}>{emptyLine}</Text> : null}
          </Animated.View>
          <Animated.View entering={enter(1)} style={styles.v2Body}>
            {contacts && !adult ? contactsRow : null}
            {picks === null ? (
              // Room kept for three people, so the page does not jump when they arrive.
              <View style={styles.v2Waiting}><ActivityIndicator color={colors.textFaint} /></View>
            ) : picks.length ? (
              <Animated.View entering={FadeIn.duration(220)}>
                {canFollowAll ? (
                  <View style={styles.v2AllRow}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Follow all ${notYet.length}`} hitSlop={8} onPress={followAll} style={({ pressed }) => [styles.v2All, pressed && { opacity: PRESS_DIM }]}>
                      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.v2AllText}>Follow all</Text>
                    </Pressable>
                  </View>
                ) : null}
                {picks.map(({ user, meta, section }, i) => {
                  // A filled group's small label over its first row (Most active in Raleigh, Coaches); real picks have none.
                  const label = section && picks[i - 1]?.section !== section ? sectionLabel(section) : null;
                  return (
                  <React.Fragment key={user.id}>
                  {label ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.v2Section}>{label}</Text> : null}
                  <View style={styles.v2Person}>
                    <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={44} ring={user.isCoach} />
                    <View style={[styles.v2PersonWords, i > 0 && !label && styles.v2PersonLine]}>
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <View style={styles.v2NameLine}><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.personName} numberOfLines={1}>{user.name}</Text><OfficialCheck userId={user.id} size={15} /></View>
                        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.personMeta} numberOfLines={1}>{meta}</Text>
                      </View>
                      <FollowPill small soft following={followingIds.includes(user.id)} userId={user.id} onPress={() => follow(user)} name={user.name.split(' ')[0]} />
                    </View>
                  </View>
                  </React.Fragment>
                  );
                })}
                {ways}
              </Animated.View>
            ) : (
              <Animated.View entering={FadeIn.duration(220)}>{ways}</Animated.View>
            )}
          </Animated.View>
        </ScrollView>
        <Animated.View entering={enter(2)}>
          <SetupFooter primary={{ label: finishLabel, onPress: () => done(move) }} />
        </Animated.View>
        <StatusShade wash={setupLook.wash} />
        {curtain}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Wash height={420} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.scroll, { paddingTop: space.top }]}>
        {setupCount ? <Animated.View entering={enter(0)}><SetupProgress count={setupCount} /></Animated.View> : null}
        <Animated.View entering={enter(0)} style={styles.head}>
          <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.title}>People you may know</Text>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.lead}>You’re in{firstName ? `, ${firstName}` : ''}. {line}</Text>
        </Animated.View>

        {/* The people you already know who are here (owner, Oct 6). The phone app only; the Find friends page asks and keeps its own rules. */}
        {contacts ? (
          <Animated.View entering={enter(1)} style={styles.card}>
            <Pressable accessibilityRole="button" accessibilityLabel={CONTACTS_LABEL} onPress={findContacts} style={({ pressed }) => [styles.post, pressed && styles.pressed]}>
              <View style={styles.tile}><Ionicons name="people" size={20} color={colors.brand} /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.postTitle}>{CONTACTS_LABEL}</Text>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.postBody}>{CONTACTS_NOTE}</Text>
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
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.postTitle}>{shared ? 'Link shared' : 'Share your invite link'}</Text>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.postBody}>{adult ? 'Whoever joins follows you.' : FRIENDS_LINE}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
          </Animated.View>
        ) : null}

        <Animated.View entering={enter(2)} style={styles.listWrap}>
          {canFollowAll ? (
            <View style={styles.allRow}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Follow all ${notYet.length}`} hitSlop={8} onPress={followAll} style={({ pressed }) => [styles.all, pressed && { opacity: 0.6 }]}>
                <Ionicons name="person-add" size={14} color={colors.brand} />
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.allText}>Follow all</Text>
              </Pressable>
            </View>
          ) : null}
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
                      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.personName} numberOfLines={1}>{user.name}</Text>
                      <View style={styles.personTop}><LevelPill profile={user.profile} userId={user.id} small /><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.personMeta} numberOfLines={1}>{meta}</Text></View>
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
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.mainTitle}>{adult ? 'Bring your hitting partners' : FRIENDS_TITLE}</Text>
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.mainBody}>{!adult ? FRIENDS_LINE : court ? `Send your link. It opens on ${court.name}.` : 'Send your link. Whoever joins follows you.'}</Text>
                  </View>
                </View>
                <Button label="Share my link" onPress={() => { void share(); }} full />
              </Animated.View>
            )}
          </View>
          {picks ? (
            // Teen search (migration 118): by name or @handle, never by town.
            <Pressable accessibilityRole="link" accessibilityLabel="Find a friend by their @handle" hitSlop={8} onPress={() => done('find', () => router.push({ pathname: '/search', params: { scope: 'players', find: 'friend' } }))} style={({ pressed }) => [styles.quiet, pressed && { opacity: PRESS_DIM }]}>
              <Ionicons name="search" size={15} color={colors.textMuted} />
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.quietText}>Find a friend by @handle</Text>
            </Pressable>
          ) : null}
        </Animated.View>

        {/* The second option: a clip, with the Instant inside it for anyone without one. */}
        <Animated.View entering={enter(3)} style={styles.second}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.label}>Or post something</Text>
          <View style={styles.card}>
            <Pressable accessibilityRole="button" accessibilityLabel="Post a clip or photo" onPress={() => done('post', () => router.push('/compose'))} style={({ pressed }) => [styles.post, pressed && styles.pressed]}>
              <View style={styles.tile}><Ionicons name="videocam" size={20} color={colors.brand} /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.postTitle}>Post a clip or photo</Text>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.postBody}>A highlight, a good rally, a funny moment.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
            {/* Only while Instants are on (features/stories/instantsSwitch): otherwise the card is the one row. */}
            {instantsOn ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Take an Instant" onPress={() => done('instant', () => router.push('/hit'))} style={({ pressed }) => [styles.instant, pressed && styles.pressed]}>
                <Ionicons name="camera-outline" size={16} color={colors.textMuted} />
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.instantText}>Nothing saved? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.instantLink}>Take an Instant</Text></Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      </ScrollView>
      {/* Continue, always in reach: following anyone is optional. */}
      {/* Setup's bottom, the same on every setup page (Oct 20 sweep). */}
      <Animated.View entering={enter(4)}>
        <SetupFooter primary={{ label: setupCount && setupCount.index === setupCount.total - 1 ? 'Finish' : 'Continue', onPress: () => done(move) }} />
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
  listWrap: { gap: spacing.xs },
  head: { gap: spacing.sm },
  title: { ...typography.display, color: colors.text },
  lead: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  // The prompt card, the same as "You're early" and "Looking for someone to play?" on Find Players.
  card: { ...lift, borderRadius: corner(20), backgroundColor: colors.surface, overflow: 'hidden' },
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
  allRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.xs },
  all: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  allText: { ...typography.smallStrong, color: colors.brand },
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

  // The sign-up redraw (ONBOARDING_V2).
  v2Scroll: { gap: 0 },
  // The title 24pt under the bar.
  v2Bar: { marginBottom: setupLook.titleGap },
  v2Lead: { ...setupLook.lead },
  v2Body: { marginTop: spacing.xl, gap: spacing.md },
  v2Waiting: { height: 192, alignItems: 'center', justifyContent: 'center' },
  v2AllRow: { flexDirection: 'row', justifyContent: 'flex-end', height: 32, alignItems: 'center', marginTop: -spacing.sm },
  v2All: { minHeight: 32, justifyContent: 'center' },
  v2AllText: { ...typography.bodyStrong, color: colors.brand },
  v2Person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64 },
  // The hairline starts at the name, not the photo, as on the iPhone's own lists and Instagram's.
  v2PersonWords: { flex: 1, minWidth: 0, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  v2PersonLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  v2InviteGap: { marginTop: 20 },
  v2Inset: { ...setupLook.inset },
  v2Contacts: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  v2ContactsText: { ...typography.body, color: colors.text, flex: 1 },
  v2Search: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginTop: spacing.xs },
  // Round 2.
  v2ContactsFirst: { marginTop: 0 },
  v2Section: { ...typography.smallStrong, fontSize: 13, color: colors.textMuted, marginTop: 20, marginBottom: spacing.sm },
  v2NameLine: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 },
});

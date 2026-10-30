import { PRESS_DIM } from '@/theme/press';
import { PlayerName } from '@/components/PlayerName';
import { resetTips, turnOffTips, useTipsOn } from '@/features/tips/tips';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { registerForPush } from '@/features/push/push';
import { router, useFocusEffect } from 'expo-router';
import { goBack } from '@/lib/goBack';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar, Screen, Toggle } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { askWhoSeesYou, canChooseVisibility, onTeenMap } from '@/features/players/mapPrivacy';
import { buttonShape, colors, font, radius, spacing, typography } from '@/theme';
import { leaveGently } from '@/components/SignOutCurtain';
import { confirm } from '@/lib/confirm';
import { replayTour } from '@/features/tour/tourStore';
import { TOUR_ON } from '@/features/tour/tourSeen';
import { useTennisFlags } from '@/features/activity/useTennisFlags';
import { isTracker } from '@/features/activity/flags';
import { workoutWatchAvailable } from '@/features/health/workoutWatch';
import { notKnownAdult } from '@/features/players/age';
import { audienceValue } from '@/features/activity/autoLogSharing';
import { HitGlyph } from '@/components/HitGlyph';
import { PHONE_LINKING } from '@/lib/phoneLinking';
import { TextScale } from '@/theme/textScale';
import { LESS_AI, corner } from '@/theme/look';

/**
 * Friend alerts (Oct 30, owner: "Make it hard to turn off friend alerts"): on is
 * one tap, off asks first. The app's own "are you sure?" card, the other way
 * round: "Keep on" is the bold answer on top, "Turn off" the plain one under
 * it, and a tap outside (or Escape, or Android's Back) keeps them on.
 */
function confirmFriendAlertsOff(turnOff: () => void) {
  confirm({
    title: 'Turn off friend alerts?',
    message: 'You won’t know when friends are up for a hit or playing at a court.',
    confirmLabel: 'Keep on',
    onConfirm: () => undefined,
    cancelLabel: 'Turn off',
    onCancel: turnOff,
  });
}

interface Row {
  icon: keyof typeof Ionicons.glyphMap;
  /** Drawn in place of the icon when a row has something better to show (the theme's own colours). */
  leading?: React.ReactNode;
  label: string;
  /** A line under the label, for the few rows that need explaining. */
  detail?: string;
  /** A short current value at the right end, the way the phone's own Settings shows one. */
  value?: string;
  onPress?: () => void;
  /** Renders a switch instead of a chevron. */
  toggle?: { value: boolean; onChange: (next: boolean) => void };
  /** A row that flips something where it is: its value says On or Off, and there is no chevron (it opens nothing). */
  flip?: boolean;
}

/**
 * Settings, the way the phone's own reads: you at the top on the page's
 * wash, then short grouped lists — borderless, hairlines inset past the
 * icons, current values on the right — and Log out on its own at the end.
 */
export default function Settings() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, currentUserId, locationEnabled, detectedLocation, actions, prefs, courtExtras, mapLive, mapVisibility, teenMap, contactsFindableLive, joinAlertsLive, questionAlertsLive, hitNudgeAlertsLive, partnerStreakAlertsLive, catchUpAlertsLive, autoLogLive, autoLogSharing, integrations } = useApp();
  const [locationNote, setLocationNote] = useState('');
  const toggleLocation = async (next: boolean) => {
    // Location here is this phone's own (courts near you): since migration 189 it never shares anything;
    // only Check in on the map does, after "Who can see you on the map?".
    setLocationNote(next ? 'Asking…' : '');
    const problem = await actions.setLocationEnabled(next);
    setLocationNote(problem ?? '');
  };
  const tipsOn = useTipsOn();
  // How many joined through your link or code, for the Invites row (Oct 5, owner: partners looked for it in Settings).
  const [joined, setJoined] = useState<number | null>(null);
  useEffect(() => { void actions.countReferrals().then(setJoined).catch(() => setJoined(null)); }, [actions]);
  // Admins: how many reports are waiting, on the Reports row. Asked again each
  // time Settings comes back into view (back from Reports, say), as a count
  // only: the database counts them, and no report itself is fetched for it.
  const [openReports, setOpenReports] = useState<number | null>(null);
  const admin = !!currentUser?.isAdmin;
  useFocusEffect(useCallback(() => {
    if (!admin) return undefined;
    let on = true;
    void actions.countOpenReports().then((n) => { if (on && n !== null) setOpenReports(n); }).catch(() => undefined);
    return () => { on = false; };
  }, [actions, admin]));
  // One tap flips them, and the row says which way they are (Oct 5, owner: no switch, just say On or Off).
  const tipsRow: Row = { icon: 'bulb-outline', label: 'Tips', detail: LESS_AI ? undefined : 'A hint on first use', value: tipsOn ? 'On' : 'Off', flip: true, onPress: () => {
    haptics.tap();
    if (tipsOn) { turnOffTips(); showToast({ title: 'Tips are off', icon: 'bulb-outline' }); }
    else { resetTips(); showToast({ title: 'Tips will show again', icon: 'bulb-outline' }); }
  } };
  // The tennis-session alert switch shows only once a tracker is connected and sending sessions
  // (Oct 15, owner: "Only show once it connects tracker"; before, everyone saw "From WHOOP"), and
  // says which: WHOOP, Fitbit, Oura, Polar (migration 58 and the trackers function), and on an
  // iPhone Apple Health, which puts up its own alert after each workout (build 15,
  // features/health/workoutWatch) and obeys the same switch.
  const tennis = useTennisFlags();
  const appleRow = integrations.find((i) => i.provider === 'apple-health');
  const appleAlerts = workoutWatchAvailable() && !!appleRow?.connected && !!appleRow.readsWorkouts && (tennis.apple || (!!appleRow.readsAllWorkouts && tennis.workoutsApple));
  const appleAllAlerts = appleAlerts && !!appleRow?.readsAllWorkouts && tennis.workoutsApple;
  const whoopRow = integrations.find((i) => i.provider === 'whoop');
  const whoopAlerts = !!whoopRow?.connected && !!whoopRow.readsWorkouts && (tennis.whoop || (!!whoopRow.readsAllWorkouts && tennis.workoutsWhoop));
  const whoopAllAlerts = whoopAlerts && !!whoopRow?.readsAllWorkouts && tennis.workoutsWhoop;
  const trackerAlerts = integrations.filter((i) => isTracker(i.provider) && i.connected && !!i.readsWorkouts && tennis[i.provider]);
  const alertSources = [...(whoopAlerts ? ['WHOOP'] : []), ...trackerAlerts.map((i) => i.label), ...(appleAlerts ? ['Apple Health'] : [])];
  const activityAlerts = alertSources.length > 0;
  const alertSourceWords = alertSources.length > 1 ? `${alertSources.slice(0, -1).join(', ')} and ${alertSources[alertSources.length - 1]}` : alertSources[0];
  const mapAdult = !!currentUser && !notKnownAdult(currentUser);
  // A teen on the map (migration 78) can hear when a friend who follows them back is up for a hit.
  const mapTeen = onTeenMap(currentUser, teenMap);
  // The map alerts' switches show only once the server is known to have
  // them (migration 60): before that a switch would do nothing, and come
  // back on at the next start. Asking for Your courts is what finds out.
  useEffect(() => { if (courtExtras === null && currentUserId) void actions.loadFollowedCourts(); }, [courtExtras, currentUserId, actions]);
  const mapAlerts = courtExtras === true;
  // Android (Oct 5): whether the phone lets CourtSide send alerts at all. A
  // "Don't allow" (or a dismissed question) on Android 13 left every switch
  // below on with nothing arriving, and no way back from the app. Read again
  // each time the app comes back to the front (after the phone's Settings).
  const [alertsOff, setAlertsOff] = useState<{ canAskAgain: boolean } | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const check = () => { void Notifications.getPermissionsAsync().then((p) => setAlertsOff(p.granted ? null : { canAskAgain: p.canAskAgain })).catch(() => undefined); };
    check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => sub.remove();
  }, []);
  const turnOnAlerts = async () => {
    if (alertsOff?.canAskAgain) {
      const asked = await Notifications.requestPermissionsAsync().catch(() => null);
      if (asked?.granted) { setAlertsOff(null); void registerForPush(); return; }
      setAlertsOff(asked ? { canAskAgain: asked.canAskAgain } : alertsOff);
      return;
    }
    await Linking.openSettings().catch(() => undefined);
  };

  const sections: { title: string; rows: Row[]; note?: string }[] = [
    // Theme is in Profile's ☰ menu only (Oct 24, owner: "make sure theme is not in the settings … that way we don't overlap").
    {
      title: 'App',
      rows: [
        { icon: 'archive-outline', label: 'Archive', onPress: () => router.push('/archive') },
        // How the app behaves, so it sits with Theme rather than under Account.
        tipsRow,
      ],
    },
    {
      title: 'Account',
      rows: [
        { icon: 'person-circle-outline', label: 'Account center', detail: LESS_AI ? undefined : 'Password and sign-in', onPress: () => router.push('/account') },
        { icon: 'shield-checkmark-outline', label: 'Privacy center', onPress: () => router.push('/privacy') },
        // Oct 5 (owner: "Do word feature like how Instagram does"): Instagram's Hidden words (migration 117).
        { icon: 'eye-off-outline', label: 'Hidden words', detail: LESS_AI ? undefined : 'Offensive comments and messages', onPress: () => router.push('/hidden-words') },
        // Oct 4 (owner): link a number so friends can find you, and find friends from your contacts.
        { icon: 'link-outline', label: 'Invites', detail: LESS_AI ? undefined : 'Your link', value: joined ? `${joined} joined` : undefined, onPress: () => router.push('/invite') },
        // Hidden until texting codes is switched on (lib/phoneLinking).
        ...(PHONE_LINKING ? [{ icon: 'call-outline' as const, label: 'Phone number', detail: 'So friends can find you', onPress: () => router.push('/link-phone') }] : []),
        ...(Platform.OS === 'web' ? [] : [{ icon: 'people-outline' as const, label: 'Find friends from contacts', onPress: () => router.push('/find-contacts') }]),
        // Oct 4: the way out of being found that way (migration 89). In a browser too: it is about other people's phones.
        // Shown only once the database has it; before that it would do nothing.
        ...(contactsFindableLive ? [{ icon: 'person-add-outline' as const, label: 'Let people find me from their contacts', detail: 'By your phone number or email', toggle: { value: prefs.contactsFindable, onChange: (v: boolean) => actions.setPref('contactsFindable', v) } }] : []),
      ],
    },
    // Phone alerts only exist in the app on a phone; a browser can't receive them, so it doesn't offer switches for them.
    ...(Platform.OS === 'web' ? [] : [{
      title: 'Notifications',
      rows: [
        ...(alertsOff ? [{ icon: 'notifications-off-outline' as const, label: 'Phone alerts are off for CourtSide', detail: alertsOff.canAskAgain ? 'Tap to turn them on' : 'Tap, then Notifications, to turn them on', onPress: () => { void turnOnAlerts(); } }] : []),
        // Every chat, groups included; a single chat is muted from its own details page instead.
        { icon: 'paper-plane-outline' as const, label: 'Messages', toggle: { value: prefs.pushMessages, onChange: (v: boolean) => actions.setPref('pushMessages', v) } },
        { icon: 'heart-outline' as const, label: 'Likes and comments', toggle: { value: prefs.pushLikes, onChange: (v: boolean) => actions.setPref('pushLikes', v) } },
        { icon: 'chatbubble-ellipses-outline' as const, label: 'Coach replies', toggle: { value: prefs.pushCoach, onChange: (v: boolean) => actions.setPref('pushCoach', v) } },
        ...(activityAlerts ? [{
          icon: 'stopwatch-outline' as const,
          label: appleAllAlerts || whoopAllAlerts ? 'Workouts' : 'Tennis sessions',
          detail: `From ${alertSourceWords}`,
          toggle: { value: prefs.pushActivity, onChange: (v: boolean) => actions.setPref('pushActivity', v) },
        }] : []),
        // Mondays at 8am your time (migration 130): last week on court. Off, it still lands in Notifications.
        { icon: 'stats-chart-outline' as const, label: 'Weekly recap', detail: 'Mondays at 8am: your week on court', toggle: { value: prefs.pushRecap, onChange: (v: boolean) => actions.setPref('pushRecap', v) } },
        // "Sam just joined CourtSide in Raleigh" (migration 146; its words since 191): only adults hear it (the server's rule), and
        // the switch shows once the database has it. Off, it still lands in Notifications.
        ...(mapAdult && joinAlertsLive ? [{ icon: 'person-add-outline' as const, label: 'New players in your town', detail: 'Someone new who lists your town', toggle: { value: prefs.pushJoined, onChange: (v: boolean) => actions.setPref('pushJoined', v) } }] : []),
        // Sweep R6 (Oct 20): when a Discussions question has waited with no answer, up to 3 people who answered that topic before (or coaches, for technique and gear) are told, at most one a day (migration 170). Shown once the database has it.
        ...(questionAlertsLive ? [{ icon: 'help-circle-outline' as const, label: 'Questions you could answer', detail: 'Unanswered threads on topics you know', toggle: { value: prefs.pushQuestions, onChange: (v: boolean) => actions.setPref('pushQuestions', v) } }] : []),
        // Sweep R10 (Oct 20): one reminder about 20 hours after a hit invite you have not answered, while the hit still has a spot (migration 171). Shown once the database has it.
        ...(hitNudgeAlertsLive ? [{ icon: 'time-outline' as const, label: 'Hit invite reminders', detail: 'One reminder if an invite waits a day', toggle: { value: prefs.pushHitNudges, onChange: (v: boolean) => actions.setPref('pushHitNudges', v) } }] : []),
        // Sweep R12 (Oct 20): one weekend reminder when a weekly streak with a hitting partner has nothing yet this week (migration 180). Shown once the database has it,
        // and to adults only: teens and players with no birthday never get one (no nudging minors), so there is nothing to switch.
        ...(partnerStreakAlertsLive && currentUser?.ageGroup === 'adult' ? [{ icon: 'people-outline' as const, label: 'Partner streak reminders', detail: 'One on the weekend if you haven’t hit yet that week', toggle: { value: prefs.pushPartnerStreak, onChange: (v: boolean) => actions.setPref('pushPartnerStreak', v) } }] : []),
        // Oct 29 (owner: "come back alerts every 5 days"): after 5 days away, one alert every 5 days, only with something real to say
        // (friends up for a hit, open hits nearby, a friend's new clip or session, your city on the board; migration 201). Shown once the database has it.
        ...(catchUpAlertsLive ? [{ icon: 'notifications-outline' as const, label: 'Catch-up alerts', detail: 'When you’ve been away 5 days', toggle: { value: prefs.pushCatchUp, onChange: (v: boolean) => actions.setPref('pushCatchUp', v) } }] : []),
        // The 7pm reminder, set on this phone (features/practice/reminder).
        { icon: 'flame-outline' as const, label: 'Streak reminders', detail: 'At 7pm, when today has nothing yet', toggle: { value: prefs.pushStreak, onChange: (v: boolean) => actions.setPref('pushStreak', v) } },
      ],
    }]),
    // The map's own alerts, each with its own switch. On a computer too: they also land in your Notifications.
    // New open hits and new players only ever go to adults (the server's rule); a teen also gets
    // "Friends up for a hit", from friends who follow each other with them (migration 78).
    ...(!mapAlerts ? [] : [{
      title: 'Map alerts',
      note: 'At most one a day each.',
      rows: [
        ...(mapAdult || mapTeen ? [
          { icon: 'people-outline' as const, leading: <HitGlyph size={20} color={colors.textMuted} />, label: 'Friends up for a hit', toggle: { value: prefs.pushMapFriends, onChange: (v: boolean) => (v ? actions.setPref('pushMapFriends', true) : confirmFriendAlertsOff(() => actions.setPref('pushMapFriends', false))) } },
        ] : []),
        ...(mapAdult ? [
          { icon: 'navigate-outline' as const, label: 'New open hits', detail: 'Within 15 miles', toggle: { value: prefs.pushMapHits, onChange: (v: boolean) => actions.setPref('pushMapHits', v) } },
          { icon: 'location-outline' as const, label: 'Friends new to CourtSide', detail: 'When one is first up to hit', toggle: { value: prefs.pushMapPlayers, onChange: (v: boolean) => actions.setPref('pushMapPlayers', v) } },
        ] : []),
        { icon: 'heart-outline' as const, label: 'Courts you follow', toggle: { value: prefs.pushCourts, onChange: (v: boolean) => actions.setPref('pushCourts', v) } },
      ],
    }]),
    {
      title: 'Your tennis',
      rows: [
        { icon: 'pulse-outline', label: 'Health and nutrition', onPress: () => router.push('/health') },
        // Oct 24 (migration 185): your tracker's tennis of 20+ minutes logs itself, so the streak always shows.
        // Here, not under Notifications, so a browser (which has no Notifications section) can switch it off too.
        ...(activityAlerts && autoLogLive ? [{
          icon: 'checkmark-done-outline' as const,
          label: 'Log tennis automatically',
          // Who sees it is the row below once the database has it (migration 193); before that, only you.
          detail: autoLogSharing === undefined ? (LESS_AI ? 'Private until you post it' : 'Private until you post it · keeps your streak') : (LESS_AI ? '20 minutes or more' : '20 minutes or more · keeps your streak'),
          toggle: { value: prefs.autoLog, onChange: (v: boolean) => actions.setPref('autoLog', v) },
        }] : []),
        // Oct 27 (migration 193; owner: "mutuals can see, no private, its just mutual or public"): who sees them. "Not chosen": only you, until you choose.
        ...(activityAlerts && autoLogLive && autoLogSharing !== undefined && prefs.autoLog ? [{
          icon: 'people-outline' as const,
          label: 'Who sees them',
          value: audienceValue(autoLogSharing, currentUser),
          onPress: () => router.push('/auto-log-sharing'),
        }] : []),
        { icon: 'location-outline', label: 'Location', detail: locationNote || (locationEnabled ? (detectedLocation ? `Courts near ${detectedLocation.split(',')[0]}` : 'On') : (LESS_AI ? 'Off' : 'Off. Turn on to see courts near you')), toggle: { value: locationEnabled, onChange: (next) => { void toggleLocation(next); } } },
        { icon: 'shield-half-outline', label: 'Permissions', onPress: () => router.push('/permissions') },
      ],
    },
    // Only admins see this group (and only admins can read what is behind it).
    ...(currentUser?.isAdmin ? [{
      title: 'Admin',
      rows: [
        { icon: 'hand-left-outline' as const, label: 'Welcome new players', onPress: () => router.push('/admin-welcome') },
        { icon: 'flag-outline' as const, label: 'Reports', value: openReports ? `${openReports} open` : undefined, onPress: () => router.push('/admin-reports') },
        // Everything taken down, with Restore (migration 108). Its own icon: Hidden words has the eye.
        { icon: 'shield-outline' as const, label: 'Removed', onPress: () => router.push('/admin-removed') },
        // Posts pushed to the bottom of feeds, with Undo (migration 152).
        { icon: 'arrow-down-circle-outline' as const, label: 'Pushed-down posts', onPress: () => router.push('/admin-pushed-down') },
        { icon: 'mail-outline' as const, label: 'Waitlist', onPress: () => router.push('/admin-waitlist') },
        { icon: 'people-outline' as const, label: 'Invites', onPress: () => router.push('/admin-invites') },
        // What each website link brought: his Facebook links and the rest (Oct 16, migration 161).
        { icon: 'link-outline' as const, label: 'Links', onPress: () => router.push('/admin-links') },
        { icon: 'school-outline' as const, label: 'Coaches and payments', onPress: () => router.push('/admin-coaches') },
      ],
    }] : []),
    {
      title: 'Support',
      rows: [
        // Back to Community on the map, where the app opens and the first-run tutorial plays again from the start.
        // Until the tour is switched on for everyone, only admins see this (to review it).
        ...(TOUR_ON || currentUser?.isAdmin ? [{ icon: 'compass-outline' as const, label: 'Show the tutorial', onPress: replayTour }] : []),
        { icon: 'help-circle-outline', label: 'Help', onPress: () => router.push('/help') },
        // The rules in plain words, what happens when something is removed, and how to report (Oct 5).
        { icon: 'book-outline', label: 'Community Guidelines', onPress: () => router.push('/guidelines') },
        { icon: 'information-circle-outline', label: 'About', onPress: () => router.push('/about') },
      ],
    },
  ];


  return (
    <Screen title="Settings" compactTitle onBack={() => goBack()}>
      {currentUser ? (
        <View style={styles.me}>
          <Avatar name={currentUser.name} seed={currentUser.avatarSeed} size={64} />
          <View style={styles.meWords}>
            <PlayerName userId={currentUser.id} style={styles.meName}>{currentUser.name}</PlayerName>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meHandle}>@{currentUser.handle}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Edit profile" onPress={() => router.push('/edit-profile')} hitSlop={buttonShape.smallSlop} style={({ pressed }) => [styles.edit, pressed && { opacity: PRESS_DIM }]}>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.editText}>Edit</Text>
          </Pressable>
        </View>
      ) : null}


      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.card}>
            {section.rows.map((row, index) => (
              <Pressable
                key={row.label}
                accessibilityRole={row.toggle ? 'switch' : 'button'}
                accessibilityLabel={row.value ? `${row.label}, ${row.value}` : row.label}
                accessibilityState={row.toggle ? { checked: row.toggle.value } : undefined}
                // The switch drawn in the row only shows it, so the row itself says whether it is on (in a browser too).
                aria-checked={row.toggle ? row.toggle.value : undefined}
                disabled={!row.onPress && !row.toggle}
                onPress={row.toggle ? () => row.toggle?.onChange(!row.toggle.value) : row.onPress}
                style={({ pressed }) => [styles.row, pressed && (row.onPress || row.toggle) ? styles.rowPressed : null]}
              >
                <View style={styles.lead}>{row.leading ?? <Ionicons name={row.icon} size={20} color={colors.textMuted} />}</View>
                <View style={[styles.rowBody, index > 0 && styles.rowLine]}>
                  <View style={styles.rowText}>
                    {/* A switch's label may take a second line rather than be cut off: it says what the switch does. */}
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowLabel} numberOfLines={row.toggle ? 2 : 1}>{row.label}</Text>
                    {row.detail ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowDetail}>{row.detail}</Text> : null}
                  </View>
                  {row.value ? <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.rowValue, row.flip && row.value === 'On' && styles.rowValueOn]} numberOfLines={1}>{row.value}</Text> : null}
                  {row.flip ? null : row.toggle ? (
                    // The whole row is the switch (it flips on a press anywhere along it), so this one only shows it: a tap is never counted twice.
                    <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                      <Toggle value={row.toggle.value} onChange={row.toggle.onChange} accessibilityLabel={row.label} />
                    </View>
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                  )}
                </View>
              </Pressable>
            ))}
          </View>
          {section.note ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.sectionNote}>{section.note}</Text> : null}
        </View>
      ))}

      {/* Signing out leaves this page too: it sits above the tabs, so nothing else would send you to sign in. */}
      <Pressable accessibilityRole="button" accessibilityLabel="Log out" onPress={() => confirm({ title: 'Log out?', message: 'You can log back in any time.', confirmLabel: 'Log out', destructive: true, onConfirm: () => leaveGently(() => { actions.signOut(); router.replace('/sign-in'); }) })} style={({ pressed }) => [styles.card, styles.logout, pressed && styles.rowPressed]}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.logoutText}>Log out</Text>
      </Pressable>
      <Text style={styles.version}>CourtSide · Version {Constants.expoConfig?.version ?? '1.0.0'}</Text>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  // You, at the top, on the page's own wash: no card around it.
  me: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.lg },
  meWords: { flex: 1, gap: 2 },
  meName: { ...typography.heading, color: colors.text },
  meHandle: { ...typography.small, color: colors.textMuted },
  edit: { minHeight: buttonShape.smallHeight, paddingHorizontal: 16, borderRadius: buttonShape.smallRadius, ...buttonShape.curve, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  editText: { ...typography.smallStrong, fontSize: buttonShape.smallLabel, color: colors.text },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 42, paddingHorizontal: 14, marginBottom: spacing.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.borderStrong}55` },
  searchInput: { flex: 1, ...typography.body, color: colors.text, paddingVertical: 0 },
  section: { gap: spacing.sm, paddingBottom: spacing.xl },
  sectionTitle: { ...typography.smallStrong, color: colors.textMuted, paddingHorizontal: spacing.sm },
  sectionNote: { ...typography.small, color: colors.textFaint, paddingHorizontal: spacing.sm },
  // Borderless grouped list: the list is a shade off the page, rows are separated by hairlines that start past the icons.
  // Flatter than the app's usual lift: a settings list should sit on the page, not float (Oct 2).
  card: { boxShadow: '0px 1px 3px rgba(42, 36, 24, 0.05)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: corner(20), backgroundColor: colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'stretch', paddingLeft: spacing.lg },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  lead: { width: 26, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 50, paddingVertical: 11, paddingRight: spacing.lg },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowText: { flex: 1, gap: 1 },
  rowLabel: { ...typography.body, color: colors.text },
  rowDetail: { ...typography.small, color: colors.textFaint },
  rowValue: { ...typography.body, color: colors.textMuted, maxWidth: 140 },
  rowValueOn: { color: colors.brand, ...font('600') },
  logout: { alignItems: 'center', justifyContent: 'center', minHeight: 50 },
  logoutText: { ...typography.body, color: colors.danger },
  empty: { ...typography.small, color: colors.textFaint, paddingVertical: spacing.lg },
  version: { ...typography.caption, letterSpacing: 0.2, color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.xl },
});

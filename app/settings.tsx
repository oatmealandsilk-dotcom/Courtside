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
import { useTheme, themeList, themes, type ThemeName } from '@/theme/ThemeProvider';
import { Wash } from '@/components/Wash';
import { colors, font, radius, spacing, typography } from '@/theme';
import { leaveGently } from '@/components/SignOutCurtain';
import { confirm } from '@/lib/confirm';
import { replayTour } from '@/features/tour/tourStore';
import { TOUR_ON } from '@/features/tour/tourSeen';
import { useTennisFlags } from '@/features/activity/useTennisFlags';
import { workoutWatchAvailable } from '@/features/health/workoutWatch';
import { notKnownAdult } from '@/features/players/age';
import { HitGlyph } from '@/components/HitGlyph';

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
  const { currentUser, currentUserId, locationEnabled, detectedLocation, actions, prefs, courtExtras, mapLive, mapVisibility, teenMap, contactsFindableLive, joinAlertsLive, integrations } = useApp();
  const [locationNote, setLocationNote] = useState('');
  const toggleLocation = async (next: boolean) => {
    // Never said who can see you on the map (migration 63): that comes first, the same as on the map.
    // A teen (migration 78) gets the same screen, with its short notice: nothing is shared until they answer.
    if (next && canChooseVisibility(mapLive, currentUser, teenMap) && mapVisibility === null && !(await askWhoSeesYou('first'))) return;
    setLocationNote(next ? 'Asking…' : '');
    const problem = await actions.setLocationEnabled(next);
    setLocationNote(problem ?? '');
  };
  const { theme } = useTheme();
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
  const tipsRow: Row = { icon: 'bulb-outline', label: 'Tips', detail: 'A hint on first use', value: tipsOn ? 'On' : 'Off', flip: true, onPress: () => {
    haptics.tap();
    if (tipsOn) { turnOffTips(); showToast({ title: 'Tips are off', icon: 'bulb-outline' }); }
    else { resetTips(); showToast({ title: 'Tips will show again', icon: 'bulb-outline' }); }
  } };
  // The tennis-session alert switch shows once WHOOP's tennis sessions are switched on (migration 58),
  // and on an iPhone that puts up its own alert after each Apple Health workout (build 15,
  // features/health/workoutWatch), which obeys the same switch.
  const tennis = useTennisFlags();
  const appleRow = integrations.find((i) => i.provider === 'apple-health');
  const appleAlerts = workoutWatchAvailable() && !!appleRow?.connected && !!appleRow.readsWorkouts && (tennis.apple || (!!appleRow.readsAllWorkouts && tennis.workoutsApple));
  const appleAllAlerts = appleAlerts && !!appleRow?.readsAllWorkouts && tennis.workoutsApple;
  const activityAlerts = tennis.whoop || appleAlerts;
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
    // Theme first (Oct 5, owner: the city courts are a big feature, so they sit at the top, looking the same as ever).
    {
      title: 'App',
      rows: [
        { icon: 'color-palette-outline', label: 'Theme', leading: <ThemeTile name={theme} />, value: themeList.find((t) => t.name === theme)?.label, onPress: () => router.push('/theme') },
        { icon: 'archive-outline', label: 'Archive', onPress: () => router.push('/archive') },
        // How the app behaves, so it sits with Theme rather than under Account.
        tipsRow,
      ],
    },
    {
      title: 'Account',
      rows: [
        { icon: 'person-circle-outline', label: 'Account center', detail: 'Password and sign-in', onPress: () => router.push('/account') },
        { icon: 'shield-checkmark-outline', label: 'Privacy center', onPress: () => router.push('/privacy') },
        // Oct 5 (owner: "Do word feature like how Instagram does"): Instagram's Hidden words (migration 117).
        { icon: 'eye-off-outline', label: 'Hidden words', detail: 'Offensive comments and messages', onPress: () => router.push('/hidden-words') },
        // Oct 4 (owner): link a number so friends can find you, and find friends from your contacts.
        { icon: 'link-outline', label: 'Invites', detail: 'Your link', value: joined ? `${joined} joined` : undefined, onPress: () => router.push('/invite') },
        { icon: 'call-outline', label: 'Phone number', detail: 'So friends can find you', onPress: () => router.push('/link-phone') },
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
          label: appleAllAlerts ? 'Workouts' : 'Tennis sessions',
          detail: tennis.whoop && appleAlerts ? 'From WHOOP and Apple Health' : appleAlerts ? 'From Apple Health' : 'From WHOOP',
          toggle: { value: prefs.pushActivity, onChange: (v: boolean) => actions.setPref('pushActivity', v) },
        }] : []),
        // Mondays at 8am your time (migration 130): last week on court. Off, it still lands in Notifications.
        { icon: 'stats-chart-outline' as const, label: 'Weekly recap', detail: 'Mondays at 8am: your week on court', toggle: { value: prefs.pushRecap, onChange: (v: boolean) => actions.setPref('pushRecap', v) } },
        // "Sam just joined CourtSide near you" (migration 146): only adults hear it (the server's rule), and
        // the switch shows once the database has it. Off, it still lands in Notifications.
        ...(mapAdult && joinAlertsLive ? [{ icon: 'person-add-outline' as const, label: 'Players joining near you', detail: 'Someone new in your town', toggle: { value: prefs.pushJoined, onChange: (v: boolean) => actions.setPref('pushJoined', v) } }] : []),
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
          { icon: 'people-outline' as const, leading: <HitGlyph size={20} color={colors.textMuted} />, label: 'Friends up for a hit', toggle: { value: prefs.pushMapFriends, onChange: (v: boolean) => actions.setPref('pushMapFriends', v) } },
        ] : []),
        ...(mapAdult ? [
          { icon: 'navigate-outline' as const, label: 'New open hits', detail: 'Within 15 miles', toggle: { value: prefs.pushMapHits, onChange: (v: boolean) => actions.setPref('pushMapHits', v) } },
          { icon: 'location-outline' as const, label: 'New players nearby', toggle: { value: prefs.pushMapPlayers, onChange: (v: boolean) => actions.setPref('pushMapPlayers', v) } },
        ] : []),
        { icon: 'heart-outline' as const, label: 'Courts you follow', toggle: { value: prefs.pushCourts, onChange: (v: boolean) => actions.setPref('pushCourts', v) } },
      ],
    }]),
    {
      title: 'Your tennis',
      rows: [
        { icon: 'pulse-outline', label: 'Health and nutrition', onPress: () => router.push('/health') },
        { icon: 'location-outline', label: 'Location', detail: locationNote || (locationEnabled ? (detectedLocation ? `Showing players near ${detectedLocation.split(',')[0]}` : 'On') : 'Off. Turn on to see who is near you'), toggle: { value: locationEnabled, onChange: (next) => { void toggleLocation(next); } } },
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
            <Text style={styles.meHandle}>@{currentUser.handle}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Edit profile" onPress={() => router.push('/edit-profile')} style={({ pressed }) => [styles.edit, pressed && { opacity: 0.7 }]}>
            <Text style={styles.editText}>Edit</Text>
          </Pressable>
        </View>
      ) : null}


      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
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
                    <Text style={styles.rowLabel} numberOfLines={row.toggle ? 2 : 1}>{row.label}</Text>
                    {row.detail ? <Text style={styles.rowDetail}>{row.detail}</Text> : null}
                  </View>
                  {row.value ? <Text style={[styles.rowValue, row.flip && row.value === 'On' && styles.rowValueOn]} numberOfLines={1}>{row.value}</Text> : null}
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
          {section.note ? <Text style={styles.sectionNote}>{section.note}</Text> : null}
        </View>
      ))}

      {/* Signing out leaves this page too: it sits above the tabs, so nothing else would send you to sign in. */}
      <Pressable accessibilityRole="button" accessibilityLabel="Log out" onPress={() => confirm({ title: 'Log out?', message: 'You can log back in any time.', confirmLabel: 'Log out', destructive: true, onConfirm: () => leaveGently(() => { actions.signOut(); router.replace('/sign-in'); }) })} style={({ pressed }) => [styles.card, styles.logout, pressed && styles.rowPressed]}>
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
      <Text style={styles.version}>CourtSide · Version {Constants.expoConfig?.version ?? '1.0.0'}</Text>
    </Screen>
  );
}

/**
 * The Theme row's icon: the chosen court as a tiny page — its ground with its
 * wash faintly on it — the same picture the Theme page shows for each court.
 */
function ThemeTile({ name }: { name: ThemeName }) {
  const p = themes[name];
  return (
    <View style={[tile.box, { backgroundColor: p.bg, borderColor: p.borderStrong }]}>
      <Wash theme={name} height={26} strength={0.9} fade={p.bg} />
    </View>
  );
}
const tile = StyleSheet.create({
  box: { width: 26, height: 24, borderRadius: 7, borderWidth: 1, overflow: 'hidden' },
});

const styleDefinitions = StyleSheet.create({
  // You, at the top, on the page's own wash: no card around it.
  me: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.lg },
  meWords: { flex: 1, gap: 2 },
  meName: { ...typography.heading, color: colors.text },
  meHandle: { ...typography.small, color: colors.textMuted },
  edit: { height: 34, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  editText: { ...typography.smallStrong, color: colors.text },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 42, paddingHorizontal: 14, marginBottom: spacing.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.borderStrong}55` },
  searchInput: { flex: 1, ...typography.body, color: colors.text, paddingVertical: 0 },
  section: { gap: spacing.sm, paddingBottom: spacing.xl },
  sectionTitle: { ...typography.smallStrong, color: colors.textMuted, paddingHorizontal: spacing.sm },
  sectionNote: { ...typography.small, color: colors.textFaint, paddingHorizontal: spacing.sm },
  // Borderless grouped list: the list is a shade off the page, rows are separated by hairlines that start past the icons.
  // Flatter than the app's usual lift: a settings list should sit on the page, not float (Oct 2).
  card: { boxShadow: '0px 1px 3px rgba(42, 36, 24, 0.05)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
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

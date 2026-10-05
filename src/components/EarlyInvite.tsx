import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Button } from '@/components/ui';
import { Wash } from '@/components/Wash';
import { inviteLink, type InviteCourt } from '@/features/invite/referral';
import * as haptics from '@/lib/haptics';
import { shareOutside } from '@/lib/shareOutside';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

/**
 * "You're early in Columbus": Find Players with nobody sharing a spot
 * within 30 miles. Rather than an empty map, the way to fill it: your own
 * link and a poster for your court. When there is a court to name (one you
 * follow, else the nearest public one), the link carries it, so a friend who
 * joins lands on that court's page.
 *
 * `friends` (Oct 5, owner: "Do all"): the same card for a teen, or anyone
 * not known to be an adult, with no friend on their map yet. Their map only
 * ever shows friends who follow each other with them, so the way to fill it
 * is the same link, carrying no court (a link or poster naming where a teen
 * plays would put them in front of strangers), and finding a friend by
 * their @handle. Nothing about who sees whom changes.
 *
 * It sits right under the map, so its button shows without scrolling, and
 * the tutorial's first tip lights its top half (`leadRef`).
 */
export function EarlyInvite({ city, court, friends = false, leadRef }: { city: string | null; court: InviteCourt | null; friends?: boolean; /** The tutorial's target: the title, the words and the button. */ leadRef?: (node: View | null) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser } = useApp();
  if (!currentUser) return null;
  const carried = friends ? null : court;
  const link = inviteLink(currentUser.handle, carried);
  const share = async () => {
    try {
      const said = await shareOutside(carried ? `Hit with me at ${carried.name} on CourtSide` : friends ? 'Join me on CourtSide' : 'Hit with me on CourtSide', link);
      haptics.commit();
      if (said) showToast({ title: said, icon: 'link-outline' });
    } catch { /* the share sheet was closed */ }
  };
  const poster = () => router.push(court ? { pathname: '/club-poster', params: { court: court.id, name: court.name, lat: court.lat.toFixed(5), lng: court.lng.toFixed(5) } } : '/club-poster');
  return (
    <View style={styles.card}>
      <Wash height={220} strength={0.6} fade={colors.surface} style={styles.wash} />
      {/* Never folded away by the phone's renderer, or the tutorial could not measure it. */}
      <View ref={leadRef} collapsable={false} style={styles.lead}>
        <Text style={styles.title}>{friends ? 'Bring your friends' : city ? `You’re early in ${city}` : 'You’re early here'}</Text>
        <Text style={styles.body}>{friends
          ? 'Send your friends your link. When they join, follow each other to see who’s up for a hit.'
          : 'The map fills up with the people you already play with. Send them your link.'}</Text>
        {/* The feature card's shape: one primary pill, one quiet link under it. */}
        <View style={styles.actions}>
          <Button label="Share my link" onPress={() => { void share(); }} full />
        </View>
      </View>
      {friends ? (
        // Teen search (migration 118): by name or @handle, never by town.
        <Pressable accessibilityRole="link" accessibilityLabel="Find a friend by their @handle" hitSlop={8} onPress={() => router.push({ pathname: '/search', params: { scope: 'players' } })} style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}>
          <Ionicons name="search" size={15} color={colors.textMuted} />
          <Text style={styles.linkText}>Find a friend by @handle</Text>
        </Pressable>
      ) : (
        <>
          <Pressable accessibilityRole="link" accessibilityLabel={court ? `Print a poster for ${court.name}` : 'Print a poster'} hitSlop={8} onPress={poster} style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}>
            <Ionicons name="print-outline" size={15} color={colors.textMuted} />
            <Text style={styles.linkText}>{court ? 'Print a poster for my court' : 'Print a poster'}</Text>
          </Pressable>
          {court ? <Text style={styles.fine} numberOfLines={2}>Both open on {court.name} for whoever joins.</Text> : null}
        </>
      )}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  // The feature card: surface, 20px corners, a hairline, the wash inside it.
  card: { borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.xl, gap: spacing.sm, overflow: 'hidden' },
  wash: { position: 'absolute', left: 0, right: 0, top: 0 },
  lead: { gap: spacing.sm },
  title: { ...typography.title, color: colors.text },
  body: { ...typography.small, color: colors.textMuted, lineHeight: 19, maxWidth: 420 },
  actions: { marginTop: spacing.sm, maxWidth: 440 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingVertical: spacing.xs },
  linkText: { ...typography.smallStrong, color: colors.textMuted },
  fine: { ...typography.caption, letterSpacing: 0, color: colors.textFaint, textAlign: 'center' },
});

import React, { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { goHome, HOME } from '@/lib/goBack';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { useInstantsOn } from './instantsSwitch';

/**
 * Wraps a page that is only about Instants (the camera, an Instant's page,
 * the full-screen viewer). While Instants are hidden (instantsSwitch), the
 * page is never drawn: an old link, a notification on the phone or a page
 * reopened in a browser lands on the Feed instead. While the server is
 * still being asked, a plain page in the theme's colour, for a moment.
 *
 * `admins`: an admin still gets the page, so a reported Instant can be
 * looked at and taken down from Reports and Taken down.
 */
export function InstantsGate({ children, admins = false }: { children: ReactNode; admins?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const on = useInstantsOn();
  const { currentUser } = useApp();
  const open = on === true || (admins && !!currentUser?.isAdmin);
  const away = on === false && !open;
  useEffect(() => {
    if (!away) return;
    // Opened over the tabs: close down to them, on the Feed. Opened first (a reload, a link): swapped for the tabs.
    if (router.canDismiss()) goHome();
    else router.replace(HOME);
  }, [away]);
  if (open) return <>{children}</>;
  return <View style={styles.waiting} />;
}

const styleDefinitions = StyleSheet.create({
  waiting: { flex: 1, backgroundColor: colors.bg },
});

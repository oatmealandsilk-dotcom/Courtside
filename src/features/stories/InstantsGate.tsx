import React, { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { goHome, HOME } from '@/lib/goBack';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { useInstantsOn } from './instantsSwitch';

/** How long a page waits on the server's answer before going to the Feed anyway. */
const WAIT_MS = 5000;

/**
 * Wraps a page that is only about Instants (the camera, an Instant's page,
 * the full-screen viewer). While Instants are hidden (instantsSwitch), the
 * page is never drawn: an old link, a notification on the phone or a page
 * reopened in a browser lands on the Feed instead. While the server is
 * still being asked, a plain page in the theme's colour, for a moment; an
 * ask that hangs (a weak signal) counts as hidden after WAIT_MS, as a failed
 * one does, so the page is never left blank with nowhere to go.
 *
 * `admins`: an admin still gets the page, so a reported Instant can be
 * looked at and taken down from Reports and Taken down.
 */
export function InstantsGate({ children, admins = false }: { children: ReactNode; admins?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const on = useInstantsOn();
  const { currentUser } = useApp();
  const open = on === true || (admins && !!currentUser?.isAdmin);
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (on !== undefined) return;
    const t = setTimeout(() => setGaveUp(true), WAIT_MS);
    return () => clearTimeout(t);
  }, [on]);
  const away = (on === false || (on === undefined && gaveUp)) && !open;
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

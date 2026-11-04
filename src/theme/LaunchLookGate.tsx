import { useEffect } from 'react';

import { useApp } from '@/store/AppContext';
import { useLaunchLookWanted } from '@/theme/ThemeProvider';
import { LAUNCH_FOLLOWS_THEME_FOR_EVERYONE, confirmLaunchLook, saveLaunchLook } from '@/lib/launchLook';
import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * Saves the launch screen's look for the next open (Nov 2, owner: "if someone selects night, then the
 * opening screen is always night, if it's day it's always day"; src/lib/launchLook.ts): the one the
 * court picked, Match phone and signing in or out call for (launchLookWanted), for admins until
 * LAUNCH_FOLLOWS_THEME_FOR_EVERYONE; the phone's own mode, as before, for everyone else. Only once the
 * account is known (signed out, or signed in with the account in: loaded, or its saved copy shown), so an
 * open never saves a guess: an account that failed to load (offline, a token run out) stands in with no
 * admin flag, and saving 'phone' for it would put an admin back on the phone's mode for the next open.
 * At every open it also tells the iPhone's module this code is here (confirmLaunchLook), whoever is in.
 */
export function LaunchLookGate() {
  const { authResolved, currentUserId, currentUser, remoteLoaded, snapshotShown } = useApp();
  const wanted = useLaunchLookWanted();
  const accountIn = !!currentUser && (!isSupabaseConfigured || remoteLoaded || snapshotShown);
  const known = authResolved && (!currentUserId || accountIn);
  const on = LAUNCH_FOLLOWS_THEME_FOR_EVERYONE || !!currentUser?.isAdmin;
  useEffect(() => {
    confirmLaunchLook();
  }, []);
  useEffect(() => {
    if (known) saveLaunchLook(on ? wanted : 'phone');
  }, [known, on, wanted]);
  return null;
}

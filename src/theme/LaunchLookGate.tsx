import { useEffect } from 'react';

import { useApp } from '@/store/AppContext';
import { useLaunchLookWanted } from '@/theme/ThemeProvider';
import { LAUNCH_FOLLOWS_THEME_FOR_EVERYONE, saveLaunchLook } from '@/lib/launchLook';

/**
 * Saves the launch screen's look for the next open (Nov 2, owner: "if someone selects night, then the
 * opening screen is always night, if it's day it's always day"; src/lib/launchLook.ts): the one the
 * court picked, Match phone and signing in or out call for (launchLookWanted), for admins until
 * LAUNCH_FOLLOWS_THEME_FOR_EVERYONE; the phone's own mode, as before, for everyone else. Only once the
 * account is known (signed out, or signed in with the account in), so an open never saves a guess.
 */
export function LaunchLookGate() {
  const { authResolved, currentUserId, currentUser } = useApp();
  const wanted = useLaunchLookWanted();
  const known = authResolved && (!currentUserId || !!currentUser);
  const on = LAUNCH_FOLLOWS_THEME_FOR_EVERYONE || !!currentUser?.isAdmin;
  useEffect(() => {
    if (known) saveLaunchLook(on ? wanted : 'phone');
  }, [known, on, wanted]);
  return null;
}

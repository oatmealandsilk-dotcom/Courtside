import { useEffect } from 'react';

import { useApp } from '@/store/AppContext';
import { pickedTheme, replacePicked, useTheme } from '@/theme/ThemeProvider';
import { joinedAfterCutoff, NEW_PLAYER_FALLBACK, themeAllowed } from '@/theme/earlyThemes';

/**
 * A player who joined after the launch cutoff (src/theme/earlyThemes.ts) with
 * one of the early members' courts saved on this phone (a phone someone else
 * used CourtSide on, say) is put on Clean as their account opens. It only
 * ever acts as the account opens or the saved court is read back: the Theme
 * page never offers them another court, so nobody is moved off a court they
 * picked while using the app. Early members, guests, and everyone while there
 * is no cutoff: nothing happens.
 *
 * It swaps the saved court with replacePicked, not setTheme: a pick of a light
 * court with Match phone on and the phone dark switches Match phone off, and
 * this player never touched that switch.
 */
export function EarlyThemesGate() {
  const { currentUser } = useApp();
  const { theme } = useTheme();
  const joinedAt = currentUser?.joinedAt;
  useEffect(() => {
    if (!joinedAfterCutoff(joinedAt)) return;
    if (!themeAllowed(pickedTheme(), joinedAt)) replacePicked(NEW_PLAYER_FALLBACK);
  }, [joinedAt, theme]);
  return null;
}

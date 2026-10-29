import { useEffect } from 'react';

import { useApp } from '@/store/AppContext';
import { setSignedOut } from '@/theme/ThemeProvider';

/**
 * Tells the theme whether anyone is signed in, once the app knows (Oct 29): signed out, the app
 * shows Clean or Night by the phone's light or dark mode, whatever court is saved here; signed
 * in, the saved court (and Match phone) as always. See `signedOut` in ThemeProvider.
 */
export function VisitorThemeGate() {
  const { authResolved, currentUserId } = useApp();
  useEffect(() => {
    if (authResolved) setSignedOut(!currentUserId);
  }, [authResolved, currentUserId]);
  return null;
}

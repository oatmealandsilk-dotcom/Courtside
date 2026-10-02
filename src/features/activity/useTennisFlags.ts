import { useEffect, useState } from 'react';

import { useApp } from '@/store/AppContext';
import { knownTennisFlags, tennisFlags, type TennisFlags } from './flags';

/**
 * Which tennis-session sources are switched on for the signed-in account.
 * All off until the server says otherwise (and on a database without the
 * switches), so a screen never shows the new parts before it should.
 */
export function useTennisFlags(): TennisFlags {
  const { currentUserId } = useApp();
  const [flags, setFlags] = useState<TennisFlags>(() => knownTennisFlags(currentUserId) ?? { apple: false, whoop: false });
  useEffect(() => {
    let current = true;
    void tennisFlags(currentUserId).then((f) => { if (current) setFlags(f); });
    return () => { current = false; };
  }, [currentUserId]);
  return flags;
}

import { useEffect, useRef, useState } from 'react';

import { defaultHealthChoice, loadHealthChoice, saveHealthChoice, type HealthChoice } from './healthShare';

/**
 * The "Share health data" choice for the post being written: what this
 * account chose last time on this phone, or the default (on for someone
 * known to be an adult, off for everyone else). A change is remembered for
 * the next post.
 */
export function useHealthChoice(userId: string | null | undefined, adult: boolean): [HealthChoice, (next: HealthChoice) => void] {
  const [choice, setChoice] = useState<HealthChoice>(() => defaultHealthChoice(adult));
  const touched = useRef(false);
  // The age can arrive a moment after the page opens: the default follows it until anything is chosen.
  useEffect(() => { if (!touched.current) setChoice(defaultHealthChoice(adult)); }, [adult]);
  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    void loadHealthChoice(userId).then((kept) => { if (live && kept && !touched.current) setChoice(kept); });
    return () => { live = false; };
  }, [userId]);
  const change = (next: HealthChoice) => {
    touched.current = true;
    setChoice(next);
    if (userId) saveHealthChoice(userId, next);
  };
  return [choice, change];
}

import { useEffect, useRef, useState } from 'react';

import { defaultHealthChoice, loadHealthChoice, saveHealthChoice, type HealthChoice } from './healthShare';

/**
 * The "Share health data" choice for the post being written: what this
 * account chose last time on this phone, or the default (on, for every age
 * since Oct 29). A change is remembered for the next post.
 */
export function useHealthChoice(userId: string | null | undefined): [HealthChoice, (next: HealthChoice) => void] {
  const [choice, setChoice] = useState<HealthChoice>(() => defaultHealthChoice());
  const touched = useRef(false);
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

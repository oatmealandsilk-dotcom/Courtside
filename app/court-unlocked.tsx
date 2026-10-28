import React from 'react';
import { useLocalSearchParams } from 'expo-router';

import { unlockOption } from '@/features/courtUnlocks/designDemo';
import { UnlockCard } from '@/features/courtUnlocks/UnlockCard';
import { UnlockTraced } from '@/features/courtUnlocks/UnlockTraced';
import { UnlockZoom } from '@/features/courtUnlocks/UnlockZoom';

/**
 * DESIGN BRANCH ONLY (design/court-unlocks): the "Court unlocked" moment.
 *
 * Round 3 (owner, Oct 28: "the court unlocked looks better, but im not the
 * biggest fan of the badge on the bottom right. or the court icon on the
 * top. show me a couple to pick from"): the round stamp and the court mark
 * over the map are gone, and there are three ways to tell it, for him to
 * pick from (COURT_UNLOCKED_OPTION; the demo's pictures pass ?v=A, B or C):
 * A Traced, B Card, C Your map. All three keep the full-screen court map,
 * who got here first, what is next near you, Share to story and See your
 * courts. Round 4 (owner, Oct 28: "Just say number like x here."): who got
 * here first is friends only, by face and name; with no friend, just "You're
 * the 43rd player here" (the demo's pictures pass ?friends=none).
 */
export default function CourtUnlocked() {
  const { v } = useLocalSearchParams<{ v?: string }>();
  const option = unlockOption(v);
  if (option === 'B') return <UnlockCard />;
  if (option === 'C') return <UnlockZoom />;
  return <UnlockTraced />;
}

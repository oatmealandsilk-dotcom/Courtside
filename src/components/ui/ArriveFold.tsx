import React, { useState } from 'react';

import { Fold } from './Fold';

/**
 * A section that may turn up after its page is on show (People you may know, Your courts, Near
 * you, Question of the week, a messages list's Up to hit today …; Nov 4, owner: "nothing should
 * just cut in"). `arriving` (an owner's useArriveGate, read as it is built) says whether it does:
 * then it unfolds, its height growing as it fades in, so everything under it glides down instead
 * of jumping (Fold's `appear`). Otherwise it is simply there, exactly as before (no Fold round it).
 * Decided once, when it is built. Never round anything glass (Fold fades its contents).
 */
export function ArriveFold({ arriving, gap = 0, children }: { arriving: boolean; gap?: number; children: React.ReactNode }) {
  const [play] = useState(arriving);
  if (!play) return <>{children}</>;
  return <Fold open appear gap={gap}>{children}</Fold>;
}

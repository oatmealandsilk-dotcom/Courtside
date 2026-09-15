import React from 'react';
import type { SharedValue } from 'react-native-reanimated';

import { SwipeSurface } from '@/components/SwipeSurface';

/**
 * Sections inside a tab, on the web: the drag-to-swipe surface with the
 * neighbouring pane shown as the preview. Same contract as the phone's
 * side-by-side pager, so the pages do not care which they got.
 */
export function SectionPager({ index, panes, onIndex, progress, delegateLeft = false, delegateRight = false }: {
  index: number;
  panes: React.ReactNode[];
  onIndex: (next: number) => void;
  progress?: SharedValue<number>;
  depth?: 1 | 2;
  delegateLeft?: boolean;
  delegateRight?: boolean;
}) {
  const last = panes.length - 1;
  return (
    <SwipeSurface
      fill={false}
      progress={progress}
      settledKey={String(index)}
      delegateLeft={delegateLeft && index >= last}
      delegateRight={delegateRight && index <= 0}
      onSwipe={(direction) => onIndex(Math.max(0, Math.min(last, index + direction)))}
      renderPreview={(direction) => {
        const next = index + direction;
        return next >= 0 && next <= last ? panes[next] : null;
      }}
    >
      {panes[index]}
    </SwipeSurface>
  );
}

import React, { useEffect, useRef } from 'react';
import type { SharedValue } from 'react-native-reanimated';

import { SwipeSurface } from '@/components/SwipeSurface';
import { listenForSlides } from '@/features/navigation/pageSlide';

/**
 * Sections inside a tab, on the web: the drag-to-swipe surface with the
 * neighbouring pane shown as the preview. Same contract as the phone's
 * side-by-side pager, so the pages do not care which they got.
 */
export function SectionPager({ index, panes, onIndex, progress, delegateLeft = false, delegateRight = false, slideChannel }: {
  index: number;
  panes: React.ReactNode[];
  onIndex: (next: number) => void;
  progress?: SharedValue<number>;
  depth?: 1 | 2;
  delegateLeft?: boolean;
  delegateRight?: boolean;
  slideChannel?: string;
}) {
  const last = panes.length - 1;
  // A section turn asked for by code (the tutorial) plays as this pager's own swipe.
  const slide = useRef<((direction: 1 | -1) => boolean) | null>(null);
  useEffect(() => (slideChannel ? listenForSlides(slideChannel, ({ direction }) => slide.current?.(direction) ?? false) : undefined), [slideChannel]);
  return (
    <SwipeSurface
      slideRef={slide}
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

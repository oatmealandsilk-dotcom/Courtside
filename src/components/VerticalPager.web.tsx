import React, { useEffect, useRef } from 'react';

export function VerticalPager({ children, onIndex }: {
  children: React.ReactNode[];
  onIndex: (index: number) => void;
}) {
  const pager = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = pager.current;
    if (!el) return;
    let lastWheel = 0;
    let lockedUntil = 0;
    let distance = 0;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      // Long discussion cards retain their own scrolling until their edge.
      let target = event.target instanceof HTMLElement ? event.target : null;
      while (target && target !== el) {
        const canScroll = ['auto', 'scroll'].includes(getComputedStyle(target).overflowY);
        if (canScroll && target.scrollHeight > target.clientHeight + 1 &&
          (event.deltaY > 0 ? target.scrollTop + target.clientHeight < target.scrollHeight - 1 : target.scrollTop > 1)) return;
        target = target.parentElement;
      }
      event.preventDefault();
      const now = performance.now();
      const newGesture = now - lastWheel > 180;
      lastWheel = now;
      if (newGesture) distance = 0;
      if (now < lockedUntil) return;
      if (!newGesture && distance === Infinity) return;
      distance += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientHeight : 1);
      if (Math.abs(distance) < 24 || !el.clientHeight) return;
      const next = Math.max(0, Math.min(children.length - 1,
        Math.round(el.scrollTop / el.clientHeight) + Math.sign(distance)));
      el.scrollTo({ top: next * el.clientHeight,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      distance = Infinity;
      lockedUntil = now + 380;
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [children.length]);

  return <div ref={pager} tabIndex={0} role="region" aria-label="Reels feed"
    onScroll={e => {
      const el = e.currentTarget;
      if (el.clientHeight) onIndex(Math.round(el.scrollTop / el.clientHeight));
    }}
    style={{ height: '100%', width: '100%', overflowY: 'auto', scrollSnapType: 'y mandatory',
      overscrollBehaviorY: 'contain', scrollbarWidth: 'thin', scrollbarColor: '#8B8373 #F1EFE6' }}>
    {children.map((child, index) => <div key={index} style={{ display: 'flex', flexDirection: 'column',
      height: '100%', width: '100%', scrollSnapAlign: 'start', scrollSnapStop: 'always',
      position: 'relative', overflow: 'hidden' }}>{child}</div>)}
  </div>;
}

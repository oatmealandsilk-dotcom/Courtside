import React, { useLayoutEffect, useRef } from 'react';
import { usePathname, useGlobalSearchParams } from 'expo-router';

const depthOf = (pathname: string) => pathname.split('/').filter(Boolean).length;

/**
 * Animate the content without remounting the router or moving navigation.
 *
 * Moving between the tabs is a swipe, so a change there only gets a light
 * fade. Opening something — a profile, a post, a thread — slides the new page
 * in from the right the way native does, and stepping back slides it in from
 * the left, so the page never just cuts to a new one.
 */
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { section } = useGlobalSearchParams<{ section?: string }>();
  const previous = useRef({ key: `${pathname}:${section ?? ''}`, depth: depthOf(pathname) });
  useLayoutEffect(() => {
    const next = { key: `${pathname}:${section ?? ''}`, depth: depthOf(pathname) };
    const before = previous.current;
    if (before.key === next.key) return;
    previous.current = next;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const slide = next.depth > before.depth ? 28 : next.depth < before.depth ? -20 : 0;
    const animation = content.current?.animate(
      slide
        ? [{ opacity: 0, transform: `translate3d(${slide}px,0,0)` }, { opacity: 1, transform: 'translate3d(0,0,0)' }]
        : [{ opacity: 0.65 }, { opacity: 1 }],
      { duration: slide ? 260 : 170, easing: 'cubic-bezier(.2,.7,.2,1)' },
    );
    return () => animation?.cancel();
  }, [pathname, section]);
  return <div ref={content} style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }}>{children}</div>;
}

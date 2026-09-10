import React, { useLayoutEffect, useRef } from 'react';
import { usePathname, useGlobalSearchParams } from 'expo-router';

/** Animate the content without remounting the router or moving navigation. */
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { section } = useGlobalSearchParams<{ section?: string }>();
  const previous = useRef(`${pathname}:${section ?? ''}`);
  useLayoutEffect(() => {
    const next = `${pathname}:${section ?? ''}`;
    if (previous.current === next) return;
    previous.current = next;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = content.current?.animate(
      [{ opacity: 0.65 }, { opacity: 1 }],
      { duration: 170, easing: 'cubic-bezier(.2,.7,.2,1)' },
    );
    return () => animation?.cancel();
  }, [pathname, section]);
  return <div ref={content} style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }}>{children}</div>;
}

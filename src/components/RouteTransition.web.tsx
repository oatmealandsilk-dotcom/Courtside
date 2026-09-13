import React, { useLayoutEffect, useRef } from 'react';
import { usePathname, useGlobalSearchParams } from 'expo-router';

/** The four tab roots. Moving between them is a swipe, so they only fade. */
const TABS = new Set(['/', '/discuss', '/coaches', '/profile']);
/** Splash → sign-in → home: a fade in and out, never a slide. */
const AUTH = new Set(['/sign-in', '/onboarding']);
/**
 * See-through sheets over the current page. The page underneath stays put,
 * so animating the content here would make it flash behind the sheet.
 */
const SHEETS = new Set(['/compose', '/share']);

/**
 * Animate the content without remounting the router or moving navigation.
 *
 * Opening something — a profile, a post, a thread from a chat — slides the
 * new page in from the right the way native does; stepping back slides it in
 * from the left. Whether a change is a push or a pop comes from a small
 * history of where you have been, not from how deep the URL looks, because a
 * chat and a thread sit at the same depth and still deserve the slide.
 */
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { section } = useGlobalSearchParams<{ section?: string }>();
  const key = `${pathname}:${section ?? ''}`;
  const trail = useRef<string[]>([key]);
  useLayoutEffect(() => {
    const trailing = trail.current;
    const before = trailing[trailing.length - 1];
    if (before === key) return;
    const wentBack = trailing.length > 1 && trailing[trailing.length - 2] === key;
    if (wentBack) trailing.pop();
    else trailing.push(key);
    if (trailing.length > 30) trailing.shift();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const beforePath = before.split(':')[0];
    if (SHEETS.has(pathname) || SHEETS.has(beforePath)) return;
    const tabToTab = TABS.has(pathname) && TABS.has(beforePath);
    const auth = AUTH.has(pathname) || AUTH.has(beforePath);
    const slide = tabToTab || auth ? 0 : wentBack ? -24 : 36;
    const animation = content.current?.animate(
      slide
        ? [{ opacity: 0, transform: `translate3d(${slide}px,0,0)` }, { opacity: 1, transform: 'translate3d(0,0,0)' }]
        : [{ opacity: auth ? 0 : 0.65 }, { opacity: 1 }],
      { duration: slide ? 300 : auth ? 420 : 170, easing: 'cubic-bezier(.2,.7,.2,1)' },
    );
    return () => animation?.cancel();
  }, [key, pathname]);
  return <div ref={content} style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }}>{children}</div>;
}
